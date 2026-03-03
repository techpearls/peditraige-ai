from app.agent.safety_gate import check_for_emergency, EMERGENCY_RESPONSE
from app.models.schemas import ChatRequest
from app.agent.orchestrator import run_agent_turn
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

# define a router with APIRouter()
router = APIRouter()

def stream_text(text: str):
    """Utility function to stream text responses."""
    # chunk by character groups instead of splitting on spaces
    # splitting on spaces drops the spaces themselves
    chunk_size = 4
    for i in range(0, len(text), chunk_size):
        yield f"data: {text[i:i+chunk_size]}\n\n"
        
async def stream_response(request: ChatRequest):
    """Runs the agent and streams the response back as SSE."""
    response_text, updated_profile = await run_agent_turn(request)
    
    # stream the text word by word
    for chunk in response_text.split(" "):
        yield f"data: {chunk} \n\n"
    
    # send the updated profile as a final event
    yield f"event: profile\ndata: {updated_profile.model_dump_json()}\n\n"
        
@router.post("/chat")
async def chat_endpoint(chat_request: ChatRequest):     
    # get last USER message
    user_messages = [m for m in chat_request.messages if m.role == "user"]
    last_message = user_messages[-1].content if user_messages else ""    
    
    if check_for_emergency(last_message):
        return StreamingResponse(stream_text(EMERGENCY_RESPONSE), media_type="text/event-stream")
    
    return StreamingResponse(
        stream_response(chat_request),
        media_type="text/event-stream"
    )