import fp from 'fastify-plugin';
import { createDb, type Database } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface DbPluginOptions {
  connectionString: string;
}

export default fp<DbPluginOptions>(
  async (app, opts) => {
    const { db, pool } = createDb(opts.connectionString);

    // Fail fast on startup if the database is unreachable.
    await pool.query('select 1');

    app.decorate('db', db);
    app.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'db' },
);
