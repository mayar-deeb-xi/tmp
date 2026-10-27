import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness and database check',
        response: {
          200: z.object({ status: z.literal('ok') }),
        },
      },
    },
    async () => {
      await app.db.execute(sql`select 1`);
      return { status: 'ok' as const };
    },
  );
};

export default healthRoutes;
