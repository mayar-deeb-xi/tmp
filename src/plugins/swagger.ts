import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';

export default fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'API',
          version: '0.1.0',
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    });

    // persistAuthorization keeps the pasted token across page reloads.
    await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { persistAuthorization: true } });
  },
  { name: 'swagger' },
);
