import { 
  ExamSchemaService,
  ExamSessionService,
  ExamTemplateService,
  ExamModerationService,
  ExamCertificateService,
  ExamAssignmentService,
  TemplateInput,
  BulkQuestionsInput,
  QuestionUpdateInput
} from './exam';

export class ExamService {
  static async ensureSchemaCompatibility() {
    return ExamSchemaService.ensureSchemaCompatibility();
  }

  static async getUserExamCatalog(userId: string) {
    return ExamSessionService.getUserExamCatalog(userId);
  }

  static async getOrCreateSession(userId: string, requestedSkillName?: string) {
    return ExamSessionService.getOrCreateSession(userId, requestedSkillName);
  }

  static async submitSession(userId: string, sessionId: string, answers: Record<string, string>) {
    return ExamSessionService.submitSession(userId, sessionId, answers);
  }

  static async scheduleRetake(userId: string, skillName: string) {
    return ExamSessionService.scheduleRetake(userId, skillName);
  }

  static async getSkillSummaries(userId: string) {
    return ExamSessionService.getSkillSummaries(userId);
  }

  static async listSkillRequests() {
    return ExamModerationService.listSkillRequests();
  }

  static async updateSkillRequestStatus(requestId: string, status: 'pending' | 'approved' | 'rejected' | 'implemented') {
    return ExamModerationService.updateSkillRequestStatus(requestId, status);
  }

  static async getExamAnalytics(skillName: string) {
    return ExamModerationService.getExamAnalytics(skillName);
  }

  static async getModerationOverview() {
    return ExamModerationService.getModerationOverview();
  }

  static async upsertTemplate(input: TemplateInput) {
    return ExamTemplateService.upsertTemplate(input);
  }

  static async listTemplates() {
    return ExamTemplateService.listTemplates();
  }

  static async listTemplateQuestions(skillName: string) {
    return ExamTemplateService.listTemplateQuestions(skillName);
  }

  static async generateAiQuestions(skillName: string, options: { count: number; difficulty: number; type: string }) {
    return ExamTemplateService.generateAiQuestions(skillName, options);
  }

  static async bulkUpsertQuestions(skillName: string, input: BulkQuestionsInput) {
    return ExamTemplateService.bulkUpsertQuestions(skillName, input);
  }

  static async updateQuestion(questionId: string, input: QuestionUpdateInput) {
    return ExamTemplateService.updateQuestion(questionId, input);
  }

  static async deleteQuestion(questionId: string) {
    return ExamTemplateService.deleteQuestion(questionId);
  }

  static async getCertificate(attemptId: string, userId: string) {
    return ExamCertificateService.getCertificate(attemptId, userId);
  }

  static async verifyCertificate(hash: string) {
    return ExamCertificateService.verifyCertificate(hash);
  }

  static async logProctoringEvent(userId: string, sessionId: string, event: string, metadata?: Record<string, unknown>) {
    return ExamSessionService.logProctoringEvent(userId, sessionId, event, metadata);
  }

  static async getAuditTrail(attemptId: string) {
    return ExamSessionService.getAuditTrail(attemptId);
  }

  static async assignExam(adminId: string, payload: { examId: string; userId?: string; teamId?: string; organizationId?: string; deadlineAt?: string; priority?: string }) {
    return ExamAssignmentService.assignExam(adminId, payload);
  }

  static async listUserAssignments(userId: string) {
    return ExamAssignmentService.listUserAssignments(userId);
  }

  static async getOrganizationOverview(orgId: string) {
    return ExamModerationService.getOrganizationOverview(orgId);
  }

  static async getUserSkillStats(userId: string) {
    return ExamSessionService.getUserSkillStats(userId);
  }

  static async getDashboardInsights(userId: string) {
    return ExamSessionService.getDashboardInsights(userId);
  }

  static async requestSkill(userId: string, skillName: string) {
    return ExamModerationService.requestSkill(userId, skillName);
  }

  static async getSkillSuggestions(query: string, limit = 10) {
    return ExamModerationService.getSkillSuggestions(query, limit);
  }
}
