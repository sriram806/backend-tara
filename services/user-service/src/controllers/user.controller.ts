import { FastifyReply, FastifyRequest } from 'fastify';
import { patchMeSchema } from '../schemas/user.schema';
import { UserService } from '../services/user.service';
import { replyOk } from '../utils/response';

export class UserController {
  constructor(private readonly userService: UserService) {}

  health() {
    return {
      status: 'ok',
      service: 'user-service'
    };
  }

  me(_request: FastifyRequest, reply: FastifyReply) {
    return replyOk(reply, this.userService.getMe());
  }

  updateMe(request: FastifyRequest, reply: FastifyReply) {
    const input = patchMeSchema.parse(request.body);
    return replyOk(reply, this.userService.updateMe(input));
  }
}
