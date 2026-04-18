import type { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { socketMessageSchema, socketStartSchema } from '../schemas/interview.schema';
import { InterviewService } from '../services/interview.service';
import { canUseInterviewFeature } from '../middleware/subscription.middleware';

type SocketData = {
  userId?: string;
  sessionId?: string;
};

export function setupInterviewSockets(
  server: HttpServer,
  interviewService: InterviewService,
  timeoutMs: number
): void {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  const namespace = io.of('/ws/interview');
  const inactivityTimers = new Map<string, NodeJS.Timeout>();

  const resetTimer = (sessionId: string) => {
    const activeTimer = inactivityTimers.get(sessionId);
    if (activeTimer) {
      clearTimeout(activeTimer);
    }

    const newTimer = setTimeout(async () => {
      const timedOutPayload = await interviewService.timeoutSession(sessionId);
      if (timedOutPayload) {
        namespace.to(sessionId).emit('interview:complete', {
          success: true,
          data: {
            ...timedOutPayload,
            reason: 'session_timeout'
          }
        });
      }
      inactivityTimers.delete(sessionId);
    }, timeoutMs);

    inactivityTimers.set(sessionId, newTimer);
  };

  namespace.use((socket: Socket) => {
    const data = socket.data as SocketData;
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (typeof token === 'string' && token.trim()) {
      data.userId = token.trim();
    }
  });

  namespace.on('connection', (socket: Socket) => {
    socket.on('interview:start', async (rawPayload: unknown) => {
      try {
        const payload = socketStartSchema.parse(rawPayload);
        const data = socket.data as SocketData;
        const userId = data.userId ?? payload.userId;

        const allowed = await canUseInterviewFeature(userId);
        if (!allowed) {
          socket.emit('interview:response', {
            success: false,
            error: {
              code: 'FEATURE_RESTRICTED',
              message: 'Interview AI is not available on the current plan'
            }
          });
          return;
        }

        const session = payload.sessionId
          ? await interviewService.getSession(payload.sessionId)
          : await interviewService.createSession({
              userId,
              role: payload.role,
              type: payload.type
            });

        if (!session) {
          socket.emit('interview:response', {
            success: false,
            error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' }
          });
          return;
        }

        data.sessionId = session.sessionId;
        socket.join(session.sessionId);
        resetTimer(session.sessionId);

        socket.emit('interview:response', {
          success: true,
          data: {
            sessionId: session.sessionId,
            status: session.status,
            reconnect: Boolean(payload.sessionId)
          }
        });

        if (session.status !== 'active') {
          socket.emit('interview:complete', { success: true, data: session });
          return;
        }

        if (session.questionCount === 0) {
          const openingQuestion = await interviewService.generateQuestion(session.sessionId);
          namespace.to(session.sessionId).emit('interview:question', {
            success: true,
            data: {
              sessionId: session.sessionId,
              question: openingQuestion.question,
              difficulty: openingQuestion.difficulty,
              confidenceScore: openingQuestion.confidenceScore
            }
          });
        }
      } catch (error) {
        socket.emit('interview:response', {
          success: false,
          error: {
            code: 'INTERVIEW_START_FAILED',
            message: error instanceof Error ? error.message : 'Unable to start interview'
          }
        });
      }
    });

    socket.on('interview:message', async (rawPayload: unknown) => {
      try {
        const payload = socketMessageSchema.parse(rawPayload);
        const data = socket.data as SocketData;
        if (data.sessionId && data.sessionId !== payload.sessionId) {
          socket.emit('interview:response', {
            success: false,
            error: {
              code: 'SESSION_MISMATCH',
              message: 'Socket is currently attached to another session'
            }
          });
          return;
        }

        resetTimer(payload.sessionId);

        const result = await interviewService.handleCandidateMessage(payload.sessionId, payload.message, (token) => {
          namespace.to(payload.sessionId).emit('interview:response', {
            success: true,
            data: {
              sessionId: payload.sessionId,
              token,
              done: false
            }
          });
        });

        namespace.to(payload.sessionId).emit('interview:response', {
          success: true,
          data: {
            sessionId: payload.sessionId,
            message: result.response,
            done: true
          }
        });

        if (result.completed) {
          namespace.to(payload.sessionId).emit('interview:complete', {
            success: true,
            data: result.completionPayload
          });
          const timer = inactivityTimers.get(payload.sessionId);
          if (timer) {
            clearTimeout(timer);
            inactivityTimers.delete(payload.sessionId);
          }
          return;
        }

        if (result.nextQuestion) {
          namespace.to(payload.sessionId).emit('interview:question', {
            success: true,
            data: {
              sessionId: payload.sessionId,
              question: result.nextQuestion
            }
          });
        }
      } catch (error) {
        socket.emit('interview:response', {
          success: false,
          error: {
            code: 'INTERVIEW_MESSAGE_FAILED',
            message: error instanceof Error ? error.message : 'Unable to process message'
          }
        });
      }
    });

    socket.on('disconnect', () => {
      const data = socket.data as SocketData;
      if (!data.sessionId) {
        return;
      }

      resetTimer(data.sessionId);
    });
  });
}
