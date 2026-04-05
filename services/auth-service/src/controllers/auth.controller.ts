import { FastifyReply, FastifyRequest } from 'fastify';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  sendVerifyOtpSchema,
  verifyEmailSchema
} from '../schemas/auth.schema';
import { AuthService } from '../services/auth.service';
import { sendSuccess } from '../utils/response';

type ControllerConfig = {
  refreshCookieName: string;
  secureCookie: boolean;
};

export class AuthController {
  constructor(private readonly authService: AuthService, private readonly config: ControllerConfig) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    const input = registerSchema.parse(request.body);
    const data = await this.authService.register(input);
    return sendSuccess(reply, data, 201);
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const input = loginSchema.parse(request.body);
    const data = await this.authService.login(input, {
      ipAddress: request.ip,
      deviceInfo: request.headers['user-agent']
    });

    reply.setCookie(this.config.refreshCookieName, data.refreshToken, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'strict',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60
    });

    return sendSuccess(reply, {
      accessToken: data.accessToken,
      user: data.user
    });
  }

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const input = refreshSchema.parse(request.body ?? {});
    const cookieToken = request.cookies[this.config.refreshCookieName];
    const refreshToken = input.refreshToken ?? cookieToken;

    if (!refreshToken) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token is required'
        }
      });
    }

    const data = await this.authService.refresh(refreshToken, {
      ipAddress: request.ip,
      deviceInfo: request.headers['user-agent']
    });

    reply.setCookie(this.config.refreshCookieName, data.refreshToken, {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'strict',
      path: '/auth',
      maxAge: 30 * 24 * 60 * 60
    });

    return sendSuccess(reply, {
      accessToken: data.accessToken,
      user: data.user
    });
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const input = logoutSchema.parse(request.body ?? {});
    const cookieToken = request.cookies[this.config.refreshCookieName];
    const refreshToken = input.refreshToken ?? cookieToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    reply.clearCookie(this.config.refreshCookieName, {
      path: '/auth'
    });

    return sendSuccess(reply, { loggedOut: true });
  }

  async sendVerifyOtp(request: FastifyRequest, reply: FastifyReply) {
    const input = sendVerifyOtpSchema.parse(request.body);
    const data = await this.authService.sendVerifyOtp(input);
    return sendSuccess(reply, data);
  }

  async verifyEmail(request: FastifyRequest, reply: FastifyReply) {
    const input = verifyEmailSchema.parse(request.body);
    const data = await this.authService.verifyEmail(input);
    return sendSuccess(reply, data);
  }

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const input = forgotPasswordSchema.parse(request.body);
    const data = await this.authService.forgotPassword(input);
    return sendSuccess(reply, data);
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const input = resetPasswordSchema.parse(request.body);
    const data = await this.authService.resetPassword(input);
    return sendSuccess(reply, data);
  }
}
