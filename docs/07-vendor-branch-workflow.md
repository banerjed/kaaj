# Vendor Branch Workflow

**Version:** 1.0
**Last Updated:** August 27, 2026
**Status:** Active

How `app/` tracks its upstream template, and how to pull upstream changes
without losing local work.

---

## What `app/` is

`app/` began as a pristine copy of
**[CMSaasStarter](https://github.com/scosman/CMSaasStarter)** — an MIT-licensed
SvelteKit + Supabase SaaS template (© 2023 Steve Cosman).

It matches the stack the ADRs specify:

| Starter provides | Matches |
|---|---|
| SvelteKit 2 + Svelte 5 (runes) | [ADR-004](./05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack), and `03-perf_guide.md` / `04-mobile_guide.md` are already written for runes |
| `@supabase/ssr`, Supabase Auth | [ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform) |
| Tailwind 4 + daisyUI 5 | No ADR — a starter choice, ours to keep or replace |

The import commit is `2e61406`, upstream's `main` as of 2026-03-21.

---

## The two branches

```
vendor/cmsaasstarter    pristine upstream only — never edit
        │
        └──merge──►  main    upstream + all our changes
```

**`vendor/cmsaasstarter`** is an orphan branch containing nothing but `app/`,
exactly as upstream published it. It has no project code, no docs, and no local
edits. Its only job is to be a merge base.

**`main`** carries the merge plus every local change.

### Why this works

When you later merge an updated `vendor/cmsaasstarter` into `main`, git uses the
*previous* vendor commit as the merge base. It therefore computes **upstream's
diff** — not the whole tree — and replays it onto our modified files. Conflicts
arise only where upstream and we changed the same lines.

That is the entire benefit: it is the difference between "apply these 40 upstream
changes" and "reconcile two whole trees by hand."

---

## Pulling a new upstream release

```bash
# 1. Fetch the upstream tree you want, somewhere outside the repo
git clone --depth 1 https://github.com/scosman/CMSaasStarter /tmp/cmsaas-new
NEW_SHA=$(git -C /tmp/cmsaas-new rev-parse --short HEAD)
rm -rf /tmp/cmsaas-new/.git

# 2. Update the vendor branch in an isolated worktree, so your working tree
#    is never disturbed. NOTE: a worktree's .git is a FILE — never delete it.
git worktree add /tmp/vendorwt vendor/cmsaasstarter
cd /tmp/vendorwt
find app -mindepth 1 -delete
cp -R /tmp/cmsaas-new/. app/
git add -A app
git commit -m "vendor: CMSaasStarter @ $NEW_SHA"
cd -
git worktree remove /tmp/vendorwt

# 3. Merge forward
git checkout main
git merge vendor/cmsaasstarter
```

Resolve conflicts normally. Keep our side wherever we deliberately diverged
(see below), take upstream's side for dependency bumps and fixes we have not
touched.

> The **first** merge needed `--allow-unrelated-histories` because the vendor
> branch is an orphan. Subsequent merges do not — they share history now.

---

## Where we intend to diverge

Record divergences here as they happen. During a merge conflict, this list tells
you which side to keep without re-deriving the reasoning.

| File | Change | Why |
|---|---|---|
| `app/svelte.config.js` | `adapter-auto` → `adapter-node` | [ADR-005](./05-architecture-decisions.md#adr-005-node-lts-as-the-runtime): we deploy a long-running container, not a serverless target |
| `app/src/hooks.server.ts` | Add tenant resolution into `event.locals` | [ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security) — the starter is single-tenant |
| `app/src/lib/server/` | New: repository layer, per-request transaction, `SET LOCAL request.jwt.claims` | ADR-003, ADR-008 |
| Database schema | Replace the starter's demo tables with `data-models/schema.sql` (98 tables) | The starter ships a minimal profile table |
| Auth | Extend with `tenant_users` and `custom_access_token_hook` | ADR-008 multi-tenancy |

---

## Honest assessment of this approach

**What it costs:** almost nothing. Two commits and a branch that sits idle until
you want it.

**What it gives:** a clean upstream diff for as long as `app/` still resembles
the starter.

**Where it stops paying:** once we replace the auth flow, add tenant resolution,
swap the adapter, and bring in a 98-table schema, `app/` will have diverged
substantially. Merges will conflict more often, and at some point the honest
move is to stop pulling and treat the starter as a one-time seed.

Be realistic about what upstream will actually offer by then: dependency bumps
(which `npm update` handles) and changes to demo pages we will have deleted.
A template is designed to be forked and diverged from — unlike a library, its
value is front-loaded.

**So:** keep the vendor branch, use it for the first few months while the
divergence is small, and retire it without ceremony when merges stop being
worth the effort. Delete the branch at that point and note it here.

**Alternative considered:** `git subtree` automates exactly this pattern with
`git subtree pull`. We do it manually because the mechanics are then visible in
plain git commands, and no one needs to remember subtree's syntax to maintain
it. The trade-off is a few more steps per update.

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md)
- [Technical Architecture](./architecture-technical.md)
