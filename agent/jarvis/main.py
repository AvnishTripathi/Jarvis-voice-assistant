"""J.A.R.V.I.S Autonomous Agent — Interactive Console & CLI Entrypoint.

Provides Rich terminal interface, autonomous goal execution loop,
system diagnostics, and audit log inspection.
"""

import asyncio
import logging
import sys
from pathlib import Path
import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from jarvis.config import settings
from jarvis.safety.guards import DestructivePatternGuard
from jarvis.safety.sandbox import PathSandbox
from jarvis.system.executor import AsyncSubprocessExecutor
from jarvis.system.telemetry import SystemTelemetryCollector
from jarvis.system.signals import SignalManager
from jarvis.memory.db import DatabaseManager
from jarvis.memory.session import SessionMemory
from jarvis.memory.execution_log import AuditLogger
from jarvis.tools.base import ToolRegistry
from jarvis.tools.system_tools import SystemTools
from jarvis.tools.web_tools import WebTools
from jarvis.engine.gemini import GeminiAgentEngine

console = Console()
logging.basicConfig(level=getattr(logging, settings.log_level))


def display_banner() -> None:
    """Render the high-tech J.A.R.V.I.S banner."""
    banner = """[bold cyan]
    ╦ ╔═╗ ╦═╗ ╦  ╦ ╦ ╔═╗
    ║ ╠═╣ ╠╦╝ ╚╗╔╝ ║ ╚═╗
   ╚╝ ╩ ╩ ╩╚═  ╚╝  ╩ ╚═╝
   [dim]AUTONOMOUS AGENT CORE v1.0.0[/dim]
   [dim cyan]Google GenAI (Gemini 2.5) • Subprocess Async • SQLite Memory • Strict Sandboxing[/dim cyan]
[/bold cyan]"""
    console.print(banner)


def render_telemetry(collector: SystemTelemetryCollector) -> None:
    """Display real-time hardware diagnostics table."""
    report = collector.capture()
    table = Table(title="J.A.R.V.I.S — Host Telemetry & Hardware Matrix", border_style="cyan")
    table.add_column("Subsystem", style="bold cyan")
    table.add_column("Metric / Specification", style="white")

    table.add_row("Host OS", f"{report.os_name} ({report.architecture})")
    table.add_row("Hostname", report.hostname)
    table.add_row("CPU Architecture", f"{report.cpu_cores} Cores @ {report.cpu_percent}% Utilized")
    table.add_row("Memory (RAM)", f"{report.memory_used_gb} GB / {report.memory_total_gb} GB ({report.memory_percent}%)")
    table.add_row("Disk Volume", f"{report.disk_used_gb} GB / {report.disk_total_gb} GB ({report.disk_percent}%)")
    table.add_row("Agent Process", f"PID {report.process_pid} • {report.process_memory_mb} MB RSS")
    table.add_row("Uptime", f"{round(report.uptime_seconds / 3600, 1)} hours")

    console.print(table)


async def render_audit_logs(audit_logger: AuditLogger) -> None:
    """Display recent command audit records."""
    logs = await audit_logger.get_recent(limit=15)
    if not logs:
        console.print("[yellow]No audit logs recorded yet.[/yellow]")
        return

    table = Table(title="Execution Audit Trail (Recent 15 Operations)", border_style="magenta")
    table.add_column("ID", style="dim")
    table.add_column("Command", style="cyan")
    table.add_column("Status", style="bold")
    table.add_column("Exit", style="white")
    table.add_column("Duration", style="yellow")
    table.add_column("Verdict", style="white")

    for l in logs:
        status_style = "green" if l["status"] == "SUCCESS" else ("red" if l["status"] == "BLOCKED" else "yellow")
        table.add_row(
            str(l["id"]),
            l["command"][:40],
            f"[{status_style}]{l['status']}[/{status_style}]",
            str(l["exit_code"]) if l["exit_code"] is not None else "-",
            f"{l['duration_ms']:.1f}ms" if l["duration_ms"] else "-",
            l["safety_verdict"][:35]
        )

    console.print(table)


async def run_agent_loop(session_id: str, single_command: str = None) -> None:
    """Initialize agent subsystem dependencies and enter autonomous loop."""
    settings.ensure_directories()

    # 1. Safety & Subprocess Execution Layer
    guard = DestructivePatternGuard(mode=settings.safety_level)
    sandbox = PathSandbox(root_dir=settings.sandbox_root)
    executor = AsyncSubprocessExecutor(
        default_timeout_seconds=settings.command_timeout_seconds,
        max_output_bytes=settings.max_output_bytes,
        working_directory=str(settings.sandbox_root.resolve())
    )

    # 2. State & Memory Persistence Layer
    db = DatabaseManager(db_path=settings.database_path)
    await db.initialize()
    memory = SessionMemory(db=db, session_id=session_id)
    audit_logger = AuditLogger(db=db)

    # 3. Tool Registration
    registry = ToolRegistry()
    sys_tools = SystemTools(
        executor=executor,
        sandbox=sandbox,
        guard=guard,
        audit_logger=audit_logger,
        session_id=session_id
    )
    sys_tools.register_all(registry)

    web_tools = WebTools(allow_networking=settings.allow_networking)
    web_tools.register_all(registry)

    # 4. Signal Handlers
    sig_mgr = SignalManager()
    sig_mgr.attach(asyncio.get_running_loop())

    # 5. Gemini 2.5 Agent Engine
    engine = GeminiAgentEngine(
        registry=registry,
        memory=memory,
        api_key=settings.gemini_api_key,
        model_name=settings.gemini_model
    )

    display_banner()
    console.print(f"[dim cyan]Session ID:[/dim cyan] {session_id}")
    console.print(f"[dim cyan]Sandbox Root:[/dim cyan] {settings.sandbox_root.resolve()}")
    console.print(f"[dim cyan]Safety Mode:[/dim cyan] [{ 'bold green' if settings.safety_level == 'STRICT' else 'yellow' }]{settings.safety_level}[/]")
    console.print(f"[dim cyan]Model Engine:[/dim cyan] {settings.gemini_model}")
    console.print("[dim]Type 'exit' to terminate, 'telemetry' for hardware specs, or 'audit' for log history.[/dim]\n")

    # Single-shot execution mode
    if single_command:
        console.print(f"[bold cyan]JARVIS Single Instruction:[/bold cyan] {single_command}")
        response = await engine.run_turn(single_command, on_chunk=lambda c: console.print(c, end=""))
        console.print(Panel(response, title="JARVIS Response", border_style="cyan"))
        return

    # Interactive autonomous REPL loop
    while True:
        try:
            user_text = console.input("[bold cyan]JARVIS > [/bold cyan]").strip()
            if not user_text:
                continue

            if user_text.lower() in ("exit", "quit", "bye"):
                console.print("[cyan]Deactivating core protocols. Standing down, Sir.[/cyan]")
                break

            if user_text.lower() == "telemetry":
                render_telemetry(sys_tools.telemetry)
                continue

            if user_text.lower() == "audit":
                await render_audit_logs(audit_logger)
                continue

            with console.status("[bold cyan]Processing neural heuristics & tool actions...[/bold cyan]", spinner="dots"):
                response = await engine.run_turn(
                    user_text,
                    on_chunk=lambda chunk: console.print(chunk, end="")
                )

            console.print(Panel(response, title="JARVIS Intelligence", border_style="cyan"))

        except (KeyboardInterrupt, EOFError):
            console.print("\n[yellow]Interrupt detected. Shutting down, Sir.[/yellow]")
            break
        except Exception as ex:
            console.print(f"[bold red]Execution Exception:[/bold red] {ex}")


@click.command()
@click.option("--session", "-s", default="default_session", help="Session ID for context memory persistence.")
@click.option("--telemetry", "-t", is_flag=True, help="Display live system telemetry and exit.")
@click.option("--audit", "-a", is_flag=True, help="Inspect recent command audit logs and exit.")
@click.option("--command", "-c", default=None, help="Execute a single-shot instruction and exit.")
def cli(session: str, telemetry: bool, audit: bool, command: str) -> None:
    """J.A.R.V.I.S Autonomous Agent CLI Entrypoint."""
    if telemetry:
        collector = SystemTelemetryCollector()
        render_telemetry(collector)
        return

    if audit:
        async def _run_audit():
            db = DatabaseManager(settings.database_path)
            await db.initialize()
            logger = AuditLogger(db)
            await render_audit_logs(logger)
        asyncio.run(_run_audit())
        return

    asyncio.run(run_agent_loop(session_id=session, single_command=command))


if __name__ == "__main__":
    cli()

