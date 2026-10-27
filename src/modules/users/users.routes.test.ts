import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, testSession, testUser, testUserJson } from '../../test/fixtures.js';
import { validateSessionToken } from '../auth/session.service.js';

vi.mock('../../plugins/db.js', () => import('../../test/fake-db.js'));
vi.mock('../auth/session.service.js');

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /users/me', () => {
  it('returns the current user for a valid session', async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({ user: testUser, session: testSession });

    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: testUserJson });
    expect(validateSessionToken).toHaveBeenCalledWith(expect.anything(), 'good-token');
  });

  it('never exposes the password hash', async () => {
    const userWithHash = { ...testUser, passwordHash: 'argon2-hash' };
    vi.mocked(validateSessionToken).mockResolvedValue({ user: userWithHash, session: testSession });

    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: 'Bearer good-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    expect(validateSessionToken).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-Bearer Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Authentication required');
    expect(validateSessionToken).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired or unknown session', async () => {
    vi.mocked(validateSessionToken).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: 'Bearer stale-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Session expired or invalid' });
  });
});
