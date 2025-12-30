import os
import httpx
import json
import logging

logger = logging.getLogger(__name__)

class OpenRouterClient:
    def __init__(self, api_key: str = None, base_url: str = "https://openrouter.ai/api/v1"):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.base_url = base_url
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not found in environment")

    async def chat_completions(self, model: str, messages: list, **kwargs):
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("SITE_URL", "http://localhost:3000"),
            "X-Title": "AI Marketing WebGen",
        }
        
        payload = {
            "model": model,
            "messages": messages,
            **kwargs
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
