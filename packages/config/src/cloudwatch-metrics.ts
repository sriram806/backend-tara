export type CloudWatchMetricUnit = 'Count' | 'Milliseconds' | 'Seconds';

export function createCloudWatchMetricEvent(
  namespace: string,
  metricName: string,
  value: number,
  unit: CloudWatchMetricUnit,
  dimensions: Record<string, string>
) {
  const dimensionKeys = Object.keys(dimensions);

  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimensionKeys],
          Metrics: [{ Name: metricName, Unit: unit }]
        }
      ]
    },
    ...dimensions,
    [metricName]: value
  };
}
