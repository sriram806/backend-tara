CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
    CREATE TYPE auth_provider AS ENUM ('local', 'google', 'github');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('guest', 'free', 'pro', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'otp_type') THEN
    CREATE TYPE otp_type AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_plan') THEN
    CREATE TYPE billing_plan AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('paid', 'failed', 'pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('created', 'authorized', 'paid', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_status') THEN
    CREATE TYPE webhook_status AS ENUM ('processing', 'processed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM ('email', 'in_app');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_run_status') THEN
    CREATE TYPE ai_run_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resume_status') THEN
    CREATE TYPE resume_status AS ENUM ('draft', 'active', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_step') THEN
    CREATE TYPE onboarding_step AS ENUM ('resume', 'target_role', 'complete');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_type') THEN
    CREATE TYPE organization_type AS ENUM ('college', 'company', 'institute');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_member_role') THEN
    CREATE TYPE organization_member_role AS ENUM ('admin', 'mentor', 'student');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_invite_status') THEN
    CREATE TYPE organization_invite_status AS ENUM ('pending', 'accepted', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_assignment_type') THEN
    CREATE TYPE organization_assignment_type AS ENUM ('skill', 'exam', 'project', 'roadmap');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_assignment_status') THEN
    CREATE TYPE organization_assignment_status AS ENUM ('pending', 'active', 'completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'learning_speed') THEN
    CREATE TYPE learning_speed AS ENUM ('slow', 'medium', 'fast');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_performance_status') THEN
    CREATE TYPE skill_performance_status AS ENUM ('weak', 'improving', 'strong');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_type') THEN
    CREATE TYPE recommendation_type AS ENUM ('skill', 'task', 'exam', 'project');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_status') THEN
    CREATE TYPE recommendation_status AS ENUM ('pending', 'completed', 'dismissed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_action') THEN
    CREATE TYPE recommendation_action AS ENUM ('clicked', 'completed', 'ignored');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'experiment_status') THEN
    CREATE TYPE experiment_status AS ENUM ('active', 'paused', 'completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'experiment_type') THEN
    CREATE TYPE experiment_type AS ENUM ('roadmap', 'exam', 'recommendation');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exam_question_type') THEN
    CREATE TYPE exam_question_type AS ENUM ('MCQ', 'FILL', 'CODE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exam_status') THEN
    CREATE TYPE exam_status AS ENUM ('IN_PROGRESS', 'PASS', 'FAIL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_progress_status') THEN
    CREATE TYPE skill_progress_status AS ENUM ('NOT_STARTED', 'LEARNING', 'PASSED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  auth_provider auth_provider NOT NULL DEFAULT 'local',
  role user_role NOT NULL DEFAULT 'guest',
  status user_status NOT NULL DEFAULT 'active',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_onboarded_idx ON users (is_onboarded);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS user_target_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  level TEXT,
  industry TEXT,
  location_preference TEXT,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_target_roles_user_current_idx ON user_target_roles (user_id, is_current);
CREATE INDEX IF NOT EXISTS user_target_roles_user_created_at_idx ON user_target_roles (user_id, created_at);

CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_step onboarding_step NOT NULL DEFAULT 'resume',
  resume_completed BOOLEAN NOT NULL DEFAULT FALSE,
  target_role_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_progress_current_step_idx ON onboarding_progress (current_step);

CREATE TABLE IF NOT EXISTS user_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Primary resume',
  summary TEXT NOT NULL DEFAULT '',
  status resume_status NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  completeness_score INTEGER NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  ats_score INTEGER NOT NULL DEFAULT 0 CHECK (ats_score BETWEEN 0 AND 100),
  section_scores JSONB NOT NULL DEFAULT '{"summary":0,"skills":0,"experience":0,"projects":0,"education":0}'::jsonb,
  keyword_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_resumes_user_id_idx ON user_resumes (user_id);
CREATE INDEX IF NOT EXISTS user_resumes_user_current_idx ON user_resumes (user_id, is_current, deleted_at);
CREATE INDEX IF NOT EXISTS user_resumes_user_version_idx ON user_resumes (user_id, version);
CREATE INDEX IF NOT EXISTS user_resumes_user_status_idx ON user_resumes (user_id, status);

CREATE TABLE IF NOT EXISTS resume_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'technical',
  proficiency TEXT NOT NULL DEFAULT 'intermediate',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_skills_resume_id_idx ON resume_skills (resume_id);
CREATE INDEX IF NOT EXISTS resume_skills_user_name_idx ON resume_skills (user_id, name);

CREATE TABLE IF NOT EXISTS resume_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  location TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_experiences_resume_id_idx ON resume_experiences (resume_id);
CREATE INDEX IF NOT EXISTS resume_experiences_user_id_idx ON resume_experiences (user_id);

CREATE TABLE IF NOT EXISTS resume_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  url TEXT,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_projects_resume_id_idx ON resume_projects (resume_id);
CREATE INDEX IF NOT EXISTS resume_projects_user_id_idx ON resume_projects (user_id);

CREATE TABLE IF NOT EXISTS resume_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  field TEXT,
  start_year TEXT,
  end_year TEXT,
  grade TEXT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_education_resume_id_idx ON resume_education (resume_id);
CREATE INDEX IF NOT EXISTS resume_education_user_id_idx ON resume_education (user_id);

CREATE TABLE IF NOT EXISTS resume_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  resume_version INTEGER NOT NULL,
  status ai_run_status NOT NULL DEFAULT 'pending',
  ats_score INTEGER,
  matched_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  section_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resume_analysis_runs_resume_version_unique UNIQUE (resume_id, resume_version)
);

CREATE INDEX IF NOT EXISTS resume_analysis_runs_user_resume_idx ON resume_analysis_runs (user_id, resume_id);
CREATE INDEX IF NOT EXISTS resume_analysis_runs_status_idx ON resume_analysis_runs (status);
CREATE INDEX IF NOT EXISTS resume_analysis_runs_created_at_desc_idx ON resume_analysis_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS roadmap_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id UUID NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  analysis_run_id UUID NOT NULL REFERENCES resume_analysis_runs(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 90,
  roadmap_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status ai_run_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roadmap_runs_user_resume_idx ON roadmap_runs (user_id, resume_id);
CREATE INDEX IF NOT EXISTS roadmap_runs_status_idx ON roadmap_runs (status);
CREATE INDEX IF NOT EXISTS roadmap_runs_created_at_desc_idx ON roadmap_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS roadmap_runs_analysis_run_id_idx ON roadmap_runs (analysis_run_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  device_info TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  type otp_type NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otp_verifications_lookup_idx ON otp_verifications (email, type, created_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan billing_plan NOT NULL DEFAULT 'FREE',
  status subscription_status NOT NULL DEFAULT 'active',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  razorpay_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_idx ON subscriptions (razorpay_subscription_id);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status invoice_status NOT NULL DEFAULT 'pending',
  razorpay_payment_id TEXT,
  razorpay_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON invoices (user_id);
CREATE INDEX IF NOT EXISTS invoices_subscription_id_idx ON invoices (subscription_id);
CREATE INDEX IF NOT EXISTS invoices_razorpay_payment_id_idx ON invoices (razorpay_payment_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan billing_plan NOT NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_signature TEXT,
  receipt TEXT,
  idempotency_key TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'created',
  attempts INTEGER NOT NULL DEFAULT 1,
  failure_code TEXT,
  failure_reason TEXT,
  raw_order JSONB,
  raw_payment JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_transactions_provider_order_id_unique UNIQUE (provider_order_id),
  CONSTRAINT payment_transactions_provider_payment_id_unique UNIQUE (provider_payment_id),
  CONSTRAINT payment_transactions_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_transactions_user_created_at_idx ON payment_transactions (user_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  signature_hash TEXT NOT NULL,
  status webhook_status NOT NULL DEFAULT 'processing',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT webhook_events_event_key_unique UNIQUE (event_key)
);

CREATE INDEX IF NOT EXISTS webhook_events_provider_order_id_idx ON webhook_events (provider_order_id);
CREATE INDEX IF NOT EXISTS webhook_events_provider_payment_id_idx ON webhook_events (provider_payment_id);

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  usage_month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_tracking_lookup_idx ON usage_tracking (user_id, feature, usage_month);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS achievements_user_id_idx ON achievements (user_id);
CREATE INDEX IF NOT EXISTS achievements_user_type_idx ON achievements (user_id, type);

CREATE TABLE IF NOT EXISTS user_xp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_xp_user_id_idx ON user_xp (user_id);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type organization_type NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizations_created_by_idx ON organizations (created_by);
CREATE INDEX IF NOT EXISTS organizations_type_idx ON organizations (type);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role organization_member_role NOT NULL DEFAULT 'student',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_members_org_user_unique_idx UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_org_idx ON organization_members (organization_id);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_members_role_idx ON organization_members (organization_id, role);

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role organization_member_role NOT NULL DEFAULT 'student',
  token_hash TEXT NOT NULL,
  status organization_invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_invites_org_idx ON organization_invites (organization_id);
CREATE INDEX IF NOT EXISTS organization_invites_email_idx ON organization_invites (email);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invites_token_hash_unique_idx ON organization_invites (token_hash);

CREATE TABLE IF NOT EXISTS organization_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type organization_assignment_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_skill_name TEXT,
  target_exam_skill TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status organization_assignment_status NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_assignments_org_idx ON organization_assignments (organization_id);
CREATE INDEX IF NOT EXISTS organization_assignments_type_idx ON organization_assignments (organization_id, type);
CREATE INDEX IF NOT EXISTS organization_assignments_status_idx ON organization_assignments (organization_id, status);

CREATE TABLE IF NOT EXISTS skill_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  skill_name TEXT NOT NULL,
  difficulty_level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skill_exams_org_idx ON skill_exams (organization_id);
CREATE INDEX IF NOT EXISTS skill_exams_skill_difficulty_idx ON skill_exams (skill_name, difficulty_level);
CREATE INDEX IF NOT EXISTS skill_exams_created_at_idx ON skill_exams (created_at);

CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES skill_exams(id) ON DELETE CASCADE,
  type exam_question_type NOT NULL,
  question TEXT NOT NULL,
  options JSONB DEFAULT NULL,
  answer TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id);
CREATE INDEX IF NOT EXISTS exam_questions_type_idx ON exam_questions (type);
CREATE INDEX IF NOT EXISTS exam_questions_difficulty_idx ON exam_questions (difficulty);

CREATE TABLE IF NOT EXISTS user_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  skill_name TEXT NOT NULL,
  exam_id UUID NOT NULL REFERENCES skill_exams(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  total_marks INTEGER NOT NULL DEFAULT 0,
  percentage INTEGER NOT NULL DEFAULT 0,
  status exam_status NOT NULL DEFAULT 'IN_PROGRESS',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  time_limit_seconds INTEGER NOT NULL DEFAULT 2700,
  evaluation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_exams_organization_idx ON user_exams (organization_id);
CREATE INDEX IF NOT EXISTS user_exams_user_skill_idx ON user_exams (user_id, skill_name);
CREATE INDEX IF NOT EXISTS user_exams_status_idx ON user_exams (status);
CREATE INDEX IF NOT EXISTS user_exams_created_at_idx ON user_exams (created_at);

CREATE TABLE IF NOT EXISTS skill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  status skill_progress_status NOT NULL DEFAULT 'NOT_STARTED',
  last_score INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skill_progress_user_skill_unique_idx UNIQUE (user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS skill_progress_user_status_idx ON skill_progress (user_id, status);
CREATE INDEX IF NOT EXISTS skill_progress_updated_at_idx ON skill_progress (updated_at);

CREATE TABLE IF NOT EXISTS user_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learning_speed learning_speed NOT NULL DEFAULT 'medium',
  consistency_score INTEGER NOT NULL DEFAULT 0,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_features_user_id_unique_idx UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS user_features_learning_speed_idx ON user_features (learning_speed);
CREATE INDEX IF NOT EXISTS user_features_last_active_idx ON user_features (last_active_at);

CREATE TABLE IF NOT EXISTS skill_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  avg_score INTEGER NOT NULL DEFAULT 0,
  last_score INTEGER NOT NULL DEFAULT 0,
  status skill_performance_status NOT NULL DEFAULT 'weak',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT skill_performance_user_skill_unique_idx UNIQUE (user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS skill_performance_user_id_idx ON skill_performance (user_id);
CREATE INDEX IF NOT EXISTS skill_performance_status_idx ON skill_performance (status);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_activity_logs_user_id_idx ON user_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS user_activity_logs_action_idx ON user_activity_logs (action);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_at_idx ON user_activity_logs (created_at);

CREATE TABLE IF NOT EXISTS user_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type recommendation_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  status recommendation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_recommendations_user_id_idx ON user_recommendations (user_id);
CREATE INDEX IF NOT EXISTS user_recommendations_user_status_idx ON user_recommendations (user_id, status);
CREATE INDEX IF NOT EXISTS user_recommendations_priority_idx ON user_recommendations (user_id, priority);
CREATE UNIQUE INDEX IF NOT EXISTS user_recommendations_user_type_title_status_unique_idx ON user_recommendations (user_id, type, title, status);

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  scheduled_rollout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flags_key_unique_idx UNIQUE (key)
);

CREATE INDEX IF NOT EXISTS feature_flags_enabled_idx ON feature_flags (is_enabled);
CREATE INDEX IF NOT EXISTS feature_flags_rollout_idx ON feature_flags (rollout_percentage);

CREATE TABLE IF NOT EXISTS feature_flag_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flag_overrides_flag_user_unique_idx UNIQUE (feature_flag_id, user_id),
  CONSTRAINT feature_flag_overrides_flag_org_unique_idx UNIQUE (feature_flag_id, organization_id)
);

CREATE INDEX IF NOT EXISTS feature_flag_overrides_flag_idx ON feature_flag_overrides (feature_flag_id);
CREATE INDEX IF NOT EXISTS feature_flag_overrides_user_idx ON feature_flag_overrides (feature_flag_id, user_id);
CREATE INDEX IF NOT EXISTS feature_flag_overrides_org_idx ON feature_flag_overrides (feature_flag_id, organization_id);

CREATE TABLE IF NOT EXISTS recommendation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES user_recommendations(id) ON DELETE CASCADE,
  action recommendation_action NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recommendation_logs_user_id_idx ON recommendation_logs (user_id);
CREATE INDEX IF NOT EXISTS recommendation_logs_recommendation_id_idx ON recommendation_logs (recommendation_id);
CREATE INDEX IF NOT EXISTS recommendation_logs_action_idx ON recommendation_logs (action);
CREATE INDEX IF NOT EXISTS recommendation_logs_created_at_idx ON recommendation_logs (created_at);

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type experiment_type NOT NULL,
  status experiment_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experiments_name_unique_idx UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS experiments_status_idx ON experiments (status);
CREATE INDEX IF NOT EXISTS experiments_type_idx ON experiments (type);

CREATE TABLE IF NOT EXISTS experiment_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT experiment_variants_experiment_variant_unique_idx UNIQUE (experiment_id, variant_name)
);

CREATE INDEX IF NOT EXISTS experiment_variants_experiment_id_idx ON experiment_variants (experiment_id);

CREATE TABLE IF NOT EXISTS user_experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_experiment_assignments_user_experiment_unique_idx UNIQUE (user_id, experiment_id)
);

CREATE INDEX IF NOT EXISTS user_experiment_assignments_user_id_idx ON user_experiment_assignments (user_id);
CREATE INDEX IF NOT EXISTS user_experiment_assignments_experiment_id_idx ON user_experiment_assignments (experiment_id);
CREATE INDEX IF NOT EXISTS user_experiment_assignments_variant_id_idx ON user_experiment_assignments (variant_id);

CREATE TABLE IF NOT EXISTS system_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_metadata (key, value)
VALUES ('deployment_name', 'think_v1')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
