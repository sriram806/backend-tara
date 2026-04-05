import os
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongodb:27017/thinkai")
# motor_asyncio.AsyncIOMotorClient does not connect immediately but parses URL
# ensure database name is specified in standard URL, else default to "test"
client = AsyncIOMotorClient(MONGO_URL)

try:
    db = client.get_default_database()
except Exception:
    db = client.get_database("test")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
