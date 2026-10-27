import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { publicUserColumns, users, type PublicUser } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password.js';
import type { LoginBody, RegisterBody } from './auth.schemas.js';

export class EmailTakenError extends Error {
  constructor() {
    super('Email is already registered');
  }
}

export async function registerUser(db: Database, input: RegisterBody): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash })
      .returning(publicUserColumns);
    return user!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError();
    throw error;
  }
}

/** Returns the user when the credentials are valid, otherwise null. */
export async function verifyCredentials(db: Database, input: LoginBody): Promise<PublicUser | null> {
  const [row] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!row) {
    await burnPasswordCheck(input.password);
    return null;
  }

  if (!(await verifyPassword(row.passwordHash, input.password))) return null;

  const { passwordHash: _passwordHash, ...user } = row;
  return user;
}
