import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { publicUserColumns, sessions, users, type PublicUser, type Session } from '../../db/schema.js';

export const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface ValidatedSession {
  session: Session;
  user: PublicUser;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(db: Database, userId: string, meta: SessionMeta = {}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, ...meta });

  return { token, expiresAt };
}

export async function validateSessionToken(db: Database, token: string): Promise<ValidatedSession | null> {
  const id = hashToken(token);

  const [row] = await db
    .select({ session: sessions, user: publicUserColumns })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) return null;

  const now = Date.now();
  const { session, user } = row;

  if (session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Sliding expiration: extend once less than half of the lifetime remains.
  // The token itself stays the same, so the client doesn't need to update anything.
  if (session.expiresAt.getTime() - now < SESSION_TTL_MS / 2) {
    session.expiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt: session.expiresAt }).where(eq(sessions.id, id));
  }

  return { session, user };
}

export async function invalidateSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteExpiredSessions(db: Database): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return result.rowCount ?? 0;
}
