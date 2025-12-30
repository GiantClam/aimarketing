import asyncio
import os
from dotenv import load_dotenv
from website_agent import app_graph

# Load environment variables
load_dotenv()

async def test_workflow():
    initial_state = {
        "prompt": "为我的五金配件厂生成一个现代化的门户网站",
        "industry": "Manufacturing",
        "company_info": None,
        "research_results": None,
        "html_content": None,
        "audit_feedback": None,
        "assets": [],
        "deployment_url": None,
        "status": "started"
    }

    print("--- Starting Workflow Test ---")
    async for event in app_graph.astream(initial_state):
        for node_name, state in event.items():
            print(f"[Node: {node_name}] Status: {state['status']}")
            if state.get('html_content'):
                print(f"HTML Content Length: {len(state['html_content'])}")
            if state.get('audit_feedback'):
                print(f"Audit Feedback: {state['audit_feedback'][:100]}...")
    print("--- Workflow Test Completed ---")

if __name__ == "__main__":
    # Ensure OPENROUTER_API_KEY is set
    if not os.getenv("OPENROUTER_API_KEY"):
        print("Warning: OPENROUTER_API_KEY is not set. The test will likely fail at the Coder node.")
    else:
        asyncio.run(test_workflow())
