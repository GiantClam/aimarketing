import os
import httpx
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class SerperClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("SERPER_API_KEY")
        self.base_url = "https://google.serper.dev/search"

    async def search(self, query: str, num: int = 5) -> List[Dict[str, Any]]:
        if not self.api_key:
            logger.error("SERPER_API_KEY not found")
            return []

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "q": query,
            "num": num
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(self.base_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                return data.get("organic", [])
            except Exception as e:
                logger.error(f"Serper search error: {e}")
                return []

class FirecrawlClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY")
        self.base_url = "https://api.firecrawl.dev/v1/scrape"

    async def scrape(self, url: str) -> str:
        if not self.api_key:
            logger.error("FIRECRAWL_API_KEY not found")
            return f"Error: FIRECRAWL_API_KEY not set. Could not scrape {url}"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "url": url,
            "formats": ["markdown"]
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(self.base_url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                if data.get("success"):
                    return data.get("data", {}).get("markdown", "")
                return f"Error: Firecrawl scrape failed for {url}"
            except Exception as e:
                logger.error(f"Firecrawl scrape error: {e}")
                return f"Error: {str(e)}"
