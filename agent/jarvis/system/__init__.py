"""System Interface, Execution, and Telemetry Subsystem for J.A.R.V.I.S."""

from jarvis.system.executor import AsyncSubprocessExecutor, ExecutionResult
from jarvis.system.telemetry import SystemTelemetryCollector, TelemetryReport
from jarvis.system.signals import SignalManager

__all__ = [
    "AsyncSubprocessExecutor",
    "ExecutionResult",
    "SystemTelemetryCollector",
    "TelemetryReport",
    "SignalManager",
]

