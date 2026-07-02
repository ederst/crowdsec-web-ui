# Proxy Auth Mode (Minimal RBAC via External OIDC Proxy)

Add `AUTH_MODE=proxy` support so crowdsec-web-ui can delegate authentication to an
upstream reverse proxy (oauth2-proxy, Authelia, etc.) that sets request headers,
while keeping the existing `local` mode (password + passkey + built-in OIDC) intact.
The two modes are mutually exclusive; a single `AUTH_MODE` env var selects which is active.

## For Future Agents
As work proceeds: mark checkboxes `- [x]` as items complete; when a phase is done,
set its status to `Complete` and write its **Phase Summary** (what was done, key
decisions, anything needed to continue with zero context); run the phase's
**Verification Plan** and record the result before moving on. When all phases are
done, fill in **Final Recap** and **Deployment Plan**.

---

## Design Reference

### New env vars (proxy mode only)
| Var | Default | Purpose |
|-----|---------|---------|
| `AUTH_MODE` | `local` | `local` = current behaviour; `proxy` = trust upstream headers |
| `CROWDSEC_AUTH_PROXY_TRUSTED_IPS` | *(required)* | Comma-sep CIDRs/IPs the proxy sends from (e.g. `127.0.0.1/32,10.0.0.0/8`). Requests from outside list → 401 even with headers present. |
| `CROWDSEC_AUTH_PROXY_HEADER_USER` | `X-Auth-Request-User` | Header containing the username |
| `CROWDSEC_AUTH_PROXY_HEADER_EMAIL` | `X-Auth-Request-Email` | Header containing the email (optional, fallback for username) |
| `CROWDSEC_AUTH_PROXY_ROLE_SOURCE` | `groups` | `groups` = read groups header and map to role; `roles` = read role value directly |
| `CROWDSEC_AUTH_PROXY_HEADER_GROUPS` | `X-Auth-Request-Groups` | Groups header (used when `ROLE_SOURCE=groups`). Distinct from `CROWDSEC_AUTH_OIDC_GROUPS_CLAIM` which is a JWT claim name, not an HTTP header name. |
| `CROWDSEC_AUTH_PROXY_GROUPS_SEPARATOR` | `,` | Separator used by the proxy for multiple groups |
| `CROWDSEC_AUTH_PROXY_ADMIN_GROUPS` | *(empty)* | Comma-sep group names → admin role (when `ROLE_SOURCE=groups`) |
| `CROWDSEC_AUTH_PROXY_READ_ONLY_GROUPS` | *(empty)* | Comma-sep group names → read-only role (when `ROLE_SOURCE=groups`) |
| `CROWDSEC_AUTH_PROXY_UNMATCHED_ROLE` | `deny` | Fallback when no group matches: `deny`, `admin`, `read-only` (when `ROLE_SOURCE=groups`) |
| `CROWDSEC_AUTH_PROXY_HEADER_ROLES` | `X-Auth-Request-Roles` | Role header (used when `ROLE_SOURCE=roles`); expected values: `admin`, `read-only` |

**Why not reuse `CROWDSEC_AUTH_OIDC_ADMIN_GROUPS` etc.?** `getEffectiveConfig()` reads group settings from the DB first (written by the Settings UI), then falls back to env. In proxy mode the Settings UI is hidden, so any previously DB-stored OIDC group config would silently bleed into proxy role resolution with no way to clear it. Separate vars avoid this hidden coupling. The role-resolution *logic* (`resolveOidcRole`) is still shared in code.

### Behavioural contract in proxy mode
- **Setup phase**: skipped entirely. `/api/auth/status` always returns `setupRequired: false`.
- **Password / passkey / built-in OIDC routes**: return `405 Method Not Allowed` with `{ error: 'Unavailable in proxy auth mode' }`.
- **Authentication flow**: every request to a protected route → middleware reads configured headers → validates source IP → resolves role → creates/refreshes HMAC-signed session cookie (same mechanism as current, `authMethod: 'proxy'`).
- **Missing headers on protected route**: 401.
- **Untrusted source IP with auth headers**: 401 (headers ignored).
- **Logout**: clears session cookie only. No upstream redirect.
- **`/api/auth/status`**: returns `authMode: 'proxy'`; `oidcEnabled: false`; `passwordLoginDisabled: true`; `setupRequired: false`.

### Files touched
- `server/config.ts` — new types + env parsing
- `server/app-auth.ts` — proxy middleware, route gating, session bootstrap
- `client/src/contexts/AuthContext.tsx` — `authMode` field in `AuthStatus`
- `client/src/App.tsx` — skip setup redirect in proxy mode
- `client/src/pages/Login.tsx` — hide login UI in proxy mode
- `client/src/pages/Settings.tsx` — hide local-auth sections in proxy mode
- `server/config.test.ts` — proxy config parsing tests
- `server/app.test.ts` — proxy auth integration tests

---

## Phase 1: Config layer
Status: Not started

- [ ] Add `AuthMode = 'local' | 'proxy'` type to `server/config.ts`
- [ ] Add `ProxyRoleSource = 'groups' | 'roles'` type
- [ ] Add `ProxyAuthConfig` interface with all fields listed in design reference (includes own adminGroups/readOnlyGroups/unmatchedRole — not shared with OIDC config to avoid DB-setting bleed from `getEffectiveConfig()`)
- [ ] Add `parseAuthMode(value: string | undefined): AuthMode` — throws on invalid value, defaults to `'local'`
- [ ] Add `parseProxyRoleSource(value: string | undefined): ProxyRoleSource` — defaults to `'groups'`
- [ ] Add `parseProxyAuthConfig(env): ProxyAuthConfig` function reading all `CROWDSEC_AUTH_PROXY_*` vars; reuse existing `parseCsvEnv` and `parseOidcUnmatchedRole` helpers for the group-mapping fields
- [ ] Add `authMode: AuthMode` and `proxyAuth: ProxyAuthConfig` to `RuntimeConfig` interface
- [ ] Wire `parseAuthMode` + `parseProxyAuthConfig` into `createRuntimeConfig()`
- [ ] Propagate `authMode` and `proxyAuth` fields through to `DashboardAuthConfig` OR pass as separate fields to `createDashboardAuth()` (keep `DashboardAuthConfig` for local-mode fields only; add separate `authMode` + `proxyAuth` param to factory)
- [ ] Add `parseAuthMode` + `parseProxyAuthConfig` tests in `server/config.test.ts` covering: defaults, valid values, invalid values, TRUSTED_IPS CSV, ROLE_SOURCE variants

### Verification Plan
- `npm run test -- --testPathPattern=config` (or project's test runner) exits 0
- No TypeScript errors: `npm run typescript` (or `npx tsc --noEmit`) exits 0

### Phase Summary
_(write when phase completes)_

---

## Phase 2: Server — proxy auth middleware and route gating
Status: Not started

- [ ] Add `isIpTrusted(clientIp: string, trustedCidrs: string[]): boolean` pure function in `server/app-auth.ts`
  - Handle IPv4 CIDR (`a.b.c.d/n`) and exact match
  - Handle IPv6 if feasible with stdlib `net`; if not, document the limitation in a `// ponytail:` comment and open a follow-up
  - Empty `trustedCidrs` list → deny all (safe default)
- [ ] Add `resolveProxyRole(config: ProxyAuthConfig, headers: Record<string, string | undefined>): Role | null` pure function
  - `ROLE_SOURCE=groups`: parse groups header using configured separator → call existing `resolveOidcRole({ oidcAdminGroups: config.adminGroups, oidcReadOnlyGroups: config.readOnlyGroups, oidcUnmatchedRole: config.unmatchedRole }, groups)` — logic reused, config source separate
  - `ROLE_SOURCE=roles`: read roles header value → map `'admin'`/`'read-only'` directly; else apply `config.unmatchedRole`
- [ ] Add `extractProxyUsername(config: ProxyAuthConfig, headers: Record<string, string | undefined>): string | null`
  - Try `HEADER_USER`, fallback to `HEADER_EMAIL`, return `null` if both absent/empty
- [ ] Extend `AuthMethod` type: add `'proxy'`
- [ ] Extend `createDashboardAuth` options: accept `authMode: AuthMode` and `proxyAuth: ProxyAuthConfig`
- [ ] In proxy mode, replace `ensureAuth` logic:
  - Get client IP from `context.req.raw` (check `X-Forwarded-For` first, then raw socket — match existing `getPublicOrigin` pattern)
  - `isIpTrusted` check → 401 if fails
  - `extractProxyUsername` → 401 if absent
  - `resolveProxyRole(proxyAuth, headers)` → 401 if null (deny); reads group config exclusively from `proxyAuth`, not from `getEffectiveConfig()`
  - Upsert user via `database.upsertOidcUser(username, role)` (reuse existing method)
  - `createSession(context, user, 'proxy')` — reuses existing session signing
  - `context.set('user', session)` + `await next()`
- [ ] In `registerRoutes`, gate disabled routes in proxy mode:
  - Routes that return `405`: `POST /setup`, `POST /login`, `GET /oidc/login`, `GET /oidc/callback`, `POST /webauthn/login/options`, `POST /webauthn/login/verify`, `POST /webauthn/register/options`, `POST /webauthn/register/verify`, `POST /change-password`
  - `GET /status`: add `authMode`, set `setupRequired: false`, `oidcEnabled: false`, `passwordLoginDisabled: true` when in proxy mode
  - `GET /settings` in proxy mode: return stripped settings (no OIDC/password/passkey fields)
  - `PUT /settings` in proxy mode: return 405
  - `GET /passkeys`, `PATCH /passkeys/:id`, `DELETE /passkeys/:id` in proxy mode: 405
  - `POST /logout`: keep working (clear cookie only, same as current)
  - `GET /me`: keep working
- [ ] Add `authMode` field to `DashboardAuth` interface export
- [ ] Update `server/app.ts` call-site: pass `authMode` + `proxyAuth` to `createDashboardAuth`

### Verification Plan
- `npm run test -- --testPathPattern=app` exits 0 (existing tests still pass)
- Manually verify new proxy auth tests added below (Phase 4) pass

### Phase Summary
_(write when phase completes)_

---

## Phase 3: Frontend — proxy mode awareness
Status: Not started

- [ ] Add `authMode: 'local' | 'proxy'` to `AuthStatus` interface in `client/src/contexts/AuthContext.tsx`
- [ ] Add `authMode: 'local'` to `DEFAULT_STATUS` and `fallbackAuthContext`
- [ ] `client/src/App.tsx`: when `authMode === 'proxy'`, skip the `setupRequired` → `/setup` redirect (setup phase is bypassed server-side too, but defence-in-depth)
- [ ] `client/src/pages/Login.tsx`: when `authMode === 'proxy'`, render nothing or a brief "Authentication handled by your SSO provider" message — no password/passkey/OIDC login UI; the user should never land here in normal proxy flow (oauth2-proxy intercepts unauthenticated requests before the app sees them)
- [ ] `client/src/pages/Settings.tsx`: when `authMode === 'proxy'`, hide the Password Login, Passkeys, and OIDC Configuration sections entirely; show a notice "Auth managed externally via proxy"
- [ ] Verify `Sidebar.tsx` and `AuthContext.tsx` — no changes needed (username already comes from session which is populated by proxy middleware)

### Verification Plan
- `npm run test -- --testPathPattern=App|Login|Settings|Sidebar` exits 0
- TypeScript: `npm run typescript` exits 0

### Phase Summary
_(write when phase completes)_

---

## Phase 4: Tests
Status: Not started

### server/config.test.ts additions
- [ ] `parseAuthMode`: default `'local'`, valid `'proxy'`, invalid throws
- [ ] `parseProxyRoleSource`: default `'groups'`, valid `'roles'`, invalid throws
- [ ] `parseProxyAuthConfig`: all defaults wired correctly
- [ ] `parseProxyAuthConfig`: TRUSTED_IPS CSV parsed correctly
- [ ] `parseProxyAuthConfig`: adminGroups/readOnlyGroups/unmatchedRole parsed from `CROWDSEC_AUTH_PROXY_*` vars (not OIDC vars)
- [ ] `createRuntimeConfig`: `authMode` field present

### server/app-auth.ts unit tests (can live in `server/app.test.ts` or new `server/app-auth.test.ts`)
- [ ] `isIpTrusted`: exact IPv4 match, IPv4 CIDR match, out-of-CIDR deny, empty list deny
- [ ] `resolveProxyRole` (groups): admin group match, read-only match, no match + deny, no match + fallback role — delegates to existing `resolveOidcRole` with proxy-specific config struct
- [ ] `resolveProxyRole` (roles): direct `admin` header, direct `read-only` header, unknown value + deny
- [ ] `extractProxyUsername`: user header present, user absent fallback email, both absent → null

### server/app.test.ts integration additions (proxy mode)
- [ ] `GET /api/auth/status` in proxy mode returns `authMode: 'proxy'`, `setupRequired: false`
- [ ] `GET /api/auth/*` protected route with no headers → 401
- [ ] `GET /api/auth/*` with headers from untrusted IP → 401
- [ ] `GET /api/auth/*` with valid headers + trusted IP → session cookie set, 200
- [ ] `POST /api/auth/login` in proxy mode → 405
- [ ] `POST /api/auth/setup` in proxy mode → 405
- [ ] `GET /api/auth/oidc/login` in proxy mode → 405
- [ ] `POST /api/auth/logout` in proxy mode → clears cookie, 200
- [ ] Role resolved as `read-only` from groups header
- [ ] Role resolved as `admin` from roles header directly

### Verification Plan
- Full test suite: `npm test` exits 0
- Coverage does not regress below current threshold: `npm run coverage:check` exits 0

### Phase Summary
_(write when phase completes)_

---

## Final Recap
_(write when all phases complete)_

## Deployment Plan
_(write when all phases complete)_
