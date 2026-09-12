"""Path Sandboxing Subsystem for J.A.R.V.I.S.

Restricts file read, write, and directory listing operations to an authorized root.
"""

from pathlib import Path
from typing import Union


class SandboxViolationError(Exception):
    """Raised when an operation attempts to access paths outside the sandbox root."""
    pass


class PathSandbox:
    """Enforces directory confinement and prevents directory traversal attacks."""

    def __init__(self, root_dir: Union[str, Path]) -> None:
        self.root = Path(root_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve_safe_path(self, target_path: Union[str, Path], allow_nonexistent: bool = True) -> Path:
        """Resolve target_path and verify it lies strictly within the sandbox boundary.

        Args:
            target_path: Path to validate (relative or absolute).
            allow_nonexistent: If True, parent directory must exist or be within root.

        Returns:
            Resolved absolute Path guaranteed to reside inside self.root.

        Raises:
            SandboxViolationError if target_path escapes sandbox root.
        """
        raw_path = Path(target_path)
        if raw_path.is_absolute():
            resolved = raw_path.resolve()
        else:
            resolved = (self.root / raw_path).resolve()

        # Confinement check: resolved path must start with root path
        try:
            resolved.relative_to(self.root)
        except ValueError:
            raise SandboxViolationError(
                f"ACCESS DENIED: Path '{target_path}' resolves to '{resolved}', "
                f"which is outside authorized sandbox '{self.root}'."
            )

        return resolved

    def is_safe(self, target_path: Union[str, Path]) -> bool:
        """Check if path is safe without raising exception."""
        try:
            self.resolve_safe_path(target_path)
            return True
        except SandboxViolationError:
            return False

