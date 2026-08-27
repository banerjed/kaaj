# `app/` Provenance and Planned Modifications

**Version:** 1.0
**Last Updated:** August 27, 2026
**Status:** Active

---

## Where `app/` came from

`app/` started as a copy of
**[CMSaasStarter](https://github.com/scosman/CMSaasStarter)** at commit
`2e61406` (2026-03-21) — an MIT-licensed SvelteKit + Supabase SaaS template.

```
Copyright (c) 2023 Steve Cosman
MIT License — retained at app/LICENSE
```

**Keep `app/LICENSE` in place.** The MIT licence requires the copyright notice
to travel with the code, including in derivative work. Everything else is ours
to change freely.

**We do not track upstream.** The starter was a seed, not a dependency: `app/`
is our code now, modified as we see fit. If a specific upstream fix is ever
wanted, port it by hand. Dependency updates come from `npm update`, not from
upstream.

---

## Why this starter

It already matches the architecture we settled on, which is most of the value:

| Starter provides | Matches |
|---|---|
| SvelteKit 2 + Svelte 5 (runes) | [ADR-004](./05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack); `03-perf_guide.md` and `04-mobile_guide.md` are already written for runes |
| `@supabase/ssr`, Supabase Auth wiring | [ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform) |
| Tailwind 4 + daisyUI 5 | No ADR — a starter choice, ours to keep or replace |
| Working auth flows, billing scaffolding, CI | Saves the boring parts |

---

## Planned modifications

What has to change for the starter to become this product. This doubles as the
first work list.

| Area | Change | Driver |
|---|---|---|
| `app/svelte.config.js` | `adapter-auto` → `@sveltejs/adapter-node` | [ADR-005](./05-architecture-decisions.md#adr-005-node-lts-as-the-runtime): a long-running container, not a serverless target |
| `app/src/hooks.server.ts` | Resolve tenant from subdomain into `event.locals.tenantId`; reject when the subdomain and the token disagree | [ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security) — the starter is single-tenant |
| `app/src/lib/server/db/` | New: `postgres.js` pool, and `withTenant()` owning the per-request transaction and `SET LOCAL request.jwt.claims` | ADR-003, ADR-008 |
| `app/src/lib/server/modules/` | New: one directory per module, repositories taking `tenantId` as a required first parameter | [ADR-001](./05-architecture-decisions.md#adr-001-modular-monolith-not-microservices) |
| Database | Replace the starter's demo profile table with [`schema.sql`](./data-models/schema.sql) (98 tables) | The starter ships a minimal example schema |
| Auth | Add `tenant_users` membership and the `custom_access_token_hook` that stamps `app_metadata.tenant_id` | ADR-008 |
| Jobs | New: `worker.ts` entrypoint claiming from the `jobs` table with `SKIP LOCKED` | [ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore) |
| Shared code | Import `validation-utils.js` (33 validators) and `enumerations.json` so client and server validate identically | ADR-004 |
| Billing | Evaluate what the starter ships against our pricing model | — |
| Demo content | Delete the marketing/demo pages we do not want | — |

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md)
- [Technical Architecture](./architecture-technical.md) — the target structure
  for `app/src/`
- [`data-models/schema.sql`](./data-models/schema.sql)
