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

  async proxy(request: FastifyRequest, reply: FastifyReply) {
    const resolved = this.gatewayService.resolveTarget(request.url);
    if (!resolved) {
      return reply.code(501).send(this.gatewayService.buildProxyPlaceholder(request.url));
    }

    const upstreamUrl = new URL(resolved.upstreamPath, resolved.baseUrl).toString();
    const headers = new Headers();

    const authorization = request.headers.authorization;
    if (authorization) {
      headers.set('authorization', authorization);
    }

    if (request.headers['content-type']) {
      headers.set('content-type', String(request.headers['content-type']));
    }

    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : JSON.stringify(request.body ?? {})
    });

    const contentType = response.headers.get('content-type') ?? 'application/json';
    reply.code(response.status);
    reply.header('content-type', contentType);

    const text = await response.text();
    return reply.send(text);
  }
}
