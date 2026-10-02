# Code review log

Who reviewed what, and **through which commit**, so the next review starts
where the last one stopped instead of re-reading the whole history.

**The anchor is a SHA, not a date.** Several sessions commit to this repo
concurrently, so "everything since Tuesday" is a moving window that both
re-covers work and skips it. A SHA is exact.

## Next run

```bash
git diff 148f3ef HEAD --stat        # what is new since the last review
git log --oneline 148f3ef..HEAD     # and the commits that produced it
```

**A SHA anchors a lineage, not a date.** `3d9a5d8..main` turned out to be
60 commits, not the handful committed after that review: the perf-tenant
branch had been developed in parallel from an older base and merged later,
so everything on it was "after" the anchor by ancestry. That is the correct
answer — those commits had never been reviewed — but it means the range can
be much larger than the calendar suggests. Size it with `--stat` before
starting, and split by area.

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
| 2026-10-02 | `148f3ef` (main) + `8d31cd0` (branch `messaging`) | `3d9a5d8..148f3ef` and `148f3ef..8d31cd0` | 60 commits on main (perf tenant, every page paged, pickers, daily ledger balances, accounting conformance suite, payroll export) + 2 on the branch (Bird messaging, mailer off Resend); 505 + 97 files | 0 critical, 4 high (inbound mail over a column width is a 500 Bird retries then drops; perf tooling plants known-password users wherever `DATABASE_URL` points; page numbers from the query string reach `LIMIT`/`OFFSET` unbounded on 14 pages; raw `::uuid` casts on documents/ticketing filters), 9 medium, ~15 low. Payroll export and the pagination sweep reviewed by subagents; accounting ledger, conformance suite, messaging and the docs restructure reviewed by hand after the subagents for those areas hit the session rate limit — depth there is correspondingly lower, and the conformance scenarios were sampled, not read. Nothing remediated yet. |
| 2026-10-01 | `3d9a5d8` | `ec606a5..3d9a5d8` | 18 commits, 137 files (+7,472 / −2,995): enterprise SSO, custom fields consolidation, portal off, row actions, CRM person accounts, pipeline paging | 1 critical (live 500 on a uuid query param), 2 high (unpaged SCALE_SENSITIVE reads; money summed in JS and across currencies), 4 medium. Remediated in the follow-up commit; `projects.read` left open as a decision (see below). L112 and L113 written. |

### From the 2026-10-02 review

Remediated on branch `messaging`, in the commit after the merge of main:
every high item; of the medium items, the Bird timeout, the number-order
idempotency key, the contact lookup indexes (`20261003110000`), the
`+server.ts` rule globs, the objectives read guard, the payroll write-policy
test, the merge itself (with the design doc renumbered to 38 and budgets
recorded for the new pages), and the check-step counts. The `/payroll/export`
whole-period read is now a named exception in performance.md rather than
redesigned. **Still open:** the fixture has no hourly employee — adding one
moves row counts that dozens of tests assert exactly, so it is its own
change; and `/messaging/[id]` has no perf budget because the perf tenant
has no messaging rows to open (a generator step for `messaging_*`).

High:

- **Inbound mail with a subject over 998 characters, or a sender name over
  200, is a 500 at `recordInbound`** (`messaging_messages.subject
  VARCHAR(998)`, `messaging_conversations.counterparty_name VARCHAR(200)`;
  `inbound.ts` passes `data.subject` and `sender.name` through untouched).
  Bird redelivers eight times over 27 hours, then drops the message. Fix:
  truncate at the column width in `inbound.ts`, as `status_detail` already is.
- **The perf tooling writes to whatever `DATABASE_URL` names**
  (`packages/database/perf/measure.mjs` `register()`: a tenant, eight
  `auth.users` with the password `devpassword`, identities), and the only
  guard is a `127.0.0.1|localhost` regex that a tunnel passes. `./check
  --all` and the pre-push hook run it. Fix: refuse unless the URL's port is
  the perf cluster's, the way the conformance runner does.
- **Page numbers from the query string reach `LIMIT`/`OFFSET` unvalidated on
  14 pages and in `pageParam` itself** (`?page=1.1`, `?page=1e400`,
  `?page=99999999999999999999` → `invalid input syntax for type bigint` →
  500, verified against the driver). Fix: `f.integer("page", {min, max})`
  through `FormReader`, in `pageParam`, and delete the 14 hand-rolled copies.
- **Query-string ids still go raw into `::uuid` casts** on `/documents`
  (`owner`) and `/ticketing` (`logger`, `assignee`, `subscriber`,
  `business_area`, `category`, `subcategory`) — both loads were rewritten in
  this range and did not get `uuidParam`. `?owner=garbage` is a 500.

Medium:

- **Bird calls have no timeout** (`bird.ts` `call()` uses bare `fetch`): a
  hung carrier call holds the request, or the webhook, open indefinitely.
- **Buying a number has no idempotency key and no double-submit guard**
  (`settings/messaging` `orderNumber`); two clicks can buy two numbers.
- **`matchContact` is a sequential scan of `customer_contacts`
  (SCALE_SENSITIVE) on every inbound SMS and email** — `regexp_replace(phone)`
  and `lower(email)` match no index. Needs a normalised-phone column or an
  expression index.
- **The rules files never load for `+server.ts` routes.** Every `paths:`
  glob is `**/*.server.ts`, which does not match `+server.ts`; 23 API routes
  (every report export, the invoice PDF, the document download, the chat
  stream, the payroll export file, the Bird webhook) are written without
  server.md, forms.md or tenancy-audit-pii.md in context. Add
  `**/+server.ts` to each.
- **`/objectives` and `/objectives/[id]` `load()` have no read guard**; the
  comment "matching /projects" became false when `projects.read` landed.
- **`/payroll/export` reads the whole firm's period on every page of the
  review** (JS `slice` after computing everything; 22,955 data pages in the
  budget vs ~400 for comparable pages). Justified in a comment, but
  performance.md names `/crm/pipeline` as the only known exception.
- **The committed fixture has no hourly employee**, so the payroll export's
  worked-hours and overtime path has an empty subject everywhere except
  rows the unit tests insert (L50).
- **No test watches the new payroll RESTRICTIVE write policies fail**; a
  future `DROP/CREATE` that loses `AS RESTRICTIVE` (L63) would pass
  `./check`.
- **The `messaging` branch cannot merge cleanly**: 19 files are modified on
  both sides (snapshot `.txt`s, the three registers, `menu.ts`, the fixture,
  smoke/form-errors specs, docs/11/22), the messaging design doc was numbered
  37 like main's `docs/37-payroll-provider-integration.md` (now 38), and the
  three new pages have no row in `budgets.tsv`, so `./check --all` fails
  with "no budget — a new page?" until `pnpm db:perf regress --update` runs
  on the perf cluster.
- **`docs/35-check-steps.md` on main is stale** (three tables, five deleted
  and two added actions, the audit register, test counts); the branch
  updated its own copy, which will need redoing after the merge.

Low (reported, not tracked here): outbound `rfc_message_id` is synthesised
(`<em_id@domain>`), not Bird's real Message-ID — misleading data;
`unreadCount` in `messaging.repo.ts` is dead code; the thread page's
`markRead` fires once per thread, so a reply that arrives while the thread
is open leaves the inbox marked unread; `useProvider` in `mailer.ts` is a
module-level mutable test seam; the mailer's per-recipient loop can send to
one recipient and report `send_failed` for the batch; a blanked payroll code
does not unmap its source despite the comment; export provider codes are not
formula-neutralised (`-VAC`); `payroll_export.test.ts:173` asserts a
scenario its comment does not describe; raw ISO dates on the export review
page instead of `calendarDate()`; the perf cluster's transition path records
migrations as applied without applying them; "Load more" on a company's
activities stops silently at page 10; Combobox options are tabbable;
`employees.list`/`customers.list` ILIKE still unescaped; three uncapped
counts on SCALE_SENSITIVE tables bounded by one entity; stale `/payroll/runs`
references in TESTPLAN.md, docs/32 and two repository comments.

### Open from the 2026-10-01 review

- ~~**`projects/[id]` and `/projects` have no read permission on
  `load()`.**~~ **Closed.** `projects.read` now exists and sits in
  `EVERYONE`, the same split as `document.read`: the permission is whether a
  staff member may open the module, and `project_visibility` RLS decides
  which projects they then see (everything not `is_restricted`, plus what
  they manage or hold a group grant on). No staff member's access changed;
  what the guard adds is an explicit refusal for a `customer` base role,
  which is deliberately not built on `EVERYONE`. Neither authorization suite
  named a projects permission, so the conformance bridge needed no change.
- **Seven `(app)` loads have no permission check at all** — attendance,
  time-off, the four employee pages, payroll payslips. All pre-date this
  review window and several are plausibly deliberate (every employee may read
  the directory). Worth confirming one by one rather than assuming either way.
- **CI itself is in scope for a review.** `tests.yml` had never passed —
  thirty runs, none green — while four other workflows were. Two suites,
  including five Storage RLS tenant-isolation assertions, had never executed.
  Fixed in `b1908bb`; recorded as L114. When reviewing a range, check
  `gh run list --workflow=<file> --limit 30` for every workflow, not the
  latest run: "failing" and "has never passed" look identical on one red tick.
- **`customer-contacts.departments()`** does a `SELECT DISTINCT` over a
  SCALE_SENSITIVE table to populate a filter. Bounded in output, unbounded in
  work; fixing it is a different design (a lookup table or a cap), not a
  `LIMIT`.
