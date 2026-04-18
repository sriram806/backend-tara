import mongoose, { Document, Schema } from 'mongoose';
import { AnalyticsEventType } from '../schemas/analytics.schema';

export interface IUserEvent extends Document {
  userId: string;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const UserEventSchema = new Schema<IUserEvent>({
  userId: { type: String, required: true, index: true },
  eventType: {
    type: String,
    required: true,
    enum: [
      'login',
      'resume_updated',
      'exam_started',
      'exam_completed',
      'skill_passed',
      'skill_failed',
      'task_completed',
      'project_completed',
      'recommendation_clicked'
    ],
    index: true
  },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  collection: 'user_events',
  versionKey: false
});

UserEventSchema.index({ userId: 1, createdAt: -1 });
UserEventSchema.index({ eventType: 1, createdAt: -1 });

export const UserEventModel = mongoose.models.UserEvent as mongoose.Model<IUserEvent> || mongoose.model<IUserEvent>('UserEvent', UserEventSchema);
