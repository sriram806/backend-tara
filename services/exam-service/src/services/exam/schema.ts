import { sql } from 'drizzle-orm';
import { getDb } from '@thinkai/db';

export class ExamSchemaService {
  private static schemaCompatibilityPromise: Promise<void> | null = null;

  static async ensureSchemaCompatibility() {
    if (!this.schemaCompatibilityPromise) {
      this.schemaCompatibilityPromise = (async () => {
        const db = getDb();

        await db.execute(sql`
          DO $$ BEGIN
            CREATE TYPE exam_skill_type AS ENUM ('STANDARD', 'PROGRAMMING_LANGUAGE');
          EXCEPTION
            WHEN duplicate_object THEN NULL;
          END $$;
        `);

        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS organization_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS skill_type exam_skill_type NOT NULL DEFAULT 'STANDARD'`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS difficulty_level INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS pass_percentage INTEGER NOT NULL DEFAULT 65`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS mcq_count INTEGER NOT NULL DEFAULT 15`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS fill_blank_count INTEGER NOT NULL DEFAULT 10`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS coding_count INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_exams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_org_idx ON skill_exams (organization_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_skill_difficulty_idx ON skill_exams (skill_name, difficulty_level)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_skill_type_idx ON skill_exams (skill_name, skill_type)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_exams_created_at_idx ON skill_exams (created_at)`);

        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS exam_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS type exam_question_type`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS question TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS options JSONB DEFAULT NULL`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS placeholder TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS starter_code TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS language TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS explanation TEXT`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS difficulty INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS marks INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_skill_name_idx ON exam_questions (skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_type_idx ON exam_questions (type)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS exam_questions_difficulty_idx ON exam_questions (difficulty)`);

        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS organization_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS exam_id UUID`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS percentage INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS status exam_status NOT NULL DEFAULT 'IN_PROGRESS'`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER NOT NULL DEFAULT 2700`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS pass_percentage INTEGER NOT NULL DEFAULT 65`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS answers_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS question_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS evaluation_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS user_exams ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_organization_idx ON user_exams (organization_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_user_skill_idx ON user_exams (user_id, skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_status_idx ON user_exams (status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS user_exams_created_at_idx ON user_exams (created_at)`);

        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS skill_name TEXT NOT NULL DEFAULT ''`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS status skill_progress_status NOT NULL DEFAULT 'NOT_STARTED'`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS last_score INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`ALTER TABLE IF EXISTS skill_progress ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS skill_progress_user_skill_unique_idx ON skill_progress (user_id, skill_name)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_progress_user_status_idx ON skill_progress (user_id, status)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS skill_progress_updated_at_idx ON skill_progress (updated_at)`);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'skill_exams' AND column_name = 'skill'
            ) THEN
              UPDATE skill_exams
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'exam_questions' AND column_name = 'skill'
            ) THEN
              UPDATE exam_questions
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'user_exams' AND column_name = 'skill'
            ) THEN
              UPDATE user_exams
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);

        await db.execute(sql`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = 'skill_progress' AND column_name = 'skill'
            ) THEN
              UPDATE skill_progress
              SET skill_name = skill
              WHERE COALESCE(skill_name, '') = '' AND COALESCE(skill, '') <> '';
            END IF;
          END $$;
        `);
      })().catch((error) => {
        this.schemaCompatibilityPromise = null;
        throw error;
      });
    }

    return this.schemaCompatibilityPromise;
  }
}
