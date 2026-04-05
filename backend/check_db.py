import asyncio
from database import connect_to_mongo, get_database, close_mongo_connection
from bson import ObjectId

async def main():
    await connect_to_mongo()
    db = get_database()
    
    user_count = await db.users.count_documents({})
    trade_count = await db.trade_history.count_documents({})
    metrics_count = await db.risk_metrics.count_documents({})
    
    print(f"Users: {user_count}")
    print(f"Trades: {trade_count}")
    print(f"Metrics: {metrics_count}")
    
    # Check if DUMMY_USER_ID exists
    dummy_user_id = "64f1a2b3c4d5e6f7a8b9c0d1"
    exists = await db.users.find_one({"_id": ObjectId(dummy_user_id)})
    print(f"Dummy user exists: {exists is not None}")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
