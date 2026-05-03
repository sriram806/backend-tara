import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, issuedCertificates, userExams, users } from '@thinkai/db';
import { ExamSchemaService } from './schema';

export class ExamCertificateService {
  static async issueCertificate(userId: string, attemptId: string) {
    const db = getDb();
    const [attempt] = await db.select().from(userExams).where(eq(userExams.id, attemptId)).limit(1);
    if (!attempt || attempt.status !== 'PASS') {
      throw new Error('Valid passed attempt required for certificate issuance');
    }

    const [existing] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.examAttemptId, attemptId)).limit(1);
    if (existing) {
      return existing;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const certificateHash = crypto.createHash('sha256').update(`${userId}-${attemptId}-${Date.now()}`).digest('hex');

    const [issued] = await db.insert(issuedCertificates).values({
      userId,
      examAttemptId: attemptId,
      skillName: attempt.skillName,
      certificateHash,
      score: attempt.score,
      percentage: attempt.percentage,
      issuedAt: new Date(),
      metadata: {
        userName: (user as any)?.name || 'Candidate',
        userEmail: user?.email,
        attemptNumber: attempt.attemptNumber,
        skillType: (attempt.evaluationJson as any)?.skillType
      }
    }).returning();

    return issued;
  }

  static async getCertificate(attemptId: string, userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [cert] = await db.select().from(issuedCertificates).where(and(
      eq(issuedCertificates.examAttemptId, attemptId),
      eq(issuedCertificates.userId, userId)
    )).limit(1);

    if (!cert) {
      throw new Error('Certificate not found');
    }

    return cert;
  }

  static async verifyCertificate(hash: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();
    const [cert] = await db.select().from(issuedCertificates).where(eq(issuedCertificates.certificateHash, hash)).limit(1);
    if (!cert) {
      throw new Error('Invalid or expired certificate');
    }

    return {
      isValid: true,
      issuedTo: (cert.metadata as any)?.userName,
      skill: cert.skillName,
      issuedAt: cert.issuedAt,
      percentage: cert.percentage
    };
  }
}
