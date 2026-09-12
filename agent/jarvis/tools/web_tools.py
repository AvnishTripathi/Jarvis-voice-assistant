"""Web Extraction Tools for J.A.R.V.I.S Autonomous Agent.

Provides non-blocking HTTP fetching and content extraction.
"""

from typing import Dict, Any

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    httpx = None
    HAS_HTTPX = False

from jarvis.config import settings
from jarvis.tools.base import ToolRegistry


class WebTools:
    """Network search and web fetching tools."""

    def __init__(self, allow_networking: bool = True) -> None:
        self.allow_networking = allow_networking

    def register_all(self, registry: ToolRegistry) -> None:
        """Register web tools into the provided ToolRegistry."""
        registry.register(
            self.fetch_url_content,
            name="fetch_url_content",
            description="Fetch text content from a web URL via HTTP GET."
        )

    async def fetch_url_content(self, url: str, max_chars: int = 4000) -> Dict[str, Any]:
        """Fetch text content from a web URL via HTTP GET."""
        if not self.allow_networking or not settings.allow_networking:
            return {"success": False, "error": "Outbound networking is disabled by safety policy."}

        if not url.startswith(("http://", "https://")):
            return {"success": False, "error": "Invalid URL scheme. Only http:// and https:// are supported."}

        try:
            if HAS_HTTPX:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                    resp = await client.get(url, headers={"User-Agent": "JARVIS-Autonomous-Agent/1.0"})
                    resp.raise_for_status()
                    text = resp.text[:max_chars]
                    return {
                        "success": True,
                        "url": str(resp.url),
                        "status_code": resp.status_code,
                        "content_length": len(text),
                        "content": text
                    }
            else:
                import urllib.request
                import asyncio
                def _fetch():
                    req = urllib.request.Request(url, headers={"User-Agent": "JARVIS-Autonomous-Agent/1.0"})
                    with urllib.request.urlopen(req, timeout=10.0) as response:
                        return response.read().decode("utf-8", errors="replace")[:max_chars]
                text = await asyncio.to_thread(_fetch)
                return {
                    "success": True,
                    "url": url,
                    "content_length": len(text),
                    "content": text
                }
        except Exception as ex:
            return {"success": False, "error": f"Failed to fetch URL: {str(ex)}"}

