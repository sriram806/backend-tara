import mongoose, { Document, Schema } from 'mongoose';
import { InterviewType } from '../schemas/interview.schema';

export type InterviewMessageRole = 'user' | 'assistant' | 'system';

export type InterviewMessage = {
  role: InterviewMessageRole;
  content: string;
  timestamp: string;
};

export interface IInterviewSession extends Document {
  sessionId: string;
  userId: string;
  role: string;
  type: InterviewType;
  status: 'active' | 'completed' | 'timed_out';
  messages: InterviewMessage[];
  scores?: {
    technicalAccuracy: number;
    communicationClarity: number;
    confidence: number;
  };
  feedback?: string[];
  improvements?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const InterviewMessageSchema = new Schema<InterviewMessage>(
  {
    role: {
      type: String,
      required: true,
      enum: ['user', 'assistant', 'system']
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    timestamp: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    type: { type: String, required: true, enum: ['technical', 'behavioral', 'hr'] },
    status: { type: String, required: true, enum: ['active', 'completed', 'timed_out'], default: 'active' },
    messages: { type: [InterviewMessageSchema], default: [] },
    scores: {
      technicalAccuracy: { type: Number, min: 1, max: 10 },
      communicationClarity: { type: Number, min: 1, max: 10 },
      confidence: { type: Number, min: 1, max: 10 }
    },
    feedback: { type: [String], default: [] },
    improvements: { type: [String], default: [] }
  },
  {
    timestamps: true,
    collection: 'interview_sessions'
  }
);

export const InterviewSessionModel = mongoose.model<IInterviewSession>('InterviewSession', InterviewSessionSchema);
