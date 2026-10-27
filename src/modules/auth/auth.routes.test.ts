import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, testUser, testUserJson } from '../../test/fixtures.js';
import { EmailTakenError, registerUser, verifyCredentials } from './auth.service.js';
import { createSession, invalidateSession } from './session.service.js';

vi.mock('../../plugins/db.js', () => import('../../test/fake-db.js'));
vi.mock('./session.service.js');
// Keep the real EmailTakenError so the route's instanceof check still works.
vi.mock('./auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth.service.js')>()),
  registerUser: vi.fn(),
  verifyCredentials: vi.fn(),
}));

const session = { token: 'new-token', expiresAt: new Date('2026-12-01T00:00:00.000Z') };
const sessionJson = { token: 'new-token', expiresAt: '2026-12-01T00:00:00.000Z' };

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /auth/register', () => {
  const body = { email: 'Ada@Example.com', password: 'correct-horse', name: '  Ada Lovelace ' };

  it('creates the user and a session', async () => {
    vi.mocked(registerUser).mockResolvedValue(testUser);
    vi.mocked(createSession).mockResolvedValue(session);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: body,
      headers: { 'user-agent': 'vitest' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ user: testUserJson, ...sessionJson });
    expect(registerUser).toHaveBeenCalledWith(expect.anything(), {
      email: 'ada@example.com',
      password: 'correct-horse',
      name: 'Ada Lovelace',
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.anything(),
      testUser.id,
      expect.objectContaining({ userAgent: 'vitest' }),
    );
  });

  it('returns 409 when the email is taken', async () => {
    vi.mocked(registerUser).mockRejectedValue(new EmailTakenError());

    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: body });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'Email is already registered' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns 400 with issues for an invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'short', name: '' },
    });

    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Request validation failed' });
    expect(json.issues.map((issue: { path: string }) => issue.path).sort()).toEqual(['email', 'name', 'password']);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it('returns a generic 500 for unexpected errors', async () => {
    vi.mocked(registerUser).mockRejectedValue(new Error('relation "users" does not exist'));

    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: body });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('Internal Server Error');
  });
});

describe('POST /auth/login', () => {
  const body = { email: 'ada@example.com', password: 'correct-horse' };

  it('returns the user and a new session', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(testUser);
    vi.mocked(createSession).mockResolvedValue(session);

    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: body });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: testUserJson, ...sessionJson });
    expect(createSession).toHaveBeenCalledWith(expect.anything(), testUser.id, expect.any(Object));
    expect(invalidateSession).not.toHaveBeenCalled();
  });

  it('revokes the session the client already had', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(testUser);
    vi.mocked(createSession).mockResolvedValue(session);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: body,
      headers: { authorization: 'Bearer old-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(invalidateSession).toHaveBeenCalledWith(expect.anything(), 'old-token');
  });

  it('returns 401 for wrong credentials', async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);

    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: body });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns 400 when the password is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ada@example.com' } });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([expect.objectContaining({ path: 'password' })]);
    expect(verifyCredentials).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it('invalidates the current session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer current-token' },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(invalidateSession).toHaveBeenCalledWith(expect.anything(), 'current-token');
  });

  it('succeeds without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });

    expect(res.statusCode).toBe(204);
    expect(invalidateSession).not.toHaveBeenCalled();
  });
});
