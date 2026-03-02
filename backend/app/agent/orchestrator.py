"""
Agent Orchestrator — The brain of PediTriage AI.

Uses Google Gemini for inference. Architecture unchanged —
the agent loop, tool execution, and state management are
identical regardless of the underlying LLM provider.
"""

import re
import json
import os
import google.generativeai as genai
from app.models.schemas import ChatRequest, SymptomProfile
from app.agent.tools import TOOL_DEFINITIONS, execute_tool
from app.agent.prompts import SYSTEM_PROMPT

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


def _convert_tools_to_gemini(tool_definitions: list[dict]) -> list:
    """
    Converts Anthropic-style tool definitions to Gemini format.
    Gemini uses google.generativeai.protos.Tool structure.
    """
    from google.generativeai.protos import Tool, FunctionDeclaration, Schema

    declarations = []
    for tool in tool_definitions:
        properties = {}
        for prop_name, prop_def in tool["input_schema"]["properties"].items():
            prop_type = prop_def["type"].upper()
            # map JSON schema types to Gemini types
            type_map = {
                "STRING": Schema(type="STRING"),
                "NUMBER": Schema(type="NUMBER"),
                "BOOLEAN": Schema(type="BOOLEAN"),
                "ARRAY": Schema(
                    type="ARRAY",
                    items=Schema(type="STRING")
                ),
            }
            properties[prop_name] = type_map.get(prop_type, Schema(type="STRING"))

        declarations.append(FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters=Schema(
                type="OBJECT",
                properties=properties,
                required=tool["input_schema"].get("required", [])
            )
        ))

    return [Tool(function_declarations=declarations)]


def _build_gemini_messages(request: ChatRequest) -> list[dict]:
    """
    Converts our message format to Gemini's parts format.
    Also injects current SymptomProfile as context.
    """
    messages = []
    for m in request.messages:
        role = "user" if m.role == "user" else "model"
        messages.append({"role": role, "parts": [m.content]})

    # inject symptom profile context into last user message
    profile = request.symptom_profile
    if profile and messages:
        context = f"""

[Current symptom profile:
- Child age: {profile.child_age_years or 'unknown'}
- Symptoms: {', '.join(profile.symptoms) if profile.symptoms else 'none reported'}
- Duration: {f'{profile.duration_hours} hours' if profile.duration_hours else 'unknown'}
- Fever present: {profile.fever_present if profile.fever_present is not None else 'unknown'}
- Fever temp: {f'{profile.fever_temp_f}F' if profile.fever_temp_f else 'unknown'}
- Ready for triage: {profile.is_ready_for_triage}
- Still need: {', '.join(profile.questions_still_needed) if profile.questions_still_needed else 'nothing — ready to triage'}]"""
        messages[-1]["parts"][0] += context

    return messages


def extract_symptom_profile(text: str) -> SymptomProfile | None:
    match = re.search(r"<symptom_profile>(.*?)</symptom_profile>", text, re.DOTALL)
    if not match:
        return None
    try:
        raw = match.group(1).strip()
        # fix Python booleans that Gemini sometimes outputs
        raw = raw.replace(": True", ": true").replace(": False", ": false").replace(": None", ": null")
        data = json.loads(raw)
        return SymptomProfile(**data)
    except Exception:
        return None

def extract_triage_result(text: str) -> dict | None:
    """
    Parses the <triage_result> JSON block from the response.
    Returns a dict or None if not found.
    """
    match = re.search(r"<triage_result>(.*?)</triage_result>", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1).strip())
    except json.JSONDecodeError:
        return None


async def run_agent_turn(request: ChatRequest) -> tuple[str, SymptomProfile]:
    """
    The core agent loop.

    Calls Gemini, handles tool use, returns final text
    response and updated SymptomProfile.
    """
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
        tools=_convert_tools_to_gemini(TOOL_DEFINITIONS)
    )

    messages = _build_gemini_messages(request)
    current_profile = request.symptom_profile

    # start chat with history minus the last message
    chat = model.start_chat(history=messages[:-1])

    # agent loop — runs until Gemini returns a text response
    last_message = messages[-1]["parts"][0]

    while True:
        response = chat.send_message(last_message)
        candidate = response.candidates[0]
        part = candidate.content.parts[0]

        # check if Gemini wants to call a tool
        if hasattr(part, "function_call") and part.function_call.name:
            tool_name = part.function_call.name
            tool_input = dict(part.function_call.args)

            # execute tool on our backend
            tool_result = execute_tool(tool_name, tool_input)

            # send tool result back to continue the loop
            last_message = {
                "role": "user",
                "parts": [{
                    "function_response": {
                        "name": tool_name,
                        "response": tool_result
                    }
                }]
            }

        else:
            # Gemini returned text — we're done
            response_text = part.text if hasattr(part, "text") else ""

            # extract updated symptom profile
            updated_profile = extract_symptom_profile(response_text)
            if updated_profile:
                current_profile = updated_profile

            return response_text, current_profile