import { FastifyReply, FastifyRequest } from 'fastify';
import { GatewayService } from '../services/gateway.service';

export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  health() {
    return {
      status: 'ok',
      service: 'gateway'
    };
  }

  proxy(request: FastifyRequest, reply: FastifyReply) {
    return reply.code(501).send(this.gatewayService.buildProxyPlaceholder(request.url));
  }
}
