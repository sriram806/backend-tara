import { redisClient } from '../queues/connection';
import { pushRoadmapJob } from '../queues/producer';
import { AiJob } from '../models/ai_job.model';
import { CreateRoadmapJobDto } from '../schemas/roadmap.schema';

const getEnv = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const createJobId = () => `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export class RoadmapService {
  static async submitJob(userId: string, data: CreateRoadmapJobDto) {
    const feature = 'roadmap';
    const currentMonth = new Date().toISOString().slice(0, 7);

    const cooldownKey = `roadmap:cooldown:${userId}`;
    const quotaKey = `ai:quota:${userId}:${feature}:${currentMonth}`;

    const onCooldown = await redisClient.get(cooldownKey);
    if (onCooldown) {
      throw new Error('You can only generate one roadmap every 24 hours.');
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
      type: 'roadmap',
      status: 'pending',
    });
    await newJob.save();

    await pushRoadmapJob(jobId, { ...data, userId, source: 'user-service' });

    await redisClient.set(cooldownKey, '1', 'EX', 24 * 60 * 60);
    if (!currentUsageStr) {
      await redisClient.set(quotaKey, '1', 'EX', 31 * 24 * 60 * 60);
    } else {
      await redisClient.incr(quotaKey);
    }

    return { jobId, status: 'pending' };
  }

  static async getJobStatus(jobId: string, userId: string) {
    const job = await AiJob.findOne({ jobId, userId, type: 'roadmap' });
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }
}
