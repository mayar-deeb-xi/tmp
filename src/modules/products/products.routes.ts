import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ProductRow } from '../../db/schema.js';
import { ErrorSchema } from '../../lib/schemas.js';
import {
  CreateProductBodySchema,
  ListProductsQuerySchema,
  PRODUCT_BODY_LIMIT,
  ProductListSchema,
  ProductParamsSchema,
  ProductResponseSchema,
  UpdateProductBodySchema,
} from './products.schemas.js';
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductImage,
  listProducts,
  NotProductOwnerError,
  ProductNotFoundError,
  updateProduct,
} from './products.service.js';

function toProduct({ imageMimeType, ...row }: ProductRow) {
  // The version query changes whenever the product does, so browsers never show a stale cached image.
  const imageUrl = imageMimeType ? `/products/${row.id}/image?v=${row.updatedAt.getTime()}` : null;
  return { ...row, imageUrl };
}

const productsRoutes: FastifyPluginAsyncZod = async (app) => {
  function toHttpError(error: unknown): never {
    if (error instanceof ProductNotFoundError) throw app.httpErrors.notFound(error.message);
    if (error instanceof NotProductOwnerError) throw app.httpErrors.forbidden(error.message);
    throw error;
  }

  app.get(
    '/',
    {
      schema: {
        tags: ['products'],
        summary: 'List products, newest first',
        querystring: ListProductsQuerySchema,
        response: {
          200: ProductListSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request) => {
      const { page, pageSize } = request.query;
      const { items, total } = await listProducts(app.db, request.query);
      return { items: items.map(toProduct), page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
    },
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Get a product',
        params: ProductParamsSchema,
        response: {
          200: ProductResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request) => {
      const product = await getProduct(app.db, request.params.id);
      if (!product) throw app.httpErrors.notFound('Product not found');
      return { product: toProduct(product) };
    },
  );

  app.get(
    '/:id/image',
    {
      schema: {
        tags: ['products'],
        summary: 'Get the product image as binary',
        params: ProductParamsSchema,
        response: {
          // Buffers skip serialization; this schema only documents the binary body.
          200: z.any().meta({ type: 'string', format: 'binary' }),
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const image = await getProductImage(app.db, request.params.id);
      if (!image) throw app.httpErrors.notFound('Product image not found');
      return reply
        .type(image.mimeType)
        .header('cache-control', 'public, max-age=86400')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(image.base64, 'base64'));
    },
  );

  app.post(
    '/',
    {
      preHandler: app.authenticate,
      bodyLimit: PRODUCT_BODY_LIMIT,
      schema: {
        tags: ['products'],
        summary: 'Create a product',
        security: [{ bearerAuth: [] }],
        body: CreateProductBodySchema,
        response: {
          201: ProductResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          413: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      // authenticate guarantees a user.
      const product = await createProduct(app.db, request.user!.id, request.body);
      return reply.code(201).send({ product: toProduct(product) });
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: app.authenticate,
      bodyLimit: PRODUCT_BODY_LIMIT,
      schema: {
        tags: ['products'],
        summary: 'Update your product',
        security: [{ bearerAuth: [] }],
        params: ProductParamsSchema,
        body: UpdateProductBodySchema,
        response: {
          200: ProductResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          413: ErrorSchema,
        },
      },
    },
    async (request) => {
      const product = await updateProduct(app.db, request.params.id, request.user!.id, request.body).catch(
        toHttpError,
      );
      return { product: toProduct(product) };
    },
  );

  app.delete(
    '/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['products'],
        summary: 'Delete your product',
        security: [{ bearerAuth: [] }],
        params: ProductParamsSchema,
        response: {
          204: z.null().describe('Deleted'),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteProduct(app.db, request.params.id, request.user!.id).catch(toHttpError);
      return reply.code(204).send(null);
    },
  );
};

export default productsRoutes;
