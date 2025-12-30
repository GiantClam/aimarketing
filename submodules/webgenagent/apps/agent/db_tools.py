import os
import json
from supabase import create_client, Client
from typing import List, Dict, Any, Optional

class DBClient:
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if url and key:
            self.supabase: Client = create_client(url, key)
        else:
            self.supabase = None
            print("Supabase credentials missing")

    async def save_site(self, run_id: str, project_name: str, deployment_url: str, html: str, assets: list):
        if not self.supabase:
            return
        
        data = {
            "run_id": run_id,
            "project_name": project_name,
            "deployment_url": deployment_url,
            "html_content": html,
            "assets": assets
        }
        
        try:
            self.supabase.table("web_sites").upsert(data).execute()
        except Exception as e:
            print(f"Error saving site: {e}")

    async def get_templates(self, industry: str, query_embedding: Optional[List[float]] = None) -> List[Dict[str, Any]]:
        if not self.supabase:
            return []
        
        try:
            if query_embedding:
                # Placeholder for pgvector similarity search via Supabase RPC or raw remote SQL
                # response = self.supabase.rpc('match_templates', {'query_embedding': query_embedding, 'match_threshold': 0.5, 'match_count': 5}).execute()
                # return response.data
                pass
            
            # Fallback to industry tag filtering
            query = self.supabase.table("web_templates").select("*").eq("industry", industry)
            response = query.execute()
            return response.data
        except Exception as e:
            print(f"Error getting templates: {e}")
            return []
