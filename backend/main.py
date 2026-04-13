"""
RiskHub — FastAPI Application Entry Point
==========================================
Wires up:
* MongoDB connection lifecycle (connect on startup, close on shutdown)
* Index bootstrapping (idempotent — safe on every restart)
* CORS middleware
* REST API routers  (sync, engine, dashboard)
* WebSocket endpoint for real-time alert pushes
* Health check
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import connect_to_mongo, close_mongo_connection, ensure_indexes, get_database
from api.sync import router as sync_router
from api.engine import router as engine_router
from api.dashboard import router as dashboard_router
from api.exchange_keys import router as exchange_keys_router
from api.ws import router as ws_router
from api.risk_analysis import router as risk_analysis_router

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
app.include_router(sync_router)         # /api/v1/sync/*
app.include_router(engine_router)       # /api/v1/engine/*
app.include_router(dashboard_router)    # /api/v1/dashboard/*
app.include_router(exchange_keys_router)  # /api/v1/exchange-keys/*
app.include_router(ws_router)           # ws://…/ws/alerts/{user_id}
app.include_router(risk_analysis_router) # /api/v1/risk-analysis/*

# ── Routes ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "RiskHub API is running"}


@app.get("/health")
async def health_check():
    """Lightweight probe — also pings MongoDB to verify connectivity."""
    from services.websocket_manager import ws_manager

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
        "websockets": {
            "active_users": len(ws_manager.active_users),
            "total_connections": ws_manager.total_connections,
        },
    }
