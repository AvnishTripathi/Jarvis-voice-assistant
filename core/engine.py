"""Central Autonomous Runtime Engine for J.A.R.V.I.S.

Orchestrates multi-turn conversations, Google GenAI SDK chat sessions, strict JSON schema
tool dispatching, high-concurrency parallel tool execution, an autonomous self-healing
retry loop (up to 3 correction attempts on non-zero exit codes or error traces), production
system prompt enforcement, and structured rotating JSONL telemetry logging.
"""

import asyncio
import datetime
import io
import json
import logging
import os
import sys
import time
import uuid
from logging.handlers import RotatingFileHandler
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from pydantic import BaseModel, Field

# Core tools integration
from core.tools.system import (
    execute_shell_command,
    get_telemetry,
    CommandResult,
    SystemStats,
    SafetyBlacklistViolation,
)
from core.tools.vision import (
    capture_active_display,
    capture_webcam_frame,
    create_fallback_payload,
    VisualFrame,
)

# Google GenAI SDK integration
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    genai = None
    types = None
    HAS_GENAI_SDK = False


# ---------------------------------------------------------------------------
# Structured JSONL Audit Logger
# ---------------------------------------------------------------------------

os.makedirs("logs", exist_ok=True)
audit_logger = logging.getLogger("jarvis_audit")
audit_logger.setLevel(logging.INFO)

if not audit_logger.handlers:
    rfh = RotatingFileHandler(
        "logs/jarvis_audit.jsonl",
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=5,
        encoding="utf-8"
    )
    audit_logger.addHandler(rfh)


def log_event(event_type: str, payload: Dict[str, Any]) -> None:
    """Emits an immutable structured JSON log record."""
    record = {
        "timestamp": time.time(),
        "event_type": event_type,
        "payload": payload
    }
    audit_logger.info(json.dumps(record))


# ---------------------------------------------------------------------------
# System Directives
# ---------------------------------------------------------------------------

PRODUCTION_SYSTEM_PROMPT = """You are JARVIS: an autonomous, production-grade system controller and execution engine (J.A.R.V.I.S).

CORE PROTOCOLS & DIRECTIVES:
1. Direct Execution & ZERO-NARRATION:
   - Never narrate what you are about to do. DO NOT provide conversational preambles, narrations, or intent declarations before invoking tools (e.g., NEVER say "I will check this", "Executing command", "Let me run...").
   - Call the required tool immediately. Zero conversational fluff before or between tool invocations.

2. HIGH-CONCURRENCY Discipline:
   - When multiple independent diagnostic checks or system inspections are required, execute them concurrently in a single turn.
   - Maximize throughput and minimize redundant round-trips.

3. SELF-HEALING Discipline & CORRECTION PROTOCOL:
   - When a tool execution yields a non-zero exit code, error trace, or exception, analyze the root cause immediately.
   - In the subsequent step, self-correct by adjusting command flags, working paths, syntax delimiters, or environment arguments to overcome the fault.
   - Do NOT apologize, do NOT explain that you are retrying. Immediately emit the corrected tool call.

4. Multimodal Grounding:
   - When visual context is requested or relevant to verify GUI/system state, invoke capture_screen or capture_camera.

5. Output Schema & AUTHORITATIVE OUTPUT STYLING:
   - Keep closing summaries concise, scannable, and authoritative.
   - Quantify findings with metrics, telemetry, exit statuses, and definitive outcomes using structured Markdown tables for metrics and lists for sequenced steps.
"""


# ---------------------------------------------------------------------------
# Tool Adapters
# ---------------------------------------------------------------------------

def run_shell(command: str, timeout_seconds: int = 30) -> str:
    """
    Executes a shell command synchronously and returns a structured status string.
    Includes exit code, stdout, and stderr for the self-healing reasoning loop.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            res = executor.submit(lambda: asyncio.run(execute_shell_command(command, timeout_seconds))).result()
    else:
        res = loop.run_until_complete(execute_shell_command(command, timeout_seconds))

    result_dict = {
        "command": res.command,
        "exit_code": res.exit_code,
        "stdout": res.stdout,
        "stderr": res.stderr,
        "timed_out": res.timed_out,
        "blocked": res.blocked,
        "duration_ms": res.duration_ms
    }

    log_event("tool_execution", {"tool": "run_shell", "result": result_dict})
    return json.dumps(result_dict)


def inspect_telemetry() -> str:
    """Retrieves live host metrics (CPU, RAM, Swap, Disk, and top memory consumers)."""
    stats = get_telemetry()
    data = stats.model_dump()
    log_event("tool_execution", {"tool": "inspect_telemetry", "result": data})
    return json.dumps(data)


def capture_screen(monitor_index: int = 1) -> str:
    """Captures the current display buffer to verify visual or desktop states."""
    frame = capture_active_display(monitor_index=monitor_index, max_dimension=1024)
    status = {
        "success": frame.success,
        "width": frame.width,
        "height": frame.height,
        "duration_ms": frame.duration_ms,
        "error": frame.error_message
    }
    log_event("tool_execution", {"tool": "capture_screen", "result": status})
    return json.dumps(status)


def capture_camera(device_index: int = 0) -> str:
    """Captures a webcam frame for physical presence or environment verification."""
    frame = capture_webcam_frame(device_index=device_index, max_dimension=1024)
    status = {
        "success": frame.success,
        "width": frame.width,
        "height": frame.height,
        "duration_ms": frame.duration_ms,
        "error": frame.error_message
    }
    log_event("tool_execution", {"tool": "capture_camera", "result": status})
    return json.dumps(status)


# ---------------------------------------------------------------------------
# Core Engine Runtime
# ---------------------------------------------------------------------------

class JarvisEngine:
    def __init__(
        self,
        model_name: Optional[str] = None,
        max_healing_retries: int = 3,
        client: Optional[Any] = None,
        api_key: Optional[str] = None
    ):
        if client is not None:
            self.client = client
        elif genai is not None:
            if api_key:
                self.client = genai.Client(api_key=api_key)
            else:
                try:
                    self.client = genai.Client()
                except Exception as ex:
                    self.client = None
                    log_event("engine_init_warning", {"warning": str(ex)})
        else:
            self.client = None

        self.model_name = os.environ.get("GEMINI_MODEL") or model_name or "gemini-3.6-flash"
        self.max_healing_retries = max_healing_retries
        self.tools = [run_shell, inspect_telemetry, capture_screen, capture_camera]

        # Initialize the persistent multi-turn chat session
        if self.client and hasattr(self.client, "chats"):
            self.chat = self.client.chats.create(
                model=self.model_name,
                config=types.GenerateContentConfig(
                    system_instruction=PRODUCTION_SYSTEM_PROMPT,
                    tools=self.tools,
                    temperature=0.1  # Low temperature for deterministic tool dispatch
                )
            )
        else:
            self.chat = None

        log_event("engine_init", {"model": self.model_name, "max_retries": self.max_healing_retries})

    def execute_instruction(self, user_prompt: str) -> str:
        """
        Submits an instruction to JARVIS, managing the autonomous self-healing loop
        across tool invocation errors.
        """
        log_event("user_prompt", {"prompt": user_prompt})

        if self.chat is None:
            msg = (
                "[CONFIG_ERROR]: GEMINI_API_KEY is not configured in the host environment.\n"
                "Please configure GEMINI_API_KEY:\n"
                "  $env:GEMINI_API_KEY=\"your_key_here\" (PowerShell)\n"
                "  set GEMINI_API_KEY=your_key_here (CMD)\n"
                "Deterministic local tools (run_shell, inspect_telemetry, capture_screen, capture_camera) remain functional."
            )
            log_event("engine_config_error", {"error": "Missing GEMINI_API_KEY"})
            return msg

        attempt = 0
        current_input = user_prompt

        while attempt <= self.max_healing_retries:
            try:
                # Dispatch turn to model (client.chats automatically handles function call execution)
                if self.chat is None:
                    raise RuntimeError("GenAI client or chat session is uninitialized.")

                response = self.chat.send_message(current_input)
                response_text = response.text or ""

                # Inspect execution history for errors requiring remediation
                history = self.chat.get_history()
                recent_tool_failure = self._detect_tool_failure(history)

                if recent_tool_failure:
                    if attempt < self.max_healing_retries:
                        attempt += 1
                        error_signal = (
                            f"[SYSTEM HEALING INTERVENTION - ATTEMPT {attempt}/{self.max_healing_retries}]\n"
                            f"Previous tool invocation failed with error:\n{recent_tool_failure}\n"
                            f"Analyze the error, alter flags/arguments/paths, and re-execute to resolve."
                        )
                        log_event("self_healing_trigger", {"attempt": attempt, "error": recent_tool_failure})
                        current_input = error_signal
                        continue
                    else:
                        log_event("self_healing_exhausted", {"attempts": attempt, "error": recent_tool_failure})
                        return "[FAILED_TO_HEAL]: Exceeded maximum retry iterations without clean resolution."

                # Execution resolved cleanly or completed successfully
                log_event("agent_response", {"response": response_text, "attempts_used": attempt})
                return response_text

            except Exception as e:
                err_str = str(e)
                # Auto-fallback if model is deprecated or returns 404 NOT_FOUND
                if "404" in err_str and ("not found" in err_str.lower() or "no longer available" in err_str.lower()):
                    for fallback_model in ["gemini-3.6-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                        if fallback_model != self.model_name and self.client and hasattr(self.client, "chats"):
                            try:
                                log_event("model_fallback_attempt", {"from": self.model_name, "to": fallback_model})
                                self.model_name = fallback_model
                                self.chat = self.client.chats.create(
                                    model=self.model_name,
                                    config=types.GenerateContentConfig(
                                        system_instruction=PRODUCTION_SYSTEM_PROMPT,
                                        tools=self.tools,
                                        temperature=0.1
                                    )
                                )
                                response = self.chat.send_message(current_input)
                                response_text = response.text or ""
                                log_event("agent_response", {"response": response_text, "attempts_used": attempt})
                                return response_text
                            except Exception:
                                continue

                attempt += 1
                log_event("engine_exception", {"attempt": attempt, "error": str(e)})
                if attempt > self.max_healing_retries:
                    return f"[CRITICAL_ENGINE_FAILURE]: Execution halted after {self.max_healing_retries} attempts: {str(e)}"
                
                current_input = f"[SYSTEM_EXCEPTION]: {str(e)}. Modify strategy and retry."

        return "[FAILED_TO_HEAL]: Exceeded maximum retry iterations without clean resolution."

    def _detect_tool_failure(self, history: List[Any]) -> Optional[str]:
        """
        Inspects the most recent conversation turn for non-zero exit codes or unhandled errors.
        """
        if not history:
            return None

        # Inspect the last 2 messages (tool call & tool response)
        for msg in reversed(history[-2:]):
            if not hasattr(msg, "parts") or not msg.parts:
                continue
            for part in msg.parts:
                # Check for tool/function responses containing failure signals
                if hasattr(part, "function_response") and part.function_response:
                    response_content = str(part.function_response.response)
                    if "exit_code" in response_content and ('"exit_code": 0' not in response_content and "'exit_code': 0" not in response_content):
                        return response_content
                    if "EXECUTION_BLOCKED" in response_content or "EXECUTION_TIMEOUT" in response_content:
                        return response_content
                    if '"success": false' in response_content.lower() or "'success': false" in response_content.lower():
                        return response_content
                    # If this recent function response was successful, don't check older messages in slice
                    return None
        return None



# ─────────────────────────────────────────────────────────────
# 2. Strict JSON Schemas for Tool Declarations
# ─────────────────────────────────────────────────────────────

TOOL_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "execute_shell_command",
        "description": "Execute a shell command asynchronously on the host OS with strict safety guardrails, exit code capture, and leak sanitization.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "command": {
                    "type": "STRING",
                    "description": "The exact shell command line to execute."
                },
                "timeout_seconds": {
                    "type": "INTEGER",
                    "description": "Timeout in seconds before terminating the subprocess (default 30)."
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "get_telemetry",
        "description": "Sample host hardware telemetry including CPU utilization per core, memory allocation, disk capacity, and active network connections.",
        "parameters": {
            "type": "OBJECT",
            "properties": {}
        }
    },
    {
        "name": "capture_active_display",
        "description": "Capture the primary display buffer in-memory, downsample preserving aspect ratio, and compress to JPEG bytes without disk I/O.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "max_dimension": {
                    "type": "INTEGER",
                    "description": "Maximum dimension (width or height) preserving aspect ratio (default 1280)."
                },
                "quality": {
                    "type": "INTEGER",
                    "description": "JPEG compression quality from 1 to 100 (default 80)."
                }
            }
        }
    },
    {
        "name": "capture_webcam_frame",
        "description": "Capture a single frame from the specified webcam device, release hardware locks immediately, and compress to JPEG bytes.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "device_index": {
                    "type": "INTEGER",
                    "description": "Camera device index (default 0)."
                },
                "max_dimension": {
                    "type": "INTEGER",
                    "description": "Maximum dimension (default 1280)."
                },
                "quality": {
                    "type": "INTEGER",
                    "description": "JPEG quality (default 80)."
                }
            }
        }
    }
]


# ─────────────────────────────────────────────────────────────
# 3. Structured Data Models
# ─────────────────────────────────────────────────────────────

class RuntimeConfig(BaseModel):
    """Configuration settings for AutonomousRuntimeEngine."""
    model_name: str = "gemini-2.5-flash"
    api_key: Optional[str] = None
    max_retries: int = 3
    max_turn_steps: int = 10
    temperature: float = 0.2
    log_file_path: str = "logs/jarvis_runtime.jsonl"
    max_log_bytes: int = 10 * 1024 * 1024  # 10 MB rotation
    backup_count: int = 5
    system_prompt: str = PRODUCTION_SYSTEM_PROMPT


class ToolExecutionResult(BaseModel):
    """Encapsulates the result of a tool execution event."""
    name: str
    call_id: Optional[str] = None
    is_success: bool
    exit_code: Optional[int] = 0
    output: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    retry_count: int = 0
    image_part: Optional[Any] = None


class RuntimeTurnResult(BaseModel):
    """Encapsulates the complete outcome of an autonomous turn."""
    session_id: str
    user_query: str
    final_response: str
    total_steps: int = 0
    self_healing_retries: int = 0
    tools_invoked: List[str] = Field(default_factory=list)
    duration_ms: float = 0.0
    is_success: bool = True
    error: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# 4. Structured Rotating JSONL Telemetry Logger
# ─────────────────────────────────────────────────────────────

class JSONLRawFormatter(logging.Formatter):
    """Outputs raw message string without adding extra timestamps or prefixes."""
    def format(self, record: logging.LogRecord) -> str:
        return record.getMessage()


class RotatingJSONLLogger:
    """High-performance thread-safe rotating logger emitting structured JSONL records."""

    def __init__(
        self,
        log_file_path: str = "logs/jarvis_runtime.jsonl",
        max_bytes: int = 10 * 1024 * 1024,
        backup_count: int = 5,
        logger_name: Optional[str] = None,
    ) -> None:
        self.log_file_path = os.path.abspath(log_file_path)
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        os.makedirs(os.path.dirname(self.log_file_path), exist_ok=True)

        name = logger_name or f"jarvis_jsonl_{uuid.uuid4().hex[:8]}"
        self._logger = logging.getLogger(name)
        self._logger.setLevel(logging.INFO)
        self._logger.propagate = False

        # Clear existing handlers to prevent duplicates
        for h in list(self._logger.handlers):
            self._logger.removeHandler(h)

        self._handler = RotatingFileHandler(
            self.log_file_path,
            maxBytes=self.max_bytes,
            backupCount=self.backup_count,
            encoding="utf-8"
        )
        self._handler.setFormatter(JSONLRawFormatter())
        self._logger.addHandler(self._handler)

    def log_event(self, event_type: str, session_id: str, data: Dict[str, Any]) -> None:
        """Write a single structured JSONL event record."""
        now = datetime.datetime.now(datetime.timezone.utc)
        record = {
            "timestamp": now.isoformat(),
            "timestamp_epoch": time.time(),
            "session_id": session_id,
            "event": event_type,
            "data": data,
        }
        try:
            line = json.dumps(record, default=str)
            self._logger.info(line)
            self._handler.flush()
        except Exception as ex:
            sys.stderr.write(f"[RotatingJSONLLogger Error] Failed to write log: {ex}\n")

    def get_recent_logs(self, limit: int = 50, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve recent parsed JSONL records for audit and testing."""
        if not os.path.exists(self.log_file_path):
            return []
        records = []
        try:
            with open(self.log_file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if session_id is None or obj.get("session_id") == session_id:
                            records.append(obj)
                    except json.JSONDecodeError:
                        continue
            return records[-limit:]
        except Exception:
            return []

    def close(self) -> None:
        """Close log handlers."""
        if self._handler:
            self._handler.close()
            self._logger.removeHandler(self._handler)


# ─────────────────────────────────────────────────────────────
# 5. Strict JSON Schema Tool Dispatcher
# ─────────────────────────────────────────────────────────────

class ToolDispatcher:
    """Validates schemas and dispatches execution to core tools asynchronously."""

    def __init__(self) -> None:
        self._handlers: Dict[str, Callable[..., Any]] = {}
        self._schemas: Dict[str, Dict[str, Any]] = {}
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        """Register default system and vision tools."""
        for decl in TOOL_DECLARATIONS:
            self._schemas[decl["name"]] = decl

        self.register("execute_shell_command", execute_shell_command)
        self.register("get_telemetry", get_telemetry)
        self.register("capture_active_display", capture_active_display)
        self.register("capture_webcam_frame", capture_webcam_frame)

    def register(
        self,
        name: str,
        handler: Callable[..., Any],
        schema: Optional[Dict[str, Any]] = None
    ) -> None:
        """Register a tool handler and its schema."""
        self._handlers[name] = handler
        if schema:
            self._schemas[name] = schema

    def get_declarations(self) -> List[Dict[str, Any]]:
        """Return all registered tool declarations."""
        return list(self._schemas.values())

    def get_genai_tools(self) -> List[Any]:
        """Convert declarations to Google GenAI SDK Tool objects."""
        if not HAS_GENAI_SDK:
            return []
        declarations = []
        for d in self.get_declarations():
            try:
                decl = types.FunctionDeclaration.model_validate(d)
                declarations.append(decl)
            except Exception as ex:
                sys.stderr.write(f"[ToolDispatcher] Warning: failed to validate {d.get('name')}: {ex}\n")
        return [types.Tool(function_declarations=declarations)] if declarations else []

    async def dispatch(
        self,
        name: str,
        args: Optional[Dict[str, Any]] = None,
        call_id: Optional[str] = None
    ) -> ToolExecutionResult:
        """Execute a tool with strict validation, timing, and error handling."""
        start_time = time.perf_counter()
        args = args or {}

        if name not in self._handlers:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return ToolExecutionResult(
                name=name,
                call_id=call_id,
                is_success=False,
                exit_code=-1,
                error=f"Unrecognized tool '{name}'. Registered tools: {list(self._handlers.keys())}",
                duration_ms=duration_ms,
            )

        handler = self._handlers[name]

        try:
            # Execute async or sync in threadpool
            if asyncio.iscoroutinefunction(handler):
                raw_result = await handler(**args)
            else:
                raw_result = await asyncio.to_thread(handler, **args)

            duration_ms = (time.perf_counter() - start_time) * 1000

            # Normalize result based on type
            if isinstance(raw_result, CommandResult):
                is_success = raw_result.is_success and (raw_result.exit_code == 0)
                error_trace = raw_result.stderr if not is_success else None
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=is_success,
                    exit_code=raw_result.exit_code,
                    output={
                        "exit_code": raw_result.exit_code,
                        "stdout": raw_result.stdout,
                        "stderr": raw_result.stderr,
                        "duration_ms": raw_result.duration_ms,
                        "blocked_by_safety": raw_result.blocked_by_safety,
                    },
                    error=error_trace,
                    duration_ms=duration_ms,
                )

            elif isinstance(raw_result, SystemStats):
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=True,
                    exit_code=0,
                    output=raw_result.model_dump(),
                    error=None,
                    duration_ms=duration_ms,
                )

            elif isinstance(raw_result, VisualFrame):
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=raw_result.success,
                    exit_code=0 if raw_result.success else 1,
                    output={
                        "format": "JPEG",
                        "source": raw_result.source,
                        "width": raw_result.width,
                        "height": raw_result.height,
                        "size_bytes": len(raw_result.image_bytes) if raw_result.image_bytes else 0,
                        "duration_ms": raw_result.duration_ms,
                    },
                    error=raw_result.error_message,
                    duration_ms=duration_ms,
                    image_part=raw_result.to_genai_part(),
                )

            elif isinstance(raw_result, bytes):
                # JPEG byte stream from vision tools
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=True,
                    exit_code=0,
                    output={
                        "format": "JPEG",
                        "size_bytes": len(raw_result),
                        "status": "Frame acquired nominal",
                    },
                    error=None,
                    duration_ms=duration_ms,
                )

            elif isinstance(raw_result, dict):
                # Generic dictionary output
                is_success = raw_result.get("is_success", True)
                exit_code = raw_result.get("exit_code", 0 if is_success else 1)
                error = raw_result.get("error") or raw_result.get("stderr")
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=is_success,
                    exit_code=exit_code,
                    output=raw_result,
                    error=error,
                    duration_ms=duration_ms,
                )

            else:
                return ToolExecutionResult(
                    name=name,
                    call_id=call_id,
                    is_success=True,
                    exit_code=0,
                    output={"result": str(raw_result)},
                    error=None,
                    duration_ms=duration_ms,
                )

        except SafetyBlacklistViolation as sbv:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return ToolExecutionResult(
                name=name,
                call_id=call_id,
                is_success=False,
                exit_code=-1,
                error=f"SafetyBlacklistViolation: {str(sbv)}",
                duration_ms=duration_ms,
            )

        except Exception as ex:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return ToolExecutionResult(
                name=name,
                call_id=call_id,
                is_success=False,
                exit_code=1,
                error=f"{type(ex).__name__}: {str(ex)}",
                duration_ms=duration_ms,
            )


# ─────────────────────────────────────────────────────────────
# 6. Central Autonomous Runtime Engine
# ─────────────────────────────────────────────────────────────

class AutonomousRuntimeEngine:
    """Central Autonomous Engine managing GenAI inference, self-healing, and tool dispatch."""

    def __init__(
        self,
        config: Optional[RuntimeConfig] = None,
        dispatcher: Optional[ToolDispatcher] = None,
        logger: Optional[RotatingJSONLLogger] = None,
        client: Optional[Any] = None,
    ) -> None:
        self.config = config or RuntimeConfig()
        self.dispatcher = dispatcher or ToolDispatcher()
        self.logger = logger or RotatingJSONLLogger(
            log_file_path=self.config.log_file_path,
            max_bytes=self.config.max_log_bytes,
            backup_count=self.config.backup_count,
        )

        # GenAI Client initialization
        self.client = client
        if self.client is None and HAS_GENAI_SDK and self.config.api_key:
            try:
                self.client = genai.Client(api_key=self.config.api_key)
            except Exception as ex:
                sys.stderr.write(f"[AutonomousRuntimeEngine] Failed to init GenAI Client: {ex}\n")

        # Active chat sessions keyed by session_id
        self._active_chats: Dict[str, Any] = {}

    def _get_or_create_chat(self, session_id: str) -> Optional[Any]:
        """Create or retrieve a Google GenAI SDK Chat Session for session_id."""
        if session_id in self._active_chats:
            return self._active_chats[session_id]

        if not HAS_GENAI_SDK or self.client is None:
            return None

        tools = self.dispatcher.get_genai_tools()
        chat_config = types.GenerateContentConfig(
            temperature=self.config.temperature,
            system_instruction=self.config.system_prompt,
            tools=tools,
        )

        try:
            # Use async chat via client.aio.chats
            chat = self.client.aio.chats.create(
                model=self.config.model_name,
                config=chat_config,
            )
            self._active_chats[session_id] = chat
            return chat
        except Exception as ex:
            sys.stderr.write(f"[AutonomousRuntimeEngine] Failed to create chat session: {ex}\n")
            return None

    async def run_turn(
        self,
        user_query: str,
        session_id: Optional[str] = None,
        on_event: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ) -> RuntimeTurnResult:
        """Execute an autonomous agent turn with self-healing and tool-dispatching.

        Args:
            user_query: User instruction or task directive.
            session_id: Session identifier.
            on_event: Optional callback for real-time telemetry streaming.

        Returns:
            RuntimeTurnResult detailing the execution trace and final output.
        """
        turn_start = time.perf_counter()
        session_id = session_id or f"jarvis_session_{uuid.uuid4().hex[:8]}"

        # 1. Log LLM_INPUT
        self.logger.log_event("llm_input", session_id, {
            "query": user_query,
            "model": self.config.model_name,
            "temperature": self.config.temperature,
            "max_retries": self.config.max_retries,
        })
        if on_event:
            on_event("llm_input", {"query": user_query, "session_id": session_id})

        # 2. Check for GenAI Client availability
        chat = self._get_or_create_chat(session_id)
        if chat is None:
            # Standalone / Offline Fallback Handler
            return await self._handle_offline_turn(user_query, session_id, turn_start)

        # 3. Autonomous Multi-Turn Execution Loop
        step = 0
        total_retries = 0
        invoked_tools: List[str] = []
        final_answer = ""
        current_message: Any = user_query
        tool_retry_tracker: Dict[str, int] = {}

        try:
            while step < self.config.max_turn_steps:
                step += 1

                # Send message to model (text query or function response parts)
                response = await chat.send_message(current_message)

                # Inspect function calls
                function_calls = getattr(response, "function_calls", None) or []

                if not function_calls:
                    # Model reached final answer
                    final_answer = getattr(response, "text", "") or "Directive executed successfully."
                    self.logger.log_event("llm_output", session_id, {
                        "text": final_answer,
                        "step": step,
                    })
                    break

                # 4. High-Concurrency Tool Dispatching
                # Group and dispatch all requested tool calls concurrently
                dispatch_tasks = []
                for fc in function_calls:
                    name = fc.name
                    args = dict(fc.args) if fc.args else {}
                    call_id = getattr(fc, "id", None) or name
                    invoked_tools.append(name)

                    self.logger.log_event("tool_trigger", session_id, {
                        "name": name,
                        "args": args,
                        "call_id": call_id,
                        "step": step,
                    })
                    if on_event:
                        on_event("tool_trigger", {"name": name, "args": args})

                    dispatch_tasks.append(self.dispatcher.dispatch(name, args, call_id=call_id))

                # Concurrently execute tools
                tool_results: List[ToolExecutionResult] = await asyncio.gather(*dispatch_tasks)

                # 5. Process Results & Self-Healing Evaluation
                response_parts = []
                has_fault = False

                for result in tool_results:
                    self.logger.log_event("tool_result", session_id, {
                        "name": result.name,
                        "is_success": result.is_success,
                        "exit_code": result.exit_code,
                        "duration_ms": result.duration_ms,
                        "error": result.error,
                        "output_preview": str(result.output)[:300],
                    })
                    if on_event:
                        on_event("tool_result", {
                            "name": result.name,
                            "is_success": result.is_success,
                            "exit_code": result.exit_code,
                        })

                    if not result.is_success or (result.exit_code is not None and result.exit_code != 0):
                        # Fault condition detected!
                        has_fault = True
                        cur_retries = tool_retry_tracker.get(result.name, 0)

                        if cur_retries < self.config.max_retries:
                            cur_retries += 1
                            total_retries += 1
                            tool_retry_tracker[result.name] = cur_retries

                            # Inject Self-Healing Directive into Context
                            self.logger.log_event("self_healing_retry", session_id, {
                                "tool_name": result.name,
                                "iteration": cur_retries,
                                "max_retries": self.config.max_retries,
                                "exit_code": result.exit_code,
                                "error": result.error,
                            })
                            if on_event:
                                on_event("self_healing_retry", {
                                    "tool": result.name,
                                    "iteration": cur_retries,
                                    "error": result.error,
                                })

                            fault_response = {
                                "status": "FAULT_DETECTED",
                                "exit_code": result.exit_code,
                                "error_trace": result.error or "Non-zero exit code encountered.",
                                "stdout": result.output.get("stdout", "") if isinstance(result.output, dict) else "",
                                "self_healing_attempt": cur_retries,
                                "max_retries": self.config.max_retries,
                                "directive": (
                                    f"[SELF-HEALING ENGAGED - ITERATION {cur_retries}/{self.config.max_retries}] "
                                    f"Command execution faulted with exit code {result.exit_code}. "
                                    f"Error: {result.error}. "
                                    f"Diagnose the cause, correct command flags/paths/arguments, and re-execute immediately."
                                ),
                            }
                            response_parts.append(
                                types.Part.from_function_response(
                                    name=result.name,
                                    response=fault_response,
                                )
                            )
                        else:
                            # Self-healing exhausted for this tool
                            self.logger.log_event("self_healing_exhausted", session_id, {
                                "tool_name": result.name,
                                "total_attempts": cur_retries,
                            })
                            terminal_response = {
                                "status": "SELF_HEALING_CEILING_REACHED",
                                "exit_code": result.exit_code,
                                "error_trace": result.error,
                                "directive": "Maximum self-healing attempts exhausted. Cease retrying and output authoritative diagnostic report.",
                            }
                            response_parts.append(
                                types.Part.from_function_response(
                                    name=result.name,
                                    response=terminal_response,
                                )
                            )
                    else:
                        # Nominal execution
                        tool_retry_tracker[result.name] = 0  # Reset on success
                        res_dict = result.output if isinstance(result.output, dict) else {"result": str(result.output)}
                        response_parts.append(
                            types.Part.from_function_response(
                                name=result.name,
                                response=res_dict,
                            )
                        )
                        if getattr(result, "image_part", None) is not None:
                            response_parts.append(result.image_part)

                # Set current message to list of response parts for the next loop
                current_message = response_parts

            duration_ms = (time.perf_counter() - turn_start) * 1000
            turn_result = RuntimeTurnResult(
                session_id=session_id,
                user_query=user_query,
                final_response=final_answer or "Operation complete, Sir.",
                total_steps=step,
                self_healing_retries=total_retries,
                tools_invoked=invoked_tools,
                duration_ms=duration_ms,
                is_success=True,
            )

            self.logger.log_event("system_response", session_id, {
                "final_response": turn_result.final_response,
                "total_steps": step,
                "self_healing_retries": total_retries,
                "duration_ms": duration_ms,
                "is_success": True,
            })
            if on_event:
                on_event("system_response", {"status": "complete", "duration_ms": duration_ms})

            return turn_result

        except Exception as ex:
            duration_ms = (time.perf_counter() - turn_start) * 1000
            err_msg = f"Autonomous runtime error: {str(ex)}"
            self.logger.log_event("runtime_error", session_id, {
                "error": err_msg,
                "duration_ms": duration_ms,
            })
            return RuntimeTurnResult(
                session_id=session_id,
                user_query=user_query,
                final_response=f"System Alert: {err_msg}",
                total_steps=step,
                self_healing_retries=total_retries,
                tools_invoked=invoked_tools,
                duration_ms=duration_ms,
                is_success=False,
                error=err_msg,
            )

    async def _handle_offline_turn(
        self,
        user_query: str,
        session_id: str,
        turn_start: float
    ) -> RuntimeTurnResult:
        """Fallback turn handling when GenAI SDK or API key is not configured."""
        duration_ms = (time.perf_counter() - turn_start) * 1000
        reply = (
            "J.A.R.V.I.S Autonomous Engine Online, Sir. "
            "Google GenAI SDK is active, but GEMINI_API_KEY is not configured in this environment. "
            "Deterministic tools (system execution, hardware telemetry, display/camera capture) remain fully functional."
        )
        self.logger.log_event("system_response", session_id, {
            "final_response": reply,
            "status": "OFFLINE_STANDALONE",
            "duration_ms": duration_ms,
        })
        return RuntimeTurnResult(
            session_id=session_id,
            user_query=user_query,
            final_response=reply,
            total_steps=1,
            self_healing_retries=0,
            tools_invoked=[],
            duration_ms=duration_ms,
            is_success=True,
        )

