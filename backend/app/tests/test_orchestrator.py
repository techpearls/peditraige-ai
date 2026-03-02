from app.agent.orchestrator import extract_symptom_profile, extract_triage_result

def test_extract_symptom_profile_valid():
    text = """
    Here is my response.
    <symptom_profile>
    {
        "child_age_years": 3,
        "symptoms": ["fever", "cough"],
        "duration_hours": 24,
        "fever_present": true,
        "fever_temp_f": 101.5,
        "severity_descriptors": []
    }
    </symptom_profile>
    """
    profile = extract_symptom_profile(text)
    assert profile is not None
    assert profile.child_age_years == 3
    assert "fever" in profile.symptoms
    assert profile.fever_present is True

def test_extract_symptom_profile_missing():
    text = "There is no profile block in this response."
    profile = extract_symptom_profile(text)
    assert profile is None

def test_extract_triage_result_valid():
    text = """
    <triage_result>
    {
        "tier": "CALL_DOCTOR",
        "headline": "Contact your pediatrician today",
        "reasoning": "Fever lasting 24 hours in a 3 year old warrants evaluation.",
        "watch_for": ["fever above 104F", "difficulty breathing"],
        "disclaimer": "This is not medical advice."
    }
    </triage_result>
    """
    result = extract_triage_result(text)
    assert result is not None
    assert result["tier"] == "CALL_DOCTOR"
    assert len(result["watch_for"]) == 2