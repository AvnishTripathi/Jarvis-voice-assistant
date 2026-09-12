"""Destructive Command Pattern Detection Guard.

Validates shell and subprocess commands against a defense-in-depth ruleset
to prevent data destruction, privilege escalation, and machine tampering.
"""

import re
from typing import List, Tuple


class SecurityViolationError(Exception):
    """Raised when a command violates safety policy."""
    pass


class DestructivePatternGuard:
    """Pre-execution analyzer for system commands."""

    # High-severity regex patterns that immediately block execution in STRICT mode
    BLOCKED_PATTERNS: List[Tuple[str, str]] = [
        # ── Recursive Deletions of Root / Drives / System Paths ──
        (
            r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-[a-zA-Z]*f[a-zA-Z]*r*)\s+([/~]|\*|\.\.|/\w+)",
            "Recursive deletion of root, home, or wildcards (rm -rf)"
        ),
        (
            r"\brmdir\s+/[sS]\s+/[qQ]\s+([a-zA-Z]:\\?|[\\/])",
            "Recursive deletion of Windows drive root (rmdir /s /q)"
        ),
        (
            r"\bdel(ete)?\s+/[fF]\s+/[sS]\s+/[qQ]\s+([a-zA-Z]:\\?|[\\/])",
            "Force deletion of entire drive (del /f /s /q)"
        ),

        # ── Drive / Filesystem Formatting ──
        (
            r"\bformat\s+[a-zA-Z]:",
            "Disk drive formatting command (format C:)"
        ),
        (
            r"\bmkfs(\.\w+)?\s+/dev/",
            "Filesystem initialization on block device (mkfs)"
        ),
        (
            r"\b(fdisk|parted|diskpart)\b",
            "Low-level disk partitioning utility"
        ),

        # ── Raw Disk & Block Device Overwrites ──
        (
            r"\bdd\s+.*of=/dev/(sd[a-z]|nvme|hd[a-z]|disk)",
            "Direct raw block device write (dd of=/dev/...)"
        ),
        (
            r">\s*/dev/(sd[a-z]|nvme|kmem|mem)",
            "Direct stdout redirection into raw device"
        ),

        # ── Fork Bombs & Resource Starvation ──
        (
            r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:",
            "Bash fork bomb pattern"
        ),
        (
            r"%0\s*\|\s*%0",
            "Batch script fork bomb pattern"
        ),

        # ── Windows Registry Destruction ──
        (
            r"\breg\s+delete\s+[\"']?(HKLM|HKEY_LOCAL_MACHINE|HKCR|HKEY_CLASSES_ROOT)",
            "Destructive deletion of critical Windows Registry hives"
        ),

        # ── Remote Code Pipe Execution ──
        (
            r"\b(curl|wget|fetch)\b.*\|\s*(bash|sh|zsh|powershell|cmd)\b",
            "Piped remote script execution (curl ... | bash)"
        ),

        # ── System Shutdown / Reboot ──
        (
            r"\b(shutdown\s+-[sShHrR]|init\s+[06]|reboot|poweroff)\b",
            "System shutdown or reboot command"
        ),

        # ── Linux System Wipe Hooks ──
        (
            r"\bchmod\s+(-R\s+)?000\s+/",
            "Permission stripping on root filesystem"
        ),
        (
            r"\bchown\s+(-R\s+)?.*\s+/(bin|boot|dev|etc|lib|lib64|sbin|usr)",
            "System binary ownership manipulation"
        ),
    ]

    def __init__(self, mode: str = "STRICT") -> None:
        self.mode = mode.upper()
        self._compiled_patterns = [
            (re.compile(pattern, re.IGNORECASE), description)
            for pattern, description in self.BLOCKED_PATTERNS
        ]

    def validate(self, command: str) -> Tuple[bool, str]:
        """Validate command against security patterns.

        Returns:
            (is_safe: bool, reason: str)
        Raises:
            SecurityViolationError if self.mode is STRICT and a threat is detected.
        """
        if not command or not command.strip():
            return True, "Empty command"

        cmd_clean = command.strip()

        for regex, description in self._compiled_patterns:
            if regex.search(cmd_clean):
                msg = f"SECURITY ALERT: Blocked potentially destructive command. Matched rule: '{description}'"
                if self.mode == "STRICT":
                    raise SecurityViolationError(msg)
                return False, msg

        return True, "Command passed security guards."

