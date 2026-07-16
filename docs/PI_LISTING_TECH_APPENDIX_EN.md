# PyCafé™ Technical Appendix — for Pi Network Listing & Review

> This document is a technical appendix submitted for the **Pi Network Mainnet listing / Launchpad review**
> of cafe.pi (PyCafé™). It demonstrates, **with source-code evidence**, the app's
> ① Pi policy compliance, ② Pi Browser compatibility, ③ payment & fund integrity,
> ④ security (KISA criteria), and ⑤ adoption of the K-DATA data standard.
>
> - As of: 2026-07-16
> - Stack: Next.js 16 (App Router) · React 19 · TypeScript 6 · Supabase · Vercel (Pro)
> - Every claim is backed by an actual file in the repository.

---

## 1. Overview

PyCafé™ is a global community & commerce platform whose **primary path is Pi account login and Pi payment**.

| Feature | Official name | Nature |
|---|---|---|
| Community (cafés · chat) | **PyCafé™** | Online community |
| Marketplace | **PyShop™** | P2P · O2O trade |
| Auto-translation | **PyTranslate™** | Multilingual communication |

**Top-priority design values** (stated at the very top of the repository `CLAUDE.md`):
1. Users must be able to **log in** with a Pi account inside Pi Browser.
2. Users must be able to **pay** with a Pi account inside Pi Browser.

Any change to authentication or payment is considered complete only after **verification on a real
device in Pi Browser**, preventing regressions.

---

## 2. Pi Network Policy Compliance — Listing Red Lines ⭐

The app satisfies all four prohibitions central to Pi Mainnet / Launchpad review.

### 2.1 Pi account login supported (no forced non-Pi login)
- The Pi SDK `authenticate()` is the primary authentication path. Google OAuth is only an
  **optional, supplementary link** and is never required to use the service.
- **Pi Sign-In (added 2026-07-08)**: regular browsers can also sign in with the **official Pi
  account** via `accounts.pinet.com` OAuth (verified on real devices across three journeys —
  desktop QR, mobile deep link, and Pi Browser SDK). This further strengthens the
  "Pi-account-first" identity model outside Pi Browser.
- Evidence: `src/components/pi-auth-provider.tsx` (Pi auth & session), `src/auth.ts` (Google is optional),
  `src/components/pi-oauth-login-button.tsx` (Pi Sign-In)

### 2.2 No non-Pi currency (no fiat / external-token payment path)
- All real payments are made **only in Pi**.
- **Bean** is an **internal store credit that cannot be exchanged externally**.
  - Fixed rate of `1 Pi = 100 Bean`, **integer-only**, no burning (off-chain USER↔platform circulation).
  - Bean is not a currency that competes with Pi; it is an internal point topped up using Pi.
- Evidence: `sql/067_bean_wallet.sql` (header comment L4–7: "Bean Token is an off-chain internal balance
  (store credit), fixed 1 Pi = 100 Bean, integer-only"), `src/lib/bean-shared.ts` (`BEAN_PER_PI = 100`)

### 2.3 No gambling / betting
- Betting features have been fully removed and price-quote elements are hidden; the codebase
  currently contains no gambling logic.

### 2.4 Branding compliance
- User-facing text consistently uses the official notation (PyCafé™ · PyShop™ · PyTranslate™).
  (Database code values, identifiers, and **Pi payment memo** keep their plain form for payment
  compatibility.)
- Evidence: the "Official brand notation" section of `CLAUDE.md`

### 2.5 Pi payment is Pi Browser–only
- Before entering payment, the app **pre-checks** for `window.Pi`, blocking payment attempts in
  ordinary browsers.
- Evidence: `src/components/pi-pay-button.tsx` (`window.Pi` guard right before payment)

---

## 3. Pi Browser Compatibility (Technical Core)

Pi Browser's WebView has a critical constraint: it **does not persist `Set-Cookie` in any form**.
PyCafé™ works around this structurally and cryptographically.

### 3.1 Overcoming cookie-less storage — dual auth via cookie OR `X-Pi-Token` header
- On token issuance, the server returns **both** a `pi_session` **cookie** and a **token field** in JSON.
- The client stores the token in `localStorage`, and `piFetch` automatically attaches it as the
  `X-Pi-Token` header (plus `credentials: 'include'`).
- The server `getSessionUser()` authenticates in order of **cookie first → `X-Pi-Token` header
  fallback + expiry check**.
- Evidence: `src/app/api/auth/pi/route.ts` (returns cookie + token together), `src/lib/pi-fetch.ts`
  (auto header attach), `src/lib/auth-check.ts` (dual-path verification)

### 3.2 Token security — HMAC-SHA256 + constant-time comparison
- Session tokens are signed with HMAC-SHA256 (tamper-proof) and verified with a `timingSafeEqual`
  constant-time comparison to defend against timing attacks.
- Evidence: `src/lib/pi-session-crypto.ts`

### 3.3 Client gate — preventing infinite loops
- Calling `redirect` on the server when `getSessionUser()` is null causes an **infinite loop** in
  Pi Browser. To prevent this, the app **delegates to a client component instead of redirecting**
  (e.g., `ClientChatRoom`).
- Evidence: `src/app/[locale]/chat/[roomId]/page.tsx`, `src/components/chat/client-chat-room.tsx`

### 3.4 Automatic recovery of incomplete payments
- On app hydration, `getIncompleteServerPayments()` is used to find pending payments and, on a
  best-effort basis, complete them if a txid exists or cancel them otherwise.
- Evidence: `src/components/pi-auth-provider.tsx`

---

## 4. Payment & Fund Integrity ("Zero tolerance for fund leakage")

Money-related data follows a principle of **zero loss · zero double-payment** with layered defenses.

### 4.1 Pi payment state machine + idempotency
- The asynchronous callback flow `createPayment → approve → complete` is handled as a clear state
  transition.
- The approve step anticipates `already_approved` and handles it idempotently; the complete step
  branches business logic by payment meta type (MPS_ESCROW / MPS_BOND / BEAN_CHARGE).
- Evidence: `src/app/api/payments/approve/route.ts`, `src/app/api/payments/complete/route.ts`

### 4.2 Automatic seller settlement (A2U) — double-send blocked at the source
- On order completion, an App→User (A2U) Pi transfer to the seller's wallet is performed automatically.
- **Layered idempotency**: checks both `release_txid` and the `RELEASE_OUT` · `pi_txid` rows in
  `mps_txn_hist` → already-settled orders are never re-sent. If A2U is disabled, the order is marked
  PENDING (graceful degradation).
- Evidence: `src/lib/mps-order.ts` (`settleOrder`), `src/lib/pi-a2u.ts`

### 4.3 Bean economy — accounting conservation identity
- Conservation identity: **issued (ΣCHARGE + Σmint) = circulating (ΣUSER) + collected
  (PLATFORM + REWARD_POOL + FOUNDATION)**
- `fn_bean_balance_check()` continuously verifies this identity, and in a healthy state the difference
  (diff) **must be exactly 0** (no tolerance).
- Evidence: `sql/088_bean_accounting_p0_p1_fix.sql`; strict `diff === 0` balance check in
  `src/app/api/admin/token/stats/route.ts`

### 4.4 Over-issuance blocked + non-negative balances
- When granting rewards, the source wallet is debited; if funds are insufficient, instead of a silent
  clamp the transaction **rolls back entirely** via a `CHECK(bean_amt >= 0)` violation (no creation of
  tokens out of nothing). No wallet can ever go negative.
- Evidence: `sql/088_bean_accounting_p0_p1_fix.sql`, `sql/069_bean_token_wallet.sql` (`CHECK(bean_amt >= 0)`)

### 4.5 Append-only ledger + atomic synchronization
- `bean_txn` (an append-only ledger) is the **source of truth**, while `bean_wlt` is a fast-read balance
  cache. `fn_bean_apply` synchronizes the two atomically within a single transaction using `FOR UPDATE`
  locks.
- Evidence: `sql/067_bean_wallet.sql`

### 4.6 Double-payment prevention
- Event rewards: `FOR UPDATE` lock on the reward-log row + a status gate (returns immediately if `PAID`).
- P2P transfers: sender and receiver wallets are locked in sorted order to avoid deadlocks.
- Evidence: `sql/095_fn_evt_grant_bean_reward.sql`, `sql/078_bean_p2p_transfer.sql`

---

## 5. Security (per the KISA 21-item criteria)

Canonical assessment document: `docs/PRD_2_SECURITY.md` (detailed evaluation against the Korean
MOIS/KISA 21 web-vulnerability items)

| Area | Measures |
|---|---|
| SQL injection | Supabase PostgREST parameter binding; `.or()` filter input sanitization |
| XSS | React auto-escaping; Markdown rendering with `skipHtml` |
| Authentication | HMAC-SHA256 Pi token (32+ char SECRET) · NextAuth JWT |
| Authorization | RBAC (ADMIN/MASTER/USER), server-side `isAdmin` gate |
| CSRF / session | SameSite cookies, 32+ char SECRET (validated by t3-env in `src/env.ts`) |
| File upload | Magic-byte validation + extension allowlist; isolated Supabase Storage |
| Transport encryption | HTTPS enforced (Vercel) |

> **Justification for disabling Supabase RLS**: all data access goes solely through the server-only
> `SUPABASE_SERVICE_ROLE_KEY`, and direct client use of the anon key is prohibited. Authorization is
> centralized in the server-side `getSessionUser()` / `isAdmin()` (model documented in
> `docs/PRD_2_SECURITY.md`).

---

## 6. Adoption of the K-DATA (Korea Data Agency) Data Architecture Standard ⭐

> **Government-recognized data standard compliance** — PyCafé™ adopts the official data-management
> methodology of the Korea Data Agency (K-DATA, 한국데이터산업진흥원) **from the outset** and enforces
> it with automation. Data standardization is the hardest area to retrofit; honoring it from day one is
> a decisive differentiator for long-term operations, auditability, and migration trust.
>
> Canonical framework: `docs/da/README.md` · `docs/da/데이터표준규칙.md` · `docs/da/품질점검기준서.md`

All four K-DATA data-management domains are implemented.

### 6.1 Data Standardization (standard dictionary)
- Maintains **standard word / standard domain / standard term** dictionaries, and enforces the column
  naming form `word(_word)_domain` (e.g., `bean_amt`, `reg_dtm`, `del_yn`).
- Unified compound abbreviations: REGR (registrant) · MODR (modifier) · PYMNT (payment) · CTGR (category).
- Enforced domain prefixes: `bean_` (Bean economy) · `sys_` (system) · `msg_` (messaging) · `std_`
  (standards) · `mps_` (marketplace).
- Admin screens: `/admin/std/words` · `/admin/std/domains` · `/admin/std/terms`

### 6.2 Data Modeling (top-down)
- Follows **top-down modeling**: conceptual (subject areas) → logical (based on the standard dictionary)
  → physical (DDL).
- Designs with domains separated by subject area.

### 6.3 Data Quality
- Inspects standard compliance and naming consistency via **P1/P2/P3 checklists** based on
  `docs/da/품질점검기준서.md`.
- Every table has the **four mandatory system columns**: `regr_id` (registrant) · `reg_dtm`
  (registered at) · `modr_id` (modifier) · `mod_dtm` (modified at) → **100% audit traceability**.
- **Logical-delete principle (`del_yn` + `del_dtm`); physical DELETE strictly forbidden** → permanent
  data retention.

### 6.4 Data Governance (automated enforcement)
- A `da-ddl-guard` Hook **automatically blocks** standard violations at the time `sql/*.sql` / DDL is
  written.
- Exceptions are allowed only via a `-- DA-APPROVED:` approval comment and are permanently tracked.
- A dedicated review governance (data-standard review and quality-audit roles) operates the standard.

> **Significance**: cafe.pi applies the K-DATA standard from its very first table and enforces it with a
> Hook, eliminating data technical debt at the source. This translates directly into trust at the
> scaling, audit, and migration stages.

---

## 7. Performance Engineering

Under Core Web Vitals targets (LCP < 2.5s · CLS < 0.1 · INP < 200ms), multiple optimization layers are
applied. (For security, exact thresholds, cache lifetimes, index structures, execution schedules, and
secrets are intentionally omitted from this document.)

### 7.1 Server-first rendering + parallel data fetching
- React Server Components (RSC) preload data on the server, eliminating client-side waterfalls.
- `Promise.all` parallel queries and a single consolidated member-count query remove N+1 queries.
- After the response is returned, non-critical work (e.g., mission evaluation) runs in the background via `after()`.
- Evidence: `src/lib/chat-room-list.ts`, `src/lib/event.ts`

### 7.2 Stale-While-Revalidate client caching
- Displays cached data instantly, then revalidates in the background — an SWR pattern implemented on
  localStorage (Pi Browser cannot rely on HTTP caching, so app-level caching is adopted).
- Concurrent identical requests are collapsed into one via in-memory dedup, preventing duplicate calls.
- Evidence: `src/lib/client-cache.ts`, `src/lib/chat-translate-dedup.ts`

### 7.3 Location (GPS) optimization
- Distance badges use a "quick mode" (cache-first, short timeout, no high-accuracy retry) so the list
  is never blocked by positioning.
- Live tracking ignores micro-movements below a meaningful threshold, avoiding unnecessary re-queries.
- Evidence: `src/lib/geo.ts`

### 7.4 Database optimization
- Adopts trigram (pg_trgm) GIN indexes as the standard for substring search, accelerating
  leading/middle/trailing wildcards.
- Partial indexes on active rows (excluding logical-deleted) improve index size and cache efficiency.
- Single-row lookups use `.maybeSingle()` to avoid fetching extra rows; a lazily-initialized server-only
  client and connection pooling improve cold-start and concurrency.

### 7.5 Bundle & rendering optimization
- Next.js 16 Turbopack and `dynamic` imports (`ssr: false`) for heavy chart libraries shrink the initial bundle.
- `next/image` optimization with restricted allowed origins, viewport-triggered loading
  (IntersectionObserver), and input debouncing are applied.
- Build-time validation (environment variables and locale cross-validation) prevents post-deploy runtime
  failures (500s).
- Evidence: `scripts/validate-locales.mjs`

### 7.6 Load & abuse protection (security-integrated)
- Applies path-differentiated rate limiting (sliding window), request body-size caps, and a `Retry-After`
  response on blocks.
- Heavy aggregations run as scheduled batches (cron) outside the user request path.
- *Exact thresholds, schedules, and secrets are not disclosed in this document for security reasons.*

---

## 8. Infrastructure & Operational Stability

- **Type-safe environment variables**: `src/env.ts` (t3-env) blocks missing/typed errors at build time.
- **Internationalization**: 189 active locales (66 fully translated languages, as of 2026-07-08) managed from a single source
  (`src/lib/locale-currency.ts` · `locale-country.ts`); at build time, `scripts/validate-locales.mjs`
  cross-validates messages ↔ currency ↔ country ↔ routing (build fails on any mismatch).
- **Graceful fallback**: runtime settings fall back to code constants even when the DB migration is not
  yet applied, enabling zero-downtime operation (e.g., gift presets via `getTipPresets` in
  `src/lib/bean.ts`).
- **Single Source of Truth**: UI and server validation reference the same function, structurally
  preventing validation mismatches (e.g., gift-amount validation — the UI buttons and `api/tips` both
  use the same `getTipPresets()`).

---

## 9. Conclusion

PyCafé™ resolves Pi Network's demanding constraints (cookie-less storage, asynchronous payment
callbacks, mobile NAT) through structural and cryptographic design; guarantees fund integrity with a
**triple defense of accounting conservation identity + CHECK constraints + idempotency**; and satisfies
all four listing red lines (Pi login · Pi-only payment · no gambling · branding). Beyond the immediate
listing requirements, it enforces the government-recognized K-DATA data standard from the outset through
automation, demonstrating a platform built for **long-term operational, audit, and scaling trust**.

---

### Appendix A. Index of Key Evidence Files

| Topic | Files |
|---|---|
| Pi auth (cookie/header dual) | `src/lib/pi-fetch.ts` · `src/lib/auth-check.ts` · `src/app/api/auth/pi/route.ts` |
| Token signing/verification | `src/lib/pi-session-crypto.ts` |
| Pi payment | `src/components/pi-pay-button.tsx` · `src/app/api/payments/approve/route.ts` · `.../complete/route.ts` |
| Incomplete-payment recovery | `src/components/pi-auth-provider.tsx` |
| Auto settlement (A2U) | `src/lib/mps-order.ts` · `src/lib/pi-a2u.ts` |
| Bean accounting | `sql/088_bean_accounting_p0_p1_fix.sql` · `sql/067_bean_wallet.sql` · `sql/069_bean_token_wallet.sql` |
| Idempotent reward/transfer | `sql/095_fn_evt_grant_bean_reward.sql` · `sql/078_bean_p2p_transfer.sql` |
| Security assessment | `docs/PRD_2_SECURITY.md` |
| K-DATA DA standard | `docs/da/README.md` · `docs/da/데이터표준규칙.md` · `docs/da/품질점검기준서.md` |
| Performance engineering | `src/lib/client-cache.ts` · `src/lib/geo.ts` · `src/lib/chat-room-list.ts` · `scripts/validate-locales.mjs` |
| Env / i18n validation | `src/env.ts` · `scripts/validate-locales.mjs` |
