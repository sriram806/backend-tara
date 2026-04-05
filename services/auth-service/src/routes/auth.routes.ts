import { FastifyPluginAsync } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { loginRateLimit, otpRateLimit } from '../middleware/rateLimit.middleware';

export const authRoutes = (controller: AuthController): FastifyPluginAsync => {
  return async (app) => {
    app.post('/register', { preHandler: otpRateLimit }, (request, reply) => controller.register(request, reply));
    app.post('/login', { preHandler: loginRateLimit }, (request, reply) => controller.login(request, reply));
    app.post('/refresh', (request, reply) => controller.refresh(request, reply));
    app.delete('/logout', (request, reply) => controller.logout(request, reply));

    app.post('/send-verify-otp', { preHandler: otpRateLimit }, (request, reply) => controller.sendVerifyOtp(request, reply));
    app.post('/verify-email', { preHandler: otpRateLimit }, (request, reply) => controller.verifyEmail(request, reply));

    app.post('/forgot-password', { preHandler: otpRateLimit }, (request, reply) => controller.forgotPassword(request, reply));
    app.post('/reset-password', { preHandler: otpRateLimit }, (request, reply) => controller.resetPassword(request, reply));
  };
};
