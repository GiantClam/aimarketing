import os
import asyncio
import httpx
import boto3
import logging
from botocore.config import Config
from typing import Optional

logger = logging.getLogger(__name__)

def get_r2_client():
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY")
    secret_key = os.getenv("R2_SECRET_KEY")
    if not (account_id and access_key and secret_key):
        return None
    
    config = Config(
        connect_timeout=60,
        read_timeout=300,
        retries={'max_attempts': 3, 'mode': 'adaptive'},
        max_pool_connections=50
    )
    
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=config
    )

async def upload_to_r2(content: bytes, key: str, content_type: str = "image/png") -> str:
    bucket = os.getenv("R2_BUCKET", "webgen")
    r2 = get_r2_client()
    if not r2:
        return f"mock-url://{key}"
        
    try:
        r2.put_object(Bucket=bucket, Key=key, Body=content, ContentType=content_type)
        public_base = os.getenv("R2_PUBLIC_BASE")
        if public_base:
            return f"{public_base.rstrip('/')}/{key}"
        account_id = os.getenv("R2_ACCOUNT_ID")
        return f"https://pub-{account_id}.r2.dev/{key}"
    except Exception as e:
        logger.error(f"R2 upload error: {e}")
        return f"error-url://{key}"

class ArtisticProvider:
    async def generate_image(self, prompt: str, run_id: str, index: int) -> str:
        # Mock Nanobanana
        logger.info(f"Generating image with Nanobanana for: {prompt}")
        await asyncio.sleep(1.0)
        # Mocking byte content
        content = b"fake image content" 
        key = f"{run_id}/image_{index}.png"
        return await upload_to_r2(content, key, "image/png")

    async def generate_video(self, prompt: str, run_id: str) -> str:
        # Mock Veo 3.1
        logger.info(f"Generating background video with Veo 3.1 for: {prompt}")
        await asyncio.sleep(2.0)
        content = b"fake video content"
        key = f"{run_id}/bg_video.mp4"
        return await upload_to_r2(content, key, "video/mp4")
