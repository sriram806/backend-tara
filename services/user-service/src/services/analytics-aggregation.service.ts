import { AnalyticsSummaryModel } from '../models/analytics-summary.model';
import { AnalyticsService } from './analytics.service';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export async function runDailyAnalyticsAggregation() {
  const metrics = await AnalyticsService.getAdminMetrics();
  const summaryDate = startOfDay(new Date());

  await AnalyticsSummaryModel.findOneAndUpdate(
    { summaryDate },
    {
      summaryDate,
      metrics,
      generatedAt: new Date()
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

export function startAnalyticsAggregationScheduler(
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  intervalMs = Number(process.env.ANALYTICS_AGGREGATION_INTERVAL_MS ?? 24 * 60 * 60 * 1000)
) {
  const run = async () => {
    try {
      await runDailyAnalyticsAggregation();
      logger.info({ intervalMs }, 'Analytics daily aggregation completed');
    } catch (error) {
      logger.error({ err: error }, 'Analytics daily aggregation failed');
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, Math.max(60_000, intervalMs));

  timer.unref();
  return timer;
}
