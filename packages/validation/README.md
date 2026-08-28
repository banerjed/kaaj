# @kaaj/validation

33 sanitisation and validation functions covering country-specific identity, tax
and bank formats: PAN and Aadhaar (India), IFSC, IBAN, BIC, UK NIN, Canada SIN,
France INSEE, Germany Tax ID, Italy Codice Fiscale, Netherlands BSN, Sweden
Personnummer, Switzerland AVS, VAT numbers, SSN, EIN, routing numbers.

**Framework-agnostic plain ESM, no dependencies.** It must run unchanged in the
browser (instant form feedback) and on the server (the authority), and under any
future mobile runtime. This is the constraint that ruled out a non-TypeScript
backend — see
[ADR-004](../../docs/05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack):
maintaining 33 country-specific validators in two languages would produce a
wrong tax identifier on a payslip, not a cosmetic bug.

Do not add Svelte, React, or any framework import here.

```js
import { sanitizePAN, validateFields } from "@kaaj/validation"
```
