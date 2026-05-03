import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const authProviderEnum = pgEnum('auth_provider', ['local', 'google', 'github']);
export const userRoleEnum = pgEnum('user_role', ['guest', 'user', 'support', 'moderator', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const otpTypeEnum = pgEnum('otp_type', ['VERIFY_EMAIL', 'RESET_PASSWORD']);
export const billingPlanEnum = pgEnum('billing_plan', ['LITE', 'PRO', 'ENTERPRISE']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'cancelled', 'expired']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['paid', 'failed', 'pending']);
export const paymentStatusEnum = pgEnum('payment_status', ['created', 'authorized', 'paid', 'failed']);
export const webhookStatusEnum = pgEnum('webhook_status', ['processing', 'processed', 'failed']);
export const notificationTypeEnum = pgEnum('notification_type', ['email', 'in_app']);
export const notificationCategoryEnum = pgEnum('notification_category', ['info', 'success', 'warning', 'error', 'system', 'promotion']);
export const aiRunStatusEnum = pgEnum('ai_run_status', ['pending', 'processing', 'completed', 'failed']);
export const resumeStatusEnum = pgEnum('resume_status', ['draft', 'active', 'archived']);
export const onboardingStepEnum = pgEnum('onboarding_step', ['resume', 'target_role', 'complete']);
export const organizationTypeEnum = pgEnum('organization_type', ['college', 'company', 'institute']);
export const organizationRoleEnum = pgEnum('organization_member_role', ['admin', 'mentor', 'student']);
export const organizationInviteStatusEnum = pgEnum('organization_invite_status', ['pending', 'accepted', 'expired']);
export const organizationAssignmentTypeEnum = pgEnum('organization_assignment_type', ['skill', 'exam', 'project', 'roadmap']);
export const organizationAssignmentStatusEnum = pgEnum('organization_assignment_status', ['pending', 'active', 'completed']);
export const learningSpeedEnum = pgEnum('learning_speed', ['slow', 'medium', 'fast']);
export const skillPerformanceStatusEnum = pgEnum('skill_performance_status', ['weak', 'improving', 'strong']);
export const recommendationTypeEnum = pgEnum('recommendation_type', ['skill', 'task', 'exam', 'project']);
export const recommendationStatusEnum = pgEnum('recommendation_status', ['pending', 'completed', 'dismissed']);
export const recommendationActionEnum = pgEnum('recommendation_action', ['clicked', 'completed', 'ignored']);
export const experimentStatusEnum = pgEnum('experiment_status', ['active', 'paused', 'completed']);
export const experimentTypeEnum = pgEnum('experiment_type', ['roadmap', 'exam', 'recommendation']);
export const examQuestionTypeEnum = pgEnum('exam_question_type', ['MCQ', 'FILL', 'CODE']);
export const examStatusEnum = pgEnum('exam_status', ['IN_PROGRESS', 'PASS', 'FAIL']);
export const skillProgressStatusEnum = pgEnum('skill_progress_status', ['NOT_STARTED', 'LEARNING', 'PASSED']);
export const examSkillTypeEnum = pgEnum('exam_skill_type', ['STANDARD', 'PROGRAMMING_LANGUAGE']);
export const adminActionEnum = pgEnum('admin_action', [
  'create_user', 'update_user', 'suspend_user', 'unlock_user', 'delete_user',
  'impersonate_user', 'export_data', 'delete_data', 'revoke_session', 'revoke_all_sessions',
  'update_role', 'update_subscription', 'create_gdpr_request', 'manage_api_key',
  'manage_custom_field', 'manage_mfa', 'update_feature_flag', 'manage_webhook',
  'bulk_import', 'bulk_export', 'view_audit_log',
  'send_notification', 'flag_user', 'resolve_report', 'create_role', 'update_role_perms'
]);
export const gdprRequestTypeEnum = pgEnum('gdpr_request_type', ['export', 'delete']);
export const gdprRequestStatusEnum = pgEnum('gdpr_request_status', ['pending', 'processing', 'completed', 'failed']);
export const mfaMethodEnum = pgEnum('mfa_method', ['totp', 'email', 'sms']);
export const adminApiKeyScopeEnum = pgEnum('admin_api_key_scope', [
  'users:read', 'users:write', 'audit:read', 'gdpr:write', 'sessions:write'
]);
export const moderationReportStatusEnum = pgEnum('moderation_report_status', ['pending', 'reviewed', 'dismissed']);
export const moderationReportCategoryEnum = pgEnum('moderation_report_category', [
  'spam', 'abuse', 'harassment', 'fraud', 'inappropriate_content', 'other'
]);

export type ResumeSectionScores = {
  summary: number;
  skills: number;
  experience: number;
  projects: number;
  education: number;
};

export type ResumeKeywordSuggestion = {
  keyword: string;
  reason: string;
  section: 'summary' | 'skills' | 'experience' | 'projects' | 'education';
};

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  plan: billingPlanEnum('plan'),
  authProvider: authProviderEnum('auth_provider').notNull().default('local'),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  emailVerified: boolean('email_verified').notNull().default(false),
  isOnboarded: boolean('is_onboarded').notNull().default(false),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  // ─── Security & Moderation ────────────────────────────────────────────────
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockUntil: timestamp('lock_until', { withTimezone: true }),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  bannedBy: uuid('banned_by'),
  bannedReason: text('banned_reason'),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  // ─────────────────────────────────────────────────────────────────────────
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  emailIndex: index('users_email_idx').on(table.email),
  onboardedIndex: index('users_onboarded_idx').on(table.isOnboarded),
  lockUntilIndex: index('users_lock_until_idx').on(table.lockUntil)
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name'),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({})
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: organizationTypeEnum('type').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  organizationCreatedByIndex: index('organizations_created_by_idx').on(table.createdBy),
  organizationTypeIndex: index('organizations_type_idx').on(table.type)
}));

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: organizationRoleEnum('role').notNull().default('student'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  organizationMemberUniqueIndex: uniqueIndex('organization_members_org_user_unique_idx').on(table.organizationId, table.userId),
  organizationMemberOrgIndex: index('organization_members_org_idx').on(table.organizationId),
  organizationMemberUserIndex: index('organization_members_user_idx').on(table.userId),
  organizationMemberRoleIndex: index('organization_members_role_idx').on(table.organizationId, table.role)
}));

export const organizationInvites = pgTable('organization_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: organizationRoleEnum('role').notNull().default('student'),
  tokenHash: text('token_hash').notNull(),
  status: organizationInviteStatusEnum('status').notNull().default('pending'),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  organizationInviteOrgIndex: index('organization_invites_org_idx').on(table.organizationId),
  organizationInviteEmailIndex: index('organization_invites_email_idx').on(table.email),
  organizationInviteTokenUniqueIndex: uniqueIndex('organization_invites_token_hash_unique_idx').on(table.tokenHash)
}));

export const organizationAssignments = pgTable('organization_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: organizationAssignmentTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  targetSkillName: text('target_skill_name'),
  targetExamSkill: text('target_exam_skill'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: organizationAssignmentStatusEnum('status').notNull().default('pending'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  organizationAssignmentOrgIndex: index('organization_assignments_org_idx').on(table.organizationId),
  organizationAssignmentTypeIndex: index('organization_assignments_type_idx').on(table.organizationId, table.type),
  organizationAssignmentStatusIndex: index('organization_assignments_status_idx').on(table.organizationId, table.status)
}));

export const userTargetRoles = pgTable('user_target_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  level: text('level'),
  industry: text('industry'),
  locationPreference: text('location_preference'),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  isCurrent: boolean('is_current').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userCurrentIndex: index('user_target_roles_user_current_idx').on(table.userId, table.isCurrent),
  userCreatedAtIndex: index('user_target_roles_user_created_at_idx').on(table.userId, table.createdAt)
}));

export const onboardingProgress = pgTable('onboarding_progress', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  currentStep: onboardingStepEnum('current_step').notNull().default('resume'),
  resumeCompleted: boolean('resume_completed').notNull().default(false),
  targetRoleCompleted: boolean('target_role_completed').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  currentStepIndex: index('onboarding_progress_current_step_idx').on(table.currentStep)
}));

export const userResumes = pgTable('user_resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Primary resume'),
  summary: text('summary').notNull().default(''),
  status: resumeStatusEnum('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  completenessScore: integer('completeness_score').notNull().default(0),
  atsScore: integer('ats_score').notNull().default(0),
  sectionScores: jsonb('section_scores').$type<ResumeSectionScores>().notNull().default({
    summary: 0,
    skills: 0,
    experience: 0,
    projects: 0,
    education: 0
  }),
  keywordSuggestions: jsonb('keyword_suggestions').$type<ResumeKeywordSuggestion[]>().notNull().default([]),
  draftData: jsonb('draft_data').$type<Record<string, unknown>>().notNull().default({}),
  isCurrent: boolean('is_current').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userResumeLookupIndex: index('user_resumes_user_id_idx').on(table.userId),
  userResumeCurrentLookupIndex: index('user_resumes_user_current_idx').on(table.userId, table.isCurrent, table.deletedAt),
  userResumeVersionLookupIndex: index('user_resumes_user_version_idx').on(table.userId, table.version),
  userResumeStatusIndex: index('user_resumes_user_status_idx').on(table.userId, table.status)
}));

export const resumeSkills = pgTable('resume_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('technical'),
  proficiency: text('proficiency').notNull().default('intermediate'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resumeSkillIndex: index('resume_skills_resume_id_idx').on(table.resumeId),
  userSkillIndex: index('resume_skills_user_name_idx').on(table.userId, table.name)
}));

export const resumeExperiences = pgTable('resume_experiences', {
  id: uuid('id').defaultRandom().primaryKey(),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  location: text('location'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  isCurrent: boolean('is_current').notNull().default(false),
  bullets: jsonb('bullets').$type<string[]>().notNull().default([]),
  technologies: jsonb('technologies').$type<string[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resumeExperienceIndex: index('resume_experiences_resume_id_idx').on(table.resumeId),
  userExperienceIndex: index('resume_experiences_user_id_idx').on(table.userId)
}));

export const resumeProjects = pgTable('resume_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role'),
  url: text('url'),
  bullets: jsonb('bullets').$type<string[]>().notNull().default([]),
  technologies: jsonb('technologies').$type<string[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resumeProjectIndex: index('resume_projects_resume_id_idx').on(table.resumeId),
  userProjectIndex: index('resume_projects_user_id_idx').on(table.userId)
}));

export const resumeEducation = pgTable('resume_education', {
  id: uuid('id').defaultRandom().primaryKey(),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  institution: text('institution').notNull(),
  degree: text('degree').notNull(),
  field: text('field'),
  startYear: text('start_year'),
  endYear: text('end_year'),
  grade: text('grade'),
  highlights: jsonb('highlights').$type<string[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resumeEducationIndex: index('resume_education_resume_id_idx').on(table.resumeId),
  userEducationIndex: index('resume_education_user_id_idx').on(table.userId)
}));

export const resumeAnalysisRuns = pgTable('resume_analysis_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  resumeVersion: integer('resume_version').notNull(),
  status: aiRunStatusEnum('status').notNull().default('pending'),
  atsScore: integer('ats_score'),
  matchedSkills: jsonb('matched_skills').$type<string[]>().notNull().default([]),
  missingSkills: jsonb('missing_skills').$type<string[]>().notNull().default([]),
  sectionScores: jsonb('section_scores').$type<Record<string, unknown>>().notNull().default({}),
  suggestions: jsonb('suggestions').$type<Array<Record<string, unknown>>>().notNull().default([]),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  resumeVersionUniqueIndex: uniqueIndex('resume_analysis_runs_resume_version_unique_idx').on(table.resumeId, table.resumeVersion),
  userResumeIndex: index('resume_analysis_runs_user_resume_idx').on(table.userId, table.resumeId),
  statusIndex: index('resume_analysis_runs_status_idx').on(table.status),
  createdAtDescIndex: index('resume_analysis_runs_created_at_desc_idx').on(table.createdAt)
}));

export const roadmapRuns = pgTable('roadmap_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resumeId: uuid('resume_id').notNull().references(() => userResumes.id, { onDelete: 'cascade' }),
  analysisRunId: uuid('analysis_run_id').notNull().references(() => resumeAnalysisRuns.id, { onDelete: 'cascade' }),
  targetRole: text('target_role').notNull(),
  durationDays: integer('duration_days').notNull().default(90),
  roadmapJson: jsonb('roadmap_json').$type<Record<string, unknown>>().notNull().default({}),
  status: aiRunStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userResumeIndex: index('roadmap_runs_user_resume_idx').on(table.userId, table.resumeId),
  statusIndex: index('roadmap_runs_status_idx').on(table.status),
  createdAtDescIndex: index('roadmap_runs_created_at_desc_idx').on(table.createdAt),
  analysisRunIndex: index('roadmap_runs_analysis_run_id_idx').on(table.analysisRunId)
}));

export const skillExams = pgTable('skill_exams', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  skillName: text('skill_name').notNull(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  skillType: examSkillTypeEnum('skill_type').notNull().default('STANDARD'),
  difficultyLevel: integer('difficulty_level').notNull().default(1),
  passPercentage: integer('pass_percentage').notNull().default(65),
  mcqCount: integer('mcq_count').notNull().default(15),
  fillBlankCount: integer('fill_blank_count').notNull().default(10),
  codingCount: integer('coding_count').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  organizationIndex: index('skill_exams_org_idx').on(table.organizationId),
  skillDifficultyIndex: index('skill_exams_skill_difficulty_idx').on(table.skillName, table.difficultyLevel),
  skillTypeIndex: index('skill_exams_skill_type_idx').on(table.skillName, table.skillType),
  createdAtIndex: index('skill_exams_created_at_idx').on(table.createdAt)
}));

export const examQuestions = pgTable('exam_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id').notNull().references(() => skillExams.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull().default(''),
  type: examQuestionTypeEnum('type').notNull(),
  question: text('question').notNull(),
  options: jsonb('options').$type<string[] | null>().default(null),
  answer: text('answer').notNull(),
  placeholder: text('placeholder'),
  starterCode: text('starter_code'),
  language: text('language'),
  explanation: text('explanation'),
  difficulty: integer('difficulty').notNull().default(1),
  marks: integer('marks').notNull().default(1),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  examQuestionExamIndex: index('exam_questions_exam_id_idx').on(table.examId),
  examQuestionSkillIndex: index('exam_questions_skill_name_idx').on(table.skillName),
  examQuestionTypeIndex: index('exam_questions_type_idx').on(table.type),
  examQuestionDifficultyIndex: index('exam_questions_difficulty_idx').on(table.difficulty)
}));

export const userExams = pgTable('user_exams', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  skillName: text('skill_name').notNull(),
  examId: uuid('exam_id').notNull().references(() => skillExams.id, { onDelete: 'cascade' }),
  score: integer('score').notNull().default(0),
  totalMarks: integer('total_marks').notNull().default(0),
  percentage: integer('percentage').notNull().default(0),
  status: examStatusEnum('status').notNull().default('IN_PROGRESS'),
  attemptNumber: integer('attempt_number').notNull().default(1),
  timeLimitSeconds: integer('time_limit_seconds').notNull().default(2700),
  passPercentage: integer('pass_percentage').notNull().default(65),
  answersJson: jsonb('answers_json').$type<Record<string, string>>().notNull().default({}),
  questionSnapshotJson: jsonb('question_snapshot_json').$type<Array<Record<string, unknown>>>().notNull().default([]),
  evaluationJson: jsonb('evaluation_json').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp('submitted_at', { withTimezone: true })
}, (table) => ({
  userExamOrganizationIndex: index('user_exams_organization_idx').on(table.organizationId),
  userExamUserSkillIndex: index('user_exams_user_skill_idx').on(table.userId, table.skillName),
  userExamStatusIndex: index('user_exams_status_idx').on(table.status),
  userExamCreatedAtIndex: index('user_exams_created_at_idx').on(table.createdAt)
}));

export const skillProgress = pgTable('skill_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  status: skillProgressStatusEnum('status').notNull().default('NOT_STARTED'),
  lastScore: integer('last_score').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userSkillUniqueIndex: uniqueIndex('skill_progress_user_skill_unique_idx').on(table.userId, table.skillName),
  userSkillStatusIndex: index('skill_progress_user_status_idx').on(table.userId, table.status),
  skillUpdatedAtIndex: index('skill_progress_updated_at_idx').on(table.updatedAt)
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  deviceInfo: text('device_info'),
  ipAddress: text('ip_address')
}, (table) => ({
  tokenHashIndex: index('refresh_tokens_token_hash_idx').on(table.tokenHash)
}));

export const otpVerifications = pgTable('otp_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  otpCode: text('otp_code').notNull(),
  type: otpTypeEnum('type').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  otpLookupIndex: index('otp_verifications_lookup_idx').on(table.email, table.type, table.createdAt)
}));

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: billingPlanEnum('plan').notNull().default('LITE'),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  razorpaySubscriptionId: text('razorpay_subscription_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIndex: index('subscriptions_user_id_idx').on(table.userId),
  razorpaySubscriptionIndex: index('subscriptions_razorpay_subscription_id_idx').on(table.razorpaySubscriptionId)
}));

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: invoiceStatusEnum('status').notNull().default('pending'),
  razorpayPaymentId: text('razorpay_payment_id'),
  razorpayOrderId: text('razorpay_order_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdIndex: index('invoices_user_id_idx').on(table.userId),
  subscriptionIdIndex: index('invoices_subscription_id_idx').on(table.subscriptionId),
  razorpayPaymentIndex: index('invoices_razorpay_payment_id_idx').on(table.razorpayPaymentId)
}));

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: billingPlanEnum('plan').notNull(),
  provider: text('provider').notNull().default('razorpay'),
  providerOrderId: text('provider_order_id').notNull(),
  providerPaymentId: text('provider_payment_id'),
  providerSignature: text('provider_signature'),
  receipt: text('receipt'),
  idempotencyKey: text('idempotency_key'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: paymentStatusEnum('status').notNull().default('created'),
  attempts: integer('attempts').notNull().default(1),
  failureCode: text('failure_code'),
  failureReason: text('failure_reason'),
  rawOrder: jsonb('raw_order').$type<Record<string, unknown>>(),
  rawPayment: jsonb('raw_payment').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  providerOrderUniqueIndex: uniqueIndex('payment_transactions_provider_order_id_unique_idx').on(table.providerOrderId),
  providerPaymentUniqueIndex: uniqueIndex('payment_transactions_provider_payment_id_unique_idx').on(table.providerPaymentId),
  userIdempotencyUniqueIndex: uniqueIndex('payment_transactions_user_idempotency_unique_idx').on(table.userId, table.idempotencyKey),
  userCreatedAtIndex: index('payment_transactions_user_created_at_idx').on(table.userId, table.createdAt)
}));

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').notNull().default('razorpay'),
  eventKey: text('event_key').notNull(),
  eventName: text('event_name').notNull(),
  providerOrderId: text('provider_order_id'),
  providerPaymentId: text('provider_payment_id'),
  signatureHash: text('signature_hash').notNull(),
  status: webhookStatusEnum('status').notNull().default('processing'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  retryCount: integer('retry_count').notNull().default(0),
  errorMessage: text('error_message'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  eventKeyUniqueIndex: uniqueIndex('webhook_events_event_key_unique_idx').on(table.eventKey),
  providerOrderIndex: index('webhook_events_provider_order_id_idx').on(table.providerOrderId),
  providerPaymentIndex: index('webhook_events_provider_payment_id_idx').on(table.providerPaymentId)
}));

export const usageTracking = pgTable('usage_tracking', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  feature: text('feature').notNull(),
  usageMonth: text('usage_month').notNull(),
  count: integer('count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  usageLookupIndex: index('usage_tracking_lookup_idx').on(table.userId, table.feature, table.usageMonth)
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
  type: notificationTypeEnum('type').notNull().default('in_app'),
  category: notificationCategoryEnum('category').notNull().default('info'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  actionUrl: text('action_url'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  notificationUserIndex: index('notifications_user_id_idx').on(table.userId),
  notificationSentByIndex: index('notifications_sent_by_idx').on(table.sentBy),
  notificationCategoryIndex: index('notifications_category_idx').on(table.category)
}));

export const achievements = pgTable('achievements', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  xp: integer('xp').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  achievementUserIndex: index('achievements_user_id_idx').on(table.userId),
  achievementTypeIndex: index('achievements_user_type_idx').on(table.userId, table.type)
}));

export const userXp = pgTable('user_xp', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  totalXp: integer('total_xp').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userXpLookupIndex: index('user_xp_user_id_idx').on(table.userId)
}));

export const userFeatures = pgTable('user_features', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  learningSpeed: learningSpeedEnum('learning_speed').notNull().default('medium'),
  consistencyScore: integer('consistency_score').notNull().default(0),
  engagementScore: integer('engagement_score').notNull().default(0),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userFeaturesUniqueIndex: uniqueIndex('user_features_user_id_unique_idx').on(table.userId),
  userFeaturesLearningSpeedIndex: index('user_features_learning_speed_idx').on(table.learningSpeed),
  userFeaturesLastActiveIndex: index('user_features_last_active_idx').on(table.lastActiveAt)
}));

export const skillPerformance = pgTable('skill_performance', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  attempts: integer('attempts').notNull().default(0),
  avgScore: integer('avg_score').notNull().default(0),
  lastScore: integer('last_score').notNull().default(0),
  status: skillPerformanceStatusEnum('status').notNull().default('weak'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  skillPerformanceUniqueIndex: uniqueIndex('skill_performance_user_skill_unique_idx').on(table.userId, table.skillName),
  skillPerformanceUserIndex: index('skill_performance_user_id_idx').on(table.userId),
  skillPerformanceStatusIndex: index('skill_performance_status_idx').on(table.status)
}));

export const userActivityLogs = pgTable('user_activity_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userActivityUserIndex: index('user_activity_logs_user_id_idx').on(table.userId),
  userActivityActionIndex: index('user_activity_logs_action_idx').on(table.action),
  userActivityCreatedAtIndex: index('user_activity_logs_created_at_idx').on(table.createdAt)
}));

export const userRecommendations = pgTable('user_recommendations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: recommendationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: integer('priority').notNull().default(3),
  status: recommendationStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userRecommendationUserIndex: index('user_recommendations_user_id_idx').on(table.userId),
  userRecommendationStatusIndex: index('user_recommendations_user_status_idx').on(table.userId, table.status),
  userRecommendationPriorityIndex: index('user_recommendations_priority_idx').on(table.userId, table.priority),
  userRecommendationUniqueIndex: uniqueIndex('user_recommendations_user_type_title_status_unique_idx').on(table.userId, table.type, table.title, table.status)
}));

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull(),
  description: text('description').notNull().default(''),
  isEnabled: boolean('is_enabled').notNull().default(false),
  rolloutPercentage: integer('rollout_percentage').notNull().default(0),
  scheduledRolloutAt: timestamp('scheduled_rollout_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  featureFlagKeyUniqueIndex: uniqueIndex('feature_flags_key_unique_idx').on(table.key),
  featureFlagEnabledIndex: index('feature_flags_enabled_idx').on(table.isEnabled),
  featureFlagRolloutIndex: index('feature_flags_rollout_idx').on(table.rolloutPercentage)
}));

export const featureFlagOverrides = pgTable('feature_flag_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureFlagId: uuid('feature_flag_id').notNull().references(() => featureFlags.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  isEnabled: boolean('is_enabled').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  featureFlagOverrideFlagIndex: index('feature_flag_overrides_flag_idx').on(table.featureFlagId),
  featureFlagOverrideUserIndex: index('feature_flag_overrides_user_idx').on(table.featureFlagId, table.userId),
  featureFlagOverrideOrganizationIndex: index('feature_flag_overrides_org_idx').on(table.featureFlagId, table.organizationId),
  featureFlagOverrideUserUniqueIndex: uniqueIndex('feature_flag_overrides_flag_user_unique_idx').on(table.featureFlagId, table.userId),
  featureFlagOverrideOrganizationUniqueIndex: uniqueIndex('feature_flag_overrides_flag_org_unique_idx').on(table.featureFlagId, table.organizationId)
}));

export const recommendationLogs = pgTable('recommendation_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recommendationId: uuid('recommendation_id').notNull().references(() => userRecommendations.id, { onDelete: 'cascade' }),
  action: recommendationActionEnum('action').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  recommendationLogUserIndex: index('recommendation_logs_user_id_idx').on(table.userId),
  recommendationLogRecommendationIndex: index('recommendation_logs_recommendation_id_idx').on(table.recommendationId),
  recommendationLogActionIndex: index('recommendation_logs_action_idx').on(table.action),
  recommendationLogCreatedAtIndex: index('recommendation_logs_created_at_idx').on(table.createdAt)
}));

export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: experimentTypeEnum('type').notNull(),
  status: experimentStatusEnum('status').notNull().default('active'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  experimentNameUniqueIndex: uniqueIndex('experiments_name_unique_idx').on(table.name),
  experimentStatusIndex: index('experiments_status_idx').on(table.status),
  experimentTypeIndex: index('experiments_type_idx').on(table.type)
}));

export const experimentVariants = pgTable('experiment_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  experimentId: uuid('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  variantName: text('variant_name').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  experimentVariantUniqueIndex: uniqueIndex('experiment_variants_experiment_variant_unique_idx').on(table.experimentId, table.variantName),
  experimentVariantExperimentIndex: index('experiment_variants_experiment_id_idx').on(table.experimentId)
}));

export const userExperimentAssignments = pgTable('user_experiment_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  experimentId: uuid('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => experimentVariants.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userExperimentUniqueIndex: uniqueIndex('user_experiment_assignments_user_experiment_unique_idx').on(table.userId, table.experimentId),
  userExperimentUserIndex: index('user_experiment_assignments_user_id_idx').on(table.userId),
  userExperimentExperimentIndex: index('user_experiment_assignments_experiment_id_idx').on(table.experimentId),
  userExperimentVariantIndex: index('user_experiment_assignments_variant_id_idx').on(table.variantId)
}));

// ─── Phase 1: Admin Infrastructure Tables ────────────────────────────────────

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  actorRole: text('actor_role'),
  action: adminActionEnum('action').notNull(),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetEmail: text('target_email'),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  auditActorIdx: index('admin_audit_logs_actor_idx').on(table.actorId),
  auditTargetIdx: index('admin_audit_logs_target_idx').on(table.targetUserId),
  auditActionIdx: index('admin_audit_logs_action_idx').on(table.action),
  auditCreatedAtIdx: index('admin_audit_logs_created_at_idx').on(table.createdAt)
}));

export const userLoginHistory = pgTable('user_login_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  location: text('location'),
  success: boolean('success').notNull().default(true),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  loginHistoryUserIdx: index('user_login_history_user_idx').on(table.userId),
  loginHistoryCreatedAtIdx: index('user_login_history_created_at_idx').on(table.createdAt),
  loginHistorySuccessIdx: index('user_login_history_success_idx').on(table.userId, table.success)
}));

export const gdprRequests = pgTable('gdpr_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  type: gdprRequestTypeEnum('type').notNull(),
  status: gdprRequestStatusEnum('status').notNull().default('pending'),
  downloadUrl: text('download_url'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  gdprUserIdx: index('gdpr_requests_user_idx').on(table.userId),
  gdprStatusIdx: index('gdpr_requests_status_idx').on(table.status),
  gdprCreatedAtIdx: index('gdpr_requests_created_at_idx').on(table.createdAt)
}));

export const userMfaSettings = pgTable('user_mfa_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  method: mfaMethodEnum('method').notNull().default('totp'),
  isEnabled: boolean('is_enabled').notNull().default(false),
  secret: text('secret'),
  backupCodes: jsonb('backup_codes').$type<string[]>().notNull().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const adminApiKeys = pgTable('admin_api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  apiKeyHashIdx: index('admin_api_keys_key_hash_idx').on(table.keyHash),
  apiKeyCreatedByIdx: index('admin_api_keys_created_by_idx').on(table.createdBy)
}));

export const userCustomFields = pgTable('user_custom_fields', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  customFieldUserIdx: index('user_custom_fields_user_idx').on(table.userId),
  customFieldKeyIdx: index('user_custom_fields_key_idx').on(table.userId, table.key)
}));

// ─── Phase 2 Admin: Moderation + Notifications + Custom Roles ──────────────────────

export const moderationReports = pgTable('moderation_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportedUserId: uuid('reported_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportedBy: uuid('reported_by').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  category: moderationReportCategoryEnum('category').notNull().default('other'),
  status: moderationReportStatusEnum('status').notNull().default('pending'),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  reportedUserIdx: index('moderation_reports_reported_user_idx').on(table.reportedUserId),
  reportStatusIdx: index('moderation_reports_status_idx').on(table.status),
  reportCreatedAtIdx: index('moderation_reports_created_at_idx').on(table.createdAt)
}));

export const customRoles = pgTable('custom_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  customRoleNameUniqueIdx: uniqueIndex('custom_roles_name_unique_idx').on(table.name)
}));

// ─── Phase 3 Admin: Webhooks & Automation ──────────────────────────────────

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  eventTypes: jsonb('event_types').$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  retryCount: integer('retry_count').notNull().default(3),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  webhookEndpointUrlIdx: index('webhook_endpoints_url_idx').on(table.url),
  webhookEndpointActiveIdx: index('webhook_endpoints_active_idx').on(table.isActive)
}));

export const schema = {
  users,
  userProfiles,
  organizations,
  organizationMembers,
  organizationInvites,
  organizationAssignments,
  userTargetRoles,
  onboardingProgress,
  userResumes,
  resumeSkills,
  resumeExperiences,
  resumeProjects,
  resumeEducation,
  resumeAnalysisRuns,
  roadmapRuns,
  skillExams,
  examQuestions,
  userExams,
  skillProgress,
  refreshTokens,
  otpVerifications,
  subscriptions,
  invoices,
  paymentTransactions,
  webhookEvents,
  usageTracking,
  notifications,
  achievements,
  userXp,
  userFeatures,
  skillPerformance,
  userActivityLogs,
  userRecommendations,
  featureFlags,
  featureFlagOverrides,
  recommendationLogs,
  experiments,
  experimentVariants,
  userExperimentAssignments,
  // Phase 1 Admin
  adminAuditLogs,
  userLoginHistory,
  gdprRequests,
  userMfaSettings,
  adminApiKeys,
  userCustomFields,
  // Phase 2 Admin
  moderationReports,
  customRoles,
  // Phase 3 Admin
  webhookEndpoints
};
