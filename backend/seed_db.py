import asyncio
from datetime import datetime, timedelta, timezone
from database import connect_to_mongo, get_database, close_mongo_connection
from bson import ObjectId, Decimal128

async def seed():
    await connect_to_mongo()
    db = get_database()
    
    dummy_id = ObjectId("64f1a2b3c4d5e6f7a8b9c0d1")
    
    # 1. Create User
    user = {
        "_id": dummy_id,
        "email": "kiet@riskhub.com",
        "password_hash": "dummy_hash",
        "username": "Kiet",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "is_active": True,
        "email_verified": True,
        "preferences": {
            "alerts_enabled": True,
            "alert_channels": ["websocket"],
            "timezone": "UTC",
            "currency_display": "USD"
        }
    }
    await db.users.update_one({"_id": dummy_id}, {"$set": user}, upsert=True)
    print("User seeded.")
    
    # 2. Create Mock Risk Metrics
    await db.risk_metrics.delete_many({"user_id": dummy_id})
    metrics = {
        "user_id": dummy_id,
        "calculated_at": datetime.now(timezone.utc),
        "window_days": 30,
        "trade_count": 43,
        "net_pnl_usd": Decimal128("1250.45"),
        "profit_factor": Decimal128("1.56"),
        "sharpe_ratio": Decimal128("0.81"),
        "discipline_score": {
            "total": 85,
            "grade": "A",
            "components": {
                "leverage_control": 90,
                "drawdown_management": 80,
                "strategy_adherence": 85
            }
        },
        "max_drawdown": {
            "value_pct": Decimal128("4.5"),
            "peak_value": Decimal128("10000"),
            "trough_value": Decimal128("9550")
        },
        "win_rate": {
            "value_pct": Decimal128("62.5"),
            "win_count": 25,
            "loss_count": 15
        },
        "by_exchange": [
            {
                "exchange_id": "binance",
                "trade_count": 28,
                "win_rate_pct": "64.2",
                "avg_leverage": "12.5",
                "profit_factor": Decimal128("1.74"),
                "sharpe_ratio": Decimal128("0.92"),
                "net_pnl_usd": Decimal128("750.45")
            },
            {
                "exchange_id": "okx",
                "trade_count": 15,
                "win_rate_pct": "58.0",
                "avg_leverage": "5.0",
                "profit_factor": Decimal128("1.28"),
                "sharpe_ratio": Decimal128("0.63"),
                "net_pnl_usd": Decimal128("500.00")
            }
        ],
        "sbt_ready": True
    }
    await db.risk_metrics.insert_one(metrics)
    print("Metrics seeded.")
    
    # 3. Create Mock Alerts
    await db.alerts_log.delete_many({"user_id": dummy_id})
    alerts = [
        {
            "user_id": dummy_id,
            "rule_id": "RR-001",
            "rule_name": "High Leverage Alert",
            "severity": "warning",
            "title": "Leverage Warning",
            "message": "You are currently over 20x leverage on BTCUSDT. Reduce position size to lower risk.",
            "triggered_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "is_read": False
        },
        {
            "user_id": dummy_id,
            "rule_id": "RR-002",
            "rule_name": "Drawdown Alert",
            "severity": "critical",
            "title": "Critical Drawdown",
            "message": "Portfolio drawdown reached 5%. Consider closing underperforming positions.",
            "triggered_at": datetime.now(timezone.utc) - timedelta(hours=1),
            "is_read": False
        }
    ]
    await db.alerts_log.insert_many(alerts)
    print("Alerts seeded.")

    # 4. Create Mock Trades
    await db.trade_history.delete_many({"user_id": dummy_id})
    now = datetime.now(timezone.utc)
    trades = [
        {
            "user_id": dummy_id,
            "exchange_id": "binance",
            "account_type": "futures",
            "exchange_trade_id": "T1001",
            "symbol": "BTCUSDT",
            "base_asset": "BTC",
            "quote_asset": "USDT",
            "side": "long",
            "leverage": 75,  # Trigger RQ-003 Excessive Leverage
            "entry_price": Decimal128("65000"),
            "exit_price": Decimal128("66000"),
            "quantity": Decimal128("0.1"),
            "notional_value_usd": Decimal128("6600"),
            "realized_pnl_usd": Decimal128("100"),
            "is_win": True,
            "pnl_category": "win",
            "opened_at": now - timedelta(minutes=60),
            "closed_at": now - timedelta(minutes=50),
            "duration_seconds": 600,
            "synced_at": now
        },
        {
            "user_id": dummy_id,
            "exchange_id": "binance",
            "account_type": "futures",
            "exchange_trade_id": "T1002",
            "symbol": "ETHUSDT",
            "base_asset": "ETH",
            "quote_asset": "USDT",
            "side": "short",
            "leverage": 10,
            "entry_price": Decimal128("3500"),
            "exit_price": Decimal128("3450"),
            "quantity": Decimal128("1"),
            "notional_value_usd": Decimal128("3450"),
            "realized_pnl_usd": Decimal128("50"),
            "is_win": True,
            "pnl_category": "win",
            "opened_at": now - timedelta(minutes=40),
            "closed_at": now - timedelta(minutes=30),
            "duration_seconds": 600,
            "synced_at": now
        }
    ]
    await db.trade_history.insert_many(trades)
    print("Trades seeded.")

    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(seed())
