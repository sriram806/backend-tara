import crypto from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  getDb,
  organizationAssignments,
  organizationInvites,
  organizationMembers,
  organizations,
  roadmapRuns,
  skillProgress,
  userProfiles,
  userExams,
  userXp,
  users
} from '@thinkai/db';
import { redisClient } from '../queues/connection';
import {
  OrganizationAssignmentDto,
  OrganizationCreateDto,
  OrganizationInviteDto,
  OrganizationJoinDto,
  OrganizationRole,
  OrganizationType
} from '../schemas/organization.schema';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}

export class OrganizationService {
  static leaderboardKey(organizationId: string) {
    return `org:leaderboard:${organizationId}`;
  }

  static async createOrganization(userId: string, input: OrganizationCreateDto) {
    const db = getDb();
    const createdAt = new Date();

    const [organization] = await db.insert(organizations).values({
      name: input.name,
      type: input.type as OrganizationType,
      createdBy: userId,
      createdAt
    }).returning();

    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId,
      role: 'admin',
      joinedAt: createdAt
    });

    await this.syncLeaderboard(organization.id);

    return {
      organization,
      membership: await this.getMembership(userId, organization.id)
    };
  }

  static async createInvite(userId: string, input: OrganizationInviteDto) {
    await this.assertMemberRole(userId, input.organizationId, ['admin']);

    const db = getDb();
    const inviteToken = createInviteToken();
    const tokenHash = hashToken(inviteToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const [invite] = await db.insert(organizationInvites).values({
      organizationId: input.organizationId,
      email: normalize(input.email),
      role: input.role,
      tokenHash,
      status: 'pending',
      invitedBy: userId,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return {
      invite: {
        id: invite.id,
        organizationId: invite.organizationId,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: toIso(invite.expiresAt),
        createdAt: toIso(invite.createdAt)
      },
      inviteToken,
      inviteLink: `/org/join?token=${inviteToken}`
    };
  }

  static async joinOrganization(userId: string, input: OrganizationJoinDto) {
    const db = getDb();
    const tokenHash = hashToken(input.token);
    const [invite] = await db.select().from(organizationInvites).where(eq(organizationInvites.tokenHash, tokenHash)).limit(1);

    if (!invite) {
      throw new Error('INVITE_NOT_FOUND');
    }

    const now = new Date();
    if (invite.status !== 'pending' || invite.expiresAt <= now) {
      await db.update(organizationInvites)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(organizationInvites.id, invite.id));
      throw new Error('INVITE_EXPIRED');
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    if (normalize(user.email) !== normalize(invite.email)) {
      throw new Error('INVITE_EMAIL_MISMATCH');
    }

    const existingMembership = await this.getMembership(userId, invite.organizationId);
    if (existingMembership) {
      await db.update(organizationInvites)
        .set({ status: 'accepted', acceptedAt: now, updatedAt: now })
        .where(eq(organizationInvites.id, invite.id));
      return {
        joined: true,
        organizationId: invite.organizationId,
        role: existingMembership.role,
        memberId: existingMembership.id,
        alreadyMember: true
      };
    }

    const [member] = await db.insert(organizationMembers).values({
      organizationId: invite.organizationId,
      userId,
      role: invite.role as OrganizationRole,
      joinedAt: now
    }).returning();

    await db.update(organizationInvites)
      .set({ status: 'accepted', acceptedAt: now, updatedAt: now })
      .where(eq(organizationInvites.id, invite.id));

    await this.syncLeaderboard(invite.organizationId);

    return {
      joined: true,
      organizationId: invite.organizationId,
      role: member.role,
      memberId: member.id,
      alreadyMember: false
    };
  }

  static async createAssignment(userId: string, input: OrganizationAssignmentDto) {
    await this.assertMemberRole(userId, input.organizationId, ['admin', 'mentor']);

    const db = getDb();
    const [assignment] = await db.insert(organizationAssignments).values({
      organizationId: input.organizationId,
      createdBy: userId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      targetSkillName: input.targetSkillName ?? null,
      targetExamSkill: input.targetExamSkill ?? null,
      payload: input.payload ?? {},
      status: 'active',
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    return assignment;
  }

  static async listAssignments(userId: string, organizationId: string) {
    await this.assertMember(userId, organizationId);

    const db = getDb();
    return db.select().from(organizationAssignments)
      .where(eq(organizationAssignments.organizationId, organizationId))
      .orderBy(desc(organizationAssignments.createdAt));
  }

  static async getDashboard(userId: string, organizationId: string) {
    const membership = await this.assertMember(userId, organizationId);
    const db = getDb();

    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!organization) {
      throw new Error('ORGANIZATION_NOT_FOUND');
    }

    const members = await this.listMembers(userId, organizationId);
    const memberIds = members.map((member) => member.userId);

    const [examRows, progressRows, roadmapRows, assignments, invites, xpRows] = await Promise.all([
      memberIds.length
        ? db.select().from(userExams).where(inArray(userExams.userId, memberIds)).orderBy(desc(userExams.createdAt))
        : Promise.resolve([]),
      memberIds.length
        ? db.select().from(skillProgress).where(inArray(skillProgress.userId, memberIds)).orderBy(desc(skillProgress.updatedAt))
        : Promise.resolve([]),
      memberIds.length
        ? db.select().from(roadmapRuns).where(inArray(roadmapRuns.userId, memberIds)).orderBy(desc(roadmapRuns.createdAt))
        : Promise.resolve([]),
      db.select().from(organizationAssignments).where(eq(organizationAssignments.organizationId, organizationId)).orderBy(desc(organizationAssignments.createdAt)),
      db.select().from(organizationInvites).where(eq(organizationInvites.organizationId, organizationId)).orderBy(desc(organizationInvites.createdAt)),
      memberIds.length
        ? db.select().from(userXp).where(inArray(userXp.userId, memberIds))
        : Promise.resolve([])
    ]);

    const metrics = this.buildOrganizationMetrics(members, examRows, progressRows, roadmapRows, assignments, invites, xpRows);
    const leaderboard = await this.getLeaderboard(organizationId, 20);

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        createdBy: organization.createdBy,
        createdAt: toIso(organization.createdAt)
      },
      viewerRole: membership.role,
      summary: metrics.summary,
      skillStats: metrics.skillStats,
      roadmapStats: metrics.roadmapStats,
      weakStudents: metrics.weakStudents,
      leaderboard,
      members: metrics.members,
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: toIso(invite.expiresAt),
        acceptedAt: toIso(invite.acceptedAt),
        createdAt: toIso(invite.createdAt)
      })),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        type: assignment.type,
        title: assignment.title,
        description: assignment.description,
        targetSkillName: assignment.targetSkillName,
        targetExamSkill: assignment.targetExamSkill,
        status: assignment.status,
        dueAt: toIso(assignment.dueAt),
        createdAt: toIso(assignment.createdAt)
      }))
    };
  }

  static async listMembers(userId: string, organizationId: string) {
    await this.assertMember(userId, organizationId);

    const db = getDb();
    const rows = await db.select({
      memberId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
      email: users.email,
      fullName: userProfiles.fullName,
      isOnboarded: users.isOnboarded,
      userStatus: users.status,
      userCreatedAt: users.createdAt
    }).from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .leftJoin(userProfiles, eq(organizationMembers.userId, userProfiles.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(desc(organizationMembers.joinedAt));

    return rows.map((row) => ({
      memberId: row.memberId,
      organizationId: row.organizationId,
      userId: row.userId,
      role: row.role,
      joinedAt: toIso(row.joinedAt),
      email: row.email,
      fullName: row.fullName,
      isOnboarded: row.isOnboarded,
      userStatus: row.userStatus,
      userCreatedAt: toIso(row.userCreatedAt)
    }));
  }

  static async getMember(userId: string, organizationId: string, memberId: string) {
    await this.assertMember(userId, organizationId);
    const db = getDb();

    const [member] = await db.select({
      memberId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
      email: users.email,
      fullName: userProfiles.fullName,
      isOnboarded: users.isOnboarded,
      userStatus: users.status,
      createdAt: users.createdAt
    }).from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .leftJoin(userProfiles, eq(organizationMembers.userId, userProfiles.userId))
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.id, memberId)))
      .limit(1);

    if (!member) {
      throw new Error('MEMBER_NOT_FOUND');
    }

    const analytics = await this.buildMemberAnalytics(organizationId, member.userId);

    return {
      member: {
        memberId: member.memberId,
        organizationId: member.organizationId,
        userId: member.userId,
        role: member.role,
        joinedAt: toIso(member.joinedAt),
        email: member.email,
        fullName: member.fullName,
        isOnboarded: member.isOnboarded,
        userStatus: member.userStatus,
        createdAt: toIso(member.createdAt)
      },
      analytics
    };
  }

  static async syncLeaderboard(organizationId: string) {
    const db = getDb();
    const members = await db.select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      email: users.email,
      fullName: userProfiles.fullName,
      isOnboarded: users.isOnboarded
    }).from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .leftJoin(userProfiles, eq(organizationMembers.userId, userProfiles.userId))
      .where(eq(organizationMembers.organizationId, organizationId));

    const memberIds = members.map((member) => member.userId);
    const [exams, progress, xpRows, assignments] = await Promise.all([
      memberIds.length ? db.select().from(userExams).where(inArray(userExams.userId, memberIds)) : Promise.resolve([]),
      memberIds.length ? db.select().from(skillProgress).where(inArray(skillProgress.userId, memberIds)) : Promise.resolve([]),
      memberIds.length ? db.select().from(userXp).where(inArray(userXp.userId, memberIds)) : Promise.resolve([]),
      db.select().from(organizationAssignments).where(and(eq(organizationAssignments.organizationId, organizationId), eq(organizationAssignments.status, 'completed')))
    ]);

    const examScoreByUser = new Map<string, { total: number; count: number }>();
    for (const exam of exams) {
      const current = examScoreByUser.get(exam.userId) ?? { total: 0, count: 0 };
      current.total += exam.percentage;
      current.count += 1;
      examScoreByUser.set(exam.userId, current);
    }

    const passedSkillByUser = new Map<string, number>();
    for (const row of progress) {
      if (row.status === 'PASSED') {
        passedSkillByUser.set(row.userId, (passedSkillByUser.get(row.userId) ?? 0) + 1);
      }
    }

    const xpByUser = new Map(xpRows.map((row) => [row.userId, row.totalXp]));
    const completedAssignmentsBonus = assignments.length ? Math.min(assignments.length * 5, 50) : 0;

    const scores = members.map((member) => {
      const exam = examScoreByUser.get(member.userId);
      const avgExamScore = exam && exam.count > 0 ? exam.total / exam.count : 0;
      const xp = xpByUser.get(member.userId) ?? 0;
      const passedSkills = passedSkillByUser.get(member.userId) ?? 0;
      const onboardingBonus = member.isOnboarded ? 10 : 0;
      const score = Math.round(
        xp +
        (avgExamScore * 10) +
        (passedSkills * 15) +
        onboardingBonus +
        completedAssignmentsBonus
      );

      return {
        memberId: member.userId,
        score,
        avgExamScore: Math.round(avgExamScore),
        xp,
        passedSkills
      };
    });

    scores.sort((left, right) => right.score - left.score);

    const key = this.leaderboardKey(organizationId);
    await redisClient.del(key);
    if (scores.length > 0) {
      const flattened = scores.flatMap((entry) => [entry.score, entry.memberId]);
      await redisClient.zadd(key, ...flattened);
    }

    return scores;
  }

  static async getLeaderboard(organizationId: string, limit = 20) {
    const key = this.leaderboardKey(organizationId);
    let rows = await redisClient.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    if (!rows.length) {
      await this.syncLeaderboard(organizationId);
      rows = await redisClient.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    }

    const memberIds = rows.filter((_, index) => index % 2 === 0);
    const db = getDb();
    const members = memberIds.length
      ? await db.select({
          userId: organizationMembers.userId,
          email: users.email,
          fullName: userProfiles.fullName,
          role: organizationMembers.role
        }).from(organizationMembers)
          .innerJoin(users, eq(organizationMembers.userId, users.id))
          .leftJoin(userProfiles, eq(organizationMembers.userId, userProfiles.userId))
          .where(and(
            eq(organizationMembers.organizationId, organizationId),
            inArray(organizationMembers.userId, memberIds)
          ))
      : [];

    const memberById = new Map(members.map((member) => [member.userId, member]));
    const leaderboard = [] as Array<{ userId: string; score: number; email: string; role: OrganizationRole }>;

    for (let index = 0; index < rows.length; index += 2) {
      const userId = rows[index];
      const score = Number(rows[index + 1] ?? 0);
      const member = memberById.get(userId);
      if (!member) {
        continue;
      }

      leaderboard.push({
        userId,
        score,
        email: member.email,
        role: member.role as OrganizationRole
      });
    }

    return leaderboard;
  }

  static async getMembership(userId: string, organizationId: string) {
    const db = getDb();
    const [membership] = await db.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId)
    )).limit(1);

    return membership ?? null;
  }

  static async assertMember(userId: string, organizationId: string) {
    const membership = await this.getMembership(userId, organizationId);
    if (!membership) {
      throw new Error('ORGANIZATION_FORBIDDEN');
    }

    return membership;
  }

  static async assertMemberRole(userId: string, organizationId: string, allowedRoles: OrganizationRole[]) {
    const membership = await this.assertMember(userId, organizationId);
    if (!allowedRoles.includes(membership.role as OrganizationRole)) {
      throw new Error('ORGANIZATION_ROLE_FORBIDDEN');
    }

    return membership;
  }

  private static async buildMemberAnalytics(organizationId: string, userId: string) {
    const db = getDb();
    const [xpRow] = await db.select().from(userXp).where(eq(userXp.userId, userId)).limit(1);
    const examRows = await db.select().from(userExams).where(and(
      eq(userExams.userId, userId),
      eq(userExams.organizationId, organizationId)
    )).orderBy(desc(userExams.createdAt));
    const progressRows = await db.select().from(skillProgress).where(eq(skillProgress.userId, userId));
    const roadmapRows = await db.select().from(roadmapRuns).where(eq(roadmapRuns.userId, userId)).orderBy(desc(roadmapRuns.createdAt));

    const averageExamScore = examRows.length
      ? Math.round(examRows.reduce((sum, row) => sum + row.percentage, 0) / examRows.length)
      : 0;

    const passedSkills = progressRows.filter((row) => row.status === 'PASSED').length;
    const failedSkills = progressRows.filter((row) => row.status === 'LEARNING').length;

    return {
      xp: xpRow?.totalXp ?? 0,
      averageExamScore,
      passedSkills,
      failedSkills,
      roadmapStatus: roadmapRows[0]?.status ?? 'pending',
      examCount: examRows.length
    };
  }

  private static buildOrganizationMetrics(
    members: Array<{ userId: string; role: OrganizationRole; email: string; isOnboarded: boolean }>,
    examRows: Array<{ userId: string; skillName: string; percentage: number; status: string }>,
    progressRows: Array<{ userId: string; skillName: string; status: string; lastScore: number }>,
    roadmapRows: Array<{ userId: string; status: string }>,
    assignments: Array<{ type: string; status: string }>,
    invites: Array<{ status: string }>,
    xpRows: Array<{ userId: string; totalXp: number }>
  ) {
    const skillStats = new Map<string, { passed: number; failed: number; totalScore: number; attempts: number }>();
    const memberSkillPass = new Map<string, Set<string>>();
    const memberSkillFail = new Map<string, Set<string>>();
    const memberExamScores = new Map<string, { total: number; count: number }>();

    for (const exam of examRows) {
      const stat = skillStats.get(exam.skillName) ?? { passed: 0, failed: 0, totalScore: 0, attempts: 0 };
      stat.attempts += 1;
      stat.totalScore += exam.percentage;
      if (exam.status === 'PASS') {
        stat.passed += 1;
      } else if (exam.status === 'FAIL') {
        stat.failed += 1;
      }
      skillStats.set(exam.skillName, stat);

      const score = memberExamScores.get(exam.userId) ?? { total: 0, count: 0 };
      score.total += exam.percentage;
      score.count += 1;
      memberExamScores.set(exam.userId, score);
    }

    for (const progress of progressRows) {
      const passes = memberSkillPass.get(progress.userId) ?? new Set<string>();
      const fails = memberSkillFail.get(progress.userId) ?? new Set<string>();

      if (progress.status === 'PASSED') {
        passes.add(progress.skillName);
      } else if (progress.status === 'LEARNING') {
        fails.add(progress.skillName);
      }

      memberSkillPass.set(progress.userId, passes);
      memberSkillFail.set(progress.userId, fails);
    }

    const leaderboard = members
      .map((member) => {
        const examScore = memberExamScores.get(member.userId);
        const xp = xpRows.find((row) => row.userId === member.userId)?.totalXp ?? 0;
        const avgExam = examScore && examScore.count > 0 ? examScore.total / examScore.count : 0;
        const passedSkills = memberSkillPass.get(member.userId)?.size ?? 0;
        const failedSkills = memberSkillFail.get(member.userId)?.size ?? 0;
        const roadmapStatus = roadmapRows.find((row) => row.userId === member.userId)?.status ?? 'pending';
        const score = Math.round(xp + (avgExam * 10) + (passedSkills * 15) - (failedSkills * 5) + (roadmapStatus === 'completed' ? 10 : 0));

        return {
          userId: member.userId,
          email: member.email,
          role: member.role,
          score,
          xp,
          averageExamScore: Math.round(avgExam),
          passedSkills,
          failedSkills,
          roadmapStatus
        };
      })
      .sort((left, right) => right.score - left.score);

    const totalMembers = members.length;
    const completedMembers = members.filter((member) => member.isOnboarded).length;
    const completionRate = totalMembers > 0 ? Math.round((completedMembers / totalMembers) * 100) : 0;

    const skillStatsList = Array.from(skillStats.entries()).map(([skillName, stat]) => ({
      skillName,
      passed: stat.passed,
      failed: stat.failed,
      attempts: stat.attempts,
      averageScore: stat.attempts > 0 ? Math.round(stat.totalScore / stat.attempts) : 0,
      completionRate: stat.attempts > 0 ? Math.round((stat.passed / stat.attempts) * 100) : 0
    })).sort((left, right) => right.attempts - left.attempts);

    const roadmapStats = {
      pending: roadmapRows.filter((row) => row.status === 'pending').length,
      processing: roadmapRows.filter((row) => row.status === 'processing').length,
      completed: roadmapRows.filter((row) => row.status === 'completed').length,
      failed: roadmapRows.filter((row) => row.status === 'failed').length
    };

    const weakStudents = leaderboard.filter((entry) => entry.averageExamScore < 60 || entry.failedSkills > entry.passedSkills);
    const assignmentsSummary = {
      total: assignments.length,
      skill: assignments.filter((assignment) => assignment.type === 'skill').length,
      exam: assignments.filter((assignment) => assignment.type === 'exam').length,
      project: assignments.filter((assignment) => assignment.type === 'project').length,
      roadmap: assignments.filter((assignment) => assignment.type === 'roadmap').length,
      completed: assignments.filter((assignment) => assignment.status === 'completed').length
    };

    return {
      summary: {
        totalMembers,
        admins: members.filter((member) => member.role === 'admin').length,
        mentors: members.filter((member) => member.role === 'mentor').length,
        students: members.filter((member) => member.role === 'student').length,
        completionRate,
        inviteCount: invites.length,
        pendingInvites: invites.filter((invite) => invite.status === 'pending').length,
        leaderboardSize: leaderboard.length,
        assignments: assignmentsSummary
      },
      skillStats: skillStatsList,
      roadmapStats,
      weakStudents,
      members: leaderboard
    };
  }
}