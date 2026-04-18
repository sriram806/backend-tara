import crypto from 'node:crypto';
import { RoadmapRunRepository } from '../repositories/roadmap-run.repository';
import { pushRoadmapGenerateJob } from '../queues/producer';
import { RecommendationService } from './recommendation.service';
import { PersonalizationService } from './personalization.service';
import { AnalyticsService } from './analytics.service';
import { ExperimentService } from './experiment.service';
import { FeatureFlagService } from './feature-flag.service';

export class RoadmapRunService {
  static async createAndQueue(userId: string, analysisRunId: string, targetRole: string, durationDays: number) {
    const analysisRun = await RoadmapRunRepository.getCompletedAnalysisForUser(analysisRunId, userId);
    if (!analysisRun) {
      throw new Error('Analysis run not found');
    }

    if (analysisRun.status !== 'completed') {
      throw new Error('Analysis run must be completed before roadmap generation');
    }

    const roadmapFeatureEnabled = await FeatureFlagService.isFeatureEnabled(userId, 'roadmap_v2');
    const experimentContext = await ExperimentService.getExperimentContext(userId, 'roadmap');
    const roadmapV2Enabled = roadmapFeatureEnabled || experimentContext.config.roadmapVersion === 'v2';
    const effectiveDurationDays = roadmapV2Enabled
      ? Math.max(durationDays, 120)
      : durationDays;

    const existing = await RoadmapRunRepository.getBySignature(analysisRunId, targetRole, effectiveDurationDays);
    if (existing && existing.status !== 'failed') {
      return {
        roadmapRunId: existing.id,
        status: existing.status,
        deduplicated: true,
        experiment: experimentContext
      };
    }

    const roadmapRunId = crypto.randomUUID();
    const adaptiveContext = await PersonalizationService.getRoadmapContext(userId, {
      analysisRunId,
      targetRole,
      durationDays: effectiveDurationDays
    });

    await RoadmapRunRepository.create({
      id: roadmapRunId,
      userId,
      resumeId: analysisRun.resumeId,
      analysisRunId,
      targetRole,
      durationDays: effectiveDurationDays,
      roadmapJson: {},
      status: 'pending',
      updatedAt: new Date()
    });

    const normalizedRole = targetRole.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    await pushRoadmapGenerateJob(`roadmap:${analysisRunId}:${normalizedRole}:${durationDays}`, {
      runId: roadmapRunId,
      userId,
      analysisRunId,
      targetRole,
      durationDays: effectiveDurationDays,
      adaptiveContext: {
        ...adaptiveContext,
        featureFlags: {
          roadmapV2Enabled
        },
        experiment: {
          experimentId: experimentContext.experimentId,
          variantId: experimentContext.variantId,
          variantName: experimentContext.variantName,
          roadmapVersion: experimentContext.config.roadmapVersion
        }
      }
    });

    await PersonalizationService.recordTaskCompletion(userId, 'roadmap_generated', {
      analysisRunId,
      targetRole,
      durationDays: effectiveDurationDays
    });

    await AnalyticsService.logEvent(userId, 'task_completed', {
      area: 'roadmap',
      action: 'generated',
      roadmapRunId,
      analysisRunId,
      targetRole,
      durationDays: effectiveDurationDays,
      experimentId: experimentContext.experimentId,
      variantId: experimentContext.variantId,
      variantName: experimentContext.variantName,
      roadmapV2Enabled
    });

    await RecommendationService.refreshForUser(userId, 'roadmap_updated');

    return {
      roadmapRunId,
      status: 'pending',
      deduplicated: false,
      experiment: experimentContext
    };
  }

  static async getRun(userId: string, runId: string) {
    const run = await RoadmapRunRepository.getByIdForUser(runId, userId);
    if (!run) {
      throw new Error('Roadmap run not found');
    }

    return run;
  }
}
