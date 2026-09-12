"""Zero-Dependency Test Suite Runner for J.A.R.V.I.S Autonomous Agent.

Executes all unit tests in tests/ using standard library unittest.
"""

import sys
import unittest
from pathlib import Path

# Add agent directory to sys.path so 'jarvis' package can be imported directly
AGENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(AGENT_DIR))


def run_all_tests() -> bool:
    """Discover and execute all test suites."""
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(AGENT_DIR / "tests"), pattern="test_*.py")

    runner = unittest.TextTestRunner(verbosity=2)
    print("\n" + "=" * 65)
    print("       J.A.R.V.I.S  AUTONOMOUS AGENT VERIFICATION SUITE       ")
    print("=" * 65 + "\n")

    result = runner.run(suite)
    print("\n" + "=" * 65)
    print(f"TESTS RUN: {result.testsRun} | FAILURES: {len(result.failures)} | ERRORS: {len(result.errors)}")
    print("=" * 65 + "\n")

    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

