import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRow } from '../../db/schema.js';
import { buildTestApp, testSession, testUser } from '../../test/fixtures.js';
import { validateSessionToken } from '../auth/session.service.js';
import { MAX_IMAGE_BYTES } from './products.schemas.js';
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

vi.mock('../../plugins/db.js', () => import('../../test/fake-db.js'));
vi.mock('../auth/session.service.js');
// Keep the real error classes so the routes' instanceof checks still work.
vi.mock('./products.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./products.service.js')>()),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  getProductImage: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

// A 1x1 transparent PNG.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const productId = '0b9d5f8e-3c2a-4e1b-8f7d-6a5c4b3a2910';
const productUrl = `/products/${productId}`;
const auth = { authorization: 'Bearer good-token' };

const product: ProductRow = {
  id: productId,
  ownerId: testUser.id,
  name: 'Desk lamp',
  description: 'Warm light',
  priceCents: 1999,
  imageMimeType: 'image/png',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
};

const productJson = {
  id: productId,
  ownerId: testUser.id,
  name: 'Desk lamp',
  description: 'Warm light',
  priceCents: 1999,
  imageUrl: `/products/${productId}/image?v=${product.updatedAt.getTime()}`,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
};

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(validateSessionToken).mockResolvedValue({ user: testUser, session: testSession });
});

describe('GET /products', () => {
  it('returns a page of products with search applied', async () => {
    vi.mocked(listProducts).mockResolvedValue({ items: [product], total: 11 });

    const res = await app.inject({ method: 'GET', url: '/products?page=2&pageSize=5&q=lamp' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [productJson], page: 2, pageSize: 5, total: 11, totalPages: 3 });
    expect(listProducts).toHaveBeenCalledWith(expect.anything(), { page: 2, pageSize: 5, q: 'lamp' });
  });

  it('defaults to the first page of 20 and needs no login', async () => {
    vi.mocked(listProducts).mockResolvedValue({ items: [], total: 0 });

    const res = await app.inject({ method: 'GET', url: '/products' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    expect(listProducts).toHaveBeenCalledWith(expect.anything(), { page: 1, pageSize: 20 });
  });

  it('returns null imageUrl for products without an image', async () => {
    vi.mocked(listProducts).mockResolvedValue({ items: [{ ...product, imageMimeType: null }], total: 1 });

    const res = await app.inject({ method: 'GET', url: '/products' });

    expect(res.json().items[0].imageUrl).toBeNull();
  });

  it('rejects a page size over 100', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?pageSize=101' });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([expect.objectContaining({ path: 'pageSize' })]);
    expect(listProducts).not.toHaveBeenCalled();
  });
});

describe('GET /products/:id', () => {
  it('returns the product', async () => {
    vi.mocked(getProduct).mockResolvedValue(product);

    const res = await app.inject({ method: 'GET', url: productUrl });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ product: productJson });
    expect(getProduct).toHaveBeenCalledWith(expect.anything(), productId);
  });

  it('returns 404 for an unknown product', async () => {
    vi.mocked(getProduct).mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: productUrl });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Product not found' });
  });

  it('returns 400 for an id that is not a UUID', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/123' });

    expect(res.statusCode).toBe(400);
    expect(getProduct).not.toHaveBeenCalled();
  });
});

describe('GET /products/:id/image', () => {
  it('serves the decoded image bytes', async () => {
    vi.mocked(getProductImage).mockResolvedValue({ mimeType: 'image/png', base64: PNG_BASE64 });

    const res = await app.inject({ method: 'GET', url: `${productUrl}/image` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.rawPayload).toEqual(Buffer.from(PNG_BASE64, 'base64'));
  });

  it('returns 404 when the product has no image', async () => {
    vi.mocked(getProductImage).mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `${productUrl}/image` });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Product image not found');
  });
});

describe('POST /products', () => {
  const body = { name: ' Desk lamp ', description: 'Warm light', priceCents: 1999, image: PNG_DATA_URL };

  it('creates a product owned by the current user', async () => {
    vi.mocked(createProduct).mockResolvedValue(product);

    const res = await app.inject({ method: 'POST', url: '/products', payload: body, headers: auth });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ product: productJson });
    expect(createProduct).toHaveBeenCalledWith(expect.anything(), testUser.id, { ...body, name: 'Desk lamp' });
  });

  it('requires login', async () => {
    const res = await app.inject({ method: 'POST', url: '/products', payload: body });

    expect(res.statusCode).toBe(401);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('rejects images that are not base64 PNG/JPEG/WebP/GIF data URLs', async () => {
    for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not base64!', PNG_BASE64]) {
      const res = await app.inject({ method: 'POST', url: '/products', payload: { ...body, image }, headers: auth });

      expect(res.statusCode, image).toBe(400);
      expect(res.json().issues, image).toEqual([expect.objectContaining({ path: 'image' })]);
    }
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('rejects images over the size limit', async () => {
    const image = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`;

    const res = await app.inject({ method: 'POST', url: '/products', payload: { ...body, image }, headers: auth });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'image', message: 'Image must be at most 2 MB' }]);
  });

  it('returns 413 for bodies over the request limit', async () => {
    const image = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024).toString('base64')}`;

    const res = await app.inject({ method: 'POST', url: '/products', payload: { ...body, image }, headers: auth });

    expect(res.statusCode).toBe(413);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('rejects a negative or fractional price', async () => {
    for (const priceCents of [-1, 19.99]) {
      const res = await app.inject({
        method: 'POST',
        url: '/products',
        payload: { ...body, priceCents },
        headers: auth,
      });

      expect(res.statusCode, String(priceCents)).toBe(400);
    }
  });
});

describe('PATCH /products/:id', () => {
  it('updates the product', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ ...product, priceCents: 2499 });

    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: { priceCents: 2499 }, headers: auth });

    expect(res.statusCode).toBe(200);
    expect(res.json().product.priceCents).toBe(2499);
    expect(updateProduct).toHaveBeenCalledWith(expect.anything(), productId, testUser.id, { priceCents: 2499 });
  });

  it('passes image: null through so the image gets removed', async () => {
    vi.mocked(updateProduct).mockResolvedValue({ ...product, imageMimeType: null });

    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: { image: null }, headers: auth });

    expect(res.statusCode).toBe(200);
    expect(res.json().product.imageUrl).toBeNull();
    expect(updateProduct).toHaveBeenCalledWith(expect.anything(), productId, testUser.id, { image: null });
  });

  it("returns 403 for someone else's product", async () => {
    vi.mocked(updateProduct).mockRejectedValue(new NotProductOwnerError());

    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: { name: 'Mine now' }, headers: auth });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You can only change your own products',
    });
  });

  it('returns 404 for an unknown product', async () => {
    vi.mocked(updateProduct).mockRejectedValue(new ProductNotFoundError());

    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: { name: 'Lamp' }, headers: auth });

    expect(res.statusCode).toBe(404);
  });

  it('rejects an empty update', async () => {
    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: {}, headers: auth });

    expect(res.statusCode).toBe(400);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('requires login', async () => {
    const res = await app.inject({ method: 'PATCH', url: productUrl, payload: { name: 'Lamp' } });

    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /products/:id', () => {
  it('deletes the product', async () => {
    vi.mocked(deleteProduct).mockResolvedValue();

    const res = await app.inject({ method: 'DELETE', url: productUrl, headers: auth });

    expect(res.statusCode).toBe(204);
    expect(deleteProduct).toHaveBeenCalledWith(expect.anything(), productId, testUser.id);
  });

  it("returns 403 for someone else's product", async () => {
    vi.mocked(deleteProduct).mockRejectedValue(new NotProductOwnerError());

    const res = await app.inject({ method: 'DELETE', url: productUrl, headers: auth });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for an unknown product', async () => {
    vi.mocked(deleteProduct).mockRejectedValue(new ProductNotFoundError());

    const res = await app.inject({ method: 'DELETE', url: productUrl, headers: auth });

    expect(res.statusCode).toBe(404);
  });

  it('requires login', async () => {
    const res = await app.inject({ method: 'DELETE', url: productUrl });

    expect(res.statusCode).toBe(401);
    expect(deleteProduct).not.toHaveBeenCalled();
  });
});
