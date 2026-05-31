<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Auth + RBAC System

The dashboard ships with a database-backed auth + RBAC layer (Prisma + SQLite). Every API route except `/api/auth/login`, `/api/auth/csrf`, and `/api/health` is gated by `src/middleware.ts`.

## Login flow (high level)

1. Browser POSTs `/api/auth/login` with `{ username, password, totp? }`.
2. Server validates credentials with Argon2id, checks rate limit, optionally verifies TOTP.
3. On success: row is added to `Session`, `apd_session` cookie + CSRF token are returned, and an `auth:login:success` audit entry is written.
4. Client stores nothing in localStorage. `useCurrentUser()` (in `src/hooks/use-current-user.tsx`) hydrates the auth context by calling `GET /api/auth/me` and refreshes on window focus + 401.
5. Subsequent mutating requests must carry the `X-CSRF-Token` header. Use `useApiFetch()` to attach it automatically.

## Permission map

The single source of truth for endpoint → permission mapping is `src/lib/rbac/permission-map.ts`. The middleware looks up `(method, pathname)` and rejects with HTTP 403 if no entry exists (deny-by-default). Property test 4 (`src/lib/rbac/__tests__/permission-map.property.test.ts`) walks every `src/app/api/**/route.ts` file and asserts every exported method is registered.

When you add a new endpoint:
- Add a row to `permission-map.ts` with `{ method, pathPattern, permission, sectorScoped?, serviceTokenAllowed? }`.
- If the endpoint mutates a resource scoped to a sector and is reachable by Supervisor / PIC_Sektor, set `sectorScoped: true` so the middleware injects the sector filter.
- If the endpoint should be reachable by `ServiceAPDBackend.py`, also add the path to the service-token whitelist.

## Audit log

`src/lib/audit/audit-log.ts` exports `appendAuditLog`. The audit_log table is append-only — property test 12 (`src/lib/audit/__tests__/audit-append-only.property.test.ts`) asserts no handler calls `prisma.auditLog.update` or `delete`. The action vocabulary is the union exported by `src/lib/audit/action-types.ts`.

## Endpoints introduced by this system

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/csrf
GET    /api/auth/me
POST   /api/auth/change-password
POST   /api/auth/2fa/setup
POST   /api/auth/2fa/verify
POST   /api/auth/2fa/disable

GET    /api/users
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/:id/reset-password
POST   /api/users/:id/unlock

GET    /api/roles
POST   /api/roles
GET    /api/roles/:id
PUT    /api/roles/:id
DELETE /api/roles/:id

GET    /api/sectors
POST   /api/sectors
GET    /api/sectors/:id
PUT    /api/sectors/:id
DELETE /api/sectors/:id
PUT    /api/sectors/:id/users

GET    /api/audit-log
GET    /api/audit-log/export

POST   /api/settings/integrations/service-token
```

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite URL (default `file:../data/safeguard.db`). |
| `APD_SERVICE_TOKEN` | 32+ char token used by `ServiceAPDBackend.py`. Rotate via `/settings/integrations`. |
| `APD_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM (TOTP secret encryption). If missing, 2FA is disabled. |
| `BEHIND_PROXY` | Set to `cloudflare` when fronted by Cloudflare Tunnel. Triggers Trusted_Proxy_IPs validation and forces `Secure` cookie. |
| `NODE_ENV` | `production` enables Secure cookie, locks down logging. |

Generate scaffolding with `npm run setup:env`.

## Operational scripts

```bash
# One-time after first install or after changes to prisma/schema.prisma:
npx prisma migrate deploy
npm run seed                # idempotent — creates 5 default roles + admin user

# Migrate legacy JSON data into the database (one-shot, idempotent):
npm run migrate:json-to-db

# Recovery:
npm run reset:admin-password    # rotate admin password (prints new password once)
npm run purge:audit-log -- --older-than-days 365

# Hibp top-10k list update (offline):
npm run update:hibp-list
```

## Cloudflare Tunnel deployment

The single-laptop deployment uses a named Cloudflare Tunnel (`cloudflared`) so the dashboard is reachable from the internet without opening ports. See README.md for the full step-by-step setup including hostname routing and Windows service install. Loopback `http://127.0.0.1:3000` always works whether the tunnel is online or not.
