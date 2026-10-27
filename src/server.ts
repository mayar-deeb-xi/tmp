import { buildApp } from './build-app.js';
import { env } from './config/env.js';

const app = await buildApp({
  databaseUrl: env.DATABASE_URL,
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'Error during shutdown');
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
}
