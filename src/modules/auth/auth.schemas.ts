import { z } from 'zod';
import { UserSchema } from '../users/users.schemas.js';

const email = z.email().max(254).toLowerCase();

export const RegisterBodySchema = z.object({
  email,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});

export const LoginBodySchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const AuthResponseSchema = z
  .object({
    user: UserSchema,
    token: z.string().describe('Send as `Authorization: Bearer <token>` on authenticated requests'),
    expiresAt: z.date(),
  })
  .meta({ id: 'AuthResponse' });
