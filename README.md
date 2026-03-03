# 🩺 PediTriage AI

**An AI-powered pediatric symptom triage agent that helps parents determine how urgently their child needs medical attention.**

PediTriage conducts a focused, conversational intake with a parent, collects structured symptom data across multiple turns, and produces a clear triage verdict — Home Care, Call Your Pediatrician, or Go to the ER — with clinical reasoning and specific warning signs to watch for.

> ⚠️ **Disclaimer:** This is a portfolio demonstration project. It is not a medical device, does not store user data, and is not intended for real clinical use. Always consult a qualified healthcare professional.

---

## Why This Is an Agent, Not a Chatbot

Most "AI chat" projects are prompted chatbots — they generate a response and forget everything. PediTriage is architected as a genuine agent:

| Dimension | Chatbot | PediTriage AI |
|---|---|---|
| **Reasoning** | Generates next reply | Decides when it has enough info to triage |
| **Tools** | None | `lookup_triage_protocol()`, `assess_severity()` |
| **State** | Conversation history only | Tracks structured `SymptomProfile` across turns |
| **Decision Logic** | Implicit in LLM | Explicit: triage only triggered by backend decision model |
| **Safety** | Ad hoc | Hardcoded emergency short-circuit — runs before any LLM call |

The backend owns all decisions. The LLM is an inference engine, not a decision maker.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   REACT FRONTEND                        │
│  Chat UI · SSE Streaming · Triage Result Panel          │
└────────────────────┬────────────────────────────────────┘
                     │  POST /api/chat  (SSE stream)
┌────────────────────▼────────────────────────────────────┐
│                  FASTAPI BACKEND                        │
│  Safety Gate → Agent Orchestrator → Tool Executor       │
│  SymptomProfile Builder · Triage Decision Model         │
└────────────────────┬────────────────────────────────────┘
                     │  Google Gemini API
┌────────────────────▼────────────────────────────────────┐
│              GEMINI 2.5 FLASH                           │
│         Inference Engine · Tool Call Parser             │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Safety Gate Runs Before the LLM**
Every message passes through a synchronous regex-based emergency detector before any API call. If a parent types "my child isn't breathing" or "having a seizure", the app immediately returns a hardcoded 911 response. LLMs are probabilistic — a life-threatening situation requires a deterministic, guaranteed response.

**2. Structured SymptomProfile (Not Just Chat History)**
As the conversation progresses, the backend maintains a `SymptomProfile` Pydantic model alongside the chat history. This tracks child age, symptoms, duration, fever status, and severity descriptors. The profile is injected as structured context every turn — the agent always knows what it knows.

**3. Triage Triggered by Backend Decision Model**
The backend evaluates `SymptomProfile.is_ready_for_triage` after each turn. Only when age, symptoms, duration, and fever status are all collected does the orchestrator instruct the LLM to produce a verdict. This separation means triage classification logic is explicit, auditable, and testable.

**4. No Persistence, No Auth**
All state lives in the session context passed with each request. No database, no user accounts. Eliminates data privacy risk entirely — appropriate for a portfolio project, and a deliberate architectural constraint documented for production consideration.

**5. Streaming via SSE**
The backend streams LLM responses token-by-token using FastAPI's `StreamingResponse` with Server-Sent Events. The frontend parses two event types: text tokens for the chat display, and a final `profile` event carrying the updated `SymptomProfile` as JSON.

---

## Conversation Flow

```
GREETING → INTAKE → TRIAGE → FOLLOW_UP
                                  ↑
              EMERGENCY (bypasses all states, fires instantly)
```

The agent asks one focused question per turn until `SymptomProfile` is complete, then produces a triage verdict with three possible outcomes:

| Tier | Display | Meaning |
|---|---|---|
| `HOME` | 🟢 Green | Monitor at home — here's what to watch for |
| `CALL_DOCTOR` | 🟡 Amber | Contact your pediatrician today |
| `GO_TO_ER` | 🔴 Red | Go to the emergency room now |

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite | Fast iteration, component model maps well to chat UI |
| Styling | Inline styles + CSS animations | Zero build complexity, full control |
| Backend | Python + FastAPI | Async-native, ideal for SSE streaming |
| AI SDK | Google Generative AI SDK | Gemini 2.5 Flash free tier, reliable tool use |
| Validation | Pydantic v2 | Strict input/output validation, self-documenting models |
| Container | Docker + Docker Compose | One-command local setup |
| Testing | pytest + pytest-asyncio | Safety gate and orchestrator unit tests |

---

## Model Selection

To ensure reliability for a safety-critical use case while keeping costs minimal, three models were evaluated:

| Model | Input / 1M tokens | Output / 1M tokens | Tool Use | Notes |
|---|---|---|---|---|
| **Gemini 2.5 Flash** ✓ | $0.30 | $2.50 | Reliable | Best reasoning, chosen model |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Good | Cheaper, weaker reasoning |
| Gemini 2 Flash | $0.10 | $0.40 | Good | Older, unlimited RPD free tier |

**Why Gemini 2.5 Flash:** based on documented reasoning quality benchmarks, 2.5 Flash consistently followed tool-calling instructions and produced structured JSON output without hallucinating urgency or skipping required fields. The reasoning quality matters here — distinguishing "fever for 24 hours in a 4-year-old" from "fever in a 2-month-old" requires nuanced age-weighted judgment that smaller models handle less reliably.

---

## Project Structure

```
peditriage-ai/
├── README.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI app, CORS, router registration
│       ├── routers/
│       │   └── chat.py             # POST /api/chat — SSE streaming endpoint
│       ├── agent/
│       │   ├── orchestrator.py     # State machine, agent loop, tool execution
│       │   ├── safety_gate.py      # Pre-LLM emergency keyword detection
│       │   ├── tools.py            # Tool definitions + execution handlers
│       │   └── prompts.py          # System prompt
│       ├── models/
│       │   └── schemas.py          # Pydantic models: SymptomProfile, TriageResult
│       ├── data/
│       │   └── triage_protocols.json  # Mock AAP-style pediatric guidelines
│       └── tests/
│           ├── test_safety_gate.py    # Emergency keyword edge cases
│           └── test_orchestrator.py   # Parsing and state machine tests
└── frontend/
    ├── Dockerfile
    └── src/
        └── App.jsx                 # Single-file React app
```

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Google Gemini API key from [aistudio.google.com](https://aistudio.google.com)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # add your GEMINI_API_KEY
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` with the backend running on port `8000`.

### Docker (one command)
```bash
docker-compose up --build
```

### Tests
```bash
cd backend
pytest -v
```

---

## What I'd Add for Production

**Regulatory**
- FDA 510(k) clearance or De Novo classification as a clinical decision support tool
- HIPAA Business Associate Agreement if connected to any covered entity
- Washington State My Health My Data Act compliance (stricter than HIPAA for consumer apps)
- FTC Health Breach Notification Rule compliance

**Technical**
- Replace mock `triage_protocols.json` with real AAP and USPSTF guideline integration
- Add encrypted session storage for multi-turn persistence without a database
- Implement prompt caching to reduce token costs ~60% on repeated system prompts
- Add observability: structured logging, LLM call tracing, latency metrics
- Rate limiting per IP to prevent abuse
- Swap inline styles for a proper design system (shadcn/ui)

**Clinical**
- Clinical validation study against real triage nurse decisions
- Pediatrician review of all triage protocol data
- Age-specific symptom weighting reviewed by a board-certified pediatrician
- Red team testing for adversarial inputs and edge cases

**Business**
- Product liability insurance before any public launch
- LLC formation to protect personal assets
- Privacy-safe contextual advertising (not behavioral) if monetizing

---

## Safety Design

The safety gate is the most important file in this codebase. It deserves its own section.

```python
# Every message passes through this BEFORE the LLM
if check_for_emergency(last_message):
    return StreamingResponse(stream_text(EMERGENCY_RESPONSE), ...)

# Only if safe do we proceed to inference
return StreamingResponse(stream_response(request), ...)
```

Emergency patterns covered: breathing difficulties, seizures, loss of consciousness, cyanosis (blue lips/fingernails), choking, anaphylaxis, severe head injury, severe bleeding.

Design philosophy: **optimize for recall over precision.** A false positive (unnecessary 911 reminder) is annoying. A false negative (missing a real emergency) is unacceptable.

---

## Author

**Bhavya Krishnamurthy** — Senior Software Engineer  
[LinkedIn](https://linkedin.com/in/bhavya-k-engineer) · [GitHub](https://github.com/techpearls)

Built as a portfolio project demonstrating AI agent design, prompt engineering, and production-grade backend architecture.