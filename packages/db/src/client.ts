import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema';

let queryClient: postgres.Sql | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isDatabaseConfigured(databaseUrl?: string): boolean {
  return Boolean(databaseUrl ?? process.env.DATABASE_URL);
}

export function getDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is required for Drizzle NeonDB connection');
  }

  if (!queryClient) {
    const requiresSsl = /sslmode=require/i.test(url) || /ssl=true/i.test(url);

    queryClient = postgres(url, {
      max: 5,
      prepare: false,
      ssl: requiresSsl ? 'require' : false
    });
    dbClient = drizzle(queryClient, { schema });
  }

  return dbClient as ReturnType<typeof drizzle<typeof schema>>;
}

export async function closeDbConnection() {
  if (queryClient) {
    await queryClient.end({ timeout: 5 });
    queryClient = null;
    dbClient = null;
  }
}
