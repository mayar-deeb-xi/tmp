import { and, desc, eq, ilike, isNotNull, or, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { productColumns, products, type ProductRow } from '../../db/schema.js';
import {
  parseImageDataUrl,
  type CreateProductBody,
  type ListProductsQuery,
  type UpdateProductBody,
} from './products.schemas.js';

export class ProductNotFoundError extends Error {
  constructor() {
    super('Product not found');
  }
}

export class NotProductOwnerError extends Error {
  constructor() {
    super('You can only change your own products');
  }
}

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** undefined keeps the current image, null removes it, a data URL replaces it. */
function imageColumns(image: string | null | undefined) {
  if (image === undefined) return {};
  if (image === null) return { imageMimeType: null, imageBase64: null };
  const { mimeType, base64 } = parseImageDataUrl(image);
  return { imageMimeType: mimeType, imageBase64: base64 };
}

export async function listProducts(
  db: Database,
  { page, pageSize, q, ownerId }: ListProductsQuery,
): Promise<{ items: ProductRow[]; total: number }> {
  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(products.name, pattern), ilike(products.description, pattern))!);
  }
  if (ownerId) filters.push(eq(products.ownerId, ownerId));
  const where = and(...filters);

  const [items, total] = await Promise.all([
    db
      .select(productColumns)
      .from(products)
      .where(where)
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.$count(products, where),
  ]);

  return { items, total };
}

export async function getProduct(db: Database, id: string): Promise<ProductRow | null> {
  const [row] = await db.select(productColumns).from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

export async function getProductImage(db: Database, id: string): Promise<{ mimeType: string; base64: string } | null> {
  const [row] = await db
    .select({ mimeType: products.imageMimeType, base64: products.imageBase64 })
    .from(products)
    .where(and(eq(products.id, id), isNotNull(products.imageBase64)))
    .limit(1);
  // The products_image_complete check guarantees mimeType is set whenever base64 is.
  return row ? { mimeType: row.mimeType!, base64: row.base64! } : null;
}

export async function createProduct(db: Database, ownerId: string, input: CreateProductBody): Promise<ProductRow> {
  const { image, ...fields } = input;
  const [row] = await db
    .insert(products)
    .values({ ...fields, ownerId, ...imageColumns(image) })
    .returning(productColumns);
  return row!;
}

/** Tells apart a missing product from one owned by someone else, after an owner-scoped write matched nothing. */
async function missingOrForbidden(db: Database, id: string): Promise<Error> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  return row ? new NotProductOwnerError() : new ProductNotFoundError();
}

export async function updateProduct(
  db: Database,
  id: string,
  ownerId: string,
  input: UpdateProductBody,
): Promise<ProductRow> {
  const { image, ...fields } = input;
  const [row] = await db
    .update(products)
    .set({ ...fields, ...imageColumns(image) })
    .where(and(eq(products.id, id), eq(products.ownerId, ownerId)))
    .returning(productColumns);
  if (row) return row;
  throw await missingOrForbidden(db, id);
}

export async function deleteProduct(db: Database, id: string, ownerId: string): Promise<void> {
  const [row] = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.ownerId, ownerId)))
    .returning({ id: products.id });
  if (row) return;
  throw await missingOrForbidden(db, id);
}
