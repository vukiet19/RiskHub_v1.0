import asyncio
import logging
from bson import ObjectId
from database import connect_to_mongo, get_database, close_mongo_connection
from services.exchange_service import fetch_and_sync_trades

logging.basicConfig(level=logging.DEBUG)

async def main():
    await connect_to_mongo()
    try:
        res = await fetch_and_sync_trades(
            user_id="64f1a2b3c4d5e6f7a8b9c0d1",
            exchange_id="binance",
            api_key="p78rg4piSpNNlRNZV9973wJZ9g5hqIuEw9LwsJUpTV7TkgnyLBIK8Ca2jMjGSg2b",
            api_secret="iRACN88DEMG4EE44h8cFy9WiniluQ1UuhammAG8DM7t9J9ZA1y4YiDXcNpRn8Kjg",
            testnet=True
        )
        print("Success:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
