CREATE TYPE "public"."admin_action" AS ENUM('create_user', 'update_user', 'suspend_user', 'unlock_user', 'delete_user', 'impersonate_user', 'export_data', 'delete_data', 'revoke_session', 'revoke_all_sessions', 'update_role', 'update_subscription', 'create_gdpr_request', 'manage_api_key', 'manage_custom_field', 'manage_mfa', 'update_feature_flag', 'manage_webhook', 'bulk_import', 'bulk_export', 'view_audit_log', 'send_notification', 'flag_user', 'resolve_report', 'create_role', 'update_role_perms');--> statement-breakpoint
CREATE TYPE "public"."admin_api_key_scope" AS ENUM('users:read', 'users:write', 'audit:read', 'gdpr:write', 'sessions:write');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('local', 'google', 'github');--> statement-breakpoint
CREATE TYPE "public"."billing_plan" AS ENUM('LITE', 'PRO', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."exam_question_type" AS ENUM('MCQ', 'FILL', 'CODE');--> statement-breakpoint
CREATE TYPE "public"."exam_skill_type" AS ENUM('STANDARD', 'PROGRAMMING_LANGUAGE');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('IN_PROGRESS', 'PASS', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."experiment_type" AS ENUM('roadmap', 'exam', 'recommendation');--> statement-breakpoint
CREATE TYPE "public"."gdpr_request_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gdpr_request_type" AS ENUM('export', 'delete');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('paid', 'failed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."learning_speed" AS ENUM('slow', 'medium', 'fast');--> statement-breakpoint
CREATE TYPE "public"."mfa_method" AS ENUM('totp', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."moderation_report_category" AS ENUM('spam', 'abuse', 'harassment', 'fraud', 'inappropriate_content', 'other');--> statement-breakpoint
CREATE TYPE "public"."moderation_report_status" AS ENUM('pending', 'reviewed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('resume', 'target_role', 'complete');--> statement-breakpoint
CREATE TYPE "public"."organization_assignment_status" AS ENUM('pending', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."organization_assignment_type" AS ENUM('skill', 'exam', 'project', 'roadmap');--> statement-breakpoint
CREATE TYPE "public"."organization_invite_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."organization_member_role" AS ENUM('admin', 'mentor', 'student');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('college', 'company', 'institute');--> statement-breakpoint
CREATE TYPE "public"."otp_type" AS ENUM('VERIFY_EMAIL', 'RESET_PASSWORD');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'authorized', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_action" AS ENUM('clicked', 'completed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'completed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_type" AS ENUM('skill', 'task', 'exam', 'project');--> statement-breakpoint
CREATE TYPE "public"."resume_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."skill_performance_status" AS ENUM('weak', 'improving', 'strong');--> statement-breakpoint
CREATE TYPE "public"."skill_progress_status" AS ENUM('NOT_STARTED', 'LEARNING', 'PASSED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('guest', 'user', 'support', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by" uuid,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"actor_role" text,
	"action" "admin_action" NOT NULL,
	"target_user_id" uuid,
	"target_email" text,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"skill_name" text DEFAULT '' NOT NULL,
	"type" "exam_question_type" NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT 'null'::jsonb,
	"answer" text NOT NULL,
	"placeholder" text,
	"starter_code" text,
	"language" text,
	"explanation" text,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"marks" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "experiment_type" NOT NULL,
	"status" "experiment_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_flag_id" uuid NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"is_enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 0 NOT NULL,
	"scheduled_rollout_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gdpr_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_by" uuid,
	"type" "gdpr_request_type" NOT NULL,
	"status" "gdpr_request_status" DEFAULT 'pending' NOT NULL,
	"download_url" text,
	"expires_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"razorpay_payment_id" text,
	"razorpay_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"reported_by" uuid,
	"reason" text NOT NULL,
	"category" "moderation_report_category" DEFAULT 'other' NOT NULL,
	"status" "moderation_report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_by" uuid,
	"type" "notification_type" DEFAULT 'in_app' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current_step" "onboarding_step" DEFAULT 'resume' NOT NULL,
	"resume_completed" boolean DEFAULT false NOT NULL,
	"target_role_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"type" "organization_assignment_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_skill_name" text,
	"target_exam_skill" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "organization_assignment_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "organization_member_role" DEFAULT 'student' NOT NULL,
	"token_hash" text NOT NULL,
	"status" "organization_invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_member_role" DEFAULT 'student' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "organization_type" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"otp_code" text NOT NULL,
	"type" "otp_type" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "billing_plan" NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"provider_signature" text,
	"receipt" text,
	"idempotency_key" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"failure_code" text,
	"failure_reason" text,
	"raw_order" jsonb,
	"raw_payment" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"action" "recommendation_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"device_info" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "resume_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"resume_version" integer NOT NULL,
	"status" "ai_run_status" DEFAULT 'pending' NOT NULL,
	"ats_score" integer,
	"matched_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"section_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_education" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"degree" text NOT NULL,
	"field" text,
	"start_year" text,
	"end_year" text,
	"grade" text,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"location" text,
	"start_date" text NOT NULL,
	"end_date" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"url" text,
	"bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'technical' NOT NULL,
	"proficiency" text DEFAULT 'intermediate' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"target_role" text NOT NULL,
	"duration_days" integer DEFAULT 90 NOT NULL,
	"roadmap_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ai_run_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"skill_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"skill_type" "exam_skill_type" DEFAULT 'STANDARD' NOT NULL,
	"difficulty_level" integer DEFAULT 1 NOT NULL,
	"pass_percentage" integer DEFAULT 65 NOT NULL,
	"mcq_count" integer DEFAULT 15 NOT NULL,
	"fill_blank_count" integer DEFAULT 10 NOT NULL,
	"coding_count" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"avg_score" integer DEFAULT 0 NOT NULL,
	"last_score" integer DEFAULT 0 NOT NULL,
	"status" "skill_performance_status" DEFAULT 'weak' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"status" "skill_progress_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"last_score" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "billing_plan" DEFAULT 'LITE' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"razorpay_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"usage_month" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"skill_name" text NOT NULL,
	"exam_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"total_marks" integer DEFAULT 0 NOT NULL,
	"percentage" integer DEFAULT 0 NOT NULL,
	"status" "exam_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"time_limit_seconds" integer DEFAULT 2700 NOT NULL,
	"pass_percentage" integer DEFAULT 65 NOT NULL,
	"answers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_snapshot_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluation_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_experiment_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_speed" "learning_speed" DEFAULT 'medium' NOT NULL,
	"consistency_score" integer DEFAULT 0 NOT NULL,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_login_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"location" text,
	"success" boolean DEFAULT true NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mfa_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" "mfa_method" DEFAULT 'totp' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"secret" text,
	"backup_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "recommendation_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'Primary resume' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "resume_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completeness_score" integer DEFAULT 0 NOT NULL,
	"ats_score" integer DEFAULT 0 NOT NULL,
	"section_scores" jsonb DEFAULT '{"summary":0,"skills":0,"experience":0,"projects":0,"education":0}'::jsonb NOT NULL,
	"keyword_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_target_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"level" text,
	"industry" text,
	"location_preference" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_xp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan" "billing_plan",
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"is_onboarded" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"lock_until" timestamp with time zone,
	"last_login" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"banned_by" uuid,
	"banned_reason" text,
	"banned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"event_key" text NOT NULL,
	"event_name" text NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"signature_hash" text NOT NULL,
	"status" "webhook_status" DEFAULT 'processing' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_api_keys" ADD CONSTRAINT "admin_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_skill_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."skill_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_feature_flag_id_feature_flags_id_fk" FOREIGN KEY ("feature_flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gdpr_requests" ADD CONSTRAINT "gdpr_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gdpr_requests" ADD CONSTRAINT "gdpr_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_assignments" ADD CONSTRAINT "organization_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_recommendation_id_user_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."user_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_analysis_runs" ADD CONSTRAINT "resume_analysis_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_analysis_runs" ADD CONSTRAINT "resume_analysis_runs_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_education" ADD CONSTRAINT "resume_education_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_education" ADD CONSTRAINT "resume_education_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_experiences" ADD CONSTRAINT "resume_experiences_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_experiences" ADD CONSTRAINT "resume_experiences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_projects" ADD CONSTRAINT "resume_projects_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_projects" ADD CONSTRAINT "resume_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_skills" ADD CONSTRAINT "resume_skills_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_skills" ADD CONSTRAINT "resume_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_runs" ADD CONSTRAINT "roadmap_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_runs" ADD CONSTRAINT "roadmap_runs_resume_id_user_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."user_resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_runs" ADD CONSTRAINT "roadmap_runs_analysis_run_id_resume_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."resume_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_exams" ADD CONSTRAINT "skill_exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_performance" ADD CONSTRAINT "skill_performance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_progress" ADD CONSTRAINT "skill_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_fields" ADD CONSTRAINT "user_custom_fields_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_fields" ADD CONSTRAINT "user_custom_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exams" ADD CONSTRAINT "user_exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exams" ADD CONSTRAINT "user_exams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exams" ADD CONSTRAINT "user_exams_exam_id_skill_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."skill_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experiment_assignments" ADD CONSTRAINT "user_experiment_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experiment_assignments" ADD CONSTRAINT "user_experiment_assignments_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_experiment_assignments" ADD CONSTRAINT "user_experiment_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_features" ADD CONSTRAINT "user_features_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_login_history" ADD CONSTRAINT "user_login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa_settings" ADD CONSTRAINT "user_mfa_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recommendations" ADD CONSTRAINT "user_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_resumes" ADD CONSTRAINT "user_resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_target_roles" ADD CONSTRAINT "user_target_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_user_id_idx" ON "achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achievements_user_type_idx" ON "achievements" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "admin_api_keys_key_hash_idx" ON "admin_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "admin_api_keys_created_by_idx" ON "admin_api_keys" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_target_idx" ON "admin_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_roles_name_unique_idx" ON "custom_roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "exam_questions_exam_id_idx" ON "exam_questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exam_questions_skill_name_idx" ON "exam_questions" USING btree ("skill_name");--> statement-breakpoint
CREATE INDEX "exam_questions_type_idx" ON "exam_questions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "exam_questions_difficulty_idx" ON "exam_questions" USING btree ("difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_variants_experiment_variant_unique_idx" ON "experiment_variants" USING btree ("experiment_id","variant_name");--> statement-breakpoint
CREATE INDEX "experiment_variants_experiment_id_idx" ON "experiment_variants" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_name_unique_idx" ON "experiments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiments_type_idx" ON "experiments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_flag_idx" ON "feature_flag_overrides" USING btree ("feature_flag_id");--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_user_idx" ON "feature_flag_overrides" USING btree ("feature_flag_id","user_id");--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_org_idx" ON "feature_flag_overrides" USING btree ("feature_flag_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_overrides_flag_user_unique_idx" ON "feature_flag_overrides" USING btree ("feature_flag_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_overrides_flag_org_unique_idx" ON "feature_flag_overrides" USING btree ("feature_flag_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flags_key_unique_idx" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "feature_flags_rollout_idx" ON "feature_flags" USING btree ("rollout_percentage");--> statement-breakpoint
CREATE INDEX "gdpr_requests_user_idx" ON "gdpr_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gdpr_requests_status_idx" ON "gdpr_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gdpr_requests_created_at_idx" ON "gdpr_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_subscription_id_idx" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_razorpay_payment_id_idx" ON "invoices" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "moderation_reports_reported_user_idx" ON "moderation_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "moderation_reports_status_idx" ON "moderation_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_reports_created_at_idx" ON "moderation_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_sent_by_idx" ON "notifications" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "onboarding_progress_current_step_idx" ON "onboarding_progress" USING btree ("current_step");--> statement-breakpoint
CREATE INDEX "organization_assignments_org_idx" ON "organization_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_assignments_type_idx" ON "organization_assignments" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "organization_assignments_status_idx" ON "organization_assignments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "organization_invites_org_idx" ON "organization_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_invites_email_idx" ON "organization_invites" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invites_token_hash_unique_idx" ON "organization_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_org_user_unique_idx" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_members_role_idx" ON "organization_members" USING btree ("organization_id","role");--> statement-breakpoint
CREATE INDEX "organizations_created_by_idx" ON "organizations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "organizations_type_idx" ON "organizations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "otp_verifications_lookup_idx" ON "otp_verifications" USING btree ("email","type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_provider_order_id_unique_idx" ON "payment_transactions" USING btree ("provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_provider_payment_id_unique_idx" ON "payment_transactions" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_user_idempotency_unique_idx" ON "payment_transactions" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_transactions_user_created_at_idx" ON "payment_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "recommendation_logs_user_id_idx" ON "recommendation_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recommendation_logs_recommendation_id_idx" ON "recommendation_logs" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "recommendation_logs_action_idx" ON "recommendation_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "recommendation_logs_created_at_idx" ON "recommendation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_analysis_runs_resume_version_unique_idx" ON "resume_analysis_runs" USING btree ("resume_id","resume_version");--> statement-breakpoint
CREATE INDEX "resume_analysis_runs_user_resume_idx" ON "resume_analysis_runs" USING btree ("user_id","resume_id");--> statement-breakpoint
CREATE INDEX "resume_analysis_runs_status_idx" ON "resume_analysis_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "resume_analysis_runs_created_at_desc_idx" ON "resume_analysis_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resume_education_resume_id_idx" ON "resume_education" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_education_user_id_idx" ON "resume_education" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resume_experiences_resume_id_idx" ON "resume_experiences" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_experiences_user_id_idx" ON "resume_experiences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resume_projects_resume_id_idx" ON "resume_projects" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_projects_user_id_idx" ON "resume_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resume_skills_resume_id_idx" ON "resume_skills" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_skills_user_name_idx" ON "resume_skills" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "roadmap_runs_user_resume_idx" ON "roadmap_runs" USING btree ("user_id","resume_id");--> statement-breakpoint
CREATE INDEX "roadmap_runs_status_idx" ON "roadmap_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "roadmap_runs_created_at_desc_idx" ON "roadmap_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "roadmap_runs_analysis_run_id_idx" ON "roadmap_runs" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE INDEX "skill_exams_org_idx" ON "skill_exams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "skill_exams_skill_difficulty_idx" ON "skill_exams" USING btree ("skill_name","difficulty_level");--> statement-breakpoint
CREATE INDEX "skill_exams_skill_type_idx" ON "skill_exams" USING btree ("skill_name","skill_type");--> statement-breakpoint
CREATE INDEX "skill_exams_created_at_idx" ON "skill_exams" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_performance_user_skill_unique_idx" ON "skill_performance" USING btree ("user_id","skill_name");--> statement-breakpoint
CREATE INDEX "skill_performance_user_id_idx" ON "skill_performance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_performance_status_idx" ON "skill_performance" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_progress_user_skill_unique_idx" ON "skill_progress" USING btree ("user_id","skill_name");--> statement-breakpoint
CREATE INDEX "skill_progress_user_status_idx" ON "skill_progress" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "skill_progress_updated_at_idx" ON "skill_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_razorpay_subscription_id_idx" ON "subscriptions" USING btree ("razorpay_subscription_id");--> statement-breakpoint
CREATE INDEX "usage_tracking_lookup_idx" ON "usage_tracking" USING btree ("user_id","feature","usage_month");--> statement-breakpoint
CREATE INDEX "user_activity_logs_user_id_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_activity_logs_action_idx" ON "user_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "user_activity_logs_created_at_idx" ON "user_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_custom_fields_user_idx" ON "user_custom_fields" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_custom_fields_key_idx" ON "user_custom_fields" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "user_exams_organization_idx" ON "user_exams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_exams_user_skill_idx" ON "user_exams" USING btree ("user_id","skill_name");--> statement-breakpoint
CREATE INDEX "user_exams_status_idx" ON "user_exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_exams_created_at_idx" ON "user_exams" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_experiment_assignments_user_experiment_unique_idx" ON "user_experiment_assignments" USING btree ("user_id","experiment_id");--> statement-breakpoint
CREATE INDEX "user_experiment_assignments_user_id_idx" ON "user_experiment_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_experiment_assignments_experiment_id_idx" ON "user_experiment_assignments" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "user_experiment_assignments_variant_id_idx" ON "user_experiment_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_features_user_id_unique_idx" ON "user_features" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_features_learning_speed_idx" ON "user_features" USING btree ("learning_speed");--> statement-breakpoint
CREATE INDEX "user_features_last_active_idx" ON "user_features" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "user_login_history_user_idx" ON "user_login_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_login_history_created_at_idx" ON "user_login_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_login_history_success_idx" ON "user_login_history" USING btree ("user_id","success");--> statement-breakpoint
CREATE INDEX "user_recommendations_user_id_idx" ON "user_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recommendations_user_status_idx" ON "user_recommendations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_recommendations_priority_idx" ON "user_recommendations" USING btree ("user_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "user_recommendations_user_type_title_status_unique_idx" ON "user_recommendations" USING btree ("user_id","type","title","status");--> statement-breakpoint
CREATE INDEX "user_resumes_user_id_idx" ON "user_resumes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_resumes_user_current_idx" ON "user_resumes" USING btree ("user_id","is_current","deleted_at");--> statement-breakpoint
CREATE INDEX "user_resumes_user_version_idx" ON "user_resumes" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "user_resumes_user_status_idx" ON "user_resumes" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_target_roles_user_current_idx" ON "user_target_roles" USING btree ("user_id","is_current");--> statement-breakpoint
CREATE INDEX "user_target_roles_user_created_at_idx" ON "user_target_roles" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_xp_user_id_idx" ON "user_xp" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_onboarded_idx" ON "users" USING btree ("is_onboarded");--> statement-breakpoint
CREATE INDEX "users_lock_until_idx" ON "users" USING btree ("lock_until");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_url_idx" ON "webhook_endpoints" USING btree ("url");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_active_idx" ON "webhook_endpoints" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_key_unique_idx" ON "webhook_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_order_id_idx" ON "webhook_events" USING btree ("provider_order_id");--> statement-breakpoint
CREATE INDEX "webhook_events_provider_payment_id_idx" ON "webhook_events" USING btree ("provider_payment_id");