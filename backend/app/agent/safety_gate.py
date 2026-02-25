"""
Safety Gate — Pre-LLM Emergency Detection

DESIGN RATIONALE:
-----------------
This module runs synchronously BEFORE any call to the Anthropic API.
LLMs are probabilistic. A life-threatening situation requires a
deterministic, guaranteed response. This gate provides that guarantee.

If a parent types "my child isn't breathing", we must NEVER be in a
situation where the LLM is slow, rate-limited, or returns an unexpected
response. The 911 instruction must fire instantly and unconditionally.

This is the most important safety decision in the entire codebase.
"""

import re

# ---------------------------------------------------------------------------
# Emergency keyword patterns
#
# Intentionally broad — false positives are acceptable here.
# A false positive = unnecessary 911 reminder. Annoying but harmless.
# A false negative = child doesn't get emergency guidance. Unacceptable.
# We optimize hard for recall over precision.
# ---------------------------------------------------------------------------

_EMERGENCY_PATTERNS: list[re.Pattern] = [
    # Breathing
    re.compile(r"\bnot\s+breathing\b", re.IGNORECASE),
    re.compile(r"\bstopped\s+breathing\b", re.IGNORECASE),
    re.compile(r"\bisn'?t\s+breathing\b", re.IGNORECASE),
    re.compile(r"\bcan'?t\s+breathe\b", re.IGNORECASE),
    re.compile(r"\bdifficulty\s+breathing\b", re.IGNORECASE),

    # Consciousness
    re.compile(r"\bunconscious\b", re.IGNORECASE),
    re.compile(r"\bunresponsive\b", re.IGNORECASE),
    re.compile(r"\bwon'?t\s+wake\s+up\b", re.IGNORECASE),
    re.compile(r"\bcan'?t\s+wake\b", re.IGNORECASE),
    re.compile(r"\bnot\s+responding\b", re.IGNORECASE),

    # Seizures
    re.compile(r"\bseizure\b", re.IGNORECASE),
    re.compile(r"\bseizing\b", re.IGNORECASE),
    re.compile(r"\bconvuls(ing|ion|ions)\b", re.IGNORECASE),

    # Color changes (serious circulation/oxygen signs)
    re.compile(r"\bblue\s+lips\b", re.IGNORECASE),
    re.compile(r"\bpurple\s+lips\b", re.IGNORECASE),
    re.compile(r"\blips\s+(are\s+)?turning\s+blue\b", re.IGNORECASE),
    re.compile(r"\bblue\s+fingernails\b", re.IGNORECASE),
    re.compile(r"\bturning\s+blue\b", re.IGNORECASE),

    # Choking
    re.compile(r"\bchoking\b", re.IGNORECASE),
    re.compile(r"\bcan'?t\s+swallow\b", re.IGNORECASE),

    # Allergic reaction
    re.compile(r"\bsevere\s+allergic\b", re.IGNORECASE),
    re.compile(r"\bthroat\s+(is\s+)?swelling\b", re.IGNORECASE),
    re.compile(r"\banaphylax(is|tic)\b", re.IGNORECASE),

    # Head injury
    re.compile(r"\bhit\s+(their|his|her)\s+head\b", re.IGNORECASE),
    re.compile(r"\bhead\s+injury\b", re.IGNORECASE),

    # Bleeding
    re.compile(r"\bsevere\s+bleeding\b", re.IGNORECASE),
    re.compile(r"\bblood\s+everywhere\b", re.IGNORECASE),

    # Explicit emergency signals
    re.compile(r"\bcall\s+911\b", re.IGNORECASE),
    re.compile(r"\bemergency\b", re.IGNORECASE),
]

def check_for_emergency(text: str) -> bool:
    """
    Checks whether the input text contains any emergency indicators.

    Runs regex patterns against the input synchronously.
    Designed to be called before any LLM inference.

    Args:
        text: Raw user message text

    Returns:
        True if any emergency pattern matches, False otherwise
    """
    return any(pattern.search(text) for pattern in _EMERGENCY_PATTERNS)

EMERGENCY_RESPONSE = """
🚨 CALL 911 IMMEDIATELY 🚨

What you've described is a medical emergency. 
Please call 911 or your local emergency number right now.

Do not wait. Every second matters.

If you are in the US, call 911.
If outside the US, call your local emergency services.
"""