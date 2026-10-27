import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to Argon2id with OWASP-recommended parameters.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

// Used to spend the same amount of time on unknown emails as on wrong passwords,
// so login timing doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;

export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
