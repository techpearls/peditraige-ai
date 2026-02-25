import pytest
from app.agent.safety_gate import check_for_emergency

@pytest.mark.parametrize("input_text,expected", [
    ("my child is not breathing", True),
    ("she won't wake up", True),
    ("he's having a seizure", True),
    ("her lips are turning blue", True),
    ("my son is choking", True),
    ("he hit his head really hard", True),
    ("she's unconscious", True),
    ("NOT BREATHING", True),
    ("my child has a fever", False),
    ("she has a runny nose", False),
    ("he threw up once", False),
    ("she has a bad cough", False),
    ("my son ate some blueberries and has a rash", False),
])
def test_check_for_emergency(input_text, expected):
    assert check_for_emergency(input_text) == expected