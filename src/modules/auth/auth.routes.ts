import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorSchema } from '../../lib/schemas.js';
import { AuthResponseSchema, LoginBodySchema, RegisterBodySchema } from './auth.schemas.js';
import { EmailTakenError, registerUser, verifyCredentials } from './auth.service.js';
import { createSession, invalidateSession, type SessionMeta } from './session.service.js';

function sessionMeta(request: FastifyRequest): SessionMeta {
  return { userAgent: request.headers['user-agent']?.slice(0, 512), ipAddress: request.ip };
}

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Register a new user and start a session',
        body: RegisterBodySchema,
        response: {
          201: AuthResponseSchema,
          400: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      let user;
      try {
        user = await registerUser(app.db, request.body);
      } catch (error) {
        if (error instanceof EmailTakenError) throw app.httpErrors.conflict(error.message);
        throw error;
      }

      const { token, expiresAt } = await createSession(app.db, user.id, sessionMeta(request));
      return reply.code(201).send({ user, token, expiresAt });
    },
  );

  app.post(
    '/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Log in with email and password',
        body: LoginBodySchema,
        response: {
          200: AuthResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const user = await verifyCredentials(app.db, request.body);
      if (!user) throw app.httpErrors.unauthorized('Invalid email or password');

      // Drop any session the client already had to prevent session fixation.
      if (request.sessionToken) await invalidateSession(app.db, request.sessionToken);

      const { token, expiresAt } = await createSession(app.db, user.id, sessionMeta(request));
      return { user, token, expiresAt };
    },
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'End the current session',
        security: [{ bearerAuth: [] }],
        response: {
          204: z.null().describe('Logged out'),
        },
      },
    },
    async (request, reply) => {
      if (request.sessionToken) await invalidateSession(app.db, request.sessionToken);
      return reply.code(204).send(null);
    },
  );
};

export default authRoutes;
