# User Guide

Documentation written for the people who **use** Kaaj — firm owners,
administrators, and the staff whose records live here.

Everything else in `docs/` is written for whoever builds Kaaj. The two have
different readers and different rules:

|  | `docs/user-guide/` | the rest of `docs/` |
|---|---|---|
| Reader | a firm's owner or administrator | a contributor |
| Assumes | nothing about software | the codebase |
| Says | what to do and why it matters | how it works and what it cost |
| Avoids | table names, roles-as-strings, anything about RLS or encryption internals | nothing |

A page here should be readable by someone who has never opened a terminal. When
a user-facing page and an engineering document describe the same thing, the
engineering document is authoritative and the user-facing page links to it —
never the reverse.

## Pages

- [Roles and Responsibilities](./roles-and-responsibilities.md) — who can see
  and do what, how to decide, and the two rules Kaaj enforces for you
