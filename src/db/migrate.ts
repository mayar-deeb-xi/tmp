import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env.js';
import { createDb } from './client.js';

// Resolves to <root>/drizzle from both src/db (tsx) and dist/db (compiled).
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

const { db, pool } = createDb(env.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied');
} finally {
  await pool.end();
}
