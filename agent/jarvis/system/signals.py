"""OS-Level Signal Handling and Graceful Shutdown Protocol.

Captures termination signals (SIGINT, SIGTERM) across Windows and POSIX,
triggering registered asynchronous cleanup routines before application termination.
"""

import asyncio
import logging
import signal
from typing import Callable, List, Coroutine, Any

logger = logging.getLogger("jarvis.signals")


class SignalManager:
    """Manages system interrupt signals and coordinates graceful asynchronous shutdown."""

    def __init__(self) -> None:
        self._shutdown_callbacks: List[Callable[[], Coroutine[Any, Any, None]]] = []
        self._is_shutting_down = False

    def register_cleanup(self, callback: Callable[[], Coroutine[Any, Any, None]]) -> None:
        """Register an async callback invoked on shutdown."""
        self._shutdown_callbacks.append(callback)

    def attach(self, loop: asyncio.AbstractEventLoop) -> None:
        """Attach signal handlers to the active event loop."""
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                # Windows asyncio does not support add_signal_handler; use signal.signal fallback
                if hasattr(loop, "add_signal_handler") and hasattr(signal, "SIGTERM"):
                    loop.add_signal_handler(
                        sig,
                        lambda s=sig: asyncio.create_task(self.trigger_shutdown(s))
                    )
                else:
                    signal.signal(
                        sig,
                        lambda s, f: asyncio.create_task(self.trigger_shutdown(s))
                    )
            except (NotImplementedError, ValueError, AttributeError):
                # Windows signal compatibility fallback
                try:
                    signal.signal(sig, lambda s, f: asyncio.create_task(self.trigger_shutdown(s)))
                except Exception:
                    pass

    async def trigger_shutdown(self, sig: int) -> None:
        """Execute cleanup tasks and exit cleanly."""
        if self._is_shutting_down:
            return
        self._is_shutting_down = True

        logger.info(f"Received shutdown signal ({sig}). Executing graceful teardown...")

        for callback in self._shutdown_callbacks:
            try:
                await callback()
            except Exception as ex:
                logger.error(f"Error during teardown callback: {ex}")

        logger.info("J.A.R.V.I.S core shutdown complete.")

