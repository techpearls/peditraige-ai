import os
import json

TOOL_DEFINITIONS = [
    {
        "name": "lookup_triage_protocol",
        "description": "Look up pediatric triage guidance for a specific symptom category",
        "input_schema": {
            "type": "object",
            "properties": {
                "symptom_category": {
                    "type": "string",
                    "description": "The symptom category to look up e.g. fever, respiratory, gastrointestinal"
                }
            },
            "required": ["symptom_category"]
        }
    },
    {
        "name": "assess_severity",
        "description": "Assess the severity of a child's condition based on collected symptom profile and return a triage tier",
        "input_schema": {
            "type": "object",
            "properties": {
                "child_age_years": {"type": "number", "description": "Child's age in years"},
                "symptoms": {"type": "array", "items": {"type": "string"}, "description": "List of reported symptoms"},
                "duration_hours": {"type": "number", "description": "How long symptoms have been present in hours"},
                "fever_present": {"type": "boolean", "description": "Whether fever is present"},
                "fever_temp_f": {"type": "number", "description": "Fever temperature in Fahrenheit if known"},
                "severity_descriptors": {"type": "array", "items": {"type": "string"}, "description": "Parent's own severity words"}
            },
            "required": ["symptoms", "fever_present"]
        }
    }
]

def lookup_triage_protocol(symptom_category: str) -> dict:
    data_path = os.path.join(os.path.dirname(__file__), "../data/triage_protocols.json")
    with open(data_path) as f:
        protocols = json.load(f)
    
    # fall back to general if category not found
    return protocols.get(symptom_category.lower(), protocols["general"])

def assess_severity(
    symptoms: list[str],
    fever_present: bool,
    child_age_years: float = None,
    duration_hours: float = None,
    fever_temp_f: float = None,
    severity_descriptors: list[str] = None
) -> dict:
    score = 0

    # age factor — infants are higher risk
    if child_age_years is not None:
        if child_age_years < 0.25:    # under 3 months
            score += 3
        elif child_age_years < 1:     # under 1 year
            score += 2
        elif child_age_years < 2:     # under 2 years
            score += 1

    # fever factor
    if fever_present:
        score += 1
        if fever_temp_f:
            if fever_temp_f >= 104:
                score += 3
            elif fever_temp_f >= 102:
                score += 2
            elif fever_temp_f >= 100.4:
                score += 1

    # duration factor
    if duration_hours:
        if duration_hours >= 72:
            score += 2
        elif duration_hours >= 48:
            score += 1

    # severity descriptors from parent
    high_severity_words = ["worse", "severe", "can't keep", "not eating", "lethargic", "not responding"]
    if severity_descriptors:
        for descriptor in severity_descriptors:
            if any(word in descriptor.lower() for word in high_severity_words):
                score += 2

    # symptom count factor
    score += min(len(symptoms), 3)

    # map score to tier
    if score >= 8:
        tier = "GO_TO_ER"
    elif score >= 4:
        tier = "CALL_DOCTOR"
    else:
        tier = "HOME"

    return {"tier": tier, "score": score}

def execute_tool(tool_name: str, tool_input: dict) -> dict:
    """
    Routes tool calls from Claude to the appropriate function.
    The orchestrator calls this when Claude returns a tool_use block.
    """
    if tool_name == "lookup_triage_protocol":
        return lookup_triage_protocol(**tool_input)
    elif tool_name == "assess_severity":
        return assess_severity(**tool_input)
    else:
        return {"error": f"Unknown tool: {tool_name}"}