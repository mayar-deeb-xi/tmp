import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db: Database = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
}
