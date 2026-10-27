import { z } from 'zod';

export const MAX_IMAGE_BYTES = 1024 * 1024;
// Base64 grows data by 4/3; leave headroom for the other JSON fields.
export const PRODUCT_BODY_LIMIT = 2 * 1024 * 1024;

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

const ImageDataUrlSchema = z
  .string()
  .regex(IMAGE_DATA_URL, 'Must be a base64 data URL of a PNG, JPEG, WebP or GIF image')
  .refine(
    (value) => Buffer.byteLength(value.slice(value.indexOf(',') + 1), 'base64') <= MAX_IMAGE_BYTES,
    `Image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
  )
  .meta({
    description: 'Base64 data URL, e.g. "data:image/png;base64,iVBORw0KGgo..."',
    // A 1x1 PNG; without an example, Swagger UI generates a long random string from the regex.
    example:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  });

/** Splits a data URL that already passed ImageDataUrlSchema. */
export function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const [, mimeType, base64] = IMAGE_DATA_URL.exec(dataUrl)!;
  return { mimeType: mimeType!, base64: base64! };
}

const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(5000);
const priceCents = z.number().int().min(0).max(2_147_483_647).describe('Price in cents, e.g. 1999 = 19.99');

export const CreateProductBodySchema = z.object({
  name,
  description: description.default(''),
  priceCents,
  image: ImageDataUrlSchema.nullable().optional(),
});

export const UpdateProductBodySchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    priceCents: priceCents.optional(),
    image: ImageDataUrlSchema.nullable().optional().describe('A new data URL replaces the image; null removes it'),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;
export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;

export const ProductParamsSchema = z.object({ id: z.uuid().meta({ example: '1d6e9f4a-3b2c-4e5d-8f7a-9c0b1e2d3f4a' }) });

export const ListProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional().describe('Case-insensitive search in name and description'),
  ownerId: z
    .uuid()
    .optional()
    .meta({ description: "Only this user's products", example: 'b3e1c7a2-5d4f-4c8e-9a1b-2f6d8e0c4a7b' }),
});

export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;

export const ProductSchema = z
  .object({
    id: z.uuid().meta({ example: '1d6e9f4a-3b2c-4e5d-8f7a-9c0b1e2d3f4a' }),
    ownerId: z.uuid().meta({ example: 'b3e1c7a2-5d4f-4c8e-9a1b-2f6d8e0c4a7b' }),
    name: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    imageUrl: z.string().nullable().describe('Path to GET the image from, relative to the API base URL'),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'Product' });

export const ProductResponseSchema = z.object({ product: ProductSchema });

export const ProductListSchema = z
  .object({
    items: z.array(ProductSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'ProductList' });
