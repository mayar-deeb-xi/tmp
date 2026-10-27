import { getTableColumns, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 hash of the session token; the raw token is only ever held by the client.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userAgent: text(),
    ipAddress: text(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId), index('sessions_expires_at_idx').on(t.expiresAt)],
);

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text().notNull().default(''),
    // Integer cents avoid floating-point rounding (1999 = 19.99).
    priceCents: integer().notNull(),
    // The image is kept as raw base64 (no "data:" prefix) next to its MIME type; both or neither are set.
    imageMimeType: text(),
    imageBase64: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('products_owner_id_idx').on(t.ownerId),
    index('products_created_at_idx').on(t.createdAt),
    check('products_price_cents_non_negative', sql`${t.priceCents} >= 0`),
    check('products_image_complete', sql`(${t.imageMimeType} is null) = (${t.imageBase64} is null)`),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Product = typeof products.$inferSelect;

const { passwordHash: _passwordHash, ...publicUserColumns } = getTableColumns(users);

/** Column selection that never includes the password hash. */
export { publicUserColumns };
export type PublicUser = Omit<User, 'passwordHash'>;

const { imageBase64: _imageBase64, ...productColumns } = getTableColumns(products);

/** Column selection without the (potentially large) image data. */
export { productColumns };
export type ProductRow = Omit<Product, 'imageBase64'>;
