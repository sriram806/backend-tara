import { sql } from 'drizzle-orm';
import { getDb } from '@thinkai/db';

export class SchemaCompatibilityService {
  private static compatibilityPromise: Promise<void> | null = null;

  static async ensure() {
    if (!this.compatibilityPromise) {
      this.compatibilityPromise = (async () => {
        const db = getDb();

        await db.execute(sql`ALTER TABLE IF EXISTS organization_assignments ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_target_roles ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_resumes ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Primary resume'`);
        await db.execute(sql`ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS achievements ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_recommendations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS user_recommendations_user_type_title_status_unique_idx
          ON user_recommendations (user_id, type, title, status)
        `);

        // ─── DAY1: Account lockout + moderation columns ────────────────────────
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS lock_until TIMESTAMPTZ`);
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ`);
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS users_lock_until_idx ON users (lock_until)`);

        // \u2500\u2500\u2500 DAY2: Moderation metadata on users \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_by UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_reason TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ`);

        // sentBy on notifications
        await db.execute(sql`ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS sent_by UUID`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_sent_by_idx ON notifications (sent_by)`);

        // moderationReports table
        await db.execute(sql`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_report_status') THEN
              CREATE TYPE moderation_report_status AS ENUM ('pending', 'reviewed', 'dismissed');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_report_category') THEN
              CREATE TYPE moderation_report_category AS ENUM ('spam', 'abuse', 'harassment', 'fraud', 'inappropriate_content', 'other');
            END IF;
          END $$;
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS moderation_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
            reason TEXT NOT NULL,
            category moderation_report_category NOT NULL DEFAULT 'other',
            status moderation_report_status NOT NULL DEFAULT 'pending',
            resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            resolved_at TIMESTAMPTZ,
            resolution_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS moderation_reports_reported_user_idx ON moderation_reports (reported_user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON moderation_reports (status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS moderation_reports_created_at_idx ON moderation_reports (created_at)`);

        // customRoles table
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS custom_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            permissions JSONB NOT NULL DEFAULT '[]',
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS custom_roles_name_unique_idx ON custom_roles (name)`);

        // admin_action enum additions
        await db.execute(sql`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_action') THEN
              CREATE TYPE admin_action AS ENUM (
                'create_user', 'update_user', 'suspend_user', 'unlock_user', 'delete_user',
                'impersonate_user', 'export_data', 'delete_data', 'revoke_session', 'revoke_all_sessions',
                'update_role', 'update_subscription', 'create_gdpr_request', 'manage_api_key',
                'manage_custom_field', 'manage_mfa', 'update_feature_flag', 'manage_webhook',
                'bulk_import', 'bulk_export', 'view_audit_log'
              );
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'send_notification';
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'flag_user';
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'resolve_report';
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'create_role';
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'update_role_perms';
            ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'manage_webhook';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$;
        `);

        // Phase 3 Admin tables
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS webhook_endpoints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            url TEXT NOT NULL,
            secret TEXT NOT NULL,
            event_types JSONB NOT NULL DEFAULT '[]',
            is_active BOOLEAN NOT NULL DEFAULT true,
            retry_count INTEGER NOT NULL DEFAULT 3,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS webhook_endpoints_url_idx ON webhook_endpoints (url)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS webhook_endpoints_active_idx ON webhook_endpoints (is_active)`);

        // ─── Phase 1 & 2 Enums ──────────────────────────────────────────────
        await db.execute(sql`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gdpr_request_type') THEN
              CREATE TYPE gdpr_request_type AS ENUM ('export', 'delete');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gdpr_request_status') THEN
              CREATE TYPE gdpr_request_status AS ENUM ('pending', 'processing', 'completed', 'failed');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mfa_method') THEN
              CREATE TYPE mfa_method AS ENUM ('totp', 'email', 'sms');
            END IF;
          END $$;
        `);

        // ─── Phase 1 Extended: Admin infrastructure tables ───────────────────
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
            actor_email TEXT,
            actor_role TEXT,
            action admin_action NOT NULL,
            target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            target_email TEXT,
            resource_type TEXT,
            resource_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}',
            ip_address TEXT,
            user_agent TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx ON admin_audit_logs (actor_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx ON admin_audit_logs (target_user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs (action)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at)`);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS user_login_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            ip_address TEXT,
            user_agent TEXT,
            location TEXT,
            success BOOLEAN NOT NULL DEFAULT TRUE,
            failure_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_login_history_user_idx ON user_login_history (user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_login_history_created_at_idx ON user_login_history (created_at)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_login_history_success_idx ON user_login_history (user_id, success)`);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS gdpr_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
            type gdpr_request_type NOT NULL,
            status gdpr_request_status NOT NULL DEFAULT 'pending',
            download_url TEXT,
            expires_at TIMESTAMPTZ,
            processed_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS gdpr_requests_user_idx ON gdpr_requests (user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS gdpr_requests_status_idx ON gdpr_requests (status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS gdpr_requests_created_at_idx ON gdpr_requests (created_at)`);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS user_mfa_settings (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            method mfa_method NOT NULL DEFAULT 'totp',
            is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            secret TEXT,
            backup_codes JSONB NOT NULL DEFAULT '[]',
            last_used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS admin_api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            scopes JSONB NOT NULL DEFAULT '[]',
            expires_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_api_keys_key_hash_idx ON admin_api_keys (key_hash)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_api_keys_created_by_idx ON admin_api_keys (created_by)`);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS user_custom_fields (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_custom_fields_user_idx ON user_custom_fields (user_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_custom_fields_key_idx ON user_custom_fields (user_id, key)`);

        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS system_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
        await db.execute(sql`
          INSERT INTO system_metadata (key, value)
          VALUES ('deployment_name', 'think_v1')
          ON CONFLICT (key) DO NOTHING;
        `);
      })().catch((error) => {
        this.compatibilityPromise = null;
        throw error;
      });
    }

    return this.compatibilityPromise;
  }
}
