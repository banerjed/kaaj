# Deployment and Connection Pooling

**Status:** proposed — not yet an ADR. Implemented so far: sealed connection secrets (§5.2) and the tenant provisioning script (§5.3). Nothing has been deployed.
**Created:** 2026-09-23
**Supersedes the hosting note in:** the spec's "Required Integrations (Pending)" section
**Related:** [ADR-003](./05-architecture-decisions.md), [ADR-006](./05-architecture-decisions.md), [ADR-008](./05-architecture-decisions.md), [ADR-009](./05-architecture-decisions.md), [12-beta-deployment.md](./12-beta-deployment.md), [03-perf_guide.md](./03-perf_guide.md)

**Figures are from memory, not measurement.** Every number marked *(verify)* must
be checked against the vendor's current documentation or measured before it
drives a decision. Section 8 lists the measurements that turn this into an ADR.

---

## 1. Decisions taken

| Decision | Source |
|---|---|
| Supabase stays. Postgres, Auth and Storage are not replaced. | Product owner |
| **Premium customers** get a private, dedicated Supabase project. **Smaller customers** share one database, isolated by `tenant_id` and RLS. | Product owner; ADR-003 and ADR-009 (tiers) |
| **One region at launch: US East Coast** (Supabase `us-east-1`, N. Virginia). | Product owner |
| **Container host: Render (Virginia).** Vercel is dropped. Render's Virginia region must be confirmed to sit on AWS `us-east-1` *(verify)*; Fly.io (`iad`) is the fallback. | Product owner |
| Server-side render time target: **most requests under 20–50 ms**, paying for infrastructure if that is what it takes. | Product owner; CLAUDE.md already targets 20 ms for `handle` end to end |

### Who does what

| Vendor | Role | Required? |
|---|---|---|
| **Supabase** | Postgres, Auth and Storage: the shared project, plus one project per premium tenant | Yes |
| **Render** (Virginia) | Runs the `adapter-node` container(s), the worker and the chat relay | Yes |
| **Cloudflare** | DNS, wildcard TLS, CDN caching of static assets, WAF/DDoS in front of Render. The edge only; it never runs application code or talks to the database. | Recommended (Render can serve the app alone; `svelte.config.js` already assumes Cloudflare compresses at the edge, and Cloudflare for SaaS is the path to customers' own domains) |

Three accounts, plus a domain registrar (Cloudflare can be that too).

### One-time setup

1. Register the domain.
2. Cloudflare: add the domain; create a wildcard `*.<domain>` record (and the apex) pointing at the Render service.
3. Render: add the wildcard custom domain (managed TLS *(verify wildcard support)*); set `PRIVATE_PII_KEK`, `APP_DATABASE_URL` and the other app secrets.
4. Supabase: create the shared project in `us-east-1`, apply migrations, give `app_user` a password.

After that, every tenant's subdomain resolves with no further DNS or certificate work.

## 2. Recommendation

**Run the SvelteKit app as long-running Node containers (`adapter-node`) in the
same region, and preferably the same availability zone, as the Supabase
database. Hold an in-process connection pool per container. Do not run
compute on Cloudflare Workers or Vercel functions.**

Why, in one paragraph: the 20–50 ms target is a database-latency budget. Each
request makes several round trips to Postgres, so the distance to the database
sets the floor and nothing can buy it back. A long-lived container in the
database's region has no connection setup on the request path and pays
roughly 0.3–1 ms per round trip. Serverless and edge compute must either open
connections per invocation or add a proxy hop (Hyperdrive, an external pooler),
and it also breaks `LISTEN`/`NOTIFY` for chat. It buys global latency that this
product's logged-in, US-based staff do not need (ADR-001 §1).

This deliberately closes the "Vercel vs Cloudflare" question for compute:
neither, for now. Cloudflare remains the edge. See §7 for what would reopen it.

## 3. Where the time goes

`withTenant` (`apps/web/src/lib/server/db/tenant.ts`) issues, each awaited
in turn: `BEGIN`, `SET LOCAL ROLE app_user`, `set_config('request.jwt.claims', …)`,
the page's queries, then `COMMIT`. A page with three queries is about **7
round trips**.

| Database distance | Round trip *(verify)* | Page at 7 round trips |
|---|---|---|
| Same availability zone | ~0.5 ms | ~4 ms |
| Same region, different zone | ~1.5 ms | ~10 ms |
| Cross-region | 20–200 ms | 140 ms or more |

Only the first two rows meet the target. Everything else in this document is
secondary to the first row.

## 4. Pooling design

### 4.1 Shared tier

- App containers and the Supabase project in `us-east-1`, same zone if the host
  allows choosing one.
- Connect through the **Supabase dedicated pooler** (PgBouncer, transaction
  mode, co-located with the database, paid compute) *(verify availability and
  IPv4/IPv6 requirements)*, or **direct on `:5432`** while there are only a few
  containers. Direct has no proxy hop; the pooler gives headroom for more
  containers. Prefer the dedicated pooler over the shared Supavisor, which adds
  a hop *(verify)*.
- Pool size per container = the pooler's or database's connection limit divided
  by the container count, with headroom for migrations and `./check`. The
  current `max: 20` is a default, not a computed value.
- **Prepared statements.** `client.ts` does not set `prepare: false`.
  Transaction-mode pooling historically breaks postgres.js prepared statements;
  confirm behaviour on the chosen pooler before relying on it, and set the flag
  if needed *(verify)*. `withTenant` is safe in transaction mode because every
  statement is inside an explicit `BEGIN` (12-beta-deployment.md).

### 4.2 Dedicated (premium) tier

- One Supabase project per premium tenant, registered in `tenant_registry`
  (ADR-009). Same region as the app at launch.
- Small per-tenant pool (`max` 1–2) through that project's pooler, so an idle
  tenant holds no direct connection.
- The current defaults do not scale as-is: `MAX_POOLS = 50` and `max: 4` allow
  200 connections per container, multiplied by container count. Size against
  the pooler's limits, not the code's.
- **Idle cost.** `idle_timeout: 60` means a tenant quiet for a minute pays a
  fresh TCP + TLS + auth handshake (3–4 round trips) on its next request.
  Lengthen it when the pooler, not the database, holds the server side.
- **Control-plane hop.** `withControlPlane` targets the shared database, and
  `tenant_users` stays central because GoTrue's access-token hook sees only the
  one database it is bound to. A request that touches both databases makes a
  second connection. Keep every database in one region (true at launch) and
  keep the control plane off the hot path where possible.
- `resolveTarget` already caches the tenant-to-database mapping with a TTL; a
  cold miss costs one extra transaction on the shared database. Only the TTL
  needs tuning.

### 4.3 Code changes (none made yet)

Estimated savings are unmeasured; take a `measure-render-times` baseline first.

1. **One-round-trip prologue.** Fold `SET LOCAL ROLE` and the claims into one
   statement, e.g. `SELECT set_config('role','app_user',true),
   set_config('request.jwt.claims',$1,true)`, or pipeline them. Saves at least
   one round trip on every request. This touches the RLS entry point (L1, L2,
   L3): change it only with `./check --db` green and a test that the role and
   claims are set exactly as before.
2. **Pipeline independent reads.** A page awaiting three queries in sequence
   can issue them together inside one transaction; postgres.js pipelines them.
   The largest per-page saving. Repositories accept a `Tx`, so this is a
   `load()`-level change, not a repository change.
3. **Pool sizing and idle policy** as in §4.1–4.2, from configuration, not
   literals.
4. **Statement timeouts and `pg_stat_statements`** stay on, as ADR-003 already
   requires, so one slow query cannot hold a pooled connection.

## 5. Per-tenant provisioning

A dedicated tenant is data and one database, not a per-tenant deployment. The
app host is identical for every tenant (ADR-009).

**Shared tier: nothing to do.** Create the tenant row; the wildcard DNS and TLS
already cover `acme.<domain>`.

**Premium tier: one command** (§5.3), which does the four steps below. The real
marginal cost of a premium tenant is its Supabase project (compute plus
storage), which the premium price must cover *(verify current pricing)*.

1. Create a Supabase project in `us-east-1` (Management API).
2. Apply the migrations; give `app_user` a generated password.
3. Seal that connection string and store it (§5.2).
4. Insert the `tenant_registry` row with `tier = dedicated`.

### 5.1 Migrations across many databases

Shared-tier migrations stay atomic and single; dedicated databases need a
migration loop and a staged rollout (shared first, then dedicated in batches),
and a failed dedicated migration must be contained. That is ADR-009 work and is
not addressed here. It also needs each project's **owner** credentials, which
the provisioning script deliberately does not retain (see open question 6).

### 5.2 Where a tenant's connection string lives

`tenant_registry.connection_secret_ref` used to be the *name of an environment
variable*, so every premium tenant meant adding a variable on the host and
restarting it. It now also accepts a **sealed value**:

```
sealed:v1:<base64url of {v,k,iv,ct,tag}>
```

- The connection string is encrypted with AES-256-GCM under `PRIVATE_PII_KEK`
  (highest version encrypts; every version decrypts, so key rotation works as
  it does for PII). The wire format is the `Envelope` of
  `pii/envelope.ts`.
- It is **bound to its tenant** through the GCM authenticated data
  (`tenantId|tenant_registry|connection_secret_ref|tenantId`), so a sealed value
  copied onto another tenant's row fails to open rather than routing that
  tenant to the wrong database.
- The app opens it in `resolveSecret(ref, tenantId)`
  (`apps/web/src/lib/server/db/secrets.ts`), cached with the registry entry for
  30 seconds. **No redeploy, no host configuration, per tenant.**
- A ref that is not `sealed:v1:` is still an environment-variable name, which
  local development and `provision-dedicated-db.sh` rely on.
- `app_user` can `SELECT` its own tenant's row, so the ciphertext is readable by
  that tenant's own session. It is useless without `PRIVATE_PII_KEK`. **Losing
  the KEK now also loses every dedicated tenant's route to its database**; it
  is already backed up separately from the database for PII, and that backup
  covers this.
- The sealing code is `sealed-secret.js`, plain JS with no SvelteKit imports, so
  the provisioning script and `./check`'s `dedicated targets` step use the same
  format the app does.

Rotating a tenant's database password means sealing a new connection string and
updating that one row; the app picks it up within the cache TTL, and the old
pool ages out.

### 5.3 The provisioning script

```bash
# needs DATABASE_URL (shared DB, owner), PRIVATE_PII_KEK, SUPABASE_ACCESS_TOKEN, SUPABASE_ORG_SLUG
node scripts/provision-tenant.mjs --subdomain acme --company "Acme Inc" --dry-run
node scripts/provision-tenant.mjs --subdomain acme --company "Acme Inc"
```

It checks the inputs and that the subdomain is free, creates the project,
applies migrations (`supabase db push`), sets a generated `app_user` password
and proves it can log in, verifies `app_user` can read the tenant's own row
with the claim RLS needs, then seals the connection string and registers the
tenant in one transaction. It prints no connection string or password; psql
receives its password through the environment, not the command line. It refuses
a taken subdomain or tenant id, and refuses to seal with the development key
against a non-local shared database. If a step fails after the project exists,
it says so and leaves the project; it never deletes anything.

Options: `--plan`, `--region` (default `us-east-1`), `--tenant-id`,
`--connection pooler|direct` (default `pooler`), `--dry-run`. For a database
that already exists, or a throwaway one, pass `--owner-url` (and `--vanilla`
when it is plain Postgres rather than a Supabase project).

**Tested** against throwaway Postgres clusters (`node --test
scripts/provision-tenant.test.mjs`, with `PROVISION_TEST_PG` set): provisioning,
dry run, duplicate refusal, atomic registration, no leakage of the password or
DSN, a working restricted login, and a real request routed through a sealed ref
to the dedicated database. The Management API calls are tested against a fake
`fetch` only.

**Not verified against a real Supabase project** *(all to check on the first
real run)*: the create-project request fields (`organization_slug`); the pooler
host and the `app_user.<ref>` login form; the direct host and its IPv6/IPv4-add-on
requirement; `supabase db push --yes` against a fresh project; and how long a
new project takes to become healthy.

**Not done by the script:** the tenant's first owner login (created through the
app's own flow), and per-tenant backup and restore.

`--vanilla` bootstraps the Supabase-provided roles and schemas from
`scripts/vanilla-postgres-stubs.sql`, a copy of the bootstrap in
`packages/database/scripts/ci-database.sh`. Change one, change the other. Note
that `provision-dedicated-db.sh` predates the storage migrations and no longer
applies cleanly to a plain cluster for the same reason.

## 6. Hosting requirements for the container host

The host is now the vendor decision that matters. It must:

- offer a **US East** region that is (or is adjacent to) AWS `us-east-1`, since
  Supabase runs on AWS;
- run small, always-on containers with no request-duration cap (SSE for chat,
  the worker process);
- support 2+ instances for redundancy behind the Cloudflare edge;
- allow a private or low-latency path to the database, and secrets injection
  (`PRIVATE_PII_KEK` and the per-tenant connection secrets).

**Decision: Render (Virginia).** Confirm its region is AWS `us-east-1` and that it can reach the chosen Supabase connection path before committing. Alternatives if it fails the baseline: Fly.io (`iad`), then AWS ECS/Fargate or App Runner in `us-east-1`. AWS gives the best chance of same-zone placement
and a private network path, at the price of more operational work (ADR-006 says
prefer boring, managed hosting). Choose by measurement (§8), not by preference.

Chat realtime (`LISTEN`/`NOTIFY` over SSE) requires a **direct** connection,
not a transaction-mode pooler, because `LISTEN` needs session state. Keep a
small dedicated direct connection for the relay, separate from the request pool.

## 7. What would reopen the Workers/Vercel question

- A material share of users outside the US making static or cacheable pages
  the bottleneck: solved first by Cloudflare caching, not compute.
- A spike proving `pdfkit`, per-tenant Hyperdrive configurations, and a chat
  relay via Durable Objects all work, and that end-to-end latency is no worse
  than the container option.
- Multi-region (below), where regional origins are needed anyway.

**Multi-region (deferred).** When a customer needs a non-US database, run app
containers in that region and route the tenant's subdomain to the regional
origin at Cloudflare. A tenant whose database is remote from its app cannot
meet 50 ms, so a database must never be placed in a region without an app.

## 8. Next steps

Ordered; each has an owner to assign.

1. **Baseline.** Deploy the current build to a `us-east-1` container against a
   `us-east-1` Supabase project; record `measure-render-times` and
   `verify-front-page-load` for representative pages. *This decides
   everything else.*
2. **Compare connection paths** on the same build: direct `:5432`, dedicated
   pooler, shared Supavisor. Record p50 and p99 and the prepared-statement
   behaviour.
3. ~~Shortlist hosts~~ — Render chosen. Confirm on the step 1 baseline; fall back to Fly.io if it misses the target.
4. **Make the §4.3 code changes** one at a time, each with a before/after
   measurement and `./check` green.
5. ~~Script premium provisioning~~ — built and tested locally (§5.3). Run it once for real, time it end to end, and confirm the monthly cost of a dedicated project.
6. **Write the ADR** (proposed ADR-012) from the measurements, amending
   ADR-006 and the beta guide's "Why not Vercel, Netlify or Cloudflare".
7. **Update** `12-beta-deployment.md`, the spec's hosting note, and
   `11-module-roadmap.md`.

## 9. Open questions

1. Same-zone placement: can the chosen host pin an availability zone, and can
   the Supabase project's zone be known?
2. Container count at launch, and therefore the pool budget per container.
3. Premium tier price, to test it against the per-project cost in §5.
4. Migration rollout order and failure containment across dedicated databases.
5. Backup and per-tenant restore for dedicated projects (ADR-003 requires a
   per-tenant export/restore path before the first customer needs it).
6. Owner credentials for dedicated projects: the provisioning script does not store them, but the migration loop (§5.1) needs them. Decide where they live (a sealed column, or reset per migration).
