"""
tests/test_jarvis_e2e.py
End-to-End Integration and Self-Healing Test Harness for JARVIS.
"""

import json
import time
import pytest
from unittest.mock import MagicMock, patch

from core.engine import JarvisEngine, run_shell, inspect_telemetry
from core.tools.system import CommandResult, execute_shell_command


# ---------------------------------------------------------------------------
# Helpers & Mock Data Types
# ---------------------------------------------------------------------------

class MockPart:
    def __init__(self, function_response_dict: dict = None, text: str = None):
        self.text = text
        if function_response_dict:
            self.function_response = MagicMock()
            self.function_response.response = function_response_dict
        else:
            self.function_response = None


class MockMessage:
    def __init__(self, parts: list[MockPart]):
        self.parts = parts


class MockChatResponse:
    def __init__(self, text: str):
        self.text = text


# ---------------------------------------------------------------------------
# Test Scenarios
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_engine():
    """Provides a JarvisEngine instance with patched Google GenAI client."""
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_chats = MagicMock()
        mock_chat_session = MagicMock()
        
        mock_chats.create.return_value = mock_chat_session
        mock_client.chats = mock_chats
        mock_client_cls.return_value = mock_client
        
        engine = JarvisEngine(model_name="gemini-2.5-flash", max_healing_retries=3)
        return engine


def test_scenario_a_self_healing_compile_failure(mock_engine):
    """
    Scenario A: 
    1. Command fails with non-zero exit code (missing dep).
    2. Engine catches error and injects healing prompt.
    3. Second turn resolves cleanly.
    """
    failed_payload = {
        "command": "python3 -c 'import nonexistent_lib'",
        "exit_code": 1,
        "stdout": "",
        "stderr": "ModuleNotFoundError: No module named 'nonexistent_lib'",
        "timed_out": False,
        "blocked": False,
        "duration_ms": 12.4
    }

    # First turn history indicates failure; second turn succeeds
    mock_engine.chat.get_history.side_effect = [
        [MockMessage([MockPart(function_response_dict=failed_payload)])],
        [] # Healed state
    ]

    mock_engine.chat.send_message.side_effect = [
        MockChatResponse("Failed to import. Attempting remediation."),
        MockChatResponse("Dependency isolated. Execution successfully verified.")
    ]

    result = mock_engine.execute_instruction("Run the script requiring nonexistent_lib")

    assert "Dependency isolated" in result
    assert mock_engine.chat.send_message.call_count == 2
    
    # Verify the intervention message was injected into the prompt
    healing_call_args = mock_engine.chat.send_message.call_args_list[1][0][0]
    assert "[SYSTEM HEALING INTERVENTION - ATTEMPT 1/3]" in healing_call_args
    assert "ModuleNotFoundError" in healing_call_args


def test_scenario_b_telemetry_inspection_and_process_reporting(mock_engine):
    """
    Scenario B:
    Jarvis pulls real telemetry and confirms parsing of CPU, memory, and top processes.
    """
    telemetry_raw = inspect_telemetry()
    data = json.loads(telemetry_raw)

    assert "cpu_percent_total" in data
    assert "memory_used_gb" in data
    assert "top_processes" in data
    assert isinstance(data["top_processes"], list)

    mock_engine.chat.get_history.return_value = []
    mock_engine.chat.send_message.return_value = MockChatResponse(
        f"Telemetry analyzed: Host CPU at {data['cpu_percent_total']}%, RAM {data['memory_percent']}% utilized."
    )

    response = mock_engine.execute_instruction("Provide live telemetry summary.")
    assert "Telemetry analyzed" in response
    assert str(data["cpu_percent_total"]) in response


def test_scenario_c_exhausted_retries_failure(mock_engine):
    """
    Scenario C:
    Persistent tool failures must not loop infinitely. Engine must halt at max_healing_retries.
    """
    persistent_fail = {
        "command": "false",
        "exit_code": 1,
        "stdout": "",
        "stderr": "General Failure",
        "timed_out": False,
        "blocked": False
    }

    # History consistently reports error
    mock_engine.chat.get_history.return_value = [
        MockMessage([MockPart(function_response_dict=persistent_fail)])
    ]
    mock_engine.chat.send_message.return_value = MockChatResponse("Failed again.")

    result = mock_engine.execute_instruction("Run a command that keeps failing.")

    # Max retries = 3 -> Initial call + 3 retry calls = 4 calls total
    assert mock_engine.chat.send_message.call_count == 4
    assert "[FAILED_TO_HEAL]" in result


# ---------------------------------------------------------------------------
# Additional Fidelity & Latency Benchmarks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_posix_exit_code_fidelity():
    """Validate exact exit code fidelity across commands."""
    res0 = await execute_shell_command("python -c \"import sys; sys.exit(0)\"")
    assert res0.exit_code == 0

    res1 = await execute_shell_command("python -c \"import sys; sys.exit(1)\"")
    assert res1.exit_code == 1

    res2 = await execute_shell_command("python -c \"import sys; sys.exit(2)\"")
    assert res2.exit_code == 2

    res42 = await execute_shell_command("python -c \"import sys; sys.exit(42)\"")
    assert res42.exit_code == 42


def test_end_to_end_latency_benchmark(mock_engine):
    """Benchmark end-to-end latency from prompt arrival to tool execution return."""
    mock_engine.chat.get_history.return_value = []
    mock_engine.chat.send_message.return_value = MockChatResponse("Benchmark turn completed.")

    start_t = time.perf_counter()
    resp = mock_engine.execute_instruction("Perform latency benchmark turn.")
    elapsed_ms = (time.perf_counter() - start_t) * 1000

    assert "Benchmark turn completed" in resp
    assert elapsed_ms < 500.0
