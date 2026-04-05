import { Queue } from 'bullmq';
import { connection } from './connection';

// Create queues
export const analysisQueue = new Queue('analysis-queue', { connection });
export const resumeQueue = new Queue('resume-queue', { connection });
export const roadmapQueue = new Queue('roadmap-queue', { connection });

export async function pushAnalysisJob(jobId: string, data: any) {
  return analysisQueue.add('analysis:task', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep in failed queue (acts as DLQ)
  });
}
