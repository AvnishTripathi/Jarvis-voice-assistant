# J.A.R.V.I.S Autonomous Agent Core (Python 3.11+)

Production-grade autonomous AI agent architecture for workstation automation, telemetry diagnostics, safe command execution, and multi-turn reasoning powered by Google GenAI (Gemini 2.5).

---

## Key Capabilities

1. **Inference Engine**:
   - Built on Google GenAI SDK (`google-genai`) with Gemini 2.5 Flash / Pro.
   - Automated native function calling: the model dynamically generates tool calls, receives structured responses, and iterates autonomously.

2. **System Interface & Execution**:
   - Non-blocking asynchronous subprocess execution (`asyncio.create_subprocess_shell`).
   - Configurable command timeouts with automatic zombie process termination.
   - Real-time `psutil` hardware telemetry (per-core CPU, RAM allocation, disk I/O, process lists).
   - Clean OS signal handlers for `SIGINT` (Ctrl+C) and `SIGTERM`.

3. **State & Persistence**:
   - Async SQLite database (`aiosqlite` / `sqlite3`) tracking sessions, message context, and detailed command execution logs.
   - Full audit trail recording commands, execution duration, exit codes, and safety verdicts.

4. **Safety & Sandboxing**:
   - Pre-execution regex & heuristic guards blocking destructive operations (`rm -rf /`, `format`, fork bombs, device wipes, registry sabotage).
   - Strict filesystem path boundary sandboxing preventing directory traversal (`../`).

---

## Installation

### Prerequisites
- Python 3.11 or higher (`python --version`)

### Option A: Using Pip
```bash
cd agent
pip install -r requirements.txt
```

### Option B: Using Poetry
```bash
cd agent
poetry install
```

---

## Configuration

1. Copy `.env.template` to `.env`:
   ```bash
   cp .env.template .env   # On Windows: copy .env.template .env
   ```
2. Edit `.env` and set your `GEMINI_API_KEY`:
   ```bash
   GEMINI_API_KEY=AIzaSy...
   ```

---

## Running the Agent

### Interactive Autonomous Terminal
```bash
python -m jarvis.main
```

### Quick Diagnostic Check
```bash
python -m jarvis.main --telemetry
```

### Run Test Suite
```bash
python run_tests.py
```

