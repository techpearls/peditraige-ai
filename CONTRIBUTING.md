# Development Setup

## Prerequisites
- Python 3.11+
- Node.js 18+
- An Anthropic API key

## Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # then add your API key
uvicorn app.main:app --reload
```

## Frontend
```bash
cd frontend
npm install
npm run dev
```

## Run Tests
```bash
cd backend
pytest
```