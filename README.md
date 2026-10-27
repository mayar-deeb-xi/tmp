# API

Fastify 5 + TypeScript + Zod + Drizzle ORM (PostgreSQL), with DB-backed bearer-token sessions and Swagger docs.

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

## Endpoints

| Method | Path             | Auth | Description                          |
| ------ | ---------------- | ---- | ------------------------------------ |
| POST   | `/auth/register` | –    | Create user, return session token (201) |
| POST   | `/auth/login`    | –    | Return a new session token (200)     |
| POST   | `/auth/logout`   | ✓    | Revoke the current token (204)       |
| GET    | `/users/me`      | ✓    | Current user                         |
| GET    | `/health`        | –    | Liveness + DB check                  |

OpenAPI UI: `/docs` · JSON spec: `/docs/json`

## Sessions

- Register/login respond with `{ user, token, expiresAt }`. The client stores `token` (e.g. in
  `localStorage`) and sends it as `Authorization: Bearer <token>` on every request.
- On a 401, the client should drop the stored token and send the user to the login page.
- In Swagger UI, click **Authorize** and paste the token (it persists across reloads).
- CORS allows any origin.
- Only the SHA-256 hash of the token is stored in `sessions`, so a DB leak doesn't leak usable tokens.
- Sliding expiry: sessions last `SESSION_TTL_DAYS` and are extended server-side once less than half
  remains; the token never changes, so `expiresAt` from login is a lower bound.
- Logging in revokes any session the client already had; expired sessions are swept hourly.
- Protect a route with `preHandler: app.authenticate`, then read `request.user`.

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
  plugins/            db, auth (bearer token + sessions), swagger
  modules/<resource>/ *.routes.ts, *.schemas.ts, *.service.ts
```
