import crypto from 'node:crypto';

export function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function buildOtpExpiry(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000); // total time is 60000 
}
