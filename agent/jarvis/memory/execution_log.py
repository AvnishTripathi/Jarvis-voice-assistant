"""Execution Audit Trail Logger.

Persists every system command, execution outcome, and security verdict
for accountability and diagnostics.
"""

import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional
from jarvis.memory.db import DatabaseManager


@dataclass
class AuditRecord:
    """Represents a logged command execution event."""
    session_id: Optional[str]
    command: str
    status: str  # 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'TIMEOUT'
    exit_code: Optional[int]
    stdout: str
    stderr: str
    duration_ms: float
    safety_verdict: str
    timestamp: float = time.time()
    id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AuditLogger:
    """Manages command audit persistence and retrieval."""

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    async def log(
        self,
        command: str,
        status: str,
        safety_verdict: str,
        session_id: Optional[str] = None,
        exit_code: Optional[int] = None,
        stdout: str = "",
        stderr: str = "",
        duration_ms: float = 0.0
    ) -> int:
        """Write an audit entry into SQLite."""
        now = time.time()
        query = """
        INSERT INTO execution_logs
        (session_id, command, status, exit_code, stdout, stderr, duration_ms, safety_verdict, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        log_id = await self.db.execute_write(
            query,
            (
                session_id,
                command,
                status,
                exit_code,
                stdout[:10000],  # cap to 10k chars in log
                stderr[:10000],
                duration_ms,
                safety_verdict,
                now
            )
        )
        return log_id

    async def get_recent(self, limit: int = 50) -> List[dict]:
        """Fetch the most recent audit records."""
        query = """
        SELECT id, session_id, command, status, exit_code, stdout, stderr, duration_ms, safety_verdict, timestamp
        FROM execution_logs
        ORDER BY timestamp DESC
        LIMIT ?;
        """
        return await self.db.execute_query(query, (limit,))

