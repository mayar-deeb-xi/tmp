import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeDb } from '../../test/fake-db.js';
import { buildTestApp } from '../../test/fixtures.js';

vi.mock('../../plugins/db.js', () => import('../../test/fake-db.js'));

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns ok when the database responds', async () => {
    fakeDb.execute.mockResolvedValue({ rows: [] });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(fakeDb.execute).toHaveBeenCalledOnce();
  });

  it('returns a generic 500 when the database is down', async () => {
    fakeDb.execute.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' });
  });
});
