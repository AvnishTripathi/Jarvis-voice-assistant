"""Tool Registry and Function Calling Definitions for J.A.R.V.I.S."""

from jarvis.tools.base import ToolRegistry, register_tool
from jarvis.tools.system_tools import SystemTools
from jarvis.tools.web_tools import WebTools

__all__ = [
    "ToolRegistry",
    "register_tool",
    "SystemTools",
    "WebTools",
]

