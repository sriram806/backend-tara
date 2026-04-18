import asyncio
import os
import json
from datetime import datetime
from bullmq import Worker
from app.database import db, redis_client
from app.core.config import settings
from app.services.career_service import analyze_career
from app.services.roadmap_service import roadmap_service
from app.services.job_matching_service import job_matching_service
from app.services.resume_service import resume_service
from app.services.user_resume_store import user_resume_store

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

async def process_roadmap(job, job_token):
    job_id_in_db = job.opts.get("jobId", job.id)
    user_id = job.data.get("userId")

    collection = db.aijobs
    await collection.update_one(
        {"jobId": job_id_in_db},
        {"$set": {"status": "processing", "updatedAt": datetime.utcnow()}}
    )

    try:
        result = await roadmap_service.generate_roadmap(
            user_id=user_id,
            target_role=job.data.get("targetRole", "Software Engineer"),
            skill_gaps=job.data.get("skillGaps", []),
            duration_days=int(job.data.get("durationDays", 90)),
            adaptive_context=job.data.get("adaptiveContext"),
            force_refresh=bool(job.data.get("forceRefresh", False)),
        )

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
        await redis_client.publish("ws:roadmap:completed", payload)

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
        await redis_client.publish("ws:roadmap:failed", payload)
        raise e

async def process_jobs(job, job_token):
    job_id_in_db = job.opts.get("jobId", job.id)
    user_id = job.data.get("userId")

    collection = db.aijobs
    await collection.update_one(
        {"jobId": job_id_in_db},
        {"$set": {"status": "processing", "updatedAt": datetime.utcnow()}}
    )

    try:
        result = await job_matching_service.match_jobs(
            user_id=user_id,
            target_role=job.data.get("targetRole", "Software Engineer"),
            resume_text=job.data.get("resumeText", ""),
            parsed_resume=job.data.get("parsedResume"),
            job_feed=job.data.get("jobFeed", []) or [],
            location=job.data.get("location"),
            experience_years=job.data.get("experienceYears"),
            top_n=int(job.data.get("topN", 5)),
            force_refresh=bool(job.data.get("forceRefresh", False)),
        )

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
        await redis_client.publish("ws:jobs:completed", payload)

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
        await redis_client.publish("ws:jobs:failed", payload)
        raise e


async def process_resume_analysis(job, job_token):
    run_id = str(job.data.get("runId"))
    user_id = str(job.data.get("userId"))

    try:
        await user_resume_store.mark_analysis_processing(run_id)
        await redis_client.publish("resume.analysis.processing", json.dumps({"runId": run_id, "status": "processing", "progress": 10}))

        analysis = await resume_service.analyze_stored_resume(user_id=user_id)

        await user_resume_store.complete_analysis_run(run_id, analysis)
        payload = json.dumps({"runId": run_id, "status": "completed", "progress": 100})
        await redis_client.publish("resume.analysis.completed", payload)
        await redis_client.publish("ws:resume:completed", payload)

        return analysis
    except Exception as e:
        await user_resume_store.mark_analysis_failed(run_id, str(e))
        payload = json.dumps({"runId": run_id, "status": "failed", "progress": 100})
        await redis_client.publish("resume.analysis.failed", payload)
        await redis_client.publish("ws:resume:failed", payload)
        raise e


async def process_roadmap_generate(job, job_token):
    run_id = str(job.data.get("runId"))
    user_id = str(job.data.get("userId"))

    try:
        run = await user_resume_store.get_roadmap_run(run_id, user_id)
        if not run:
            raise ValueError("Roadmap run not found")

        await user_resume_store.mark_roadmap_processing(run_id)
        await redis_client.publish("roadmap.processing", json.dumps({"runId": run_id, "status": "processing", "progress": 10}))

        skill_gaps = run.get("missing_skills") or []
        target_role = str(run.get("target_role") or job.data.get("targetRole") or "Software Engineer")
        duration_days = int(run.get("duration_days") or job.data.get("durationDays") or 90)

        roadmap = await roadmap_service.generate_roadmap(
            user_id=user_id,
            target_role=target_role,
            skill_gaps=skill_gaps,
            duration_days=duration_days,
            adaptive_context={"analysisRunId": str(run.get("analysis_run_id") or "")},
            force_refresh=True,
        )

        await user_resume_store.complete_roadmap_run(run_id, roadmap)
        payload = json.dumps({"runId": run_id, "status": "completed", "progress": 100})
        await redis_client.publish("roadmap.completed", payload)
        await redis_client.publish("ws:roadmap:completed", payload)
        return roadmap
    except Exception as e:
        await user_resume_store.mark_roadmap_failed(run_id, str(e))
        payload = json.dumps({"runId": run_id, "status": "failed", "progress": 100})
        await redis_client.publish("roadmap.failed", payload)
        await redis_client.publish("ws:roadmap:failed", payload)
        raise e


class WorkerGroup:
    def __init__(self, workers):
        self.workers = workers

    async def close(self):
        for worker in self.workers:
            await worker.close()


def start_worker():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    analysis_worker = Worker("analysis-queue", process_analysis, {"connection": redis_url})
    roadmap_worker = Worker("roadmap-queue", process_roadmap, {"connection": redis_url})
    jobs_worker = Worker("jobs-queue", process_jobs, {"connection": redis_url})
    resume_analysis_worker = Worker(settings.RESUME_ANALYSIS_QUEUE_NAME, process_resume_analysis, {"connection": redis_url})
    roadmap_generate_worker = Worker(settings.ROADMAP_GENERATE_QUEUE_NAME, process_roadmap_generate, {"connection": redis_url})
    return WorkerGroup([
        analysis_worker,
        roadmap_worker,
        jobs_worker,
        resume_analysis_worker,
        roadmap_generate_worker,
    ])
