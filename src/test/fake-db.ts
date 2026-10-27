import fp from 'fastify-plugin';
import { vi } from 'vitest';
import type { Database } from '../db/client.js';

/**
 * Stand-in for the real db plugin so route tests never open a Postgres connection.
 * Use it with `vi.mock('<path>/plugins/db.js', () => import('<path>/test/fake-db.js'))`.
 */
export const fakeDb = { execute: vi.fn() };

export default fp(
  async (app) => {
    app.decorate('db', fakeDb as unknown as Database);
  },
  { name: 'db' },
);
