"""Asynchronous Native Subprocess Execution Engine.

Provides non-blocking command execution, timeout enforcement, output streaming,
and safe child process cleanup.
"""

import asyncio
import os
import sys
import time
from dataclasses import dataclass
from typing import Optional


@dataclass
class ExecutionResult:
    """Encapsulates the structured result of an executed system command."""
    command: str
    exit_code: Optional[int]
    stdout: str
    stderr: str
    duration_ms: float
    timed_out: bool = False
    error: Optional[str] = None

    @property
    def is_success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out and self.error is None

    def to_dict(self) -> dict:
        return {
            "command": self.command,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_ms": round(self.duration_ms, 2),
            "timed_out": self.timed_out,
            "is_success": self.is_success,
            "error": self.error
        }


class AsyncSubprocessExecutor:
    """High-performance non-blocking process launcher with safety timeouts."""

    def __init__(
        self,
        default_timeout_seconds: int = 30,
        max_output_bytes: int = 65536,
        working_directory: Optional[str] = None
    ) -> None:
        self.default_timeout = default_timeout_seconds
        self.max_output_bytes = max_output_bytes
        self.cwd = working_directory or os.getcwd()

    async def execute(
        self,
        command: str,
        timeout_seconds: Optional[int] = None,
        cwd: Optional[str] = None,
        env: Optional[dict] = None
    ) -> ExecutionResult:
        """Execute a shell command asynchronously with strict timeout safeguards.

        Args:
            command: Shell command string to execute.
            timeout_seconds: Maximum allowed runtime before termination.
            cwd: Working directory (defaults to self.cwd).
            env: Optional environment variables dictionary.

        Returns:
            ExecutionResult containing return code, stdout, stderr, and timings.
        """
        timeout = timeout_seconds or self.default_timeout
        exec_cwd = cwd or self.cwd
        start_time = time.perf_counter()

        proc = None
        try:
            # On Windows, asyncio supports ProactorEventLoop subprocesses
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=exec_cwd,
                env=env or os.environ.copy()
            )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout
            )

            duration_ms = (time.perf_counter() - start_time) * 1000

            stdout_str = stdout_bytes.decode(errors="replace")[:self.max_output_bytes]
            stderr_str = stderr_bytes.decode(errors="replace")[:self.max_output_bytes]

            return ExecutionResult(
                command=command,
                exit_code=proc.returncode,
                stdout=stdout_str,
                stderr=stderr_str,
                duration_ms=duration_ms,
                timed_out=False
            )

        except asyncio.TimeoutError:
            duration_ms = (time.perf_counter() - start_time) * 1000
            if proc:
                await self._kill_process_tree(proc)

            return ExecutionResult(
                command=command,
                exit_code=-1,
                stdout="",
                stderr=f"Command execution timed out after {timeout} seconds.",
                duration_ms=duration_ms,
                timed_out=True,
                error=f"Timeout of {timeout}s exceeded"
            )

        except Exception as ex:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return ExecutionResult(
                command=command,
                exit_code=-1,
                stdout="",
                stderr=str(ex),
                duration_ms=duration_ms,
                timed_out=False,
                error=str(ex)
            )

    async def _kill_process_tree(self, proc: asyncio.subprocess.Process) -> None:
        """Safely terminate a timed-out process and its children."""
        try:
            if sys.platform == "win32":
                # Windows taskkill forcefully terminates child processes
                kill_cmd = f"taskkill /F /T /PID {proc.pid}"
                kill_proc = await asyncio.create_subprocess_shell(
                    kill_cmd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await kill_proc.wait()
            else:
                proc.terminate()
                await asyncio.sleep(0.5)
                if proc.returncode is None:
                    proc.kill()
        except (ProcessLookupError, PermissionError):
            pass

