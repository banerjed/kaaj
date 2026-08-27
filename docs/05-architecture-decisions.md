# Architecture Decisions

**Version:** 1.2
**Last Updated:** August 27, 2026
**Status:** Accepted

This document records the architectural decisions for the platform, and — more
importantly — the reasoning behind them. Several of these decisions reverse
earlier positions recorded elsewhere in this repository. Where that is the case,
the superseded position is stated explicitly so that nobody re-derives it.

---

## Table of Contents

1. [Context: what we are building and for whom](#1-context-what-we-are-building-and-for-whom)
2. [ADR-001: Modular monolith, not microservices](#adr-001-modular-monolith-not-microservices)
3. [ADR-002: PostgreSQL as the only datastore](#adr-002-postgresql-as-the-only-datastore)
4. [ADR-003: Shared schema multi-tenancy with row-level security](#adr-003-shared-schema-multi-tenancy-with-row-level-security)
5. [ADR-004: SvelteKit as the full stack](#adr-004-sveltekit-as-the-full-stack)
6. [ADR-005: Node LTS as the runtime](#adr-005-node-lts-as-the-runtime)
7. [ADR-006: Boring infrastructure](#adr-006-boring-infrastructure)
8. [ADR-007: Defer on-premise deployment](#adr-007-defer-on-premise-deployment)
9. [ADR-008: Supabase as the backend platform](#adr-008-supabase-as-the-backend-platform)
10. [ADR-009: Subdomain-routed database targets](#adr-009-subdomain-routed-database-targets)
11. [Superseded decisions](#superseded-decisions)
12. [Open questions](#open-questions)

---

## 1. Context: what we are building and for whom

The target customer is a **small-to-medium business** that does not want to
integrate multiple systems. The direct competitors are **Zoho** and **Odoo**,
both of which sell an integrated suite rather than a collection of tools.

Three consequences follow, and they drive every decision below:

1. **The product's value is that modules already talk to each other.** The
   customer buys the absence of integration work. Anything that makes
   cross-module features expensive to build attacks the value proposition
   directly.
2. **The market is price-sensitive.** Zoho competes at a price point that
   per-tenant infrastructure overhead cannot support. Per-tenant cost must
   amortize.
3. **The scarce resource is engineering time across 14 module specifications.**
   Breadth of working, integrated modules wins this market. Infrastructure
   sophistication does not.

What the target customer does *not* need: edge latency, scale-to-zero,
horizontal scale beyond one large database, or five-nines. Users are logged-in
business staff filling in forms and running reports. They tolerate 100ms.

---

## ADR-001: Modular monolith, not microservices

**Decision.** Modules are code boundaries — directories with clear interfaces —
inside a single deployable application backed by a single database.

**Supersedes.** `product-specification.md` previously specified
*"Microservices: Modules are independently deployable services / Each module
owns its domain data."*

### Why

The repository's own integration plan contradicts the microservices position on
two counts:

- `cross-module-integration-plan.md` specifies **"DIRECT FOREIGN KEY (Strong
  Link) — Enforced referential integrity"** across module boundaries.
  Referential integrity cannot be enforced across services with separate
  databases.
- **UC-1.1 (New Hire Onboarding)** writes to **eight modules** in one workflow:
  Employee Profile → Compensation → Payroll → Ticketing → User Groups → HR
  onboarding checklist → Accounting vendor record → AI Assistant.

In a monolith, UC-1.1 is one transaction: it all happens, or none of it does.
As microservices it is an eight-service distributed saga with compensating
transactions and eventual consistency — for no customer-visible benefit.

There is a second, independent argument. `module-ai-assistant.md` describes the
platform's clearest differentiator against Zoho and Odoo: an assistant that
answers questions spanning every module ("how much PTO do I have", "what is
this project's burn", "which invoices are unpaid for this client"). Against one
database that is a query. Across services it is a distributed query problem
without end.

### Consequences

- Cross-module workflows are ordinary transactions.
- Referential integrity across modules is enforced by the database.
- Module boundaries must be maintained by discipline and code review rather than
  by network boundaries. This is a real cost and it is the right trade.
- Scaling is vertical first. If one module ever genuinely needs independent
  scaling, it can be extracted later — but not before it is measured.

---

## ADR-002: PostgreSQL as the only datastore

**Decision.** PostgreSQL holds relational data, full-text search indexes, the
background job queue, and cached translations. Object storage (S3-compatible)
holds files. Nothing else.

**Amended by [ADR-008](#adr-008-supabase-as-the-backend-platform):** PostgreSQL,
object storage, and authentication are provided by Supabase. Sessions are
handled by Supabase Auth rather than a session table.

**Supersedes.** Redis (sessions, cache, queues), Bull/BullMQ, and Elasticsearch,
all previously specified in `product-specification.md`.

### Why

Every additional service is a service that must be operated, monitored, backed
up, upgraded, and — if a private deployment is ever sold — installed on someone
else's hardware. At the volumes this product will see for years, PostgreSQL
covers all of it:

| Need | PostgreSQL mechanism |
|---|---|
| Full-text search | `tsvector` columns + GIN indexes, maintained by trigger |
| Background jobs | Job table + `SELECT ... FOR UPDATE SKIP LOCKED` |
| Sessions | Supabase Auth (see ADR-008) |
| Cached translations | In-process cache, backed by the translations table |

Search-by-trigger has a property Elasticsearch does not: results are never
stale, because the index updates in the same transaction as the write.

### Consequences

- One backup, one restore, one point-in-time recovery story.
- Payroll runs and exports are CPU-bound and would block the event loop, so
  background work runs in a **separate worker process from the same image**
  (`--worker`), pulling from the job table.
- If search volume ever outgrows PostgreSQL FTS, a dedicated search service can
  be added — after it is measured, not before.

---

## ADR-003: Shared schema multi-tenancy with row-level security

**Decision.** One database, one schema. Every tenant-owned table carries
`tenant_id`. Isolation is enforced by PostgreSQL row-level security.

**Amended by [ADR-009](#adr-009-subdomain-routed-database-targets):** this
remains the default and the shared tier, but the database a request reaches is
now resolved per request from the subdomain. A dedicated database is the same
schema holding a single tenant row — `tenant_id` and RLS stay in place, so no
application code branches on tier.

### Why not database-per-tenant

Odoo — the closest competitor architecturally — runs one application process
against many PostgreSQL databases, routing by hostname. It is a legitimate
model with genuinely better isolation, and it makes private deployment trivial.

We diverge for **cost structure**. Per-tenant overhead (connections, memory,
per-database backup, and a migration loop across every tenant) does not
amortize, and it shows up on the invoice: Odoo runs roughly $25–38/user/month
while Zoho competes far below that. Odoo's well-known upgrade pain is the same
cost in a different currency. Serving SMBs at competitive prices requires the
shared-schema cost structure.

### Implementation rules

These are not suggestions. A mistake in any of them is a cross-tenant data leak.

1. **`tenant_id` on every tenant-owned table**, including child tables that
   could infer it through a parent foreign key. Redundant with the FK chain,
   and worth it: every query can filter without a join, and a missing filter
   becomes lintable.
2. **`tenant_id` leads every index.** `(tenant_id, status, created_at)`, never
   `(status, created_at)`. This is the single biggest determinant of query
   performance on a shared instance.
3. **`FORCE ROW LEVEL SECURITY`, and connect as a non-owner role.** RLS is
   silently bypassed by table owners. This is exactly how a system that
   "has RLS" turns out not to.
4. **One transaction per request, owned by the data layer.**
   `BEGIN; SET LOCAL app.tenant_id = ...; ... ; COMMIT;` Make it structurally
   impossible for a code path to skip, rather than a rule people remember.
5. **Tenant context resolved once**, in `hooks.server.ts`, into
   `event.locals.tenantId`. One choke point, from subdomain or session claim.
6. **Full-text search carries `tenant_id` in the predicate.** Search is where a
   cross-tenant leak is most likely to reach a user's screen.

### Consequences

- Migrations are **single and atomic** across all tenants. This is the largest
  operational advantage of this model and the reason it was chosen over
  per-tenant databases.
- Blast radius is shared: one bad migration or one runaway query affects every
  tenant. This is what the atomic migration is bought with. Mitigations are
  staged rollout, `pg_stat_statements`, and statement timeouts.
- Restoring a single tenant means extracting their rows, not rolling back the
  database. A per-tenant export/restore path must exist before the first
  customer needs it.

---

## ADR-004: SvelteKit as the full stack

**Decision.** SvelteKit is both the frontend and the backend. No separate API
service.

- `+page.server.ts` load functions and form actions for application pages
- `+server.ts` for the public REST API
- `$lib/server/` for data access — SvelteKit fails the build if client code
  imports it, which makes the server-only boundary structural rather than
  conventional
- Svelte 5 runes throughout, consistent with `03-perf_guide.md` and
  `04-mobile_guide.md`

**Supersedes.** *"API Layer: Node.js with Express or Fastify"* in
`product-specification.md`.

### Why

`api-endpoints.md` describes 37 endpoints: CRUD, dashboards, and CSV/PDF/Excel
exports, with nothing hard-real-time. A SvelteKit `load` function runs in the
same process as the PostgreSQL client, so a page's data is one round trip.
Putting a separate API service behind it adds an HTTP hop per page for no gain.
The separate service is a performance cost here, not merely extra complexity.

### Why not Go or Rust

This was seriously considered — a single static binary is an excellent
distribution story. It was ruled out by `validation-utils.js`, which exports
**33 validators** covering country-specific tax, bank, and identity formats:
`sanitizePAN`, `sanitizeAadhaar`, `sanitizeIFSC`, `sanitizeIBAN`,
`sanitizeUKNIN`, `sanitizeCanadaSIN`, `sanitizeItalyCodiceFiscale`,
`sanitizeSwedenPersonnummer`, and more. These must run **client-side** for
immediate form feedback and **server-side** as the authority.

In TypeScript that is one `import`. In Go it is 33 country-specific validators
maintained in two languages, where drift produces a wrong tax identifier on a
payslip rather than a cosmetic bug. The same argument applies to the 2,028 enum
values in `enumerations.json`.

This is a correctness constraint, not a preference, and it rules out any
non-TypeScript backend.

### Where performance actually comes from

For a CRUD-and-reporting application, runtime choice is worth single-digit
percentages. One N+1 query in the employee directory is worth 50x. In order of
impact:

1. `tenant_id` leading every index
2. Eliminating N+1 at the `load` boundary — one page, one query
3. Hand-written SQL (`postgres.js`) for anything with a join; no ORM on the
   accounting and payroll reporting paths, which is exactly where ORMs generate
   pathological queries
4. `pg_stat_statements` enabled from day one

---

## ADR-005: Node LTS as the runtime

**Decision.** Node LTS with `@sveltejs/adapter-node`.

### Why not Bun

Requests are database-bound; the runtime's share of a request is the small term,
and halving a small term keeps it small. Beyond that:

- There is **no official SvelteKit adapter for Bun**. The widely used community
  adapter has a reported bug where `ORIGIN` is not passed correctly, which
  **breaks form actions** — precisely the pattern this architecture rests on.
- Vite runs the dev server on Node regardless, so Bun would only be the
  production runtime. There is no development-loop benefit.

### Reversibility

`adapter-node` output runs under Bun (`bun ./build/index.js`). The adapter
decision and the runtime decision are separable, so this is a one-line change
if measurement ever justifies it.

Bun's genuinely interesting property is `bun build --compile`, which produces a
single standalone executable and cross-compiles to Linux (glibc and musl),
macOS, and Windows. That matters for **on-premise packaging**, not for the
shared tier — revisit it if and when ADR-007 is reversed.

---

## ADR-006: Boring infrastructure

**Decision.** Long-running Node containers on managed hosting, managed
PostgreSQL, S3-compatible object storage, and a CDN/WAF/DNS layer in front.

**Refined by [ADR-008](#adr-008-supabase-as-the-backend-platform):** the managed
PostgreSQL, object storage, and auth layer is Supabase. Supabase does not host
applications, so the SvelteKit container runs on a separate platform, colocated
in the same region.

**Supersedes.** Kubernetes/EKS, Lambda/ECS, Terraform, API Gateway, and
ElastiCache, all previously specified in `product-specification.md`.

### Why

Every hour spent on infrastructure is an hour not spent on module breadth, and
module breadth is what wins against Zoho and Odoo.

A significant amount of design effort went into Cloudflare-native options —
Workers, D1, Containers, Hyperdrive — before it became clear they were
optimizing for properties this product does not need. Edge latency and
scale-to-zero are worth nothing to logged-in business users on an always-warm
shared instance, and both impose real constraints (CPU limits, no interactive
transactions, a non-Node runtime). Cloudflare earns its place as CDN, WAF, DNS,
and object storage. Not as the application platform.

### Consequences

- The application is a standard Node container with no provider-specific
  dependencies. The hosting decision stays reversible.
- Scale vertically until measurement says otherwise.
- No orchestration platform, service mesh, or message broker is introduced until
  a measured problem requires one.

---

## ADR-007: Defer on-premise deployment

**Decision.** Build the shared multi-tenant tier only. Keep private deployment
architecturally available; do not build it until a customer has paid for it.

**Partially amended by [ADR-009](#adr-009-subdomain-routed-database-targets):**
a customer's *database* can now live in their own infrastructure while the
application stays shared. That is not the same as on-premise deployment, and
ADR-009 is explicit that it does not satisfy a sovereignty requirement — data in
transit and in memory still passes through our infrastructure. A customer who
needs genuine custody still needs the self-hosted appliance this ADR defers.

### Why

An on-premise requirement drove a large number of earlier constraints — ruling
out D1, ruling out Cloudflare Workers, ruling out Go, and forcing a two-runtime
test matrix. It is worth being precise about how much that requirement costs
before accepting it.

For SMBs choosing between Zoho and Odoo, self-hosting is rare. Zoho does not
offer it at all and is enormous. Odoo does, but it is used mainly by
implementation partners and larger customers.

### What keeps the door open

A private deployment is the **same artifact with a single tenant row**. Because
the schema, the runtime, and the isolation model are identical, the marginal
work to support it is packaging and an update path — not architecture. Nothing
in ADR-001 through ADR-006 forecloses it.

### What must be true before it is sold

- A versioned image plus a **forward-only, idempotent migration runner** with
  per-installation version tracking
- Expand/contract migrations, since code and schema cannot move atomically
  across installations
- A support policy covering a window of versions, not just the latest

---

## ADR-008: Supabase as the backend platform

**Decision.** Supabase provides PostgreSQL, authentication, and object storage.
The SvelteKit application is hosted separately and connects to Supabase Postgres
over a direct connection.

**Status.** Accepted. Refines ADR-002 and ADR-006; does not change ADR-001,
ADR-003, ADR-004 or ADR-005.

### What we use

| Capability | Supabase component | Notes |
|---|---|---|
| Relational database | Supabase Postgres | Full SQL, our own migrations |
| Authentication | Supabase Auth (GoTrue) | Signup, login, password reset, MFA, OAuth/SSO |
| Object storage | Supabase Storage | Documents, attachments, exports |
| Migrations | Supabase CLI | Versioned, forward-only |

Auth is the decisive reason for this choice. Signup, login, password reset, MFA,
OAuth/SSO, and session lifecycle are weeks of security-sensitive work that we
gain outright, with 100,000 monthly active users included at the Pro tier.

### What we deliberately do not use

- **PostgREST as the primary API.** It exposes tables; our domain needs
  transactional business *operations*. A payroll run touches many tables under
  one transaction with real rules, and pushing that into plpgsql is a poor place
  to maintain payroll across 19 locales. It also strands the 33 JavaScript
  validators in `validation-utils.js`, which must be the server-side authority —
  the same duplication argument that ruled out Go in ADR-004. Acceptable for
  simple administrative reads only.
- **Edge Functions.** Deno is a second runtime. We already have a Node server;
  splitting business logic across two runtimes is strictly worse.
- **Realtime.** "Real-time" in the module specifications means fresh-on-load and
  polling. Do not take the dependency until a feature genuinely requires it.
- **pgmq / pg_cron.** The jobs table with `SKIP LOCKED` from ADR-002 is equally
  capable and keeps ADR-007 cheap.

### Why we still need the SvelteKit server

A "no backend" design fails on five counts specific to this product:

1. Payroll and accounting are multi-table transactional operations, not table
   writes.
2. The 33 country-specific validators in `validation-utils.js` are JavaScript
   and must run server-side as the authority.
3. `UC-1.1` writes to eight modules in one transaction — one server call, not
   eight client round trips that can half-fail.
4. The AI assistant holds model credentials, builds cross-module context, and
   executes tool calls behind permission checks.
5. Third-party integration secrets (payroll providers, banks, email) need a
   server-side home.

### Connection and tenant context

Use the **direct connection on port 5432** (or Supavisor session mode if the
host is IPv4-only). We run long-lived containers, so the transaction pooler on
6543 is the wrong tool — it is designed for serverless and does not support
prepared statements.

Connecting directly bypasses PostgREST, so the JWT claims that Supabase RLS
conventions rely on are not populated automatically. The data layer sets them:

```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"sub":"...","app_metadata":{"tenant_id":"..."}}';
-- queries
COMMIT;
```

`auth.jwt()` reads `current_setting('request.jwt.claims')`, so policies written
in the Supabase idiom behave identically whether a query arrives via PostgREST
or via our own connection. ADR-003's one-transaction-per-request rule is
unchanged; it sets `request.jwt.claims` rather than a bespoke setting.

Two supporting pieces:

- **`tenant_id` is stamped into the JWT** by a `custom_access_token_hook`
  Postgres function, which writes `app_metadata.tenant_id` and
  `app_metadata.role` at token issue. No per-request membership lookup.
- **Users may belong to multiple tenants.** Membership lives in our own
  `tenant_users` table; switching the active tenant re-issues the token. This is
  unpleasant to retrofit, so it is in the schema from the start.

### Hosting architecture

```
              Cloudflare (CDN / WAF / DNS)
                          |
                          v
        +-------------------------------------+
        |  SvelteKit (adapter-node, Docker)   |   Fly.io / Render / Railway
        |  + worker container, same image     |
        +-------------------------------------+
                          |  direct connection :5432
                          v
        +-------------------------------------+
        |  Supabase: Postgres + Auth + Storage |
        +-------------------------------------+
```

**Region colocation is a hard constraint.** Supabase does not host applications,
so the app runs elsewhere — and every request makes several database round
trips. App and database in different regions adds 50-100ms to each one. The
application host's region must match the Supabase project's region.

### Indicative cost

| Item | Monthly |
|---|---|
| Supabase Pro (8 GB disk, 100 GB storage, 250 GB egress, 100k auth MAUs, $10 compute credit) | $25 |
| Compute upgrade as load grows | $10-60 |
| App + worker containers | $10-40 |
| Cloudflare CDN/WAF/DNS | $0 |
| **Realistic start** | **~$50-100** |

Cost scales with database compute, not with tenant count — the shared-schema
economics of ADR-003 working as intended.

### Consequences and the accepted risk

- **Auth is centralised even where data is not.** Under
  [ADR-009](#adr-009-subdomain-routed-database-targets) a customer's business
  data may sit in their own database, but their user identities remain in our
  Supabase project. This must be stated during the sale — for some buyers it is
  disqualifying.
- Postgres and Storage remain portable; **Supabase Auth is the real coupling.**
  GoTrue's user tables and JWT conventions are not trivially replaced.
- This raises the cost of reversing ADR-007. Self-hosting Supabase is possible
  but considerably heavier than shipping one Node container and a Postgres
  database. If on-premise is ever sold, the auth layer is the piece that needs
  a plan.
- This is an accepted trade: the auth work saved now is worth more than the
  optionality lost on a tier we have deliberately deferred.

---

## ADR-009: Subdomain-routed database targets

**Decision.** One shared SvelteKit deployment serves every customer. The
database it talks to is resolved **per request** from the subdomain, so
different customers can be backed by the shared multi-tenant database, by a
dedicated database we host, or by a database in the customer's own
infrastructure — without a separate application deployment for each.

**Status.** Accepted for tiers A and B. Tier C (customer-premises) is designed
here but **not built until a customer has paid for it**, and carries constraints
that may make a self-hosted appliance the better answer for that customer.

**Amends.** [ADR-003](#adr-003-shared-schema-multi-tenancy-with-row-level-security)
(tenancy is now per-tenant configurable, not uniformly shared),
[ADR-007](#adr-007-defer-on-premise-deployment) (on-premise data is now
architecturally reachable, though still unbuilt), and
[ADR-008](#adr-008-supabase-as-the-backend-platform) (auth stays centralised
while data may not).

### The three tiers

| Tier | Compute | Database | Isolation | Cost to build |
|---|---|---|---|---|
| **A — Shared** | shared app | shared Postgres, `tenant_id` + RLS | logical | Already built |
| **B — Dedicated** | shared app | dedicated Postgres **we host**, same region | physical | Low |
| **C — Customer-hosted** | shared app | Postgres in the customer's infrastructure | physical + custodial | High, see constraints |

All three run **the same code and the same 98-table schema**. A dedicated
database is simply the schema with one tenant row in it; `tenant_id` and RLS
remain in place, so nothing branches on tier in application logic.

### How routing works

The tenant registry cannot live in the tenant's own database — routing has to
happen *before* we know which database to connect to. It moves to a small
**control plane** database.

```
  request: acme.platform.com
        │
        ▼
  hooks.server.ts
        │  1. extract subdomain
        ▼
  CONTROL PLANE (small, central, cached aggressively)
        │  tenant_registry: subdomain → tenant_id, tier,
        │                   connection secret ref, schema_version
        ▼
  connection registry (in-process, LRU)
        │  get-or-create a pool for this target
        ▼
  ┌──────────────┬──────────────────┬────────────────────────┐
  │ Tier A       │ Tier B           │ Tier C                 │
  │ shared DB    │ dedicated DB     │ customer DB via tunnel │
  │ (RLS by      │ (we host, same   │ (their infrastructure) │
  │  tenant_id)  │  region)         │                        │
  └──────────────┴──────────────────┴────────────────────────┘
```

```typescript
// $lib/server/db/router.ts
import postgres from 'postgres';

const pools = new Map<string, { sql: postgres.Sql; lastUsed: number }>();
const MAX_POOLS = 50;                 // bounded: connections are the scarce resource

export async function getConnection(tenantId: string): Promise<postgres.Sql> {
  const hit = pools.get(tenantId);
  if (hit) { hit.lastUsed = Date.now(); return hit.sql; }

  const target = await controlPlane.resolveTarget(tenantId);   // cached
  const sql = postgres(await secrets.get(target.secretRef), {
    max: target.tier === 'shared' ? 20 : 4,   // dedicated pools stay small
    idle_timeout: 60,
    connect_timeout: 10,
  });

  if (pools.size >= MAX_POOLS) evictLeastRecentlyUsed();
  pools.set(tenantId, { sql, lastUsed: Date.now() });
  return sql;
}
```

The per-request transaction from ADR-003 is unchanged — it just runs on whichever
connection the router returned:

```typescript
const sql = await getConnection(event.locals.tenantId);
return withTenant(sql, tenantId, userId, (tx) => repo.listEmployees(tx, tenantId));
```

### What the control plane holds

A separate, deliberately tiny database. It is the only thing every request
touches regardless of tier, so it is cached in process with a short TTL and must
be treated as tier-0 infrastructure.

```sql
CREATE TABLE tenant_registry (
    tenant_id        UUID PRIMARY KEY,
    subdomain        TEXT NOT NULL UNIQUE,
    tier             TEXT NOT NULL CHECK (tier IN ('shared','dedicated','customer_hosted')),
    connection_secret_ref TEXT NOT NULL,   -- pointer into the secret store, never the DSN
    region           TEXT NOT NULL,
    schema_version   TEXT NOT NULL,        -- which migration this target is on
    status           TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('provisioning','active','suspended','migrating','unreachable')),
    last_health_check_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Connection strings are never stored here** — only a reference into a secret
store. The control plane row is not sensitive; the DSN is.

### Constraints that apply to all tiers

**Migration coupling is the hard one.** One application version now faces N
databases at possibly different schema versions. This inverts the property
ADR-003 was chosen for: shared tenancy gave one atomic migration, and that
still holds *within* tier A, but across tiers you now have a fleet.

Consequences, which are not optional:

- **Expand/contract becomes mandatory**, not advisory. Every migration must
  leave the previous application version able to run.
- **The app must support a schema-version window**, and `schema_version` in the
  registry tells it which. A tenant mid-migration is a normal state.
- **A tier-C customer controls their own migration timing**, which means they
  can hold back your release cadence. Contract for a maximum lag (e.g. 30 days)
  or you will eventually be supporting a version nobody remembers.

**Connection budget.** N tenants × pool size against a bounded server. Keep
dedicated pools small (2–4), evict idle pools, and expect to put PgBouncer in
front of the shared database before the app tier scales out far.

**Blast radius moves to the app.** One process now holds credentials for many
customer databases. A compromise of the shared app is a compromise of every
tenant it can reach — including tier C, whose whole premise was that their data
sits in their own infrastructure. This is a real argument for keeping tier C on
a separately deployed app instance rather than the shared one.

**Auth stays centralised.** Supabase Auth continues to own identity for every
tier ([ADR-008](#adr-008-supabase-as-the-backend-platform)). A tier-C customer's
*business data* is on their infrastructure, but their *user identities* are not.
Say this out loud during the sale — for some buyers it is disqualifying, and
discovering it late is worse than losing the deal early.

### Constraints specific to Tier C (customer-hosted)

**Network reachability.** The shared app is in our cloud; their Postgres is
behind their firewall. Ranked by what enterprises actually accept:

1. **Reverse tunnel** (recommended) — the customer runs a small agent that dials
   *out* to us and holds a persistent connection. No inbound firewall rule, which
   is the objection that kills the other options. Cost: an agent we must ship,
   version and support.
2. **Site-to-site VPN / private link** — clean, but heavyweight per customer and
   usually a multi-week procurement.
3. **Direct TLS with an IP allowlist** — simplest for us, refused by most
   security teams.

**Latency is the constraint that does not go away.** A single shared deployment
lives in one region; tier-C databases live wherever the customer is. Every page
makes several round trips, so a customer 100ms away pays that on each one. There
is no fix that preserves "one shared deployment" — it is inherent to the shape.
Budget for it, measure it, and be prepared to move that customer to a
regionally-deployed app instance.

**The data residency paradox — read this before selling tier C.** A customer who
wants on-premise for sovereignty or compliance usually wants their data *not* to
leave their jurisdiction or their control. Routing their queries through our
shared application server means:

- data at rest is theirs, but
- data in transit and **in memory** passes through our infrastructure, in our
  jurisdiction, under our operational control.

For GDPR, Schrems II, or a defence/health procurement, this can defeat exactly
the requirement that motivated the request. **Tier C as described gives them the
latency of remote hosting and the residency posture of SaaS.** Where the
customer's real requirement is control, the honest answer is a self-hosted
appliance — they run the app *and* the database — which is ADR-007's deferred
option, not this one.

### Recommendation

**Build A and B now. Design C, sell it only with the caveats above stated in
writing, and expect the genuinely sovereignty-driven customers to need the
appliance instead.**

Tier B is the sweet spot and deserves emphasis: it delivers physical database
isolation, per-customer backup and restore, and a credible "your data is in its
own database" story, while we keep co-location, migration control, and one
deployment. Most customers asking for "our own instance" are asking for the
isolation guarantee, not the custody — and B gives them that.

### Consequences

- The `tenants` table stays in each tenant database as the tenant's own record;
  the **routing** registry is separate and central. These are different things
  and should not be merged.
- Provisioning becomes an orchestrated flow: create database, run migrations to
  the current version, store the secret, insert the registry row, verify health.
- Health checks must cover **reachability of each tier-C target**, not just our
  own database. A tunnel that has been down for an hour must page someone.
- `verify-stories.sql` should be runnable against any target as a post-migration
  smoke test, which is a second reason it exists.

---

## Superseded decisions

Recorded so that nobody re-derives them from older documents in this repository.

| Superseded | Where it appears | Replaced by |
|---|---|---|
| Nue.js frontend | `product-specification.md` | Svelte / SvelteKit |
| Microservices, module-owned data | `product-specification.md` | ADR-001 |
| Separate Express/Fastify API layer | `product-specification.md` | ADR-004 |
| Redis for sessions, cache, queues | `product-specification.md` | ADR-002 |
| Bull/BullMQ job queue | `product-specification.md` | ADR-002 |
| Elasticsearch for search | `product-specification.md` | ADR-002 |
| Kubernetes / Terraform / API Gateway | `product-specification.md` | ADR-006 |
| Cloudflare D1 / SQLite data model | `data-models/` | ADR-002, ADR-003 |
| Database-per-organization tenancy | `data-models/d1-best-practices.md` | ADR-003 |
| Self-managed session table | ADR-002 (original) | ADR-008 (Supabase Auth) |
| Provider-neutral managed Postgres | ADR-006 (original) | ADR-008 (Supabase) |

### A note on `data-models/`

**Resolved.** The two partial schemas have been merged into a single Supabase
Postgres schema at `data-models/schema.sql`. The merge decisions — including
every capability the D1 "SMB optimization" pass dropped and which of them were
restored — are recorded in
[`data-models/SCHEMA-RECONCILIATION.md`](./data-models/SCHEMA-RECONCILIATION.md).

The superseded sources are retained for reference but are no longer
authoritative: `data-models.md` (Postgres, 43 tables, no `employees` table),
`data-models/d1-schema-clean.sql` (D1/SQLite, 52 tables, database-per-org
tenancy with colliding natural keys), and `data-models/d1-best-practices.md`
(premised on a tenancy model we do not use).

---

## Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | ~~Reconcile the two schemas~~ — **done**, see `data-models/schema.sql` | — | — |
| 2 | ~~Add `tenant_id` to tables that lack it~~ — **done**, all 94 tables carry it | — | — |
| 3 | ~~Rebuild FTS5 search as `tsvector` + GIN~~ — **done** | — | — |
| 3a | Build the control plane (`tenant_registry`) and the connection router — required before any tier-B customer | ADR-009 tiers B and C | — |
| 3b | Decide the reverse-tunnel agent for tier C (build vs. Cloudflare Tunnel / Tailscale) — only when a tier-C customer is signed | ADR-009 tier C | — |
| 4 | Choose the application host (Fly / Render / Railway) and match its region to the Supabase project | Deployment | — |
| 5 | Confirm whether any prospect has actually asked for on-premise deployment | ADR-007, ADR-008 | — |
| 6a | **Add the AI assistant schema** (`ai_conversations`, `ai_messages`, `ai_knowledge_base`, `ai_user_preferences`) — Phase 1 module #5 has no storage; deferred by decision on 2026-08-27 | AI Assistant module | — |
| 6 | Decide the India payroll launch scope — the schema supports it and `validation-utils.js` validates PAN/Aadhaar, but it is a large compliance surface | Roadmap | — |
| 7 | Write per-country seed data (chart of accounts, leave policies, tax rates) | Onboarding | — |

---

## Related documents

- [Product Specification](./product-specification.md) — what the product does
- [Technical Architecture](./architecture-technical.md) — how it is built
  (v2.0, aligned with these ADRs)
- [UX Design Specification](./02-ux-design-specification.md)
- [High-Performance SvelteKit Guide](./03-perf_guide.md)
- [Mobile-First Development Guide](./04-mobile_guide.md)
- [Customization Model](./06-customization-model.md) — how customers customize
- [Schema Reconciliation](./data-models/SCHEMA-RECONCILIATION.md) — how the two
  legacy schemas were merged, and what was restored
- [`data-models/schema.sql`](./data-models/schema.sql) — the authoritative schema
- [Cross-Module Integration Plan](./cross-module-integration-plan.md) — the
  workflows that motivate ADR-001
