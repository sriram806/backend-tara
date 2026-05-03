import { and, desc, eq } from 'drizzle-orm';
import { getDb, examAssignments, skillExams } from '@thinkai/db';
import { ExamSchemaService } from './schema';

export class ExamAssignmentService {
  static async assignExam(adminId: string, payload: { examId: string; userId?: string; teamId?: string; organizationId?: string; deadlineAt?: string; priority?: string }) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    // Validate target
    if (!payload.userId && !payload.teamId && !payload.organizationId) {
      throw new Error('At least one assignment target (user, team, or organization) is required');
    }

    const [assignment] = await db.insert(examAssignments).values({
      examId: payload.examId,
      userId: payload.userId || null,
      teamId: payload.teamId || null,
      organizationId: payload.organizationId || null,
      assignedBy: adminId,
      deadlineAt: payload.deadlineAt ? new Date(payload.deadlineAt) : null,
      priority: payload.priority || 'MEDIUM'
    }).returning();

    return assignment;
  }

  static async listUserAssignments(userId: string) {
    await ExamSchemaService.ensureSchemaCompatibility();
    const db = getDb();

    const assignments = await db.select({
      id: examAssignments.id,
      examId: examAssignments.examId,
      status: examAssignments.status,
      priority: examAssignments.priority,
      deadlineAt: examAssignments.deadlineAt,
      skillName: skillExams.skillName,
      description: skillExams.description
    })
      .from(examAssignments)
      .innerJoin(skillExams, eq(examAssignments.examId, skillExams.id))
      .where(and(
        eq(examAssignments.userId, userId),
        eq(examAssignments.status, 'PENDING')
      ))
      .orderBy(desc(examAssignments.createdAt));

    return assignments;
  }
}
