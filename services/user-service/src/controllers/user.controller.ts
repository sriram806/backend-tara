import { FastifyReply, FastifyRequest } from 'fastify';
import { patchMeSchema } from '../schemas/user.schema';
import { UserService } from '../services/user.service';
import { replyOk } from '../utils/response';

export class UserController {
  constructor(private readonly userService: UserService) {}

  async me(_request: FastifyRequest, reply: FastifyReply) {
    const userId = _request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User id is missing'
        }
      });
    }

    let profile;
    try {
      profile = await this.userService.getMe(userId);
    } catch (error) {
      if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') {
        return reply.code(500).send({
          success: false,
          error: {
            code: 'DATABASE_NOT_CONFIGURED',
            message: 'Database is not configured for user-service'
          }
        });
      }

      throw error;
    }

    if (!profile) {
      return reply.code(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User does not exist in Database'
        }
      });
    }

    return replyOk(reply, profile);
  }

  async updateMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userContext?.userId;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User id is missing'
        }
      });
    }

    const input = patchMeSchema.parse(request.body);

    try {
      const updated = await this.userService.updateMe(userId, input);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User does not exist'
          }
        });
      }

      return replyOk(reply, updated);
    } catch (error) {
      if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') {
        return reply.code(501).send({
          success: false,
          error: {
            code: 'DATABASE_NOT_CONFIGURED',
            message: 'Database is not configured for user-service'
          }
        });
      }

      throw error;
    }
  }
}
