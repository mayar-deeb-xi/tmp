import type { PublicUser, Session } from '../db/schema.js';
import { buildApp } from '../build-app.js';

export function buildTestApp() {
  return buildApp({ databaseUrl: 'postgres://unused', logger: false });
}

export const testUser: PublicUser = {
  id: '6f1c2a3e-8b4d-4c5e-9f60-7a8b9c0d1e2f',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const testSession: Session = {
  id: 'hashed-token',
  userId: testUser.id,
  expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  userAgent: null,
  ipAddress: null,
};

/** How dates look after JSON serialization. */
export const testUserJson = {
  ...testUser,
  createdAt: testUser.createdAt.toISOString(),
  updatedAt: testUser.updatedAt.toISOString(),
};
