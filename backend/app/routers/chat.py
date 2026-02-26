from app.agent.safety_gate import check_for_emergency, EMERGENCY_RESPONSE
from app.models.schemas import ChatRequest
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

# define a router with APIRouter()
router = APIRouter()

def stream_text(text: str):
    """Utility function to stream text responses."""
    for chunk in text.split(" "):
        yield f"data: {chunk} \n\n"
        
@router.post("/chat")
async def chat_endpoint(chat_request: ChatRequest):
    last_message = chat_request.messages[-1].content if chat_request.messages else ""
    print(last_message)
    if check_for_emergency(last_message):
        return StreamingResponse(stream_text(EMERGENCY_RESPONSE), media_type="text/event-stream")
    # Placeholder for chat endpoint logic
    placeholder = "Thanks for reaching out. I'm here to help triage your child's symptoms. What's going on today?"
    return StreamingResponse(
        stream_text(placeholder),
        media_type="text/event-stream"
    )