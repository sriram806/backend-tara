import crypto from 'node:crypto';
import { InterviewSessionModel } from '../models/interview-session.model';
import { CreateInterviewSessionDto } from '../schemas/interview.schema';
import { redisClient } from './redis.service';
import { sanitizeInterviewText } from '../utils/sanitize';

export type InterviewMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
};

export type InterviewSessionState = {
  sessionId: string;
  userId: string;
  role: string;
  type: 'technical' | 'behavioral' | 'hr';
  messages: InterviewMessage[];
  questionCount: number;
  status: 'active' | 'completed' | 'timed_out';
  createdAt: string;
  updatedAt: string;
  scores?: {
    technicalAccuracy: number;
    communicationClarity: number;
    confidence: number;
  };
  feedback?: string[];
  improvements?: string[];
};

type CreateSessionOptions = {
  maxQuestions: number;
  sessionTtlSeconds: number;
  aiServiceBaseUrl: string;
  aiTimeoutMs: number;
};

export class InterviewService {
  private readonly maxQuestions: number;
  private readonly sessionTtlSeconds: number;
  private readonly aiServiceBaseUrl: string;
  private readonly aiTimeoutMs: number;

  constructor(options: CreateSessionOptions) {
    this.maxQuestions = options.maxQuestions;
    this.sessionTtlSeconds = options.sessionTtlSeconds;
    this.aiServiceBaseUrl = options.aiServiceBaseUrl;
    this.aiTimeoutMs = options.aiTimeoutMs;
  }

  async createSession(dto: CreateInterviewSessionDto): Promise<InterviewSessionState> {
    const now = new Date().toISOString();
    const session: InterviewSessionState = {
      sessionId: crypto.randomUUID(),
      userId: dto.userId,
      role: sanitizeInterviewText(dto.role),
      type: dto.type,
      messages: [],
      questionCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await this.saveSession(session);
    return session;
  }

  async getSession(sessionId: string): Promise<InterviewSessionState | null> {
    const payload = await redisClient.get(this.redisKey(sessionId));
    if (!payload) {
      return null;
    }

    return JSON.parse(payload) as InterviewSessionState;
  }

  async generateQuestion(sessionId: string): Promise<{ question: string; difficulty: string; confidenceScore: number }> {
    const session = await this.requireActiveSession(sessionId);
    const response = await this.postToAi('/ai/interview/questions', {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      type: session.type,
      messages: session.messages
    });

    const data = this.readSuccessData(response);
    const question = String(data.question ?? '').trim();
    if (!question) {
      throw new Error('AI service returned an empty question');
    }

    session.questionCount += 1;
    await this.appendMessage(session, {
      role: 'assistant',
      content: question,
      timestamp: new Date().toISOString()
    });

    return {
      question,
      difficulty: String(data.difficulty ?? 'medium'),
      confidenceScore: Number(data.confidenceScore ?? 0.5)
    };
  }

  async handleCandidateMessage(
    sessionId: string,
    rawMessage: string,
    onToken: (token: string) => void
  ): Promise<{ response: string; nextQuestion?: string; completed: boolean; completionPayload?: Record<string, unknown> }> {
    const session = await this.requireActiveSession(sessionId);
    const message = sanitizeInterviewText(rawMessage);

    await this.appendMessage(session, {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    const responseText = await this.streamAiResponse(session, message, onToken);
    await this.appendMessage(session, {
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString()
    });

    if (session.questionCount >= this.maxQuestions) {
      const completionPayload = await this.completeSession(session.sessionId);
      return {
        response: responseText,
        completed: true,
        completionPayload
      };
    }

    const next = await this.generateQuestion(session.sessionId);
    return {
      response: responseText,
      nextQuestion: next.question,
      completed: false
    };
  }

  async completeSession(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.requireActiveSession(sessionId);
    const evaluation = await this.postToAi('/ai/interview/evaluate', {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      type: session.type,
      messages: session.messages
    });

    const evaluationData = this.readSuccessData(evaluation) as {
      scores?: {
        technicalAccuracy?: number;
        communicationClarity?: number;
        confidence?: number;
      };
      feedback?: string[];
      improvements?: string[];
    };

    session.status = 'completed';
    session.updatedAt = new Date().toISOString();
    session.scores = {
      technicalAccuracy: Number(evaluationData.scores?.technicalAccuracy ?? 1),
      communicationClarity: Number(evaluationData.scores?.communicationClarity ?? 1),
      confidence: Number(evaluationData.scores?.confidence ?? 1)
    };
    session.feedback = Array.isArray(evaluationData.feedback) ? evaluationData.feedback : [];
    session.improvements = Array.isArray(evaluationData.improvements) ? evaluationData.improvements : [];

    await this.saveSession(session);
    await this.persistToMongo(session);

    return {
      sessionId: session.sessionId,
      status: session.status,
      scores: session.scores,
      feedback: session.feedback,
      improvements: session.improvements,
      transcript: session.messages
    };
  }

  async timeoutSession(sessionId: string): Promise<Record<string, unknown> | null> {
    const session = await this.getSession(sessionId);
    if (!session || session.status !== 'active') {
      return null;
    }

    session.status = 'timed_out';
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    await this.persistToMongo(session);

    return {
      sessionId: session.sessionId,
      status: session.status,
      transcript: session.messages
    };
  }

  private async streamAiResponse(
    session: InterviewSessionState,
    userMessage: string,
    onToken: (token: string) => void
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.aiTimeoutMs);

    try {
      const response = await fetch(`${this.aiServiceBaseUrl}/ai/interview/stream-response`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          userId: session.userId,
          role: session.role,
          type: session.type,
          userMessage,
          messages: session.messages
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`AI streaming request failed (${response.status})`);
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let fullText = '';
      let buffer = '';

      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }

        buffer += decoder.decode(result.value, { stream: true });

        let delimiterIndex = buffer.indexOf('\n\n');
        while (delimiterIndex !== -1) {
          const eventChunk = buffer.slice(0, delimiterIndex);
          buffer = buffer.slice(delimiterIndex + 2);
          delimiterIndex = buffer.indexOf('\n\n');

          const lines = eventChunk.split('\n').map((line) => line.trim());
          for (const line of lines) {
            if (!line.startsWith('data:')) {
              continue;
            }

            const payload = line.slice(5).trim();
            if (!payload) {
              continue;
            }

            const parsed = JSON.parse(payload) as { token?: string; done?: boolean; error?: string };
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.token) {
              fullText += parsed.token;
              onToken(parsed.token);
            }
          }
        }
      }

      return fullText.trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postToAi(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.aiTimeoutMs);

    try {
      const response = await fetch(`${this.aiServiceBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const json = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String((json.error ?? json.detail ?? 'AI request failed')));
      }

      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readSuccessData(payload: Record<string, unknown>): Record<string, unknown> {
    if (payload.success !== true || typeof payload.data !== 'object' || payload.data === null) {
      throw new Error('Invalid AI response envelope');
    }

    return payload.data as Record<string, unknown>;
  }

  private async appendMessage(session: InterviewSessionState, message: InterviewMessage): Promise<void> {
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  private async requireActiveSession(sessionId: string): Promise<InterviewSessionState> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Interview session not found');
    }

    if (session.status !== 'active') {
      throw new Error(`Interview session is ${session.status}`);
    }

    return session;
  }

  private async saveSession(session: InterviewSessionState): Promise<void> {
    await redisClient.set(this.redisKey(session.sessionId), JSON.stringify(session), 'EX', this.sessionTtlSeconds);
  }

  private async persistToMongo(session: InterviewSessionState): Promise<void> {
    await InterviewSessionModel.findOneAndUpdate(
      { sessionId: session.sessionId },
      {
        sessionId: session.sessionId,
        userId: session.userId,
        role: session.role,
        type: session.type,
        status: session.status,
        messages: session.messages,
        scores: session.scores,
        feedback: session.feedback,
        improvements: session.improvements
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
  }

  private redisKey(sessionId: string): string {
    return `interview:session:${sessionId}`;
  }
}
