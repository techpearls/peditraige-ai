"""
Data models for PediTriage AI.

These Pydantic models serve as the contract between the agent,
the API layer, and the frontend. Explicit typing here is intentional —
in a medical context, unvalidated data is a safety risk.
"""

from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TriageTier(str, Enum):
    """
    The three possible triage outcomes.
    Kept deliberately coarse — this is a triage tool, not a diagnosis.
    """
    HOME = "HOME"
    CALL_DOCTOR = "CALL_DOCTOR"
    GO_TO_ER = "GO_TO_ER"


class ConversationState(str, Enum):
    """
    Explicit state machine states for the agent orchestrator.
    The LLM does not decide state transitions — the backend does.
    """
    GREETING = "GREETING"
    INTAKE = "INTAKE"
    TRIAGE = "TRIAGE"
    FOLLOW_UP = "FOLLOW_UP"
    EMERGENCY = "EMERGENCY"


class SymptomProfile(BaseModel):
    """
    Structured representation of what the agent has learned so far.

    This is built incrementally across conversation turns and passed
    back to the LLM as structured context. It is what separates this
    from a stateless chatbot — the agent always knows what it knows.
    """
    child_age_years: Optional[float] = Field(None, description="Child's age in years")
    symptoms: list[str] = Field(default_factory=list, description="Reported symptoms")
    duration_hours: Optional[float] = Field(None, description="How long symptoms have been present")
    fever_present: Optional[bool] = Field(None, description="Whether fever has been reported")
    fever_temp_f: Optional[float] = Field(None, description="Fever temperature in Fahrenheit if known")
    severity_descriptors: list[str] = Field(
        default_factory=list,
        description="Parent's own severity words: 'getting worse', 'can't keep anything down', etc."
    )

    @property
    def is_ready_for_triage(self) -> bool:
        return all([
            self.child_age_years is not None,
            self.duration_hours is not None,
            self.fever_present is not None,
            # symptoms OR fever_present is enough — fever IS a symptom
            len(self.symptoms) >= 1 or self.fever_present is True,
        ])

    @property
    def questions_still_needed(self) -> list[str]:
        """Returns a list of what information is still missing."""
        missing = []
        if self.child_age_years is None:
            missing.append("child's age")
        if not self.symptoms:
            missing.append("specific symptoms")
        if self.duration_hours is None:
            missing.append("how long symptoms have been present")
        if self.fever_present is None:
            missing.append("whether there is a fever")
        return missing


class Message(BaseModel):
    """A single message in the conversation history."""
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    """
    The request body for POST /api/chat.

    The frontend sends the full conversation history and current
    symptom profile with every request. No server-side session storage.
    """
    messages: list[Message]
    symptom_profile: SymptomProfile = Field(default_factory=SymptomProfile)
    state: ConversationState = Field(default=ConversationState.GREETING)


class TriageResult(BaseModel):
    """
    The structured triage verdict produced at the end of a session.
    Sent as a final JSON event in the SSE stream.
    """
    tier: TriageTier
    headline: str = Field(..., description="One-sentence plain-English verdict for the parent")
    reasoning: str = Field(..., description="Clinical reasoning shown in the expandable detail panel")
    watch_for: list[str] = Field(
        default_factory=list,
        description="Specific warning signs that would escalate the situation"
    )
    disclaimer: str = Field(
        default=(
            "This is not medical advice. PediTriage AI is a portfolio demonstration project "
            "and should never be used as a substitute for professional medical care. "
            "When in doubt, always contact your pediatrician or call 911."
        )
    )