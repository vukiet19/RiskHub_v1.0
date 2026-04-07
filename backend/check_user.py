import asyncio
from bson import ObjectId
from database import connect_to_mongo, get_database, close_mongo_connection

async def main():
    await connect_to_mongo()
    db = get_database()
    uid = ObjectId("64f1a2b3c4d5e6f7a8b9c0d1")
    user = await db.users.find_one({"_id": uid})
    print(f"User found: {user is not None}")
    if user:
        print(f"User email: {user.get('email')}")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
