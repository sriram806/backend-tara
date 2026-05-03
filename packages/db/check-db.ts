import { getDb } from './src/client';
import { sql } from 'drizzle-orm';

async function check() {
  const db = getDb();
  try {
    const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log('Tables:', result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

check();
