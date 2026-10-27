import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test/fixtures.js';

vi.mock('./db.js', () => import('../test/fake-db.js'));

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /docs/json', () => {
  it('generates the OpenAPI spec for every route', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().paths)).toEqual(
      expect.arrayContaining(['/auth/register', '/users/me', '/products/', '/products/{id}', '/products/{id}/image']),
    );
  });

  // Swagger UI otherwise generates a long random example from the regex.
  it('gives every regex-constrained field an example', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });

    const missing: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      if ('pattern' in node && !('example' in node)) missing.push(path);
      for (const [key, child] of Object.entries(node)) walk(child, `${path}/${key}`);
    };
    walk(res.json(), '');

    expect(missing).toEqual([]);
  });
});
