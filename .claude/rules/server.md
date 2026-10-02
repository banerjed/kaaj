---
paths:
  - "apps/web/src/routes/**/*.server.ts"
  - "apps/web/src/routes/**/+server.ts"
  - "apps/web/src/lib/server/**"
  - "apps/web/src/hooks.server.ts"
---

# Server rules

Claude Code loads this file when it reads server code: a `load()`, a form
action, a hook or a file in `$lib/server`.

**Write every form action out in the page's own `actions` object.** Shared
action code is a handler that the page calls after its own `requireCan`. Do not
spread actions into the object (`{ ...sharedActions() }`). The authorization
step and the audit step of `./check` read the `actions` object of each page.
Thus, they do not see the guard or the audit classification of a spread
action, and both steps still pass ([L110](docs/10-lessons-learned.md)).

**Type every `tx` query that returns data to a page.** Downstream, an untyped
row is `any`, and `any` satisfies each parameter. Thus, the compiler allows an
argument with the wrong shape, and nobody can examine that argument.
`data.tenant` was untyped, and a `FormatContext` argument received a bare
string. The page then rendered a timestamp with no date, and `svelte-check`
passed ([L53](docs/10-lessons-learned.md)).

**If a page layout and an action write path depend on the same question, use
one exported function for the predicate. Both must call it.**
`crm/companies/[id]` asked `customer_type === 'individual' && contacts.length === 1`
in the template. It asked `customer_type === 'individual'` in the action.
Nobody could save a row in the shape that the second predicate matched and
the first did not match. Nothing found the bug, because both halves typecheck
and the fixture had no such row ([L113](docs/10-lessons-learned.md)). The next
rule has the same reason: the vocabulary of a `text` column lives in one
place.

**A vocabulary for a plain `text` column lives in the repository, and the
pages import it.** These columns have no enum and no CHECK. Thus, the list IS
the constraint. Two copies of a constraint are one constraint, and the two
copies will disagree. `/projects` filtered on a status list that did not
include `draft`, the column default. The first project that a user created
would be correct in the database, but no filter would show it
([L57](docs/10-lessons-learned.md)). For each new write, ask: **can the page
that lists this item find it again?**

**The `load()` of a page has a guard for its own read permission. A
`requireCan` in the `actions` of that page does not cover `load()`, and a
guard in a parent layout does not cover it.** Eight `/settings/*` pages had
`requireCan(ctx, "firm.settings.write")` in their write action. In `load()`,
they had only `if (!locals.tenantId)`. Thus, each signed-in staff member could
read all eight pages, with no admin role. The sidebar did not show a link to
these pages, but that is not a permission (L44).

The shared `(app)/+layout.server.ts` guard is for general identity: a
signed-in session, and staff or portal contact. It is not for the specific
permission of a page. A write guard protects only the POST. Add
`requireCan(contextFrom(locals),
"<module>.<thing>.read")` as the first line of `load()`, immediately after the
tenant guard. The read permission and the write permission are different
strings in `@kaaj/authz` on purpose ([L79](docs/10-lessons-learned.md)).

**Do not write an error to a log as it is. Send it through `safeError`
(`$lib/errors.ts`), and send an unexpected error through `handleError`.** A
`PostgresError` holds the row that caused it in `detail`. It also holds
`where`, `query` and the bound parameters. Postgres does not give `detail` to
`app_user`, so the request path is already safe. But the table owner sees
`detail`. `./check`, the migrations, `verify-remote.sh` and all code on the
service role connect as the table owner ([L69](docs/10-lessons-learned.md)).

The allowlist is a second defence there, and it is the only defence in all
other places. For each role, `message` repeats the submitted value. For
example, the value in `invalid input syntax
for type date: "1985-03-12"` is a date of birth. This is why these log lines
stay in infrastructure that we control.

**Every unexpected error gets an id, and the id is on the page.**
`handleError` in both hooks makes an id. It writes the error to stdout as
JSON, with the id and the actor from `locals`. Then it returns
`{ id, message }`. SvelteKit replaces the real message with "Internal Error"
before the message gets to the browser. Thus, without the id, a bug report
has nothing to quote, and we have nothing to search for.
