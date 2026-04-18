import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalyticsSummary extends Document {
  summaryDate: Date;
  metrics: Record<string, unknown>;
  generatedAt: Date;
}

const AnalyticsSummarySchema = new Schema<IAnalyticsSummary>({
  summaryDate: { type: Date, required: true, unique: true, index: true },
  metrics: { type: Schema.Types.Mixed, required: true },
  generatedAt: { type: Date, required: true, default: Date.now }
}, {
  collection: 'analytics_summary',
  versionKey: false
});

export const AnalyticsSummaryModel = mongoose.models.AnalyticsSummary as mongoose.Model<IAnalyticsSummary> || mongoose.model<IAnalyticsSummary>('AnalyticsSummary', AnalyticsSummarySchema);
