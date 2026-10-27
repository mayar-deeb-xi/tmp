import { z } from 'zod';

export const UserSchema = z
  .object({
    id: z.uuid().meta({ example: 'b3e1c7a2-5d4f-4c8e-9a1b-2f6d8e0c4a7b' }),
    email: z.email().meta({ example: 'ada@example.com' }),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'User' });

export const UserResponseSchema = z.object({ user: UserSchema });
