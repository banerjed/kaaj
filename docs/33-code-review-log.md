# Code review log

Who reviewed what, and **through which commit**, so the next review starts
where the last one stopped instead of re-reading the whole history.

**The anchor is a SHA, not a date.** Several sessions commit to this repo
concurrently, so "everything since Tuesday" is a moving window that both
re-covers work and skips it. A SHA is exact.

## Next run

```bash
git diff 3d9a5d8 HEAD --stat        # what is new since the last review
git log --oneline 3d9a5d8..HEAD     # and the commits that produced it
```

Review that range, then add a row below and update this command to the new
HEAD. If the range is empty there is nothing to review.

## What a review covers

`./check` is green on every commit, so **re-running it is not a review**.
A review is for the rules nothing enforces — the ones CLAUDE.md states and
`./check` cannot see:

| Area | What to look for |
|---|---|
| Read authorization | every `load()` checks its own read permission — a `requireCan` in that page's `actions`, or a parent layout, covers neither (L79, L44) |
| Scale | every read of a `SCALE_SENSITIVE` table (`scripts/verify-query-scale.mjs`) is bounded. `./check` classifies the table; nothing checks the query |
| Money | no `Number()` over a `NUMERIC` string, no JS arithmetic on money, no total summed across currencies (BR-FP-003) |
| Formatting | nothing constructs `Intl` or calls `toLocaleString()` outside `$lib/format.ts`; a `timestamptz` renders in the OFFICE's zone via `instant()`, never the viewer's |
| Forms | every `f.*` reader is called ABOVE that action's `if (!f.ok)` gate (L33) |
| Casts | no `''` reaches a `::uuid`/`::date` parameter — SQL does not short-circuit (L37). Watch query strings: `searchParams.get()` returns `""`, not `null`, for `?x=` |
| Tailwind | no assembled class name — a complete string per state, never `` `btn-${size}` `` |
| Svelte | no `$state` seeded from a prop without `untrack`/the ignore comment, no index `{#each}` key, no module-scope `$state`, no Svelte 4 idiom |
| Docs | a new test file has a line in [docs/22](22-test-inventory.md); a salient bug has an `Lnn` in [docs/10](10-lessons-learned.md) |
| Comments | describes the code as it stands, never the path that produced it |

Findings are reported, not silently fixed — scaling the work down is the
maintainer's call.

## Reviews

| Date | Reviewed through | Range | Scope | Findings |
|---|---|---|---|---|
| 2026-10-01 | `3d9a5d8` | `ec606a5..3d9a5d8` | 18 commits, 137 files (+7,472 / −2,995): enterprise SSO, custom fields consolidation, portal off, row actions, CRM person accounts, pipeline paging | 1 critical (live 500 on `?stage=`), 2 high (unpaged `crm_activities`; JS money arithmetic), 4 medium, 2 owed `Lnn` entries. Reported in-session; not fixed. |
