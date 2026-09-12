"""Comprehensive Pytest Suite for core.engine.

Verifies:
- Production system prompt operational directives (zero-narration, concurrency, authoritative styling)
- Strict JSON schema tool declarations and Google GenAI SDK types conversion
- ToolDispatcher asynchronous execution, telemetry sampling, and safety guards
- RotatingJSONLLogger structured JSONL emission, record querying, and file size rotation
- AutonomousRuntimeEngine offline fallback mode
- Self-healing retry loop: non-zero exit code fault detection, context injection, flag adjustment, and successful self-correction
- Self-healing retry exhaustion ceiling (max 3 attempts)
- High-concurrency parallel tool dispatching (multiple tool calls in a single turn)
"""

import asyncio
import json
import os
import tempfile
import uuid
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import types

from core.engine import (
    JarvisEngine,
    run_shell,
    inspect_telemetry,
    capture_screen,
    capture_camera,
    log_event,
    audit_logger,
    AutonomousRuntimeEngine,
    RuntimeConfig,
    RuntimeTurnResult,
    ToolDispatcher,
    ToolExecutionResult,
    RotatingJSONLLogger,
    PRODUCTION_SYSTEM_PROMPT,
    TOOL_DECLARATIONS,
)


# ─────────────────────────────────────────────────────────────
# 1. Production System Prompt & Schema Integrity Tests
# ─────────────────────────────────────────────────────────────

def test_production_system_prompt_directives():
    """Verify system prompt enforces zero-narration, high-concurrency, self-healing, and authoritative style."""
    prompt = PRODUCTION_SYSTEM_PROMPT

    assert "ZERO-NARRATION" in prompt
    assert "DO NOT provide conversational preambles" in prompt
    assert "HIGH-CONCURRENCY" in prompt
    assert "concurrently" in prompt
    assert "SELF-HEALING" in prompt
    assert "AUTHORITATIVE OUTPUT STYLING" in prompt
    assert "J.A.R.V.I.S" in prompt


def test_tool_declarations_valid_genai_schemas():
    """Verify tool declarations conform to Google GenAI SDK FunctionDeclaration schemas."""
    dispatcher = ToolDispatcher()
    genai_tools = dispatcher.get_genai_tools()

    assert len(genai_tools) == 1
    tool = genai_tools[0]
    assert hasattr(tool, "function_declarations")
    assert len(tool.function_declarations) >= 4

    names = [fd.name for fd in tool.function_declarations]
    assert "execute_shell_command" in names
    assert "get_telemetry" in names
    assert "capture_active_display" in names
    assert "capture_webcam_frame" in names


# ─────────────────────────────────────────────────────────────
# 2. Tool Dispatcher Tests
# ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tool_dispatcher_execute_shell_command():
    """Verify tool dispatcher executes safe shell commands and returns structured results."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch(
        "execute_shell_command",
        {"command": "python -c \"print('DISPATCH_TEST_SUCCESS')\""}
    )

    assert result.is_success is True
    assert result.exit_code == 0
    assert result.error is None
    assert "DISPATCH_TEST_SUCCESS" in result.output["stdout"]
    assert result.duration_ms > 0.0


@pytest.mark.asyncio
async def test_tool_dispatcher_non_zero_exit():
    """Verify tool dispatcher captures non-zero exit codes as faults."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch(
        "execute_shell_command",
        {"command": "python -c \"import sys; sys.stderr.write('MissingFlagError\\n'); sys.exit(2)\""}
    )

    assert result.is_success is False
    assert result.exit_code == 2
    assert result.error is not None
    assert "MissingFlagError" in result.error


@pytest.mark.asyncio
async def test_tool_dispatcher_safety_blacklist_interception():
    """Verify tool dispatcher intercepts destructive commands with safety violation."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch(
        "execute_shell_command",
        {"command": "rm -rf /"}
    )

    assert result.is_success is False
    assert result.exit_code in (-1, 126)
    assert result.output["blocked_by_safety"] is True


@pytest.mark.asyncio
async def test_tool_dispatcher_get_telemetry():
    """Verify tool dispatcher samples and serializes hardware telemetry."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch("get_telemetry", {})

    assert result.is_success is True
    assert result.exit_code == 0
    assert isinstance(result.output, dict)
    assert "cpu_percent_total" in result.output
    assert ("memory" in result.output) or ("memory_used_gb" in result.output)
    assert ("disk" in result.output) or ("disk_free_gb" in result.output)


@pytest.mark.asyncio
async def test_tool_dispatcher_vision_capture():
    """Verify tool dispatcher executes visual display capture."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch(
        "capture_active_display",
        {"max_dimension": 640, "quality": 70}
    )

    assert result.name == "capture_active_display"
    assert isinstance(result.output, dict)
    assert result.output.get("format") == "JPEG"
    if not result.is_success:
        assert "DISPLAY_CAPTURE_ERROR" in result.error
    else:
        assert result.exit_code == 0
        assert result.output["size_bytes"] > 0


@pytest.mark.asyncio
async def test_tool_dispatcher_unregistered_tool():
    """Verify tool dispatcher handles unregistered tools gracefully."""
    dispatcher = ToolDispatcher()
    result: ToolExecutionResult = await dispatcher.dispatch("invalid_tool_xyz", {})

    assert result.is_success is False
    assert result.exit_code == -1
    assert "Unrecognized tool" in result.error


# ─────────────────────────────────────────────────────────────
# 3. Rotating JSONL Logger Tests
# ─────────────────────────────────────────────────────────────

def test_rotating_jsonl_logger_events_and_retrieval():
    """Verify RotatingJSONLLogger writes valid JSONL lines and retrieves recent records."""
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "test_runtime.jsonl")
        logger = RotatingJSONLLogger(log_file_path=log_path, max_bytes=10000)

        session_id = f"test_session_{uuid.uuid4().hex[:6]}"
        logger.log_event("llm_input", session_id, {"query": "Check telemetry"})
        logger.log_event("tool_trigger", session_id, {"name": "get_telemetry"})
        logger.log_event("tool_result", session_id, {"exit_code": 0, "status": "ok"})
        logger.log_event("system_response", session_id, {"final_response": "Telemetry nominal, Sir."})

        # Verify physical file existence and line count
        assert os.path.exists(log_path)
        with open(log_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        assert len(lines) == 4
        for line in lines:
            obj = json.loads(line)
            assert obj["session_id"] == session_id
            assert "timestamp" in obj
            assert "timestamp_epoch" in obj
            assert "event" in obj
            assert "data" in obj

        # Verify get_recent_logs
        records = logger.get_recent_logs(session_id=session_id)
        assert len(records) == 4
        assert records[0]["event"] == "llm_input"
        assert records[3]["event"] == "system_response"

        logger.close()


def test_rotating_jsonl_logger_rotation():
    """Verify log rotation triggers when max_bytes threshold is reached."""
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "rot_test.jsonl")
        # Very small max_bytes to force rotation quickly
        logger = RotatingJSONLLogger(log_file_path=log_path, max_bytes=500, backup_count=3)

        session_id = "rot_session"
        # Write enough events to trigger multiple rotations
        for i in range(30):
            logger.log_event("test_event", session_id, {"index": i, "padding": "x" * 50})

        logger.close()

        # Verify rotated backup files exist
        assert os.path.exists(log_path)
        assert os.path.exists(f"{log_path}.1")


# ─────────────────────────────────────────────────────────────
# 4. Autonomous Runtime Engine Tests
# ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_autonomous_engine_offline_fallback():
    """Verify engine handles turn gracefully when no GenAI client/API key is present."""
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "offline.jsonl")
        config = RuntimeConfig(api_key=None, log_file_path=log_path)
        engine = AutonomousRuntimeEngine(config=config, client=None)

        result: RuntimeTurnResult = await engine.run_turn("Inspect system status")

        assert result.is_success is True
        assert "Autonomous Engine Online" in result.final_response
        assert result.total_steps == 1
        assert result.self_healing_retries == 0

        logs = engine.logger.get_recent_logs()
        assert len(logs) >= 2
        assert logs[0]["event"] == "llm_input"
        assert logs[-1]["event"] == "system_response"

        engine.logger.close()


@pytest.mark.asyncio
async def test_autonomous_engine_self_healing_retry_loop():
    """Verify self-healing loop: catches non-zero exit code, provides error context,

    adjusts flags, and completes nominally within 3 iterations.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "self_healing.jsonl")
        config = RuntimeConfig(api_key="mock_key", log_file_path=log_path, max_retries=3)

        dispatcher = ToolDispatcher()

        # Create custom mock tool that fails on first call (exit code 127) and succeeds on corrected call
        call_history = []

        async def dynamic_script_runner(script_name: str, flag: str = ""):
            call_history.append((script_name, flag))
            if flag != "--production":
                return {
                    "is_success": False,
                    "exit_code": 1,
                    "stderr": f"MissingRequiredFlagError: '{script_name}' requires '--production' flag.",
                }
            return {
                "is_success": True,
                "exit_code": 0,
                "stdout": "Pipeline executed nominally in production mode.",
            }

        dispatcher.register("dynamic_script_runner", dynamic_script_runner)

        # Mock GenAI Chat Session
        # Turn 1: Model calls dynamic_script_runner without flag -> FAILS
        # Turn 2: Model receives fault feedback directive, self-corrects with flag="--production" -> SUCCEEDS
        # Turn 3: Model outputs final response
        mock_chat = MagicMock()

        # Step 1: Model emits faulted tool call
        fc1 = MagicMock()
        fc1.name = "dynamic_script_runner"
        fc1.args = {"script_name": "backup.sh", "flag": ""}
        fc1.id = "call_1"
        resp1 = MagicMock()
        resp1.function_calls = [fc1]
        resp1.text = ""

        # Step 2: Model receives self-healing directive and self-corrects
        fc2 = MagicMock()
        fc2.name = "dynamic_script_runner"
        fc2.args = {"script_name": "backup.sh", "flag": "--production"}
        fc2.id = "call_2"
        resp2 = MagicMock()
        resp2.function_calls = [fc2]
        resp2.text = ""

        # Step 3: Final authoritative answer
        resp3 = MagicMock()
        resp3.function_calls = []
        resp3.text = "Directive completed. Production pipeline executed nominal."

        mock_chat.send_message = AsyncMock(side_effect=[resp1, resp2, resp3])

        mock_client = MagicMock()
        mock_client.aio.chats.create.return_value = mock_chat

        engine = AutonomousRuntimeEngine(
            config=config,
            dispatcher=dispatcher,
            client=mock_client,
        )

        turn_result: RuntimeTurnResult = await engine.run_turn(
            "Execute the backup script",
            session_id="self_heal_session"
        )

        # Assertions
        assert turn_result.is_success is True
        assert turn_result.self_healing_retries == 1
        assert "Production pipeline executed nominal" in turn_result.final_response
        assert turn_result.total_steps == 3
        assert len(call_history) == 2
        assert call_history[0] == ("backup.sh", "")
        assert call_history[1] == ("backup.sh", "--production")

        # Verify structured logs captured self_healing_retry event
        logs = engine.logger.get_recent_logs(session_id="self_heal_session")
        events = [log["event"] for log in logs]
        assert "llm_input" in events
        assert "tool_trigger" in events
        assert "self_healing_retry" in events
        assert "system_response" in events

        # Verify the self-healing log payload
        self_heal_log = next(log for log in logs if log["event"] == "self_healing_retry")
        assert self_heal_log["data"]["tool_name"] == "dynamic_script_runner"
        assert self_heal_log["data"]["iteration"] == 1
        assert self_heal_log["data"]["exit_code"] == 1

        engine.logger.close()


@pytest.mark.asyncio
async def test_autonomous_engine_self_healing_exhaustion():
    """Verify that when a tool persistently fails across 3 retries, the loop halts and

    signals self-healing exhaustion without infinite looping.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "exhaustion.jsonl")
        config = RuntimeConfig(api_key="mock_key", log_file_path=log_path, max_retries=3)

        dispatcher = ToolDispatcher()

        # Always-failing tool
        async def failing_tool():
            return {
                "is_success": False,
                "exit_code": 127,
                "stderr": "Command not found in PATH",
            }

        dispatcher.register("failing_tool", failing_tool)

        mock_chat = MagicMock()

        # Creates repeated failing calls
        def make_fail_resp():
            fc = MagicMock()
            fc.name = "failing_tool"
            fc.args = {}
            fc.id = "call_fail"
            resp = MagicMock()
            resp.function_calls = [fc]
            resp.text = ""
            return resp

        # 1 initial + 3 retries + 1 final answer after ceiling reached
        final_resp = MagicMock()
        final_resp.function_calls = []
        final_resp.text = "Alert: Tool failure persistent across 3 self-healing attempts. Manual intervention required."

        mock_chat.send_message = AsyncMock(
            side_effect=[make_fail_resp(), make_fail_resp(), make_fail_resp(), make_fail_resp(), final_resp]
        )

        mock_client = MagicMock()
        mock_client.aio.chats.create.return_value = mock_chat

        engine = AutonomousRuntimeEngine(
            config=config,
            dispatcher=dispatcher,
            client=mock_client,
        )

        turn_result: RuntimeTurnResult = await engine.run_turn(
            "Run failing tool",
            session_id="exhaust_session"
        )

        assert turn_result.is_success is True
        assert turn_result.self_healing_retries == 3
        assert "Alert: Tool failure persistent" in turn_result.final_response

        # Verify self_healing_exhausted event logged
        logs = engine.logger.get_recent_logs(session_id="exhaust_session")
        exhausted_logs = [log for log in logs if log["event"] == "self_healing_exhausted"]
        assert len(exhausted_logs) >= 1
        assert exhausted_logs[0]["data"]["total_attempts"] == 3

        engine.logger.close()


@pytest.mark.asyncio
async def test_autonomous_engine_high_concurrency_execution():
    """Verify high-concurrency discipline: multiple tool calls in a single turn

    are executed concurrently via asyncio.gather and batched into response.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        log_path = os.path.join(tmpdir, "concurrency.jsonl")
        config = RuntimeConfig(api_key="mock_key", log_file_path=log_path)
        dispatcher = ToolDispatcher()

        execution_order = []

        async def concurrent_task_a(task_id: str):
            await asyncio.sleep(0.05)
            execution_order.append(f"task_a_{task_id}")
            return {"result": f"A_DONE_{task_id}"}

        async def concurrent_task_b(task_id: str):
            await asyncio.sleep(0.05)
            execution_order.append(f"task_b_{task_id}")
            return {"result": f"B_DONE_{task_id}"}

        dispatcher.register("concurrent_task_a", concurrent_task_a)
        dispatcher.register("concurrent_task_b", concurrent_task_b)

        # Chat session returns two tool calls concurrently
        fc_a = MagicMock()
        fc_a.name = "concurrent_task_a"
        fc_a.args = {"task_id": "1"}
        fc_a.id = "call_a"

        fc_b = MagicMock()
        fc_b.name = "concurrent_task_b"
        fc_b.args = {"task_id": "2"}
        fc_b.id = "call_b"

        resp1 = MagicMock()
        resp1.function_calls = [fc_a, fc_b]
        resp1.text = ""

        resp2 = MagicMock()
        resp2.function_calls = []
        resp2.text = "Concurrent tasks completed, Sir."

        mock_chat = MagicMock()
        mock_chat.send_message = AsyncMock(side_effect=[resp1, resp2])

        mock_client = MagicMock()
        mock_client.aio.chats.create.return_value = mock_chat

        engine = AutonomousRuntimeEngine(
            config=config,
            dispatcher=dispatcher,
            client=mock_client,
        )

        turn_result: RuntimeTurnResult = await engine.run_turn(
            "Execute concurrent diagnostics",
            session_id="conc_session"
        )

        assert turn_result.is_success is True
        assert len(turn_result.tools_invoked) == 2
        assert "concurrent_task_a" in turn_result.tools_invoked
        assert "concurrent_task_b" in turn_result.tools_invoked
        assert "Concurrent tasks completed" in turn_result.final_response

        # Verify response sent back to chat contains both function responses
        sent_parts = mock_chat.send_message.call_args_list[1][0][0]
        assert isinstance(sent_parts, list)
        assert len(sent_parts) == 2

        engine.logger.close()


# ─────────────────────────────────────────────────────────────
# 6. JarvisEngine & Synchronous Tool Adapter Tests
# ─────────────────────────────────────────────────────────────

def test_run_shell_adapter():
    """Verify run_shell executes synchronously and returns structured JSON."""
    res_raw = run_shell("python -c \"print('JARVIS_ONLINE')\"")
    data = json.loads(res_raw)
    assert data["exit_code"] == 0
    assert "JARVIS_ONLINE" in data["stdout"]
    assert data["blocked"] is False
    assert data["timed_out"] is False
    assert data["duration_ms"] > 0

    err_raw = run_shell("python -c \"import sys; sys.exit(42)\"")
    err_data = json.loads(err_raw)
    assert err_data["exit_code"] == 42


def test_inspect_telemetry_adapter():
    """Verify inspect_telemetry returns host stats JSON."""
    res_raw = inspect_telemetry()
    data = json.loads(res_raw)
    assert "cpu_percent_total" in data
    assert "memory_percent" in data
    assert "disk_free_gb" in data


def test_capture_screen_adapter():
    """Verify capture_screen returns visual frame status JSON."""
    res_raw = capture_screen(monitor_index=1)
    data = json.loads(res_raw)
    assert "success" in data
    assert "width" in data
    assert "height" in data
    assert "duration_ms" in data


def test_capture_camera_adapter():
    """Verify capture_camera returns camera frame status JSON gracefully."""
    res_raw = capture_camera(device_index=999)
    data = json.loads(res_raw)
    assert "success" in data
    assert data["success"] is False
    assert "DEVICE_UNAVAILABLE" in data["error"]


def test_jarvis_engine_init():
    """Verify JarvisEngine initializes chat session with tools and system instruction."""
    mock_client = MagicMock()
    mock_chat = MagicMock()
    mock_client.chats.create.return_value = mock_chat

    engine = JarvisEngine(model_name="gemini-2.5-flash", client=mock_client)

    assert len(engine.tools) == 4
    assert run_shell in engine.tools
    assert inspect_telemetry in engine.tools
    assert capture_screen in engine.tools
    assert capture_camera in engine.tools
    assert engine.chat is mock_chat
    mock_client.chats.create.assert_called_once()


def test_jarvis_engine_detect_tool_failure():
    """Verify _detect_tool_failure detects non-zero exit codes, blocked, timeout, and failure states."""
    engine = JarvisEngine(client=MagicMock())

    # Empty history
    assert engine._detect_tool_failure([]) is None

    # Normal success
    msg_ok = MagicMock()
    part_ok = MagicMock()
    part_ok.function_response.response = json.dumps({"command": "echo ok", "exit_code": 0})
    msg_ok.parts = [part_ok]
    assert engine._detect_tool_failure([msg_ok]) is None

    # Failure with exit code 1
    msg_fail = MagicMock()
    part_fail = MagicMock()
    part_fail.function_response.response = json.dumps({"command": "make", "exit_code": 1, "stderr": "compile error"})
    msg_fail.parts = [part_fail]
    failure = engine._detect_tool_failure([msg_fail])
    assert failure is not None
    assert "exit_code" in failure

    # Failure with EXECUTION_BLOCKED
    msg_blocked = MagicMock()
    part_blocked = MagicMock()
    part_blocked.function_response.response = json.dumps({"blocked": True, "error": "EXECUTION_BLOCKED"})
    msg_blocked.parts = [part_blocked]
    assert engine._detect_tool_failure([msg_blocked]) is not None

    # Failure with success = False
    msg_unsuccessful = MagicMock()
    part_unsuccessful = MagicMock()
    part_unsuccessful.function_response.response = json.dumps({"success": False, "error": "DEVICE_UNAVAILABLE"})
    msg_unsuccessful.parts = [part_unsuccessful]
    assert engine._detect_tool_failure([msg_unsuccessful]) is not None


def test_jarvis_engine_self_healing_retry_loop():
    """Verify execute_instruction catches tool failure and sends healing prompt to resolve."""
    mock_client = MagicMock()
    mock_chat = MagicMock()
    mock_client.chats.create.return_value = mock_chat

    # Turn 1: failure history
    resp1 = MagicMock()
    resp1.text = "Attempting compilation..."
    msg1_call = MagicMock()
    msg1_call.parts = []
    msg1_resp = MagicMock()
    part_fail = MagicMock()
    part_fail.function_response.response = json.dumps({"command": "gcc main.c", "exit_code": 2, "stderr": "fatal: ssl.h missing"})
    msg1_resp.parts = [part_fail]
    history_after_turn1 = [msg1_call, msg1_resp]

    # Turn 2: success history
    resp2 = MagicMock()
    resp2.text = "Successfully resolved dependency and compiled, Sir."
    msg2_resp = MagicMock()
    part_ok = MagicMock()
    part_ok.function_response.response = json.dumps({"command": "gcc main.c -lssl", "exit_code": 0, "stdout": "binary built"})
    msg2_resp.parts = [part_ok]
    history_after_turn2 = [msg1_call, msg1_resp, msg2_resp]

    mock_chat.send_message.side_effect = [resp1, resp2]
    mock_chat.get_history.side_effect = [history_after_turn1, history_after_turn2]

    engine = JarvisEngine(client=mock_client, max_healing_retries=3)
    final_output = engine.execute_instruction("Compile project")

    assert "Successfully resolved dependency" in final_output
    assert mock_chat.send_message.call_count == 2
    second_call_arg = mock_chat.send_message.call_args_list[1][0][0]
    assert "[SYSTEM HEALING INTERVENTION - ATTEMPT 1/3]" in second_call_arg
    assert "fatal: ssl.h missing" in second_call_arg


def test_jarvis_engine_retry_exhaustion():
    """Verify execute_instruction halts and returns failure status after max retries."""
    mock_client = MagicMock()
    mock_chat = MagicMock()
    mock_client.chats.create.return_value = mock_chat

    resp = MagicMock()
    resp.text = "Retrying command..."

    msg_fail = MagicMock()
    part_fail = MagicMock()
    part_fail.function_response.response = json.dumps({"command": "broken_tool", "exit_code": 1})
    msg_fail.parts = [part_fail]

    mock_chat.send_message.return_value = resp
    mock_chat.get_history.return_value = [msg_fail]

    engine = JarvisEngine(client=mock_client, max_healing_retries=3)
    result = engine.execute_instruction("Run failing task")

    assert "[FAILED_TO_HEAL]" in result
    assert mock_chat.send_message.call_count == 4


def test_log_event_structured_emission():
    """Verify log_event emits structured record to audit log."""
    test_event = f"test_event_{uuid.uuid4().hex[:8]}"
    log_event(test_event, {"status": "verified", "code": 200})

    log_path = "logs/jarvis_audit.jsonl"
    assert os.path.exists(log_path)
    with open(log_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    found = False
    for line in reversed(lines[-10:]):
        record = json.loads(line)
        if record.get("event_type") == test_event:
            assert record["payload"]["status"] == "verified"
            assert record["payload"]["code"] == 200
            assert "timestamp" in record
            found = True
            break
    assert found is True


