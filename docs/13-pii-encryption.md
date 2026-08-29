# PII Encryption

**Status:** implemented for `employees.ssn_tax_id` and
`employee_bank_accounts.account_number_encrypted`; the remaining fields are
named and tracked below
**Created:** 2026-08-29

**This document describes engineering, not legal advice.** It implements the
technical measure that GDPR Article 32, the US state breach-notification safe
harbours and India's DPDP Act section 8(5) all point at — encryption at rest
with keys held separately. Compliance is mostly *not* code: processing records,
DPAs, residency, retention schedules and breach procedures sit outside this
repository. Have a lawyer read that half.

---

## The shape

```
PRIVATE_PII_KEK               master key, versioned, in env/KMS
   │                          NEVER in Postgres
   │ wraps (AES-256-GCM)
   ▼
pii_keys.wrapped_dek          one data key PER EMPLOYEE
   │                          the row holds only the wrapped form
   │ encrypts (AES-256-GCM)
   ▼
employees.ssn_tax_id_ct       {"v":1,"k":1,"iv":…,"ct":…,"tag":…}
```

A database dump, a replica or a stolen backup is inert: it contains ciphertext
and wrapped keys, and the key that unwraps them was never in the database.

---

## Three decisions, and why

### The specification's key derivation is not implemented

`module-employee-profile.md` § Encryption Key Generation says:

```
encryption_key = DERIVE_KEY(org_prefix + org_4digit_code)
```

**This is not a key.** `org_prefix` is a public identifier and
`org_4digit_code` has ten thousand values, so the whole key space is about
13 bits — an attacker holding one ciphertext tries every candidate in seconds.
No key derivation function repairs a search space that small; PBKDF2 and Argon2
raise the cost per guess, and ten thousand guesses stays cheap. Worse, both
inputs are stored in the very database the encryption protects, so anyone who
can read the ciphertext can already read the recipe.

What the spec appears to want is a stable key *identifier* per organisation, and
that is honoured: `{org_prefix}-{4digit_code}` is recorded as `pii_keys.key_label`.
The key *material* is 32 bytes from `randomBytes`.

### Keys are per EMPLOYEE, not per tenant

GDPR Article 17 is a right held by an individual. A tenant-wide key cannot
answer one person's erasure request — destroying it would erase the whole firm,
so erasure would fall back to `UPDATE … SET NULL`, which does nothing about the
copy in last night's backup.

A per-subject key makes erasure real: destroy the key and every ciphertext
belonging to that person is unrecoverable **everywhere it exists**, including in
backups already taken. That is the single most important property of this
design, and `pii.test.ts` asserts it directly.

### Encryption happens in the application, not in Postgres

`pgcrypto` would put the plaintext *and* the key into the database server's
memory, its statement log, and `pg_stat_statements` — which is installed here —
so a database compromise would yield both halves. `pgsodium` is deprecated by
Supabase and is not an option. Doing it in Node keeps the key out of Postgres
entirely.

---

## What is protected

**Every ciphertext is bound to where it lives.** The AAD is
`tenant | table | column | row`, so a value lifted from one row and written into
another fails to authenticate rather than decrypting into the wrong person's
record. Without it, `UPDATE employees SET ssn_tax_id_ct = (SELECT … )` would
silently graft one employee's tax identifier onto another.

**Randomised, never deterministic.** Two employees with the same tax identifier
produce different ciphertext, so nobody can group people by equal value without
decrypting.

**The plaintext index is gone.** `idx_employees_ssn_tax_id` was a btree over
plaintext tax identifiers, which kept every one of them readable in the index
pages — and dropping a column does not scrub the pages an index was built from.
It was dropped in the same migration.

**No blind index.** Exact-match lookup by tax identifier is not a feature this
product has. Adding one later means re-encrypting, which is the price of not
making equal values linkable today.

---

## Rotation

Rotating the master key re-wraps one small row per employee. **No field
ciphertext is touched**, because fields were never encrypted under the master
key — that is what the envelope buys.

```bash
# 1. add a version; the newest encrypts, all versions still decrypt
PRIVATE_PII_KEK="1:<old>,2:<new>"
# 2. re-wrap in the background — pii.repo.ts: needsRewrap(), rewrapSubject()
# 3. when needsRewrap() returns nothing, drop version 1
PRIVATE_PII_KEK="2:<new>"
```

Removing a version while rows still reference it raises loudly rather than
looking like data loss.

---

## Erasure

`eraseSubject()` destroys the key first, then writes the audit record, then
nulls the columns. **The order is deliberate:** if the process dies between
steps, the data is already unrecoverable, which is the better failure.

`pii_erasures` records *that* an erasure happened — subject, reason, requester,
timestamp — and never the key. It is what answers a regulator asking you to
demonstrate the request was honoured (GDPR Art. 30, and the equivalent
demonstrability expectation under the DPDP Act). It is written even when there
was no key to destroy, because "there was nothing to erase" is itself the
answer.

---

## What is NOT encrypted, and why

| Field | Why it stays plaintext |
|---|---|
| `first_name`, `last_name`, `email` | The directory does `ILIKE` substring search across all three, and login resolves by email. Ciphertext defeats both. Protected by RLS and tenant isolation |
| `birth_date` | Age, tenure and birthday calendars are computed in SQL |
| `phone` | Displayed on every profile; low marginal benefit against a searchable directory |

These remain in scope for RLS, access control and the audit trail. Encryption is
one control among several, not the only one.

### Still plaintext, and tracked

Seventeen columns hold PII and are not yet encrypted — bank details, emergency
contacts, certification numbers, counterparty tax and bank identifiers. They are
named in `verify-invariants.sql` under `_pii_pending`, so `./check` fails if one
disappears without the list being updated. **None may carry real data in
production until it is encrypted.**

---

## The drift guards

`./check` runs four rules, and each has been shown to fail on the regression it
is meant to catch:

| Rule | Catches |
|---|---|
| `pii/plaintext-removed` | someone re-adds `employees.ssn_tax_id` |
| `pii/ciphertext-is-sealed` | a repository writing the raw value into a `_ct` column — the regression that type-checks, passes review, and leaves the identifier in the clear under a name that says otherwise |
| `pii/pending-tracked` | a tracked column vanishing without the list being edited |
| `pii/keys-are-wrapped` | raw key material stored in `pii_keys` |
| `pii/encrypted-name-is-honest` | a column *named* as encrypted holding something that is not. `employee_bank_accounts.account_number_encrypted` shipped full of `enc:<uuid>` placeholders — a name asserting protection is worse than an honest plaintext name, because nobody re-reads it |

The first version of `pii/ciphertext-is-sealed` had `FROM employees` hardcoded,
so registering a second encrypted field produced a check that **passed while its
column was full of plaintext** — a vacuous pass in the guard whose entire job is
catching them. It is now dynamic over the registry, and that was proved by
dirtying the second table and watching it fail.

---

## Deployment

`PRIVATE_PII_KEK` must be set before the first encrypted write, and **backed up
independently of the database**. Losing it destroys every encrypted field with
no recovery — that is the design working as intended, and it is why the key
belongs in a managed secret store with its own backup, not in a `.env` file on
one machine.

The local development value in `.env.example` is a public, deterministic demo
credential — the same class as the `app_user` password. It exists so a fresh
clone can read the fixture. **Never point it at anything real.**

---

## Related

- [10-lessons-learned.md](./10-lessons-learned.md) — L38
- [12-beta-deployment.md](./12-beta-deployment.md) — this closes the first gap listed there
- `apps/web/src/lib/server/pii/` — `envelope.ts` (pure), `keys.ts`, `pii.repo.ts`
