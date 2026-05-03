import { buildOtpExpiry, generateOtp } from '../../services/auth-service/src/utils/otp';
import { hashPassword, hashSha256, verifyPassword } from '../../services/auth-service/src/utils/hash';
import { signAccessToken, signRefreshToken, verifyToken } from '../../services/auth-service/src/utils/jwt';
import { AppError } from '../../services/auth-service/src/utils/app-error';
import { RateLimitService } from '../../services/auth-service/src/services/rate-limit.service';

describe('Auth utility tests', () => {
  test('hashPassword + verifyPassword succeeds for valid password', async () => {
    const password = 'Strong#Pass123';
    const hash = await hashPassword(password, 10);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  test('hashSha256 is deterministic', () => {
    expect(hashSha256('abc')).toBe(hashSha256('abc'));
    expect(hashSha256('abc')).not.toBe(hashSha256('abcd'));
  });

  test('generateOtp returns 6-digit code', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  test('buildOtpExpiry is about N minutes ahead', () => {
    const expiry = buildOtpExpiry(5);
    const deltaMs = expiry.getTime() - Date.now();

    expect(deltaMs).toBeGreaterThanOrEqual(4 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(5 * 60 * 1000 + 2000);
  });

  test('access token can be signed and verified', () => {
    const secret = 'a'.repeat(40);
    const signed = signAccessToken({ userId: 'u1', role: 'free' }, secret, '15m');

    const payload = verifyToken(signed.token, secret, 'access');
    expect(payload.userId).toBe('u1');
    expect(payload.role).toBe('free');
    expect(payload.type).toBe('access');
    expect(payload.jti).toBeTruthy();
  });

  test('verifyToken throws INVALID_TOKEN_TYPE when token type mismatches', () => {
    const secret = 'b'.repeat(40);
    const refresh = signRefreshToken({ userId: 'u1', role: 'free' }, secret, '30d');

    try {
      verifyToken(refresh.token, secret, 'access');
      throw new Error('Expected verifyToken to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_TOKEN_TYPE');
    }
  });
});

describe('RateLimitService', () => {
  test('allows up to max requests in window', () => {
    const service = new RateLimitService();

    const one = service.check('k', 2, 60_000);
    const two = service.check('k', 2, 60_000);
    const three = service.check('k', 2, 60_000);

    expect(one.allowed).toBe(true);
    expect(two.allowed).toBe(true);
    expect(three.allowed).toBe(false);
    expect(three.remaining).toBe(0);
  });
});
