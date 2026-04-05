import mongoose, { Schema, Document } from 'mongoose';

export interface IAiJob extends Document {
  jobId: string;
  userId: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiJobSchema: Schema = new Schema(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true, enum: ['analysis', 'resume', 'roadmap'] },
    status: { 
      type: String, 
      required: true, 
      enum: ['pending', 'processing', 'completed', 'failed'], 
      default: 'pending' 
    },
    progress: { type: Number, default: 0 },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

export const AiJob = mongoose.model<IAiJob>('AiJob', AiJobSchema);
