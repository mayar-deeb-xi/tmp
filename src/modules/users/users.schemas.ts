import { z } from 'zod';

export const UserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'User' });

export const UserResponseSchema = z.object({ user: UserSchema });
