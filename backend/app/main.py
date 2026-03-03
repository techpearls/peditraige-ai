from dotenv import load_dotenv
load_dotenv() 

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import chat

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:3000",]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://peditriage-ai.vercel.app"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api", tags=["chat"])

@app.get("/health")
def health_check():
    return {"API health": "Healthy"}
