# API

Fastify 5 + TypeScript + Zod + Drizzle ORM (PostgreSQL), with DB-backed bearer-token sessions, product CRUD
and Swagger docs.

## Quick start

```bash
cp .env.example .env
docker compose up -d db      # Postgres on localhost:5432
pnpm install
pnpm db:migrate
pnpm dev                     # http://localhost:3000, docs at /docs
```

Or run everything in containers (runs migrations on startup):

```bash
docker compose up --build
```

## Environment

| Variable           | Default       | Description                                       |
| ------------------ | ------------- | ------------------------------------------------- |
| `DATABASE_URL`     | — (required)  | Postgres connection string                        |
| `HOST`             | `0.0.0.0`     | Interface to listen on                            |
| `PORT`             | `3000`        | Port to listen on                                 |
| `NODE_ENV`         | `development` | `development` enables pretty logs                 |
| `LOG_LEVEL`        | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `SESSION_TTL_DAYS` | `30`          | Session lifetime                                  |

Invalid values stop the server on startup with a message naming the variable.

## Endpoints

| Method | Path                  | Auth | Description                             |
| ------ | --------------------- | ---- | --------------------------------------- |
| POST   | `/auth/register`      | –    | Create user, return session token (201) |
| POST   | `/auth/login`         | –    | Return a new session token (200)        |
| POST   | `/auth/logout`        | ✓    | Revoke the current token (204)          |
| GET    | `/users/me`           | ✓    | Current user                            |
| GET    | `/products`           | –    | List products (pagination + search)     |
| GET    | `/products/:id`       | –    | One product                             |
| GET    | `/products/:id/image` | –    | Product image as binary                 |
| POST   | `/products`           | ✓    | Create a product (201)                  |
| PATCH  | `/products/:id`       | ✓    | Update your product                     |
| DELETE | `/products/:id`       | ✓    | Delete your product (204)               |
| GET    | `/health`             | –    | Liveness + DB check                     |

OpenAPI UI: `/docs` · JSON spec: `/docs/json`

CORS allows any origin.

## Errors

Every error response has the same shape:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Request validation failed",
  "issues": [{ "path": "email", "message": "Invalid email address" }] }
```

`issues` is only present on validation errors (400). 5xx responses always say `Internal Server Error`;
the details are only in the server log.

## Sessions

- Register/login respond with `{ user, token, expiresAt }`. The client stores `token` (e.g. in
  `localStorage`) and sends it as `Authorization: Bearer <token>` on every request.
- On a 401, the client should drop the stored token and send the user to the login page.
- In Swagger UI, click **Authorize** and paste the token (it persists across reloads).
- Only the SHA-256 hash of the token is stored in `sessions`, so a DB leak doesn't leak usable tokens.
- Sliding expiry: sessions last `SESSION_TTL_DAYS` and are extended server-side once less than half
  remains; the token never changes, so `expiresAt` from login is a lower bound.
- Logging in revokes any session the client already had; expired sessions are swept hourly.
- Protect a route with `preHandler: app.authenticate`, then read `request.user`.

## Products

- Anyone can browse; creating needs a login, and only the owner can update or delete (403 otherwise).
- `GET /products?page=1&pageSize=20&q=lamp&ownerId=<uuid>`: newest first, `pageSize` max 100, `q`
  matches name or description (case-insensitive). Responds with `{ items, page, pageSize, total, totalPages }`.
- Prices are integer cents (`priceCents: 1999` = 19.99).
- Send the image as a base64 data URL (`"data:image/png;base64,..."`; PNG, JPEG, WebP or GIF, max 2 MB;
  request bodies over 4 MB get a 413). On `PATCH`, `image: null` removes it and leaving `image` out keeps it.
- The image is stored base64 in the `products` table but never included in product JSON. Products carry
  `imageUrl` (e.g. `/products/<id>/image?v=...`) instead; prefix it with the API base URL and use it as `<img src>`.
- Deleting a user deletes their products.

## Tests

```bash
pnpm test         # or pnpm test:watch
```

Route tests (`src/**/*.test.ts`, Vitest) use `app.inject` with the db plugin and service modules mocked,
so they need no database. SQL in `*.service.ts` isn't covered by them. Test files and `src/test/` are
left out of `pnpm build`.

## Database changes

Edit `src/db/schema.ts`, then:

```bash
pnpm db:generate --name <change>   # writes SQL to ./drizzle
pnpm db:migrate
```

## Layout

```
src/
  app.ts              buildApp(): plugins, error handler, routes
  server.ts           entry point + graceful shutdown
  config/env.ts       zod-validated environment
  db/                 schema, client, migrate script
  lib/                shared helpers (password hashing, DB errors, error schema)
  plugins/            db, auth (bearer token + sessions), swagger
  modules/<resource>/ *.routes.ts, *.schemas.ts, *.service.ts, *.routes.test.ts
  test/               test helpers: fake db plugin, fixtures
```
