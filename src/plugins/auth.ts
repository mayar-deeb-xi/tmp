import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { PublicUser, Session } from '../db/schema.js';
import { deleteExpiredSessions, validateSessionToken } from '../modules/auth/session.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler that rejects with 401 unless the request has a valid session. */
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    user: PublicUser | null;
    session: Session | null;
    /** Raw session token from the `Authorization: Bearer <token>` header, if any. */
    sessionToken: string | undefined;
  }
}

const EXPIRED_SESSION_SWEEP_MS = 60 * 60 * 1000;

function readBearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export default fp(
  async (app) => {
    app.decorateRequest('user', null);
    app.decorateRequest('session', null);
    app.decorateRequest('sessionToken', {
      getter(this: FastifyRequest) {
        return readBearerToken(this.headers.authorization);
      },
    });

    app.decorate('authenticate', async (request: FastifyRequest) => {
      const token = request.sessionToken;
      if (!token) throw app.httpErrors.unauthorized('Authentication required');

      const result = await validateSessionToken(app.db, token);
      if (!result) throw app.httpErrors.unauthorized('Session expired or invalid');

      request.user = result.user;
      request.session = result.session;
    });

    const sweep = setInterval(() => {
      deleteExpiredSessions(app.db)
        .then((count) => count > 0 && app.log.info({ count }, 'Deleted expired sessions'))
        .catch((err: unknown) => app.log.error({ err }, 'Failed to delete expired sessions'));
    }, EXPIRED_SESSION_SWEEP_MS);
    sweep.unref();
    app.addHook('onClose', async () => clearInterval(sweep));
  },
  { name: 'auth', dependencies: ['db', '@fastify/sensible'] },
);
