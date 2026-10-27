import { STATUS_CODES } from 'node:http';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import authPlugin from './plugins/auth.js';
import dbPlugin from './plugins/db.js';
import swaggerPlugin from './plugins/swagger.js';

export interface BuildAppOptions {
  databaseUrl: string;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ databaseUrl, logger = true }: BuildAppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request validation failed',
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: issue.message ?? 'Invalid value',
        })),
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, 'Response serialization failed');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
      return reply.code(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Internal Server Error' });
    }

    return reply.code(statusCode).send({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message: error.message,
    });
  });

  await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(sensible);
  await app.register(swaggerPlugin);
  await app.register(dbPlugin, { connectionString: databaseUrl });
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usersRoutes, { prefix: '/users' });

  return app;
}
