from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import uuid
from website_agent import app_graph

router = APIRouter()

class GenerateRequest(BaseModel):
    prompt: str
    industry: Optional[str] = None
    company_info: Optional[str] = None

@router.post("/generate")
async def generate_website(request: GenerateRequest):
    run_id = f"wg_{uuid.uuid4().hex[:8]}"
    initial_state = {
        "prompt": request.prompt,
        "industry": request.industry,
        "company_info": request.company_info,
        "research_results": None,
        "html_content": None,
        "audit_feedback": None,
        "assets": [],
        "deployment_url": None,
        "status": "started"
    }

    async def event_generator():
        async for event in app_graph.astream(initial_state):
            # event is a dict like {'node_name': state}
            for node_name, state in event.items():
                yield f"data: {json.dumps({'node': node_name, 'status': state['status'], 'run_id': run_id})}\n\n"
        
        # Final result
        final_state = await app_graph.ainvoke(initial_state)
        yield f"data: {json.dumps({'type': 'final', 'html': final_state['html_content'], 'deployment_url': final_state.get('deployment_url'), 'run_id': run_id})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/status/{run_id}")
async def get_status(run_id: str):
    return {"run_id": run_id, "status": "tracking_active"}
