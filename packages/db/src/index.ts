export type DatabaseProvider = 'neondb' | 'mongodb' | 'redis';

export type ConnectionHealth = {
  provider: DatabaseProvider;
  connected: boolean;
};

// Day 1 placeholder: concrete DB clients will be added in later milestones.
export const dbPlaceholder = {
  status: 'not-configured'
} as const;
