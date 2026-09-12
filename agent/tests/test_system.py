"""Unit Tests for Asynchronous Subprocess Execution and Telemetry."""

import asyncio
import sys
import unittest

from jarvis.system.executor import AsyncSubprocessExecutor
from jarvis.system.telemetry import SystemTelemetryCollector


class TestSystemExecutor(unittest.IsolatedAsyncioTestCase):
    """Test non-blocking command execution and timeout enforcement."""

    def setUp(self):
        self.executor = AsyncSubprocessExecutor(default_timeout_seconds=5)

    async def test_successful_command_execution(self):
        cmd = "echo HELLO_JARVIS"
        res = await self.executor.execute(cmd)

        self.assertTrue(res.is_success)
        self.assertEqual(res.exit_code, 0)
        self.assertIn("HELLO_JARVIS", res.stdout)
        self.assertGreater(res.duration_ms, 0)
        self.assertFalse(res.timed_out)

    async def test_failing_command_exit_code(self):
        # Exit with error code 1
        cmd = "python -c \"import sys; sys.exit(42)\""
        res = await self.executor.execute(cmd)

        self.assertFalse(res.is_success)
        self.assertEqual(res.exit_code, 42)

    async def test_command_timeout_enforcement(self):
        # Run a sleep command with a 1-second timeout
        cmd = "python -c \"import time; time.sleep(5)\""
        res = await self.executor.execute(cmd, timeout_seconds=1)

        self.assertTrue(res.timed_out)
        self.assertFalse(res.is_success)
        self.assertIn("timed out", res.stderr.lower())


class TestSystemTelemetry(unittest.TestCase):
    """Test host hardware telemetry capture."""

    def setUp(self):
        self.collector = SystemTelemetryCollector()

    def test_telemetry_capture_schema(self):
        report = self.collector.capture()

        self.assertGreater(report.timestamp, 0)
        self.assertIn(report.platform, ("win32", "linux", "darwin"))
        self.assertGreater(report.cpu_cores, 0)
        self.assertIsInstance(report.hostname, str)
        self.assertGreaterEqual(report.cpu_percent, 0.0)

        data = report.to_dict()
        self.assertIn("memory_total_gb", data)
        self.assertIn("disk_total_gb", data)
        self.assertIn("process_pid", data)


if __name__ == "__main__":
    unittest.main()

