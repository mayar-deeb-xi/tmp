import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErrorSchema } from '../../lib/schemas.js';
import { UserResponseSchema } from './users.schemas.js';

const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['users'],
        summary: 'Get the current user',
        security: [{ bearerAuth: [] }],
        response: {
          200: UserResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      // authenticate guarantees a user.
      return { user: request.user! };
    },
  );
};

export default usersRoutes;
