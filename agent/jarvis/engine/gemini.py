"""Google GenAI Inference Engine with Automated Function Calling.

Supports Gemini 2.5 Flash / Pro via the official Google GenAI SDK (google-genai)
with direct HTTP REST failover and offline diagnostic mode.
"""

import json
import logging
from typing import Any, Callable, Dict, List, Optional
from jarvis.config import settings
from jarvis.engine.prompts import SYSTEM_INSTRUCTION
from jarvis.memory.session import SessionMemory, Message
from jarvis.tools.base import ToolRegistry

try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    genai = None
    types = None
    HAS_GENAI_SDK = False

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    httpx = None
    HAS_HTTPX = False

logger = logging.getLogger("jarvis.engine.gemini")


class GeminiAgentEngine:
    """Orchestrates multi-turn conversations and automated function calling loops."""

    def __init__(
        self,
        registry: ToolRegistry,
        memory: SessionMemory,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None
    ) -> None:
        self.registry = registry
        self.memory = memory
        self.api_key = api_key or settings.gemini_api_key
        self.model = model_name or settings.gemini_model
        self.client = None

        if HAS_GENAI_SDK and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
            except Exception as ex:
                logger.warning(f"Failed to initialize GenAI Client: {ex}")

    async def run_turn(
        self,
        user_input: str,
        on_chunk: Optional[Callable[[str], None]] = None,
        max_tool_iterations: int = 5
    ) -> str:
        """Run an autonomous agent turn with automated tool invocation.

        Args:
            user_input: The user's query or instruction.
            on_chunk: Optional streaming callback for tokens.
            max_tool_iterations: Cap to prevent infinite tool loops.

        Returns:
            The agent's final text response.
        """
        # 1. Persist user turn
        await self.memory.add_message(role="user", content=user_input)

        # 2. Check if API key is configured
        if not self.api_key:
            reply = (
                "J.A.R.V.I.S Autonomous Core Online, Sir. "
                "However, GEMINI_API_KEY is not configured in your environment or .env file. "
                "Please configure GEMINI_API_KEY to activate generative inference."
            )
            await self.memory.add_message(role="model", content=reply)
            return reply

        # 3. Autonomous Execution Loop (Model -> Tool Calls -> Results -> Model -> Final Answer)
        iteration = 0
        final_answer = ""

        while iteration < max_tool_iterations:
            iteration += 1
            history = await self.memory.get_recent_history(limit=15)
            tool_schemas = self.registry.get_schemas()

            # Execute generation turn
            response_data = await self._generate_step(history, tool_schemas)
            text_content = response_data.get("text", "")
            tool_calls = response_data.get("tool_calls", [])

            # If no tool calls requested, we have reached the final answer
            if not tool_calls:
                final_answer = text_content or "Operation executed successfully, Sir."
                await self.memory.add_message(role="model", content=final_answer)
                return final_answer

            # Execute tool calls
            tool_results = []
            for call in tool_calls:
                call_id = call.get("id") or call.get("name")
                name = call.get("name")
                args = call.get("args") or {}

                logger.info(f"[Turn {iteration}] Invoking tool: {name}({args})")
                if on_chunk:
                    on_chunk(f"⚡ [Action] Invoking tool `{name}`...\n")

                output = await self.registry.dispatch(name, args)
                tool_results.append({
                    "call_id": call_id,
                    "name": name,
                    "output": output
                })

            # Record tool call & results in context history
            await self.memory.add_message(
                role="model",
                content=text_content,
                tool_calls=tool_calls,
                tool_results=tool_results
            )

        # Reached iteration ceiling
        final_answer = (
            "Task loop completed, Sir. Subordinate operations have been executed."
        )
        return final_answer

    async def _generate_step(self, history: List[Message], tool_schemas: List[dict]) -> dict:
        """Call Gemini API via SDK or HTTP REST fallback."""
        if HAS_GENAI_SDK and self.client:
            return await self._call_sdk(history, tool_schemas)
        return await self._call_rest(history, tool_schemas)

    async def _call_sdk(self, history: List[Message], tool_schemas: List[dict]) -> dict:
        """Execute via Google GenAI SDK."""
        import asyncio

        def _sync_call():
            # Format contents
            contents = []
            for msg in history:
                role = "user" if msg.role == "user" else "model"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.content)]))

            config = types.GenerateContentConfig(
                temperature=settings.temperature,
                system_instruction=SYSTEM_INSTRUCTION,
            )

            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config
            )

            # Check for function calls
            text = response.text or ""
            calls = []
            if response.function_calls:
                for fc in response.function_calls:
                    calls.append({
                        "name": fc.name,
                        "args": dict(fc.args) if fc.args else {}
                    })

            return {"text": text, "tool_calls": calls}

        return await asyncio.to_thread(_sync_call)

    async def _call_rest(self, history: List[Message], tool_schemas: List[dict]) -> dict:
        """Direct REST fallback to Google Generative Language API."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

        contents = []
        for msg in history:
            role = "user" if msg.role == "user" else "model"
            parts = []
            if msg.content:
                parts.append({"text": msg.content})
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    parts.append({"functionCall": {"name": tc["name"], "args": tc.get("args", {})}})
            if msg.tool_results:
                for tr in msg.tool_results:
                    parts.append({"functionResponse": {"name": tr["name"], "response": tr.get("output", {})}})
            if parts:
                contents.append({"role": role, "parts": parts})

        tools_param = []
        if tool_schemas:
            tools_param = [{"function_declarations": tool_schemas}]

        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "contents": contents,
            "generationConfig": {
                "temperature": settings.temperature,
                "maxOutputTokens": 2048
            }
        }
        if tools_param:
            payload["tools"] = tools_param

        if HAS_HTTPX:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
        else:
            import urllib.request
            import asyncio
            def _sync():
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=30.0) as response:
                    return json.loads(response.read().decode("utf-8"))
            data = await asyncio.to_thread(_sync)

        candidate = data.get("candidates", [{}])[0]
        content_parts = candidate.get("content", {}).get("parts", [])

        text = ""
        tool_calls = []
        for p in content_parts:
            if "text" in p:
                text += p["text"]
            if "functionCall" in p:
                fc = p["functionCall"]
                tool_calls.append({
                    "name": fc.get("name"),
                    "args": fc.get("args", {})
                })

        return {"text": text, "tool_calls": tool_calls}

