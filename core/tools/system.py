"""
core/tools/system.py
Deterministic OS Execution and Telemetry Layer for JARVIS.
"""

from __future__ import annotations

import asyncio
import os
import re
import shlex
import sys
import time
from typing import List, Optional, Tuple
import psutil
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Data Schemas
# ---------------------------------------------------------------------------

class CommandResult(BaseModel):
    command: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    blocked: bool = False
    timed_out: bool = False

    @property
    def is_success(self) -> bool:
        """True if process terminated with exit code 0 without timeout or blockage."""
        return self.exit_code == 0 and not self.blocked and not self.timed_out

    @property
    def blocked_by_safety(self) -> bool:
        """Compatibility alias for safety check status."""
        return self.blocked

    @property
    def safety_reason(self) -> Optional[str]:
        """Explanation if command was blocked."""
        return self.stderr if self.blocked else None


class MemoryStats(BaseModel):
    """Compatibility model for virtual and swap memory allocation."""
    total_bytes: int = 0
    available_bytes: int = 0
    used_bytes: int = 0
    percent: float = 0.0
    swap_total_bytes: int = 0
    swap_used_bytes: int = 0
    swap_free_bytes: int = 0
    swap_percent: float = 0.0


class DiskStats(BaseModel):
    """Compatibility model for storage allocation."""
    total_bytes: int = 0
    used_bytes: int = 0
    free_bytes: int = 0
    percent: float = 0.0
    mount_point: str = "/"


class NetworkConnectionStats(BaseModel):
    """Compatibility model for active socket connections."""
    total_active_connections: int = 0
    established: int = 0
    listening: int = 0
    other: int = 0


class SystemStats(BaseModel):
    cpu_percent_total: float
    cpu_cores_percent: List[float]
    memory_used_gb: float
    memory_total_gb: float
    memory_percent: float
    swap_percent: float
    disk_free_gb: float
    disk_total_gb: float
    disk_percent: float
    top_processes: List[dict] = Field(default_factory=list)

    @property
    def cpu_percent_per_core(self) -> List[float]:
        """Compatibility alias for per-core cpu utilization list."""
        return self.cpu_cores_percent

    @property
    def timestamp(self) -> float:
        return time.time()

    @property
    def platform(self) -> str:
        return sys.platform

    @property
    def cpu_cores_logical(self) -> int:
        return len(self.cpu_cores_percent)

    @property
    def memory(self) -> MemoryStats:
        total_b = int(self.memory_total_gb * (1024**3))
        used_b = int(self.memory_used_gb * (1024**3))
        return MemoryStats(
            total_bytes=total_b,
            available_bytes=max(0, total_b - used_b),
            used_bytes=used_b,
            percent=self.memory_percent,
            swap_percent=self.swap_percent,
        )

    @property
    def disk(self) -> DiskStats:
        total_b = int(self.disk_total_gb * (1024**3))
        free_b = int(self.disk_free_gb * (1024**3))
        return DiskStats(
            total_bytes=total_b,
            free_bytes=free_b,
            used_bytes=max(0, total_b - free_b),
            percent=self.disk_percent,
        )

    @property
    def network(self) -> NetworkConnectionStats:
        return NetworkConnectionStats(total_active_connections=0)


# ---------------------------------------------------------------------------
# Security & Guardrails
# ---------------------------------------------------------------------------

class SafetyBlacklistViolation(Exception):
    """Raised when a command violates the absolute safety blacklist."""
    pass


# Patterns that indicate irreversible filesystem destruction or system lockup
BLOCKED_PATTERNS = [
    r"\brm\s+-[rfRF]{1,4}\s+/\s*$",               # rm -rf /
    r"\brm\s+-[rfRF]{1,4}\s+/\s+",                # rm -rf / ...
    r"\brm\s+-[rfRF]{1,4}\s+/\*",                 # rm -rf /*
    r"\brm\s+-[rfRF]{1,4}\s+~",                   # rm -rf ~
    r"\brmdir\s+/[sqSQ]\s+/[sqSQ]\s+[A-Za-z]:\\", # rmdir /s /q C:\
    r"\bdel\s+/[fF]\s+/[sS]\s+/[qQ]\s+[A-Za-z]:\\", # del /f /s /q C:\
    r"\bformat\s+[A-Za-z]:",                      # format C:
    r"\bmkfs(\.\w+)?\b",                          # formatting partitions
    r"\bdiskpart\b",                               # Windows disk partitioning
    r"\bdd\s+if=.*of=/dev/(sd|hd|nvme)",          # raw disk writes
    r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", # fork bombs
    r"%0\|%0",                                     # Windows batch fork bomb
    r"\breg\s+delete\s+HKLM",                      # critical registry deletion
    r"\|\s*(bash|sh)\b",                          # remote pipe execution
    r">\s*/dev/sd[a-z]",                           # direct device overwriting
    r"\bchmod\s+-[rR]\s+000\s+/",                 # permission bricking
]

# Sensitive keys to sanitize from environment leakage in outputs
REDACT_KEYS = [
    "GEMINI_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY",
    "TOKEN", "PASSWORD", "SECRET", "PRIVATE_KEY"
]


def _is_safe(command: str) -> bool:
    """Validates command against the safety blacklist."""
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return False
    return True


def check_safety_blacklist(command: str) -> Tuple[bool, Optional[str]]:
    """Evaluates command and returns (is_blocked, reason)."""
    is_safe = _is_safe(command)
    if not is_safe:
        return True, "COMMAND BLOCKED BY SAFETY BLACKLIST: Command matched irreversible destruction pattern."
    return False, None


def _sanitize_output(text: str) -> str:
    """Strips runtime environment secrets from command output."""
    sanitized = text
    # Scan environment variables for sensitive names
    for key in REDACT_KEYS:
        val = os.environ.get(key)
        if val and len(val) > 4:
            sanitized = sanitized.replace(val, f"[REDACTED_{key}]")

    # Also scan for common environment variable keys containing substrings
    for env_k, env_v in os.environ.items():
        if any(token in env_k.upper() for token in ["KEY", "SECRET", "TOKEN", "PASSWORD"]):
            if env_v and len(env_v) > 6 and env_v in sanitized:
                sanitized = sanitized.replace(env_v, "[REDACTED]")

    # Static pattern redactions (Google API keys, OpenAI keys, Bearer tokens)
    sanitized = re.sub(r"AIzaSy[A-Za-z0-9_-]{33}", "[REDACTED]", sanitized)
    sanitized = re.sub(r"sk-[A-Za-z0-9]{20,}", "[REDACTED]", sanitized)
    return sanitized


def sanitize_environment_leaks(text: str) -> str:
    """Compatibility wrapper for environment output sanitization."""
    return _sanitize_output(text)


# ---------------------------------------------------------------------------
# Execution Tools
# ---------------------------------------------------------------------------

async def execute_shell_command(
    command: str,
    timeout_seconds: int = 30,
    raise_on_blocked: bool = False,
) -> CommandResult:
    """
    Executes a shell command asynchronously with timeout controls and sanitization.
    
    Args:
        command: The terminal command to run.
        timeout_seconds: Maximum allowed runtime before SIGKILL (default 30s).
        raise_on_blocked: If True, raises SafetyBlacklistViolation when blocked.
    """
    start_time = time.perf_counter()

    # 1. Safety Check
    if not _is_safe(command):
        msg = "EXECUTION_BLOCKED: Command matched irreversible destruction pattern. COMMAND BLOCKED BY SAFETY BLACKLIST."
        if raise_on_blocked:
            raise SafetyBlacklistViolation(msg)
        return CommandResult(
            command=command,
            exit_code=126,
            stdout="",
            stderr=msg,
            duration_ms=0.0,
            blocked=True
        )

    # Cross-platform compatibility: on Windows, translate POSIX sleep to Python sleep
    exec_cmd = command
    if sys.platform == "win32" and re.match(r"^\s*sleep\s+(\d+(\.\d+)?)", command):
        sec = re.search(r"^\s*sleep\s+(\d+(\.\d+)?)", command).group(1)
        exec_cmd = f"python -c \"import time; time.sleep({sec})\""

    # 2. Async Execution
    proc = None
    try:
        proc = await asyncio.create_subprocess_shell(
            exec_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout_seconds
        )

        duration = (time.perf_counter() - start_time) * 1000
        stdout = _sanitize_output(stdout_bytes.decode(errors="replace").strip())
        stderr = _sanitize_output(stderr_bytes.decode(errors="replace").strip())

        return CommandResult(
            command=command,
            exit_code=proc.returncode if proc.returncode is not None else 1,
            stdout=stdout,
            stderr=stderr,
            duration_ms=round(duration, 2)
        )

    except asyncio.TimeoutError:
        if proc is not None:
            try:
                proc.kill()
                await proc.wait()
            except ProcessLookupError:
                pass
        duration = (time.perf_counter() - start_time) * 1000
        return CommandResult(
            command=command,
            exit_code=124,
            stdout="",
            stderr=f"EXECUTION_TIMEOUT: Command exceeded limit of {timeout_seconds}s. Timed out after {timeout_seconds} seconds.",
            duration_ms=round(duration, 2),
            timed_out=True
        )

    except Exception as e:
        duration = (time.perf_counter() - start_time) * 1000
        return CommandResult(
            command=command,
            exit_code=1,
            stdout="",
            stderr=f"SYSTEM_EXCEPTION: {str(e)}",
            duration_ms=round(duration, 2)
        )


def get_telemetry() -> SystemStats:
    """
    Collects live host telemetry (CPU, Memory, Swap, Disk, Top processes).
    """
    # CPU
    cpu_cores = psutil.cpu_percent(interval=0.1, percpu=True)
    cpu_total = sum(cpu_cores) / len(cpu_cores) if cpu_cores else 0.0

    # Memory
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # Disk
    disk = psutil.disk_usage("/")

    # Top 5 Memory Consumers
    processes = []
    for p in psutil.process_iter(['pid', 'name', 'memory_percent', 'cpu_percent']):
        try:
            p_info = p.info
            if p_info.get('memory_percent') is not None:
                processes.append(p_info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    top_proc = sorted(processes, key=lambda x: x.get('memory_percent') or 0, reverse=True)[:5]

    return SystemStats(
        cpu_percent_total=round(cpu_total, 1),
        cpu_cores_percent=cpu_cores,
        memory_used_gb=round(mem.used / (1024**3), 2),
        memory_total_gb=round(mem.total / (1024**3), 2),
        memory_percent=round(mem.percent, 1),
        swap_percent=round(swap.percent, 1),
        disk_free_gb=round(disk.free / (1024**3), 2),
        disk_total_gb=round(disk.total / (1024**3), 2),
        disk_percent=round(disk.percent, 1),
        top_processes=[
            {
                "pid": p["pid"],
                "name": p["name"],
                "mem_percent": round(p["memory_percent"], 2)
            }
            for p in top_proc
        ]
    )
