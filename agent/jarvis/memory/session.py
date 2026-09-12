"""Conversational Session Context Memory.

Maintains multi-turn conversation history and sliding-window context in SQLite.
"""

import json
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from jarvis.memory.db import DatabaseManager


@dataclass
class Message:
    """Individual conversational message record."""
    role: str  # 'user' | 'model' | 'tool'
    content: str
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SessionMemory:
    """Manages active session context and message history."""

    def __init__(self, db: DatabaseManager, session_id: str = "default_session") -> None:
        self.db = db
        self.session_id = session_id

    async def ensure_session(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Create session entry if not already present."""
        now = time.time()
        meta_str = json.dumps(metadata or {})
        query = """
        INSERT INTO sessions (session_id, created_at, last_active, metadata_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET last_active = excluded.last_active;
        """
        await self.db.execute_write(query, (self.session_id, now, now, meta_str))

    async def add_message(
        self,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_results: Optional[List[Dict[str, Any]]] = None
    ) -> int:
        """Persist a message turn to the database."""
        await self.ensure_session()
        now = time.time()
        tc_json = json.dumps(tool_calls or [])
        tr_json = json.dumps(tool_results or [])

        query = """
        INSERT INTO messages (session_id, role, content, tool_calls_json, tool_results_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        msg_id = await self.db.execute_write(query, (self.session_id, role, content, tc_json, tr_json, now))
        return msg_id

    async def get_recent_history(self, limit: int = 20) -> List[Message]:
        """Fetch the most recent N messages in chronological order."""
        await self.ensure_session()
        query = """
        SELECT id, role, content, tool_calls_json, tool_results_json, timestamp
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?;
        """
        rows = await self.db.execute_query(query, (self.session_id, limit))
        # Reverse to return in chronological order
        messages = []
        for r in reversed(rows):
            messages.append(
                Message(
                    id=r["id"],
                    role=r["role"],
                    content=r["content"],
                    tool_calls=json.loads(r.get("tool_calls_json") or "[]"),
                    tool_results=json.loads(r.get("tool_results_json") or "[]"),
                    timestamp=r["timestamp"]
                )
            )
        return messages

    async def clear_history(self) -> None:
        """Clear all messages belonging to this session."""
        query = "DELETE FROM messages WHERE session_id = ?;"
        await self.db.execute_write(query, (self.session_id,))

