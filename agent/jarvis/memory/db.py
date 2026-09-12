"""SQLite Persistence Engine for J.A.R.V.I.S.

Provides asynchronous database access, schema initialization,
and table indexing using aiosqlite with native sqlite3 fallback.
"""

import asyncio
import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, List, Optional, Tuple, Union

try:
    import aiosqlite
    HAS_AIOSQLITE = True
except ImportError:
    aiosqlite = None
    HAS_AIOSQLITE = False

logger = logging.getLogger("jarvis.memory.db")


class DatabaseManager:
    """Async database interface managing context memory and execution audit trails."""

    def __init__(self, db_path: Union[str, Path]) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialized = False

    async def initialize(self) -> None:
        """Create database tables and performance indexes."""
        if self._initialized:
            return

        schema = """
        -- Active conversational sessions
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            created_at REAL NOT NULL,
            last_active REAL NOT NULL,
            metadata_json TEXT DEFAULT '{}'
        );

        -- Multi-turn context messages
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tool_calls_json TEXT DEFAULT '[]',
            tool_results_json TEXT DEFAULT '[]',
            timestamp REAL NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        );

        -- Immutable audit trail for tool & command executions
        CREATE TABLE IF NOT EXISTS execution_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            command TEXT NOT NULL,
            status TEXT NOT NULL,
            exit_code INTEGER,
            stdout TEXT,
            stderr TEXT,
            duration_ms REAL,
            safety_verdict TEXT NOT NULL,
            timestamp REAL NOT NULL
        );

        -- Performance indices
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_exec_logs_session ON execution_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_exec_logs_timestamp ON execution_logs(timestamp);
        """

        if HAS_AIOSQLITE:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("PRAGMA journal_mode=WAL;")
                await db.executescript(schema)
                await db.commit()
        else:
            # Sync fallback executed in thread
            def _sync_init():
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute("PRAGMA journal_mode=WAL;")
                    conn.executescript(schema)
                    conn.commit()
            await asyncio.to_thread(_sync_init)

        self._initialized = True
        logger.debug(f"Database initialized at {self.db_path}")

    async def execute_write(self, query: str, parameters: Tuple[Any, ...] = ()) -> int:
        """Execute an INSERT/UPDATE/DELETE query and return lastrowid."""
        await self.initialize()
        if HAS_AIOSQLITE:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(query, parameters)
                await db.commit()
                return cursor.lastrowid or 0
        else:
            def _sync():
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.execute(query, parameters)
                    conn.commit()
                    return cursor.lastrowid or 0
            return await asyncio.to_thread(_sync)

    async def execute_query(self, query: str, parameters: Tuple[Any, ...] = ()) -> List[dict]:
        """Execute a SELECT query and return rows as dictionary list."""
        await self.initialize()
        if HAS_AIOSQLITE:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(query, parameters) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
        else:
            def _sync():
                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.execute(query, parameters)
                    return [dict(row) for row in cursor.fetchall()]
            return await asyncio.to_thread(_sync)

