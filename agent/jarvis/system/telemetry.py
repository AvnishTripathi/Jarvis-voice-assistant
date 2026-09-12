"""Real-Time Host System Telemetry and Hardware Metrics.

Gathers resource utilization (CPU, RAM, Disk, Process, Network) via psutil
with native standard library fallback when running in minimal environments.
"""

import os
import platform
import sys
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    psutil = None
    HAS_PSUTIL = False


@dataclass
class TelemetryReport:
    """Comprehensive snapshot of host system resources."""
    timestamp: float
    platform: str
    os_name: str
    architecture: str
    hostname: str
    uptime_seconds: float
    python_version: str

    cpu_cores: int
    cpu_percent: float
    cpu_per_core: List[float]

    memory_total_gb: float
    memory_used_gb: float
    memory_free_gb: float
    memory_percent: float

    disk_total_gb: float
    disk_used_gb: float
    disk_free_gb: float
    disk_percent: float

    process_pid: int
    process_memory_mb: float
    process_cpu_percent: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SystemTelemetryCollector:
    """Telemetry provider interfacing with OS and hardware monitors."""

    def __init__(self) -> None:
        self.boot_time = time.time() - (psutil.boot_time() if HAS_PSUTIL else 0)

    def capture(self) -> TelemetryReport:
        """Capture a live diagnostic snapshot."""
        now = time.time()
        uname = platform.uname()

        cores = os.cpu_count() or 1
        cpu_pct = 0.0
        cpu_cores_pct = []

        mem_total_gb = 0.0
        mem_used_gb = 0.0
        mem_free_gb = 0.0
        mem_pct = 0.0

        disk_total_gb = 0.0
        disk_used_gb = 0.0
        disk_free_gb = 0.0
        disk_pct = 0.0

        proc_mem_mb = 0.0
        proc_cpu_pct = 0.0

        if HAS_PSUTIL:
            try:
                cpu_pct = float(psutil.cpu_percent(interval=None))
                cpu_cores_pct = [float(p) for p in psutil.cpu_percent(interval=None, percpu=True)]

                vmem = psutil.virtual_memory()
                mem_total_gb = round(vmem.total / (1024 ** 3), 2)
                mem_used_gb = round(vmem.used / (1024 ** 3), 2)
                mem_free_gb = round(vmem.available / (1024 ** 3), 2)
                mem_pct = float(vmem.percent)

                disk = psutil.disk_usage(os.getcwd())
                disk_total_gb = round(disk.total / (1024 ** 3), 2)
                disk_used_gb = round(disk.used / (1024 ** 3), 2)
                disk_free_gb = round(disk.free / (1024 ** 3), 2)
                disk_pct = float(disk.percent)

                current_proc = psutil.Process(os.getpid())
                proc_mem_mb = round(current_proc.memory_info().rss / (1024 ** 2), 2)
                proc_cpu_pct = float(current_proc.cpu_percent(interval=None))
            except Exception:
                pass
        else:
            # Fallback estimation using standard library
            try:
                import shutil
                total, used, free = shutil.disk_usage(os.getcwd())
                disk_total_gb = round(total / (1024 ** 3), 2)
                disk_used_gb = round(used / (1024 ** 3), 2)
                disk_free_gb = round(free / (1024 ** 3), 2)
                disk_pct = round((used / total) * 100, 1) if total else 0.0
            except Exception:
                pass

            # Memory fallback via ctypes (Windows) or /proc/meminfo (Linux)
            try:
                if sys.platform == "win32":
                    import ctypes
                    class MEMORYSTATUSEX(ctypes.Structure):
                        _fields_ = [
                            ("dwLength", ctypes.c_ulong),
                            ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong),
                            ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong),
                            ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                        ]
                    stat = MEMORYSTATUSEX()
                    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                    if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                        mem_total_gb = round(stat.ullTotalPhys / (1024 ** 3), 2)
                        mem_free_gb = round(stat.ullAvailPhys / (1024 ** 3), 2)
                        mem_used_gb = round(mem_total_gb - mem_free_gb, 2)
                        mem_pct = float(stat.dwMemoryLoad)
                elif os.path.exists("/proc/meminfo"):
                    with open("/proc/meminfo", "r") as f:
                        lines = f.readlines()
                    info = {}
                    for line in lines:
                        parts = line.split(":")
                        if len(parts) == 2:
                            info[parts[0].strip()] = int(parts[1].split()[0])
                    if "MemTotal" in info and "MemAvailable" in info:
                        mem_total_gb = round(info["MemTotal"] / (1024 ** 2), 2)
                        mem_free_gb = round(info["MemAvailable"] / (1024 ** 2), 2)
                        mem_used_gb = round(mem_total_gb - mem_free_gb, 2)
                        mem_pct = round(((mem_total_gb - mem_free_gb) / mem_total_gb) * 100, 1)
            except Exception:
                pass

        return TelemetryReport(
            timestamp=now,
            platform=sys.platform,
            os_name=f"{uname.system} {uname.release}",
            architecture=uname.machine,
            hostname=uname.node,
            uptime_seconds=round(now - self.boot_time, 1),
            python_version=platform.python_version(),
            cpu_cores=cores,
            cpu_percent=cpu_pct,
            cpu_per_core=cpu_cores_pct,
            memory_total_gb=mem_total_gb,
            memory_used_gb=mem_used_gb,
            memory_free_gb=mem_free_gb,
            memory_percent=mem_pct,
            disk_total_gb=disk_total_gb,
            disk_used_gb=disk_used_gb,
            disk_free_gb=disk_free_gb,
            disk_percent=disk_pct,
            process_pid=os.getpid(),
            process_memory_mb=proc_mem_mb,
            process_cpu_percent=proc_cpu_pct
        )
