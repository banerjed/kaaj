# Running the Beta in the Cloud

**Status:** guidance, not yet executed
**Created:** 2026-08-29

The shape is already decided — [ADR-006](./05-architecture-decisions.md)
(boring infrastructure), [ADR-008](./05-architecture-decisions.md) (Supabase for
Postgres, Auth and Storage) and
[architecture-technical.md § Deployment](./architecture-technical.md). This
document is the runbook, and the things that will bite.

```
        CDN / DNS  (beta.<domain>)
              │
              ▼
   ┌──────────────────────────────┐
   │ App host — ONE container      │   adapter-node, long-running
   │ SvelteKit (node build/)       │   NOT serverless. See "Why not Vercel".
   └──────────────────────────────┘
              │  Supavisor, transaction mode, :6543
              ▼
   ┌──────────────────────────────┐
   │ Supabase project — SAME REGION│
   │ Postgres · Auth · Storage     │
   └──────────────────────────────┘
```

---

## Why not Vercel, Netlify or Cloudflare

Not dogma — this app has a specific shape that rules them out:

**It holds a Postgres connection pool.** ADR-008 rejected PostgREST, so all
business data goes through postgres.js as `app_user`
([L8](./10-lessons-learned.md)). `$lib/server/db/client.ts` keeps a
module-scoped pool of up to 20 connections. Serverless invocations do not share
one: every cold start opens its own, and a few hundred concurrent invocations
exhaust a Supabase project's connection limit.

**`withTenant` depends on transaction-scoped session state.** `SET LOCAL ROLE
app_user` and `set_config('request.jwt.claims', …, true)` are what make RLS
apply ([L1](./10-lessons-learned.md), [L2](./10-lessons-learned.md)). They are
correct under a *transaction*-mode pooler and correct on a direct connection.
They are **not** safe if anything ever moves them outside the transaction —
which is why that code has one entry point.

`adapter-node` on a long-running container is the configuration this app is
written for. A single small instance is more than enough for a beta: the
Locations page measures TTFB 131ms and 69KB of JS.

**Fly.io or Render** both fit. Pick whichever has a region matching your
Supabase project.

---

## Region colocation is a hard constraint

`architecture-technical.md` states this and it is worth repeating: every request
makes several round trips to Postgres. An app in `iad` against a Supabase
project in `ap-south-1` adds ~200ms *per round trip*. Put them in the same
region, or the app will feel broken for reasons no profiler will show you.

---

## Connection pooling

Use the **Supavisor pooler in transaction mode** (port `6543`), not `:5432`.

- Transaction mode is compatible with `withTenant`, because every statement it
  issues is inside an explicit `BEGIN`.
- Set `max` in `client.ts` low for the beta — **4 or 5**, not 20. One container
  does not need 20, and the pooler multiplexes.
- Session-mode pooling would also work but wastes connections.

`:5432` direct is fine too for a single container; the pooler simply gives more
headroom when you add a second.

---

## The runbook

### 1. Prepare the Supabase project

```bash
supabase link --project-ref <ref>
./check                    # must be green BEFORE anything is pushed
supabase db push           # migrations only — NEVER --include-seed
```

> **Never pass `--include-seed`.** It would load the Northwind test fixture into
> a live project. `dev-users.sql` is deliberately *not* in `[db.seed] sql_paths`
> for this reason — it creates logins with the password `devpassword`, and its
> own guard would not save you, because `mock-data.sql` runs first in the same
> pass and creates the very tenant the guard looks for.

### 2. Two manual steps the migrations cannot do

Both fail **silently** if skipped, which is what makes them dangerous.

**a. Give `app_user` a password.** The migration creates the role with `LOGIN`
and no password, deliberately — "set out of band, never in a migration".

```sql
ALTER ROLE app_user WITH PASSWORD '<from your secret store>';
```

**b. Set and archive `PRIVATE_PII_KEK`.** Generate with
`echo "1:$(openssl rand -base64 32)"`, put it in the host's secret store, and
back it up somewhere that is not the database. The app refuses to start with the
published development key when `dev` is false, so a copied `.env.example` fails
loudly — but nothing can tell you that you have no backup. Losing this key
destroys every encrypted field permanently
([13-pii-encryption.md](./13-pii-encryption.md)).

**c. Register the access-token hook.** Dashboard →
*Authentication → Hooks → Customize Access Token (JWT) Claims* →
`public.custom_access_token_hook`.

Without it login succeeds, no `tenant_id` claim is stamped, and **every page
renders empty with no error anywhere** ([L5](./10-lessons-learned.md),
[L21](./10-lessons-learned.md)).

Verify by decoding a real token:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}' \
| python3 -c "import sys,json,base64;t=json.load(sys.stdin)['access_token'];p=t.split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['app_metadata'])"
```

`app_metadata` must contain `tenant_id`. If it does not, stop — nothing else
will work.

### 3. Create the first real tenant

There is no signup-creates-tenant flow yet. For a beta, insert the `tenants` row
and the `tenant_users` membership by hand, then invite users through Supabase
Auth. The membership row is what the hook reads.

### 4. Environment

`apps/web/.env.prod` lists what is needed. The one that is easy to miss:

```
APP_DATABASE_URL=postgresql://app_user:<password>@<host>:6543/postgres
```

**The server throws on startup without it.** It is deliberately separate from
`SUPABASE_DB_URL` (the owner connection, used only by the read-only prod
checker) so the two can never be confused — connecting as the owner would
bypass `FORCE ROW LEVEL SECURITY` entirely ([L3](./10-lessons-learned.md)).

`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS. Server-side only, never in a
`PUBLIC_`-prefixed variable.

### 5. Verify against the live database

```bash
packages/database/tests/verify-remote.sh    # read-only, safe on production
```

**Never run `verify-rls.sql` against production** — it seeds a second tenant and
writes probe rows.

---

## What a beta should NOT carry yet

These are open items, and they change what kind of beta this can be.

| Gap | Consequence for a beta |
|---|---|
| **PII encryption** | ✅ Closed. All 19 PII columns are AES-256-GCM with per-subject keys ([13-pii-encryption.md](./13-pii-encryption.md)). **`PRIVATE_PII_KEK` must be set and backed up separately before the first write** — losing it destroys every encrypted field |
| **Authorization: action-level done, row-level not** | All 23 write actions now authorize, and separation of duties is enforced in the database ([14-access-control.md](./14-access-control.md)). **RLS still filters by tenant only**, so a page that forgets to scope a query can still show one employee another's row — the application is the only thing preventing it. Acceptable for a design-partner beta; close step 5 before untrusted users |
| **No signup → tenant flow** | Tenants are created by hand. Deliberate for a beta; a blocker for self-serve |
| **No backups tested** | Supabase takes them. Restoring one has never been rehearsed. Rehearse before real data lands |
| **Stripe is CMSaasStarter's** | Billing is the starter's scaffolding, not the product's. Keep it disabled |

The honest framing: this is ready for a **design-partner beta** — a handful of
firms you know, with data they accept is in an early product. It is not ready
for open signup.

---

## Cost, roughly

- Supabase Pro — $25/month (needed for daily backups and no pausing)
- One small app instance — $5–10/month
- Total under $40/month for a beta of this size

---

## First deploy, in order

1. `./check` green locally
2. Provision Supabase in your chosen region; `supabase link`; `supabase db push`
3. Set the `app_user` password; register the access-token hook; **verify the
   claim decodes**
4. Create the first tenant and membership rows
5. Deploy the container with the environment above; set `max: 4` on the pool
6. `verify-remote.sh`
7. Log in and confirm a page renders real rows — an empty page means the claim,
   not the query ([L21](./10-lessons-learned.md))
