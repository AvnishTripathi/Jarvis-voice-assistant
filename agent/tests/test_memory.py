"""Unit Tests for SQLite Persistence, Session Memory, and Audit Logging."""

import tempfile
import unittest
from pathlib import Path
import shutil

from jarvis.memory.db import DatabaseManager
from jarvis.memory.session import SessionMemory
from jarvis.memory.execution_log import AuditLogger


class TestMemorySubsystem(unittest.IsolatedAsyncioTestCase):
    """Test SQLite async operations, message persistence, and audit records."""

    async def asyncSetUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="jarvis_db_test_")
        self.db_path = Path(self.temp_dir) / "test_memory.db"
        self.db = DatabaseManager(db_path=self.db_path)
        await self.db.initialize()

        self.memory = SessionMemory(db=self.db, session_id="test_sess_01")
        self.logger = AuditLogger(db=self.db)

    async def asyncTearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    async def test_session_message_roundtrip(self):
        # Add messages
        msg1_id = await self.memory.add_message(role="user", content="Hello JARVIS")
        msg2_id = await self.memory.add_message(role="model", content="At your service, Sir.")

        self.assertGreater(msg1_id, 0)
        self.assertGreater(msg2_id, msg1_id)

        history = await self.memory.get_recent_history(limit=10)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0].role, "user")
        self.assertEqual(history[0].content, "Hello JARVIS")
        self.assertEqual(history[1].role, "model")
        self.assertEqual(history[1].content, "At your service, Sir.")

    async def test_audit_logging_roundtrip(self):
        log_id = await self.logger.log(
            command="python --version",
            status="SUCCESS",
            safety_verdict="Allowed",
            session_id="test_sess_01",
            exit_code=0,
            stdout="Python 3.12.0",
            duration_ms=45.2
        )
        self.assertGreater(log_id, 0)

        logs = await self.logger.get_recent(limit=5)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["command"], "python --version")
        self.assertEqual(logs[0]["status"], "SUCCESS")
        self.assertEqual(logs[0]["exit_code"], 0)


if __name__ == "__main__":
    unittest.main()

