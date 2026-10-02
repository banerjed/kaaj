---
paths:
  - "apps/web/src/routes/**/*.server.ts"
  - "apps/web/src/routes/**/+server.ts"
  - "apps/web/src/routes/**/*.svelte"
  - "apps/web/src/lib/server/forms.ts"
  - "apps/web/src/lib/form-*.ts"
  - "apps/web/e2e/form-errors.spec.ts"
---

# Form rules

Claude Code loads this file when it reads a page, a form action or the form
helpers.

## Forms

**Every field that an action writes goes through `FormReader`
(`$lib/server/forms.ts`). This rule applies to all fields. Do not use
`formString` for a value that goes into a column.** `required`, `maxlength`
and `type` are only browser UX. A crafted POST does not contain them.
`varchar(n)`, `uuid` and Postgres enums are the *last* protection. When they
refuse a value, the result is an unhandled 500, not a field error
([L34](docs/10-lessons-learned.md)).

| Column | Reader | What it stops |
|---|---|---|
| `varchar(n)`, `text` | `text(name, { max: n })` | `value too long`, which is a 500. `max` **must** be equal to the length of the column. The reader counts code points, as Postgres does |
| `uuid` | `uuid(name)` | `invalid input syntax for type uuid` from a hidden `id` field |
| a Postgres enum | `enumValue(name, "<type>")` | `invalid input value for enum`. The values come from `@kaaj/enums`, and `./check` keeps them the same as the database |
| a fixed set on `varchar` | `choice(name, ALLOWED)` | a value that is not on the list, which then gets to the display code |
| `date` | `date(name)` | `2026-13-45`: the shape is correct, but the date is not real, and the cast causes a 500 |
| money and rates | `decimal(name, { scale })` | a conversion to float64 and back, and a third decimal that the column rounds away with no error |
| `int4` | `integer(name, { min, max })` | a value out of range, which also causes a 500 |
| a locale / zone / currency | `locale` / `timezone` / `currency` | `en_US` and similar values: a `RangeError` inside `Intl`, on each page that formats a number for that office ([L24](docs/10-lessons-learned.md)) |

Country-specific formats come from `@kaaj/validation`. Do not write a regex
at the call site. Examine the length of the result before you store it.

**An optional field has three possible results, not two.** The results are
blank, valid and *rejected*. If the code returns the same value for an
invalid field as for a blank field, it deletes the field and reports success.
An overtime multiplier disappeared in this way, and the application then
calculated overtime at 1x ([L33](docs/10-lessons-learned.md)). `FormReader`
has a design for these three results. A hand-written `Number(x) || 0` does
not.

**Read every field BEFORE `if (!f.ok)`. Do not read a field inside the object
that you make after that test.** If you call a reader in the argument to
`create`/`update`, the reader runs after the `if (!f.ok)` test. Thus the
rejection occurs too late, and the action cannot report it. A field that is
not required returns `null` when the reader rejects it. Then the column gets
NULL, and the action answers `saved: true`. This bug occurred one time, in
the same commit that documented L33.

Put the value in a local variable above the `if (!f.ok)` test, and use that
variable:

```ts
const middleName = f.text("middle_name", { max: 100 })   // ✅ before
if (!f.ok) return fail(400, f.problem())
await repo.update(tx, id, { middle_name: middleName })

await repo.update(tx, id, {
  middle_name: f.text("middle_name", { max: 100 }),      // ❌ never reported
})
```

**Validate a value from the QUERY STRING too. Use `uuidParam`, or a
`FormReader` on a `FormData` that you make.** The Forms rule above is
necessary because a crafted POST does not contain `required` and `type`. A
query string never had these attributes. `url.searchParams.get()` returns
`""` for `?x=`. For `?x=garbage`, it returns the text that the user typed. If
either value goes to a `::uuid` or `::date` parameter, the result is an
Internal Error, not an empty filter.

For this reason, `projects/+page.server.ts` and `receive-payment` make a
`FormData` and read it through `FormReader`. `uuidParam`
(`$lib/server/forms.ts`) is the short form for one field.

**Do not give `''` to a parameter that has a cast.** SQL does not stop the
evaluation after the first true condition. Thus
`(${x} = '' OR c = ${x}::date)` does the cast in all cases. For `::date`,
postgres.js serialises the value in the driver. The driver then throws
`RangeError: Invalid time value` before it sends the query. Give `null`, and
use `IS NULL` in the query ([L37](docs/10-lessons-learned.md)).

**If the reader cannot express a rule, call `f.reject("field")`.** Examples
are a cycle, two dates that conflict, and a band with its limits in the wrong
order. Thus each rejection comes through one path, and the page can put the
cursor on the field.

**If the database can refuse a write, catch the refusal and answer with a
sentence.** `FormReader` validates the shape of a value. It cannot know that
a different row already uses the code. It also cannot know that a user
archived the row a minute before. When the code did not catch these refusals
(UNIQUE, CHECK, FK), each one gave an "Internal Error" page. The form also
lost its contents ([L66](docs/10-lessons-learned.md)).

```ts
try {
  return await withTenant(actorFrom(locals), async (tx) => { … })
} catch (e) {
  const refused = constraintFailure(e)   // $lib/server/db/constraints
  if (refused) return refused
  throw e
}
```

The constraint registry uses **`constraint_name` as its key, never the
message text**. The name is in the migration. SQLSTATE `23505` alone cannot
tell which field to mark. A constraint that is not in the registry continues
to cause a visible crash. That crash makes someone add the constraint to the
registry. This is better than a generic "something went wrong" message, which
hides the constraint.

The `./check` step `refusals have a message` examines each constraint on a
form-written table. The step fails if a constraint is not in the registry and
has no exemption with a reason.

**A regex for the shape does not validate a date.** `/^\d{4}-\d{2}-\d{2}$/`
accepts `2026-02-31`. postgres.js then converts it through a JS `Date` and
stores `2026-03-03`. There is no error, and the action answers `saved: true`
([L67](docs/10-lessons-learned.md)). Use `f.date()`, which parses the date
and converts it back to text to compare. The same rule applies to all values
that the driver serialises. Validate each value in the units that the column
stores.

**A write reports what it DID, not that the request arrived.** An
`UPDATE … WHERE id = $1` that matches no row still succeeds. Thus all eight
`archive` actions answered `{ archived: true }` for rows that did not exist.
They also wrote an audit entry for it ([L68](docs/10-lessons-learned.md)).
Add `RETURNING id`, and make sure that the query returns an id. For each
write, ask this question: **if this write does nothing and gives no error,
does the page look different?**

**The page MARKS a refused field, and the form stays on the page for this.**
This has three parts. Each part failed separately before
([L68](docs/10-lessons-learned.md)):

- The message NAMES the field. `f.problem()` does this by default ("Check
  Anchor date."). Thus, do not give only "Some fields need attention."
- The control has the daisyUI modifier AND `aria-invalid`, through
  `fieldErrors(form)` in `$lib/form-errors`. A screen reader does not
  announce a red border.
- A modal form uses `use:enhance={closeOnSuccess(() => (editing = null))}`
  from `$lib/form-enhance`. A plain POST reloads the page and resets the
  `$state` that keeps the modal open. **`update({ reset: false })` is
  necessary.** The default resets the form and discards the work that the
  user must correct. For the same reason, a form that is not modal uses
  `keepValues`.

`apps/web/e2e/form-errors.spec.ts` asserts all three parts. It stays
read-only because it submits only values that the action refuses.

`src/lib/server/forms.test.ts` is the regression test. Before the reader
existed, each case in it gave a 500, or a `saved: true` with no error, from
the application. If you add a new reader, add cases to this file.
