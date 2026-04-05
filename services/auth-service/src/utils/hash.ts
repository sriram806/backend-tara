import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export async function hashPassword(password: string, rounds: number) {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function hashSha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
