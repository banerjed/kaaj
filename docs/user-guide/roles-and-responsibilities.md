# Roles and Responsibilities

**Who this is for:** whoever sets up Kaaj for your firm and decides what each
person can see and do.

You do not need to read this end to end. If you want the short answer, read
[Who should be what](#who-should-be-what) and stop.

---

## How access works here

Kaaj gives each person **one base role** — their floor — and **any number of
functional roles** on top.

That is deliberate. In a firm of thirty people the office manager often runs HR
*and* orders the laptops. A system that allows only one role per person forces
you to either over-grant ("just make them an admin") or maintain two logins.
Neither is a good answer, so Kaaj does not ask the question.

```
   Nadia Hassan
   ├── base role         Employee          ← everyone has exactly one
   └── functional roles  HR Admin          ← as many as the job needs
                         IT Admin
```

---

## Base roles

Everyone has exactly one.

| | What it means |
|---|---|
| **Owner** | Runs the account. Billing, subscription, and the only role that can transfer ownership or permanently erase someone's data. Keep this to one or two people |
| **Firm Admin** | Everything an Owner can do except billing and ownership. This is the role for a senior operations or office manager |
| **Employee** | The default. Sees themselves, the staff directory, their own pay, time off and attendance |
| **Contractor** | For people engaged but not employed. Like Employee, but without the staff directory or colleague profiles |

---

## Functional roles

Add as many as the job genuinely needs — and no more.

| | Give this to someone who… | They get |
|---|---|---|
| **HR Admin** | runs people operations | Employee records, hiring and offboarding, time off, and the sensitive fields — tax IDs and bank details. Sets pay |
| **Payroll Admin** | runs payroll | Pay runs, payslips, tax filings. Can *see* pay but **cannot change it** |
| **Finance Admin** | keeps the books | Invoices, bills, the ledger, banking, expenses, chart of accounts |
| **Sales Admin** | owns the pipeline | Clients, CRM, proposals |
| **Marketing Admin** | runs campaigns | Marketing hub, campaigns, analytics |
| **IT Admin** | manages equipment and access | Assets, user groups, integrations, ticket setup. **Never sees tax IDs or bank details** |
| **Legal Admin** | handles contracts and compliance | Documents, contracts, change requests, audit records |
| **Project Manager** | runs client or internal projects | Their projects and tasks, and timesheet approval for them |
| **Auditor** | needs to inspect but never change | Read-only across the whole firm. Cannot write anything, anywhere |

---

## Two rules Kaaj enforces for you

These are not preferences. Kaaj will refuse the combination.

### The person who sets pay cannot approve the payroll run

**HR Admin** changes salaries. **Payroll Admin** approves the run that pays
them. One person cannot hold both.

This is the oldest control in payroll, and it exists because the alternative is
that one person can quietly give themselves a raise and then approve their own
payment.

**One honest limit: this rule does not bind the Owner.** An Owner can do
everything, including both halves of it — and can change anyone's roles, so any
rule they met they could remove first. That is what being the account owner
means, not a gap we forgot. It is the reason to keep Owner to one or two people
you would already trust with the company bank account, and to give everyone else
the narrower roles above.

### IT Admin never sees tax IDs or bank details

Your IT person needs to issue laptops, manage groups and configure integrations.
None of that requires anyone's national insurance number. "Admin" does not mean
"everything" here, and that is on purpose.

### And one that applies to everyone, including the Owner

**Nobody approves their own request.** Not their own leave, not their own
timesheet. There is no role that grants it and no setting that turns it off.

---

## What managers get automatically

You do not grant "Manager". Kaaj works it out.

If other people list someone as their manager, that person can see their team's
pay, approve their leave, and approve their timesheets — for their reporting
line only, however deep it goes. Change who reports to whom, and access follows
the same day.

---

## Who sees sensitive information

Tax identifiers and bank account numbers are treated differently from everything
else. They are encrypted, and only HR Admin, Payroll Admin, Firm Admin and Owner
can reveal them.

**People cannot see their own full tax ID or bank number in the app.** They see
the last four digits of their account, enough to recognise it. This is not an
oversight — a screen showing someone's full bank details is a screen anyone
walking past can read, and the value is not something they need day to day. To
change them, a person submits a change request, which HR approves.

If someone needs a full copy of their own data, that is a data export request —
a deliberate, recorded action, not something rendered on a page.

---

## Who should be what

### A firm of about ten people

| Person | Base | Functional |
|---|---|---|
| Founder | Owner | Payroll Admin |
| Operations / office manager | Firm Admin | HR Admin, IT Admin |
| Bookkeeper (often external) | Contractor | Finance Admin |
| Everyone else | Employee | — |

The office manager sets pay; the founder approves the run. Note the founder is
the Owner, so the rule does not constrain them — in a firm this size the founder
*is* the control. The separation becomes real as soon as you have someone who is
not the Owner doing one of the two jobs.

### A firm of about fifty

| Person | Base | Functional |
|---|---|---|
| Founder / MD | Owner | — |
| Head of Operations | Firm Admin | — |
| HR lead | Employee | HR Admin |
| Finance lead | Employee | Finance Admin, Payroll Admin |
| IT lead | Employee | IT Admin |
| Sales lead | Employee | Sales Admin |
| Marketing lead | Employee | Marketing Admin |
| Team leads | Employee | Project Manager |
| Everyone else | Employee | — |

Managers are not listed because they do not need to be.

### External accountant or auditor

Base **Contractor**, functional **Auditor**. They can read what they need and
change nothing. If they also do your bookkeeping, that is Finance Admin instead
— Auditor cannot be combined with a role that writes, or it is not an audit.

---

## Choosing well

**Start narrow.** It is easy to add a role and awkward to explain why someone
had access they should not have. Everyone starts as Employee.

**Grant the job, not the person.** "Rachel is senior" is not a reason for Finance
Admin. "Rachel reconciles the bank statements" is.

**Two Owners, not one.** If your only Owner loses access, nobody can transfer
ownership. Two is a safety measure, not a hierarchy.

**Review when people move.** Kaaj suggests a role when you add someone to a
department, but it never changes access on its own — moving from Sales to
Finance does not remove Sales Admin. That is deliberate, and it means someone
has to look.

---

## Changing someone's roles

Only the **Owner** can grant or remove roles.

One thing to know: a change to someone's roles can take **up to an hour** to
take effect while they are signed in. If you need it immediately — someone
leaving under difficult circumstances, or an account you think is compromised —
deactivate the person rather than only changing their roles. That takes effect
at once.

---

## Common questions

**Can I create my own roles?**
Not yet. The nine functional roles are fixed for now. Custom roles are planned;
if the set above does not fit your firm, that is worth telling us, because it
tells us what to build.

**Can I give someone access to only one office or department?**
Not yet. Roles currently apply across the whole firm. Scoped access — "HR Admin
for the India entity only" — is designed for and planned.

**Someone has two jobs. Do they need two accounts?**
No. That is what functional roles are for. Give them both.

**What happens to their access when someone leaves?**
Deactivate them. Access stops immediately. Their records stay, because you need
them for payroll history and statutory retention. Permanently erasing a person's
data is a separate, deliberate action that only the Owner can take.

**Who can delete someone's data entirely?**
Only the Owner, and it is irreversible by design. Erasing someone destroys the
key that protects their sensitive data, which makes it unrecoverable everywhere
— including in backups taken before the request. That is what a proper erasure
request requires.

---

*The engineering specification behind this — what is enforced where, and what is
not yet built — is in [14-access-control.md](../14-access-control.md).*
