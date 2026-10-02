# Payroll — export hours to the customer's payroll provider

Status: **in progress** (US). Providers: ADP RUN, ADP Workforce Now, Gusto,
Paychex Flex.

## Decision

Kaaj does not calculate pay. The customer keeps its own account with a
payroll provider, which calculates gross-to-net, files taxes, pays people and
issues payslips. Kaaj produces, for a pay period, **a file of each hourly
employee's approved hours and every employee's time off**, in that provider's
import format. The customer downloads it from Kaaj and uploads it in the
provider. The product claim is "Works with ADP, Gusto and Paychex".

Why this and not an API integration:

- All four providers import hours from a file the customer uploads, with no
  partner agreement. This is how most workforce products connect to them.
- ADP's documented partner model (ADP Marketplace) also leaves approval with
  the customer's practitioner in ADP's screens, and needs a partner agreement,
  ADP's security review, single sign-on and mutual-TLS certificates before
  the first customer. It is the next step if customers ask for automation —
  see "Later" below.
- No SSN, bank account or W-4 data leaves Kaaj: the file holds the
  provider's employee id, hours and, for Gusto, the employee's name.

The previous run lifecycle (draft → calculate → approve → finalize) and the
payslip pages are removed: with the provider calculating pay, they had
nothing real to show. The payroll tables stay, unused, until a later step
fills them from the provider.

---

## What goes in the file

**Source.** Approved time-tracking entries (`time_tracking_entries.status =
'approved'`) and approved time off (`hr_time_off_requests.status =
'approved'`). Attendance is not a source: no code writes `hr_attendance` yet.

**Who.** Worked hours are exported only for employees whose current
`compensation_base` row is `hourly`. Providers pay salaried employees their
salary without hours, so exporting a salaried employee's hours would pay them
twice. Time off is exported for every employee, because providers track
leave balances for salaried staff too.

**Overtime.** Kaaj classifies worked hours before export; all four providers
expect overtime as hours, not as raw time.

- The rule comes from `firm_payroll_policies` for the employee's office, or
  the firm-wide policy (`location_id IS NULL`) if the office has none:
  `daily_threshold_hours`, `weekly_threshold_hours`, `double_time_after_hours`,
  and `workweek_start_day` (0 = Sunday).
- It applies only if the employee's current `compensation_base.overtime_eligible`
  is true. Otherwise every hour is regular.
- Per day: hours above `double_time_after_hours` are double time; hours above
  `daily_threshold_hours` (and not double time) are overtime.
- Per workweek: the remaining regular hours above `weekly_threshold_hours`
  are overtime. The workweek is counted from its first day, **including days
  before the period starts**, but only the days inside the period are
  exported.
- The calculation is SQL, on `NUMERIC`. Each employee's total per hour type
  is rounded to two decimals once, at the end.

**Time off.** Each time-off policy maps to a provider code, or explicitly to
"not exported" (unpaid leave). A request that extends outside the period is
prorated by the weekdays that fall inside it; the review page lists each such
request, because the provider may expect a different split.

**Not included yet:** holidays, bonuses, commissions and reimbursements. The
review page says so. Customers enter those in the provider.

---

## Formats

| Provider | Source of the format | Shape | Employee id | Company field |
|---|---|---|---|---|
| ADP RUN | ADP's "Time Sheet Import" guide | first row `##GENERIC## V1.0`; one row per employee per earnings code; dates `MM/DD/YYYY`; `Separate Check` 0; `Rate Code` `BASE` | RUN employee id or time-clock id | Company Code (IID) |
| ADP Workforce Now | ADP's "Importing Paydata" guide | one row per employee; `Co Code, Batch ID, File #` first; `Reg Hours`, `O/T Hours`, then up to two `Hours 3/4 Code` + `Amount` pairs; ASCII only; file name `PRcccEPI.csv` | File # | Co Code; Kaaj generates the Batch ID |
| Gusto | Gusto help centre; columns from a third party | one row per employee; `first_name, last_name, title`, one column per hour type | matched by name | none |
| Paychex Flex | third parties only | one row per employee per pay component, 16 columns | Worker ID | Client ID |

Rules for every writer:

- **No zero for "no hours".** Gusto overwrites an entry with a zero, and
  Workforce Now reads an empty field as "no data". An hour type with no
  hours has no row, or an empty field.
- Hours are written with two decimals (`80.00`): Workforce Now reads a value
  with no decimal point as a whole number.
- Ids are text: Workforce Now and Paychex ids can start with zeros. The
  review page tells the customer not to open and re-save the file in Excel.
- RUN files hold **one pay frequency**, and the dates must match RUN's next
  payroll; the export page asks for the frequency and exports only employees
  with that frequency.
- **Gusto and Paychex layouts are not confirmed by the provider.** The
  export page marks them "check on first import". Replace the layout with
  the provider's own template when a customer account can download it.

## Refusals

The download is refused, and the review page lists why, if any employee in
the file:

- has no id for the selected provider, or
- has hours of a type with no code mapping for that provider.

A file that leaves someone out pays them nothing, with no error. The review
page also shows, without refusing, the number of time entries in the period
that are still draft or submitted, and (for Gusto) employees with the same
name.

## Data

| Table | Holds | Visibility | Scale |
|---|---|---|---|
| `payroll_export_settings` | the tenant's provider and company code | tenant-wide (no secret) | bounded |
| `payroll_export_codes` | per provider: Kaaj hour type or time-off policy → provider code, or "not exported" | tenant-wide | bounded |
| `payroll_employee_ids` | per provider: employee → provider employee id, unique per provider | tenant-wide (a provider's internal id, not a national id) | bounded |

## Pages

- **Settings → Payroll export**: provider, company code, code mappings.
- **Payroll → Employee ids**: the provider id of each employee, paginated.
- **Payroll → Export**: period dates and (RUN) pay frequency; a review of
  each employee's hours by type, paginated; the problems; **Download**.

Permissions: the export and the id pages require `payroll.run`, held by
roles that can read every employee's time and compensation. Settings
require `firm.settings.read`/`write`. Each download records an `export`
audit entry with the provider, the period and the counts, in the same
transaction that reads the hours.

---

## Later: an API connector

If customers want the upload automated, ADP Marketplace offers a partner
integration: Kaaj would push employees and pay inputs (Pay Data Input API)
and pull results (Payroll Output API) for customers who connect their ADP
account. It needs a Developer's Participation Agreement, ADP's security
review, OpenID Connect sign-on, mutual-TLS certificates, per-client consent
and credentials, a background worker and a verified notification route.
Each ADP product (RUN, Workforce Now) and each region is a separate
certification. Questions to ask ADP before starting:

1. Is there a partner API to create, submit or approve a pay run?
2. Can a partner sign up a business that is not yet an ADP client?
3. The revenue share and the usual duration of the security review.
4. US APIs for pay statement PDFs, W-2s and general-ledger output.
5. Rate limits for payroll volumes; RUN's 12-second limit on pay input.
6. One integration for RUN and Workforce Now, or two certifications?
7. Which non-US products accept pay input by API.
8. Data residency, retention and subprocessor terms.

Embedded payroll providers (Gusto Embedded, Check, Zeal) are the route if
Kaaj itself should become the payroll screen.

## Sources

- ADP RUN: "Time Sheet Import and RUN Powered by ADP",
  support.adp.com/adp_payroll/content/hybrid/@runcomplete/doc/pdf/GTS_payroll_guide.pdf
- ADP Workforce Now: "ADP Workforce Now Importing Paydata, Version 13" (ADP,
  2017), and apps.adp.com listing 372723.
- Gusto: support.gusto.com, "Upload hours and earnings to payroll"; column
  layout from docs.buddypunch.com (Gusto integration overview).
- Paychex Flex: sundialtimesystems.freshdesk.com (Paychex Flex importing
  time), help.wheniwork.com (Paychex integration), redcort.com (Paychex Flex
  integration guide).
- ADP partner programme: marketplace-cdn.adp.com/dev-portal/pdf/ guides
  (Partner Development Learning Guide, Pay Data Input and Payroll Output
  guides, Webhooks, rate-limit policy).
