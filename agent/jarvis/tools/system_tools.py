"""Core System Tools for J.A.R.V.I.S Autonomous Agent.

Provides sandboxed file system manipulation, command execution, and live telemetry.
"""

from pathlib import Path
from typing import Dict, Any, Optional
from jarvis.config import settings
from jarvis.safety.guards import DestructivePatternGuard, SecurityViolationError
from jarvis.safety.sandbox import PathSandbox, SandboxViolationError
from jarvis.system.executor import AsyncSubprocessExecutor
from jarvis.system.telemetry import SystemTelemetryCollector
from jarvis.memory.execution_log import AuditLogger
from jarvis.tools.base import ToolRegistry


class SystemTools:
    """Encapsulates system automation tools bound to safety guards and audit loggers."""

    def __init__(
        self,
        executor: AsyncSubprocessExecutor,
        sandbox: PathSandbox,
        guard: DestructivePatternGuard,
        audit_logger: Optional[AuditLogger] = None,
        session_id: str = "default_session"
    ) -> None:
        self.executor = executor
        self.sandbox = sandbox
        self.guard = guard
        self.audit_logger = audit_logger
        self.session_id = session_id
        self.telemetry = SystemTelemetryCollector()

    def register_all(self, registry: ToolRegistry) -> None:
        """Register all system tools into the provided ToolRegistry."""
        registry.register(
            self.execute_command,
            name="execute_command",
            description="Execute a shell command with safety guard checks and timeout limits."
        )
        registry.register(
            self.read_file,
            name="read_file",
            description="Read content from a file inside the authorized sandbox directory."
        )
        registry.register(
            self.write_file,
            name="write_file",
            description="Write text content to a file inside the authorized sandbox directory."
        )
        registry.register(
            self.list_directory,
            name="list_directory",
            description="List files and subdirectories inside the authorized sandbox directory."
        )
        registry.register(
            self.get_system_telemetry,
            name="get_system_telemetry",
            description="Retrieve real-time host hardware metrics (CPU cores, RAM usage, disk, and uptime)."
        )

    async def execute_command(self, command: str, timeout_seconds: int = 30) -> Dict[str, Any]:
        """Execute a shell command with safety guard checks and timeout limits."""
        # 1. Safety Guard Check
        try:
            is_safe, verdict = self.guard.validate(command)
        except SecurityViolationError as sec_err:
            if self.audit_logger:
                await self.audit_logger.log(
                    command=command,
                    status="BLOCKED",
                    safety_verdict=str(sec_err),
                    session_id=self.session_id,
                    exit_code=-1
                )
            return {
                "success": False,
                "error": str(sec_err),
                "status": "BLOCKED"
            }

        # 2. Async Execution
        timeout = min(timeout_seconds, settings.command_timeout_seconds)
        res = await self.executor.execute(command, timeout_seconds=timeout)

        status = "SUCCESS" if res.is_success else ("TIMEOUT" if res.timed_out else "FAILURE")

        # 3. Audit Logging
        if self.audit_logger:
            await self.audit_logger.log(
                command=command,
                status=status,
                safety_verdict=verdict,
                session_id=self.session_id,
                exit_code=res.exit_code,
                stdout=res.stdout,
                stderr=res.stderr,
                duration_ms=res.duration_ms
            )

        return res.to_dict()

    async def read_file(self, path: str, max_bytes: int = 100000) -> Dict[str, Any]:
        """Read content from a file inside the authorized sandbox directory."""
        try:
            safe_path = self.sandbox.resolve_safe_path(path)
            if not safe_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            if not safe_path.is_file():
                return {"success": False, "error": f"Path is a directory, not a file: {path}"}

            content = safe_path.read_text(encoding="utf-8", errors="replace")[:max_bytes]
            return {
                "success": True,
                "path": str(safe_path),
                "bytes_read": len(content.encode("utf-8")),
                "content": content
            }
        except SandboxViolationError as err:
            return {"success": False, "error": str(err)}
        except Exception as ex:
            return {"success": False, "error": str(ex)}

    async def write_file(self, path: str, content: str, overwrite: bool = False) -> Dict[str, Any]:
        """Write text content to a file inside the authorized sandbox directory."""
        try:
            safe_path = self.sandbox.resolve_safe_path(path)
            if safe_path.exists() and not overwrite:
                return {
                    "success": False,
                    "error": f"File already exists: {path}. Set overwrite=True to replace."
                }

            safe_path.parent.mkdir(parents=True, exist_ok=True)
            safe_path.write_text(content, encoding="utf-8")

            return {
                "success": True,
                "path": str(safe_path),
                "bytes_written": len(content.encode("utf-8")),
                "status": "CREATED" if not safe_path.exists() else "OVERWRITTEN"
            }
        except SandboxViolationError as err:
            return {"success": False, "error": str(err)}
        except Exception as ex:
            return {"success": False, "error": str(ex)}

    async def list_directory(self, path: str = ".") -> Dict[str, Any]:
        """List files and subdirectories inside the authorized sandbox directory."""
        try:
            safe_path = self.sandbox.resolve_safe_path(path)
            if not safe_path.exists():
                return {"success": False, "error": f"Directory not found: {path}"}
            if not safe_path.is_dir():
                return {"success": False, "error": f"Path is not a directory: {path}"}

            entries = []
            for item in safe_path.iterdir():
                entries.append({
                    "name": item.name,
                    "is_dir": item.is_dir(),
                    "size_bytes": item.stat().st_size if item.is_file() else None
                })

            return {
                "success": True,
                "path": str(safe_path),
                "entry_count": len(entries),
                "entries": entries[:100]
            }
        except SandboxViolationError as err:
            return {"success": False, "error": str(err)}
        except Exception as ex:
            return {"success": False, "error": str(ex)}

    def get_system_telemetry(self) -> Dict[str, Any]:
        """Retrieve real-time host hardware metrics (CPU cores, RAM usage, disk, and uptime)."""
        report = self.telemetry.capture()
        return {
            "success": True,
            "telemetry": report.to_dict()
        }

