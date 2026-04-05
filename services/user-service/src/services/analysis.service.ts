import crypto from 'node:crypto';
import { redisClient } from '../queues/connection';
import { pushAnalysisJob } from '../queues/producer';
import { AiJob } from '../models/ai_job.model';
import { CreateAnalysisJobDto } from '../schemas/job.schema';

export class AnalysisService {
  /**
   * Submits a new analysis job after checking cooldowns and quotas.
   */
  static async submitJob(userId: string, data: CreateAnalysisJobDto) {
    const feature = 'analysis';
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const cooldownKey = `analysis:cooldown:${userId}`;
    const quotaKey = `ai:quota:${userId}:${feature}:${currentMonth}`;

    // 1. Check cooldown (1 analysis per 24 hours per user)
    const onCooldown = await redisClient.get(cooldownKey);
    if (onCooldown) {
      throw new Error('You can only perform one analysis every 24 hours.');
    }

    // 2. Check quota
    const monthlyMax = parseInt(process.env.AI_MONTHLY_QUOTA_MAX || '30', 10);
    const currentUsageStr = await redisClient.get(quotaKey);
    const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
    if (currentUsage >= monthlyMax) {
      throw new Error('Monthly AI quota exceeded.');
    }

    // 3. Create job tracking record
    const jobId = crypto.randomUUID();
    const newJob = new AiJob({
      jobId,
      userId,
      type: 'analysis',
      status: 'pending',
    });
    await newJob.save();

    // 4. Push job to BullMQ
    await pushAnalysisJob(jobId, { ...data, userId });

    // 5. Update Redis state
    await redisClient.set(cooldownKey, '1', 'EX', 24 * 60 * 60);
    if (!currentUsageStr) {
      await redisClient.set(quotaKey, '1', 'EX', 31 * 24 * 60 * 60); // Roughly a month
    } else {
      await redisClient.incr(quotaKey);
    }

    return { jobId, status: 'pending' };
  }

  static async getJobStatus(jobId: string, userId: string) {
    const job = await AiJob.findOne({ jobId, userId });
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }
}
