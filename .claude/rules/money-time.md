---
paths:
  - "apps/web/src/lib/format.ts"
  - "apps/web/src/lib/decimal.ts"
  - "apps/web/src/lib/server/accounting/**"
  - "apps/web/src/lib/server/payroll/**"
  - "apps/web/src/lib/server/compensation/**"
  - "apps/web/src/lib/server/hr/**"
  - "apps/web/src/lib/server/time-tracking/**"
  - "apps/web/src/routes/(app)/accounting/**"
  - "apps/web/src/routes/(app)/payroll/**"
  - "supabase/migrations/**"
  - "packages/database/fixtures/**"
---

# Money and time rules

Claude Code loads this file when it reads code that formats, stores or
calculates money, a date or a time.

## Time

**A `timestamptz` is an instant. Render it in the timezone of the OFFICE**
(`firm_locations.timezone`). Do not use the timezone of the user, and do not
use UTC. The same instant is a 09:00 start in Bangalore and a 22:30 finish in
New York. Only one of these is a workday. `instant()` in `$lib/format.ts`
takes the zone. No other code formats a time.

**A `timestamptz` alone does not give a local date.**
`hr_attendance.attendance_date` is the date in the office. A shift that ends
at 23:00 in New York ends at 04:00 UTC on the next day. A `::date` cast on a
timestamp column causes this bug. Apply `AT TIME ZONE` first
([L35](docs/10-lessons-learned.md)).

**A `DATE` column has no zone. Format it in UTC.** A hire date is the same day
in all places. `calendarDate()` does this. For this reason, it is a different
function from `instant()`.

**postgres.js returns `timestamptz` as a `Date` and `NUMERIC` as a string.**
`types: {}` registers custom handlers. It does not remove the built-in
handlers ([L36](docs/10-lessons-learned.md)). Declare repository types from
the values that the driver returns, not from the column type.

**Durations go through `hours()`**, which renders `7h 45m`. If you print
decimal hours, the default limit of three digits in `Intl` changes a stored
`6.9333` into `6.933`. That is not the stored value, and it is not a number
that a user can recognise.

**Never compare a database value to `Date.now()`.** The application and
Postgres are on different machines. The clock of a Docker VM drifts when the
host sleeps. Compare against `clock_timestamp()` in the same query. To prove
that the database used a column default, assert `col = now()`
([L43](docs/10-lessons-learned.md)).

## Money

**`NUMERIC`, never `real`/`double precision`/`float`.** Postgres `NUMERIC` is
exact base-10. The float types are binary, and they lose digits before any
code reads the value. We measured this against this database: `99999.99`
stored as `real` returns `100000`, and `1234567.89` returns `1234570`. A
later round operation cannot recover that loss. `./check` fails on a money
column that has a float type. Refer to the `money/numeric-not-float`
invariant.

**We chose two scales on purpose:**

| Kind | Type | Why |
|---|---|---|
| Money: salaries, invoices, premiums | `numeric(15,2)` | Ten trillion minor units. This scale holds INR amounts at crore scale |
| Rates and quantities: hourly rates, hours, FTE | `numeric(18,4)` | A rate of 12.3456/hour has a meaning. If you round it before you multiply, the error increases across each line of a timesheet |

**Money is a `string` in TypeScript, from the database to the browser and
back.** People get this rule wrong. Most errors in money amounts occur at
this point, not in the database.

- postgres.js returns `NUMERIC` as a **string**, and `client.ts` sets
  `types: {}` so that it stays a string. Do not parse it to make it easier to
  use.
- `Number("9007199254740993.00")` is `9007199254740992`, with no error.
- Repository types declare money as `string`. `money()` in `$lib/format.ts`
  takes a string. It converts the string only inside `Intl.NumberFormat`.
- Form fields use `inputmode="decimal"`, never `type="number"`. A
  `type="number"` field converts the value to a float in the browser and back.

**Money inside JSONB is a string too.** Examples are `salary_ranges`,
`costs_by_currency` and `overtime_rules`. Postgres stores a JSON *number*
exactly. But Postgres gives that number to JavaScript as a float64 when the
application reads it. Thus the loss occurs on the read, where nothing looks
wrong.

Store `"95000"`, not `95000`. A comparison of order uses `compareDecimal` in
`$lib/decimal.ts`, which compares the strings and does not parse them.
`./check` cannot see inside a JSONB column, so this rule is the only
protection.

**An invariant that reads `information_schema.columns` cannot see inside
JSONB.** `money/numeric-not-float` never could see inside JSONB. That is how
payroll kept every earning and every tax as a JSON number
([L41](docs/10-lessons-learned.md)). `money/jsonb-is-text` examines each path
in a committed list instead. Add each new JSONB money column to that list on
purpose. Every other list in this project works the same way.

**Arithmetic occurs in SQL, not in JavaScript.** Sums of invoice lines,
calculation of gross pay and proration all use `NUMERIC` in Postgres, where
the arithmetic is exact. If you add two money strings in JavaScript, the
result is a *concatenation* of the strings, and no type error occurs.

**The currency always stays with the amount,** and the application never
converts it for display (BR-FP-003). The application shows an amount in its
currency of record. It formats the amount in the locale of the market that
the amount belongs to. Refer to `localeForCurrency` and
[L24](docs/10-lessons-learned.md).

**Postgres ROUNDS a value to the scale, with no error. It does not truncate
the value.** `12345678.9052::numeric(12,2)` is `12345678.91`. If you store the
same value in two columns of different scale, round it to the scale of the
authoritative column first. Then write the other column. Pick a test value
that shows the difference between a rounded value and a truncated value:
`.9052`, not `.9012` ([L25](docs/10-lessons-learned.md)).

**All display goes through `$lib/format.ts`. No other code formats money.**
`money()`, `approxMoney()`, `number()`, `hours()`, `calendarDate()`,
`instant()` and `localised()` are the only places that construct `Intl` for
display. If a component uses `Intl.NumberFormat` or `toLocaleString()`, that
is a bug. Its output will become different from the rest of the application.
Also, it will use the locale of the *browser*, not the locale of the market.

**Two functions, and the choice is visible at the call site:** `money()` is
exact, and it is the default. `approxMoney()` abbreviates. It follows the
convention of the locale. There is no lakh or crore code anywhere, because
`Intl` already has this data:

```
en-US  18,123,432  ->  $18.12M
en-IN  18,123,432  ->  ₹1.81Cr      (crore; en-IN 1,423,323 -> ₹14.23L)
```

The function shows a maximum of 2 decimals. It does not add decimals, so
`950` stays `$950` and does not become `$950.00`.

`approxMoney` is a separate function, not an option, so that a reviewer sees
the choice. On a payslip line, `approxMoney` looks wrong to a reviewer. A
`compact: true` inside an options object does not look wrong.

**Abbreviated money is for scale, never for action.** `approxMoney()` is for
dashboards, chart axes and summary tiles. These show numbers that a user
reads to understand size. Never use `approxMoney()` on:

- a payslip
- an invoice line
- a salary band
- a tax amount
- an amount that a user reconciles against a bank statement.

`₹14.23L` is not a number that you can pay to a person. The abbreviation
loses data on purpose. If you are not sure, use `money()`. An exact amount
where an approximate amount was sufficient is a cosmetic problem. An
approximate amount where an exact amount was necessary is a financial
problem.

**Custom fields must never supply data to payroll or accounting
calculations.** Custom fields have no type and no tests. If an organization
needs a custom allowance on a payslip, that is a gap in the data model of the
product. Fix the gap in the product. Do not use a custom field.

We rejected the alternative, integer minor units. The reasons are in
[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md).
