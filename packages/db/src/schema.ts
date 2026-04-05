import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const authProviderEnum = pgEnum('auth_provider', ['local', 'google', 'github']);
export const userRoleEnum = pgEnum('user_role', ['guest', 'free', 'pro', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const otpTypeEnum = pgEnum('otp_type', ['VERIFY_EMAIL', 'RESET_PASSWORD']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  authProvider: authProviderEnum('auth_provider').notNull().default('local'),
  role: userRoleEnum('role').notNull().default('guest'),
  status: userStatusEnum('status').notNull().default('active'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  emailIndex: index('users_email_idx').on(table.email)
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name'),
  targetRole: text('target_role'),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({})
});

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

export const schema = {
  users,
  userProfiles,
  refreshTokens,
  otpVerifications
};
