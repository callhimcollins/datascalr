from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.analyze import router as analyze_router
from .routes.generate import router as generate_router
from .routes.runs import router as runs_router
from .routes.stream import router as stream_router

app = FastAPI(title="datascalr API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(generate_router)
app.include_router(runs_router)
app.include_router(stream_router)


@app.get("/")
async def root():
    return {"message": "datascalr API"}


@app.get("/health")
async def health():
    return {"status": "ok"}
