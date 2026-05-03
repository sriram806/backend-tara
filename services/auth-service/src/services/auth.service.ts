import { AppError } from '../utils/app-error';
import { hashPassword, hashSha256, verifyPassword } from '../utils/hash';
import { buildOtpExpiry, generateOtp } from '../utils/otp';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt';
import {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  SendVerifyOtpInput,
  VerifyEmailInput
} from '../schemas/auth.schema';
import { AuthStore } from './auth.store';
import { EmailService } from './email.service';

type AuthRuntimeConfig = {
  bcryptRounds: number;
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
  accessSecret: string;
  accessTtl: string;
  refreshSecret: string;
  refreshTtl: string;
  exposeOtpInResponse: boolean;
};

type AuthContext = {
  ipAddress?: string;
  deviceInfo?: string;
};

export class AuthService {
  private static readonly UNVERIFIED_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly store: AuthStore,
    private readonly emailService: EmailService,
    private readonly config: AuthRuntimeConfig
  ) {}

  async register(input: RegisterInput) {
    await this.cleanupExpiredUnverifiedAccount(input.email);

    const existing = await this.store.findUserByEmail(input.email);
    if (existing) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'Account already exists', 409);
    }

    const passwordHash = await hashPassword(input.password, this.config.bcryptRounds);
    const user = await this.store.createUser({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      preferences: input.preferences
    });

    const otp = await this.sendOtpInternal(user.email, user.id, 'VERIFY_EMAIL');

    return {
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      ...(this.config.exposeOtpInResponse ? { otp } : {})
    };
  }

  async login(input: LoginInput, context: AuthContext) {
    await this.cleanupExpiredUnverifiedAccount(input.email);

    const user = await this.store.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }

    // ─── Account lockout check ──────────────────────────────────────────────
    const lockUntilRaw = (user as any).lockUntil as Date | null | undefined;
    if (lockUntilRaw && new Date(lockUntilRaw) > new Date()) {
      const unlockAt = new Date(lockUntilRaw).toISOString();
      throw new AppError(
        'ACCOUNT_LOCKED',
        `Account is temporarily locked due to too many failed attempts. Try again after ${unlockAt}.`,
        423
      );
    }

    const matched = await verifyPassword(input.password, user.passwordHash);
    if (!matched) {
      // Record failure — best effort, non-blocking
      void this.store.incrementFailedAttempts(user.id);
      void this.store.recordLoginHistory({
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.deviceInfo,
        success: false,
        failureReason: 'INVALID_CREDENTIALS'
      });
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }

    if (!user.emailVerified) {
      throw new AppError('EMAIL_NOT_VERIFIED', 'Email is not verified', 403);
    }

    if (user.status !== 'active') {
      void this.store.recordLoginHistory({
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.deviceInfo,
        success: false,
        failureReason: 'ACCOUNT_NOT_ACTIVE'
      });
      throw new AppError('ACCOUNT_NOT_ACTIVE', 'Account is not active', 403);
    }

    // ─── Successful login ───────────────────────────────────────────────────
    void this.store.resetFailedAttempts(user.id);
    void this.store.recordLoginHistory({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.deviceInfo,
      success: true
    });

    return this.issueTokenPair(user.id, user.role, context);
  }

  async refresh(refreshToken: string, context: AuthContext) {
    const payload = verifyToken(refreshToken, this.config.refreshSecret, 'refresh');
    const tokenHash = hashSha256(refreshToken);
    const storedToken = await this.store.findActiveRefreshToken(tokenHash);

    if (!storedToken) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid', 401);
    }

    const user = await this.store.findUserById(payload.userId);
    if (!user || user.status !== 'active') {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid', 401);
    }

    await this.store.revokeRefreshToken(storedToken.id);
    return this.issueTokenPair(user.id, user.role, context);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashSha256(refreshToken);
    const token = await this.store.findActiveRefreshToken(tokenHash);

    if (token) {
      await this.store.revokeRefreshToken(token.id);
    }
  }

  async sendVerifyOtp(input: SendVerifyOtpInput) {
    const deleted = await this.cleanupExpiredUnverifiedAccount(input.email);
    if (deleted) {
      throw new AppError('ACCOUNT_EXPIRED', 'Your unverified account was deleted after 24 hours. Please register again.', 410);
    }

    const user = await this.store.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User does not exist', 404);
    }

    if (user.emailVerified) {
      throw new AppError('ALREADY_VERIFIED', 'Email already verified', 400);
    }

    const otp = await this.sendOtpInternal(user.email, user.id, 'VERIFY_EMAIL');
    return { 
      sent: true,
      ...(this.config.exposeOtpInResponse ? { otp } : {})
    };
  }

  async verifyEmail(input: VerifyEmailInput) {
    const deleted = await this.cleanupExpiredUnverifiedAccount(input.email);
    if (deleted) {
      throw new AppError('ACCOUNT_EXPIRED', 'Your unverified account was deleted after 24 hours. Please register again.', 410);
    }

    const user = await this.store.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User does not exist', 404);
    }

    await this.validateOtpOrThrow(user.email, 'VERIFY_EMAIL', input.otp);
    await this.store.markUserEmailVerified(user.id);

    const session = await this.issueTokenPair(user.id, user.role, {});

    return {
      verified: true,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user
    };
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await this.store.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'No account found with the provided ID', 404);
    }

    const otp = await this.sendOtpInternal(user.email, user.id, 'RESET_PASSWORD');
    return { 
      sent: true,
      ...(this.config.exposeOtpInResponse ? { otp } : {})
    };
  }

  async resetPassword(input: ResetPasswordInput) {
    const user = await this.store.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('INVALID_OTP', 'Invalid OTP', 400);
    }

    await this.validateOtpOrThrow(user.email, 'RESET_PASSWORD', input.otp);

    const newPasswordHash = await hashPassword(input.newPassword, this.config.bcryptRounds);
    await this.store.updatePassword(user.id, newPasswordHash);
    await this.store.revokeAllUserRefreshTokens(user.id);

    return {
      reset: true
    };
  }

  private async issueTokenPair(userId: string, role: string, context: AuthContext) {
    const access = signAccessToken(
      { userId, role },
      this.config.accessSecret,
      this.config.accessTtl
    );

    const refresh = signRefreshToken(
      { userId, role },
      this.config.refreshSecret,
      this.config.refreshTtl
    );

    await this.store.saveRefreshToken({
      userId,
      tokenHash: hashSha256(refresh.token),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: context.ipAddress,
      deviceInfo: context.deviceInfo
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      user: {
        id: userId,
        role
      }
    };
  }

  private async sendOtpInternal(email: string, userId: string | null, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const otp = generateOtp();
    const otpHash = hashSha256(otp);

    await this.store.upsertOtp({
      userId,
      email,
      otpCode: otpHash,
      type,
      expiresAt: buildOtpExpiry(this.config.otpExpiryMinutes)
    });

    await this.emailService.sendOtpEmail(email, otp, type);

    return otp;
  }

  private async validateOtpOrThrow(email: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD', otp: string) {
    const record = await this.store.getLatestOtp(email, type);
    if (!record) {
      throw new AppError('INVALID_OTP', 'Invalid OTP', 400);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.store.deleteOtp(record.id);
      throw new AppError('OTP_EXPIRED', 'OTP has expired', 400);
    }

    if (record.attempts >= this.config.otpMaxAttempts) {
      await this.store.deleteOtp(record.id);
      throw new AppError('OTP_MAX_ATTEMPTS_REACHED', 'OTP attempts exceeded', 429);
    }

    const otpHash = hashSha256(otp);
    if (otpHash !== record.otpCode) {
      await this.store.incrementOtpAttempts(record.id);
      throw new AppError('INVALID_OTP', 'Invalid OTP', 400);
    }

    await this.store.deleteOtp(record.id);
  }

  private cleanupExpiredUnverifiedAccount(email: string) {
    return this.store.deleteExpiredUnverifiedUserByEmail(
      email,
      new Date(Date.now() - AuthService.UNVERIFIED_ACCOUNT_TTL_MS)
    );
  }
}
