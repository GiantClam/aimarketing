import os
import json
import logging
from typing import TypedDict, List, Optional, Dict, Any
from langgraph.graph import StateGraph, END
from openrouter_client import OpenRouterClient
import httpx

logger = logging.getLogger(__name__)

# Models constants
GEMINI_3_FLASH = "google/gemini-3-flash-preview"
CLAUDE_4_5_OPUS = "anthropic/claude-4.5-opus"

class WebsiteState(TypedDict):
    prompt: str
    industry: Optional[str]
    company_info: Optional[str]
    research_results: Optional[str]
    html_content: Optional[str]
    audit_feedback: Optional[str]
    assets: List[Dict[str, str]]
    deployment_url: Optional[str]
    status: str

from research_tools import SerperClient, FirecrawlClient

async def researcher_node(state: WebsiteState) -> WebsiteState:
    logger.info("Entering Researcher Node")
    prompt = state["prompt"]
    
    serper = SerperClient()
    firecrawl = FirecrawlClient()
    
    # 1. Search for industry context and competitors
    search_query = f"{prompt} industry trends competitors seo keywords"
    search_results = await serper.search(search_query)
    
    research_summary = []
    if search_results:
        research_summary.append("Search Results:")
        for res in search_results[:3]:
            research_summary.append(f"- {res.get('title')}: {res.get('snippet')} (URL: {res.get('link')})")
            
            # 2. Scrape the top result for deeper context
            scrape_content = await firecrawl.scrape(res.get('link'))
            if scrape_content and not scrape_content.startswith("Error"):
                research_summary.append(f"  Scraped detail: {scrape_content[:500]}...")
    else:
        research_summary.append("No search results found. Proceeding with general industry knowledge.")

    state["research_results"] = "\n".join(research_summary)
    state["status"] = "research_completed"
    return state

async def coder_node(state: WebsiteState) -> WebsiteState:
    logger.info("Entering Coder Node")
    client = OpenRouterClient()
    
    system_prompt = """
    You are an expert web developer (Flash Coder). 
    Your task is to generate a complete, high-quality landing page using HTML and Tailwind CSS.
    The design should be modern, responsive, and suited for the industry provided in the research.
    Use placeholder images with descriptive alt tags that our Artist agent can replace later.
    Output ONLY valid HTML code.
    """
    
    user_message = f"""
    User Request: {state['prompt']}
    Research Context: {state['research_results']}
    Company Info: {state.get('company_info', 'N/A')}
    
    Generate the HTML/Tailwind code now.
    """
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    
    try:
        html = await client.chat_completions(model=GEMINI_3_FLASH, messages=messages)
        state["html_content"] = html
        state["status"] = "coding_completed"
    except Exception as e:
        logger.error(f"Error in coder_node: {e}")
        state["status"] = "coding_failed"
        
    return state

async def auditor_node(state: WebsiteState) -> WebsiteState:
    logger.info("Entering Auditor Node")
    client = OpenRouterClient()
    
    system_prompt = """
    You are a Senior SEO Auditor and Designer (Claude 4.5).
    Review the following HTML code for SEO optimization, copy quality, and design consistency.
    Provide constructive feedback. If the code is excellent, reply with 'APPROVED'.
    """
    
    user_message = f"HTML Content: {state['html_content']}"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    
    try:
        feedback = await client.chat_completions(model=CLAUDE_4_5_OPUS, messages=messages)
        state["audit_feedback"] = feedback
        state["status"] = "audit_completed"
    except Exception as e:
        logger.error(f"Error in auditor_node: {e}")
        state["status"] = "audit_failed"
        
    return state

from asset_tools import ArtisticProvider
import uuid

async def artist_node(state: WebsiteState) -> WebsiteState:
    logger.info("Entering Artist Node")
    prompt = state["prompt"]
    run_id = str(uuid.uuid4().hex[:8]) # In a real scenario, this would come from the state or context
    
    artist = ArtisticProvider()
    
    # 1. Generate core assets
    # For now, let's generate 1 main image and 1 background video
    img_url = await artist.generate_image(f"Industrial portal hero image for: {prompt}", run_id, 1)
    vid_url = await artist.generate_video(f"Cinematic industrial background for: {prompt}", run_id)
    
    state["assets"] = [
        {"type": "hero_image", "url": img_url},
        {"type": "bg_video", "url": vid_url}
    ]
    
    # 2. Replace placeholders in HTML if any
    if state["html_content"]:
        html = state["html_content"]
        # Simple replacement for demonstration
        html = html.replace("PLACEHOLDER_HERO_IMAGE", img_url)
        html = html.replace("PLACEHOLDER_BG_VIDEO", vid_url)
        state["html_content"] = html

    state["status"] = "assets_completed"
    return state

from deployment_tools import CloudflarePagesClient
from db_tools import DBClient

async def deployer_node(state: WebsiteState) -> WebsiteState:
    logger.info("Entering Deployer Node")
    html = state["html_content"]
    assets = state["assets"]
    prompt = state["prompt"]
    
    # Generate a unique project name or use a default
    run_id = f"wg_{uuid.uuid4().hex[:8]}"
    project_name = f"webgen-{uuid.uuid4().hex[:8]}"
    
    cf = CloudflarePagesClient()
    deployment_url = await cf.deploy_site(project_name, html, assets)
    
    # Persist to DB
    db = DBClient()
    await db.save_site(run_id, project_name, deployment_url, html, assets)
    
    state["deployment_url"] = deployment_url
    state["status"] = "deployed"
    return state

# Define the graph
workflow = StateGraph(WebsiteState)

workflow.add_node("researcher", researcher_node)
workflow.add_node("coder", coder_node)
workflow.add_node("artist", artist_node)
workflow.add_node("auditor", auditor_node)
workflow.add_node("deployer", deployer_node)

workflow.set_entry_point("researcher")
workflow.add_edge("researcher", "coder")
workflow.add_edge("coder", "artist")
workflow.add_edge("artist", "auditor")
workflow.add_edge("auditor", "deployer")
workflow.add_edge("deployer", END)

app_graph = workflow.compile()
