import crypto from 'node:crypto';
import { ResumeAnalysisRepository } from '../repositories/resume-analysis.repository';
import { pushResumeAnalysisJob } from '../queues/producer';

export class ResumeAnalysisRunService {
  static async createAndQueue(userId: string, resumeId: string) {
    const resume = await ResumeAnalysisRepository.getCurrentResumeForUser(userId, resumeId);
    if (!resume) {
      throw new Error('Resume not found');
    }

    if (resume.status !== 'active') {
      throw new Error('Finalize your structured resume before analysis');
    }

    const existing = await ResumeAnalysisRepository.getByResumeVersion(resume.id, resume.version);
    if (existing) {
      return {
        runId: existing.id,
        status: existing.status,
        deduplicated: true
      };
    }

    const runId = crypto.randomUUID();
    await ResumeAnalysisRepository.create({
      id: runId,
      userId,
      resumeId: resume.id,
      resumeVersion: resume.version,
      status: 'pending',
      updatedAt: new Date()
    });

    await pushResumeAnalysisJob(`resume-analysis:${resume.id}:v${resume.version}`, {
      runId,
      userId,
      resumeId: resume.id,
      resumeVersion: resume.version
    });

    return {
      runId,
      status: 'pending',
      deduplicated: false
    };
  }

  static async getRun(userId: string, runId: string) {
    const run = await ResumeAnalysisRepository.getByIdForUser(runId, userId);
    if (!run) {
      throw new Error('Analysis run not found');
    }

    return run;
  }
}
