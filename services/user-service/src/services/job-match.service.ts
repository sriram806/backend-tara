import { redisClient } from '../queues/connection';
import { pushJobsMatchJob } from '../queues/producer';
import { AiJob } from '../models/ai_job.model';
import { CreateJobMatchDto } from '../schemas/job-match.schema';
import { ResumeService } from './resume.service';

const getEnv = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const createJobId = () => `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export class JobMatchService {
  static async submitJob(userId: string, data: CreateJobMatchDto) {
    const feature = 'jobs';
    const currentMonth = new Date().toISOString().slice(0, 7);

    const cooldownKey = `jobs:cooldown:${userId}`;
    const quotaKey = `ai:quota:${userId}:${feature}:${currentMonth}`;

    const onCooldown = await redisClient.get(cooldownKey);
    if (onCooldown) {
      throw new Error('You can only run job matching once every 24 hours.');
    }

    const env = getEnv();
    const monthlyMax = parseInt(env.AI_MONTHLY_QUOTA_MAX || '30', 10);
    const currentUsageStr = await redisClient.get(quotaKey);
    const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
    if (currentUsage >= monthlyMax) {
      throw new Error('Monthly AI quota exceeded.');
    }

    const jobId = createJobId();
    const newJob = new AiJob({
      jobId,
      userId,
      type: 'jobs',
      status: 'pending',
    });
    await newJob.save();

    let storedResume;
    try {
      storedResume = await ResumeService.getCurrentStructuredResumeForAi(userId);
    } catch {
      throw new Error('Complete your structured resume before using job matching.');
    }

    await pushJobsMatchJob(jobId, {
      ...data,
      userId,
      source: 'user-service',
      resumeText: storedResume.resumeText,
      parsedResume: storedResume.structuredResume,
      structuredText: storedResume.structuredText
    });

    await redisClient.set(cooldownKey, '1', 'EX', 24 * 60 * 60);
    if (!currentUsageStr) {
      await redisClient.set(quotaKey, '1', 'EX', 31 * 24 * 60 * 60);
    } else {
      await redisClient.incr(quotaKey);
    }

    return { jobId, status: 'pending' };
  }

  static async getJobStatus(jobId: string, userId: string) {
    const job = await AiJob.findOne({ jobId, userId, type: 'jobs' });
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }

}
