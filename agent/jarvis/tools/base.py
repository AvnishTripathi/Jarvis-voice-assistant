"""Tool Registry and Schema Converter.

Inspects Python functions, generates OpenAPI-compatible parameter schemas
for Google GenAI Function Declarations, and manages tool invocation.
"""

import inspect
from typing import Any, Callable, Coroutine, Dict, List, Optional, get_type_hints


def _python_type_to_json_schema(py_type: Any) -> dict:
    """Map standard Python typing primitives to JSON schema types."""
    if py_type == str:
        return {"type": "string"}
    elif py_type == int:
        return {"type": "integer"}
    elif py_type == float:
        return {"type": "number"}
    elif py_type == bool:
        return {"type": "boolean"}
    elif py_type in (list, List):
        return {"type": "array"}
    elif py_type in (dict, Dict):
        return {"type": "object"}
    return {"type": "string"}


class RegisteredTool:
    """Represents a callable tool with its auto-generated GenAI schema."""

    def __init__(self, fn: Callable[..., Any], name: Optional[str] = None, description: Optional[str] = None) -> None:
        self.fn = fn
        self.name = name or fn.__name__
        self.description = description or (fn.__doc__ or "").strip().split("\n")[0]
        self.is_async = inspect.iscoroutinefunction(fn)
        self.schema = self._generate_schema()

    def _generate_schema(self) -> dict:
        """Derive OpenAPI-compliant function declaration schema from signature."""
        sig = inspect.signature(self.fn)
        hints = get_type_hints(self.fn)

        properties: Dict[str, Any] = {}
        required: List[str] = []

        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue

            param_type = hints.get(param_name, str)
            prop_schema = _python_type_to_json_schema(param_type)

            # Check if default value exists
            if param.default is inspect.Parameter.empty:
                required.append(param_name)
            else:
                prop_schema["default"] = param.default

            properties[param_name] = prop_schema

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required
            }
        }

    async def execute(self, **kwargs: Any) -> Any:
        """Execute the tool function with provided keyword arguments."""
        if self.is_async:
            return await self.fn(**kwargs)
        return self.fn(**kwargs)


class ToolRegistry:
    """Central repository for tools callable by Gemini."""

    def __init__(self) -> None:
        self._tools: Dict[str, RegisteredTool] = {}

    def register(self, fn: Callable[..., Any], name: Optional[str] = None, description: Optional[str] = None) -> None:
        """Register a function as an autonomous tool."""
        tool = RegisteredTool(fn, name=name, description=description)
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[RegisteredTool]:
        return self._tools.get(name)

    def get_schemas(self) -> List[dict]:
        """Return array of function declarations for Google GenAI SDK."""
        return [tool.schema for tool in self._tools.values()]

    async def dispatch(self, tool_name: str, arguments: dict) -> dict:
        """Execute a tool call requested by the model and return structured result."""
        tool = self.get_tool(tool_name)
        if not tool:
            return {"error": f"Tool '{tool_name}' not found in active registry."}

        try:
            result = await tool.execute(**arguments)
            return {"success": True, "result": result}
        except Exception as ex:
            return {"success": False, "error": str(ex)}


# Global default registry
default_registry = ToolRegistry()


def register_tool(name: Optional[str] = None, description: Optional[str] = None):
    """Decorator to easily register functions into default ToolRegistry."""
    def decorator(fn: Callable[..., Any]):
        default_registry.register(fn, name=name, description=description)
        return fn
    return decorator

