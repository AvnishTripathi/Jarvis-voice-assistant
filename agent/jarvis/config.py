"""Configuration Management for J.A.R.V.I.S Autonomous Agent.

Loads, validates, and exposes settings from environment variables and .env files.
"""

from pathlib import Path
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Production application settings with strict validation and sane defaults."""

    # ── Inference Engine Settings ──
    gemini_api_key: str = Field(
        default="",
        description="Google GenAI API Key"
    )
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        description="Default Gemini model identifier"
    )
    temperature: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        description="Inference sampling temperature"
    )

    # ── Timeouts & Execution Limits ──
    agent_timeout_seconds: int = Field(
        default=120,
        gt=0,
        description="Total autonomous execution loop timeout in seconds"
    )
    command_timeout_seconds: int = Field(
        default=30,
        gt=0,
        description="Single subprocess execution timeout in seconds"
    )
    max_output_bytes: int = Field(
        default=65536,
        gt=0,
        description="Max standard output/error capture buffer size in bytes"
    )

    # ── Safety & Sandbox ──
    safety_level: Literal["STRICT", "AUDIT_ONLY", "PERMISSIVE"] = Field(
        default="STRICT",
        description="Safety enforcement policy"
    )
    sandbox_root: Path = Field(
        default=Path("./workspace"),
        description="Root directory boundary for file operations"
    )
    allow_networking: bool = Field(
        default=True,
        description="Allow outbound HTTP web requests from tools"
    )

    # ── Persistence & Database ──
    database_path: Path = Field(
        default=Path("./data/jarvis_memory.db"),
        description="SQLite database path"
    )
    max_audit_log_records: int = Field(
        default=5000,
        gt=0,
        description="Maximum audit log records to retain"
    )

    # ── Logging & Telemetry ──
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO",
        description="Logging verbosity level"
    )
    enable_telemetry: bool = Field(
        default=True,
        description="Enable psutil system resource sampling"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False
    )

    def ensure_directories(self) -> None:
        """Create sandbox root and database directory if they do not exist."""
        self.sandbox_root.mkdir(parents=True, exist_ok=True)
        if self.database_path.parent:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)


# Singleton configuration instance
settings = AgentSettings()

