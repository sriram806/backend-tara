import asyncio
import os
import json
from datetime import datetime
from bullmq import Worker
from app.database import db, redis_client
from app.services.career_service import analyze_career

async def process_analysis(job, job_token):
    job_id_in_db = job.opts.get("jobId", job.id)
    user_id = job.data.get("userId")
    
    # Fetch collection, mongoose collection name is 'aijobs' by default for model 'AiJob'
    collection = db.aijobs
    
    await collection.update_one(
        {"jobId": job_id_in_db},
        {"$set": {"status": "processing", "updatedAt": datetime.utcnow()}}
    )
    
    try:
        result = await analyze_career(job.data, user_id=user_id)
        
        await collection.update_one(
            {"jobId": job_id_in_db},
            {"$set": {
                "status": "completed", 
                "result": result,
                "updatedAt": datetime.utcnow()
            }}
        )
        
        payload = json.dumps({
            "jobId": job_id_in_db,
            "status": "completed",
            "result": result,
            "userId": user_id
        })
        await redis_client.publish("ws:job:completed", payload)
        
        return result
    except Exception as e:
        await collection.update_one(
            {"jobId": job_id_in_db},
            {"$set": {
                "status": "failed", 
                "error": str(e),
                "updatedAt": datetime.utcnow()
            }}
        )
        payload = json.dumps({
            "jobId": job_id_in_db,
            "status": "failed",
            "userId": user_id
        })
        await redis_client.publish("ws:job:failed", payload)
        raise e

def start_worker():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    worker = Worker("analysis:queue", process_analysis, {"connection": redis_url})
    return worker
