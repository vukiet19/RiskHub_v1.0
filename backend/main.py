"""
RiskHub — FastAPI Application Entry Point
==========================================
Wires up:
* MongoDB connection lifecycle (connect on startup, close on shutdown)
* Index bootstrapping (idempotent — safe on every restart)
* CORS middleware
* WebSocket endpoint for real-time alert & position pushes
* Health check
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from database import connect_to_mongo, close_mongo_connection, ensure_indexes, get_database
from api.sync import router as sync_router

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("riskhub")


# ── Lifespan (startup / shutdown) ────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    await connect_to_mongo()
    await ensure_indexes()
    logger.info("RiskHub backend is ready.")
    yield
    # ── Shutdown ──
    await close_mongo_connection()


# ── FastAPI app ──────────────────────────────────────────────────────────

app = FastAPI(
    title="RiskHub API",
    description="Proactive Web3 Cross-Exchange Risk Management Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # Lock down for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────
app.include_router(sync_router)


# ── Routes ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "RiskHub API is running"}


@app.get("/health")
async def health_check():
    """Lightweight probe — also pings MongoDB to verify connectivity."""
    db = get_database()
    try:
        await db.command("ping")
        mongo_status = "connected"
    except Exception:
        mongo_status = "disconnected"

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "mongo": mongo_status,
    }


# ── WebSocket ────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time channel for alert delivery and position updates.
    Full implementation will authenticate via JWT token in query params
    and subscribe the user to their personal Redis pub/sub channel.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"echo: {data}")
    except Exception:
        pass
