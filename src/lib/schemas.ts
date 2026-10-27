import { z } from 'zod';

export const ErrorSchema = z
  .object({
    statusCode: z.number().int(),
    error: z.string(),
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .meta({ id: 'Error' });
