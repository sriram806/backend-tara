import { Queue } from 'bullmq';
import { connection } from './connection';

const RESUME_ANALYSIS_QUEUE_NAME = 'resume-analysis';
const ROADMAP_GENERATE_QUEUE_NAME = 'roadmap-generate';

// Create queues
export const analysisQueue = new Queue('analysis-queue', { connection });
export const roadmapQueue = new Queue('roadmap-queue', { connection });
export const jobsQueue = new Queue('jobs-queue', { connection });
export const resumeAnalysisQueue = new Queue(RESUME_ANALYSIS_QUEUE_NAME, { connection });
export const roadmapGenerateQueue = new Queue(ROADMAP_GENERATE_QUEUE_NAME, { connection });

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

export async function pushRoadmapJob(jobId: string, data: any) {
  return roadmapQueue.add('roadmap:task', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function pushJobsMatchJob(jobId: string, data: any) {
  return jobsQueue.add('jobs:task', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function pushResumeAnalysisJob(jobId: string, data: any) {
  return resumeAnalysisQueue.add('resume:analysis', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function pushRoadmapGenerateJob(jobId: string, data: any) {
  return roadmapGenerateQueue.add('roadmap:generate', data, {
    jobId,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
