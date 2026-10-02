# SaaS Penetration Testing and Security Verification Specification v1.0

**Profile:** `PTS-SAAS-1.0`  
**Status:** Proposed internal acceptance standard; requires implementation and control-owner approval  
**Research date:** 2026-10-02  
**Suggested repository path:** `docs/security/PENETRATION_TESTING_SPEC_V1.md`  
**Intended system:** An integrated SMB SaaS with HR, accounting, CRM, projects, tickets, messaging, integrations, and AI features; SvelteKit and Supabase/Postgres reference architecture  
**Deliverable:** Test design and operating procedure. No application has been penetration tested by producing this document.

## 1. Assurance claim and limits

This specification defines a repeatable security verification program that supports a SOC 2 examination. **Passing it does not guarantee SOC 2 compliance, a favorable auditor opinion, or the absence of vulnerabilities.** SOC 2 is an independent CPA attestation about the described system and applicable controls, not a certification awarded by a scanner or test suite. Type 1 addresses control design at a specified date; Type 2 also addresses operating effectiveness over a specified period. [S1–S3]

The test program supplies technical evidence. Management must also operate governance, access reviews, risk assessment, change management, vendor oversight, incident response, personnel controls, and other controls applicable to the examination. A penetration test cannot retrospectively supply missing operational evidence for an observation period.

The intended claim is:

> For an identified build, configuration, environment, scope, and test period, the applicable scenarios were executed, their evidence was reviewed, and findings were handled under the approved risk policy.

Do not market an internal `PTS-SAAS-1.0` result as a SOC 2 report or certification.

### 1.1 Three layers of assurance

| Layer | Question answered | Typical evidence | Limitation |
| --- | --- | --- | --- |
| Repeatable security verification | Do specified security properties hold for this build? | Authorization fixtures, RLS tests, browser/API checks, SAST/SCA, authenticated DAST | Covers specified cases and supported tooling |
| Manual penetration assessment | Can a qualified tester combine weaknesses to cross a trust boundary or cause business harm? | Validated reproductions, attack chains, coverage notes, independent report, retest | Limited by scope, access, time, and tester judgment |
| SOC 2 controls examination | Are the system description and applicable controls supported by sufficient evidence? | CPA examination, management assertion, control populations, samples and results | Broader than technical application testing |

A clean scan is not evidence that tenant isolation works. A clean penetration report is not evidence that every employee access review occurred.

### 1.2 Normative language

- **MUST:** Required by this internal profile once adopted.
- **SHOULD:** Expected practice; deviations need documented rationale.
- **MAY:** Optional implementation choice.
- **Company-policy default:** A proposed operating target, not an AICPA-mandated frequency, deadline, tool, test count, or auditor requirement.

## 2. Source hierarchy and baseline

Use the following standards for different purposes, rather than treating them as interchangeable checklists.

| Source | Baseline in this specification | Role |
| --- | --- | --- |
| AICPA Trust Services Criteria | 2017 TSC with revised points of focus, 2022 | Controls examination framework; management and CPA confirm applicability [S2] |
| OWASP ASVS | Version 5.0.0; target applicable Level 2 requirements | Technical requirements and a separate completeness matrix [S4] |
| OWASP WSTG | Version 4.2 | Manual web testing methodology; use versioned references [S5] |
| OWASP API Security Top 10 | 2023 edition | API risk prioritization; not a complete verification standard [S6] |
| NIST SP 800-115 | September 2008 final | Assessment planning, execution, analysis, mitigation [S7] |
| NIST SP 800-218 | SSDF 1.1 | Secure development and vulnerability response practices [S8] |
| FIRST CVSS | Version 4.0 | Consistent technical severity; supplement with business context [S9] |
| OWASP GenAI guidance | LLM Top 10 2025; Agentic Applications 2026 pack when applicable | AI threat modeling and adversarial tests [S10, S11] |
| Official SvelteKit and Supabase documentation | Match deployed versions; record a snapshot date | Stack-specific implementation and test considerations [S12–S18] |

Versions above are deliberately pinned; they are not a commitment to auto-adopt future releases. Review baseline changes through change control. The ASVS project identifies 5.0.0 as stable and recommends version-qualified requirement identifiers. WSTG lists 4.2 as the released baseline while 5.0 is under development. [S4, S5]

**Important completeness rule:** The scenario catalog in section 9 is an original product-specific baseline. It is not the full ASVS. Before claiming ASVS Level 2 verification, separately import the official pinned requirements, assess every applicable Level 1 and Level 2 requirement, and maintain reviewed evidence. Record selected Level 3 requirements for particularly sensitive components without claiming full Level 3 coverage.

Exact ASVS requirement identifiers MUST be copied from the official pinned release and checked during review. Do not invent mappings or reuse identifiers from older versions.

## 3. Definition of profile acceptance

A build receives `PTS-SAAS-1.0: PASS` only if all of the following hold:

1. Asset inventory, data flows, threat model, and authorization matrix are approved and match the build.
2. Every applicable catalog scenario has an instantiated procedure and terminal result.
3. Every mandatory applicable scenario is `PASS`; an unresolved `FAIL`, `BLOCKED`, or `NOT_RUN` prevents strict profile acceptance.
4. Every relevant invariant is checked at the specified boundary using an independent observer.
5. Sensitive workflows have both denied and permitted control cases.
6. All actual exposures discovered outside the catalog are recorded and triaged.
7. All critical/high findings and all business-impact blockers are fixed and retested.
8. Required manual review and production configuration validation are current under company policy.
9. The tested application artifact, database migrations, RLS/grant policy versions, infrastructure configuration, and production deployment are linked.
10. Evidence is retained securely, exclusions are approved, and retests preserve the original finding history.

Low/medium observations may remain open only if they do not represent failed mandatory requirements and have current dispositions. An accepted exception to a mandatory requirement changes the result to `EXCEPTION`, not strict `PASS`. The release decision is recorded separately.

### 3.1 Result semantics

| Result | Definition | Treatment |
| --- | --- | --- |
| `PASS` | Expected security outcome observed; positive control works; evidence sufficient | Counts as completed/pass |
| `FAIL` | Expected outcome violated | Create or link finding; blocks strict acceptance |
| `BLOCKED` | Cannot conclude due to missing access, unsafe conditions, authentication failure, or broken observer | Does not count as pass |
| `NOT_RUN` | No execution evidence | Does not count as pass |
| `NOT_APPLICABLE` | Feature/surface absent or outside the approved system boundary; rationale and approver recorded | Excluded from applicable denominator; reassess on changes |
| `EXCEPTION` | Applicable failed requirement has an approved, time-limited risk acceptance | Visible deviation; no strict profile pass |

Scanner alerts are not test results until triaged. A false positive requires a technical explanation and reproducible evidence. A compensating control must itself be tested; its existence does not change a broken requirement into a pass without an approved profile revision.

### 3.2 Coverage measurement

Track both catalog IDs and concrete instances. `TEN-001` must expand across each protected object class and relevant access path; one invoice request does not establish complete tenant isolation.

```text
Completion = (PASS + FAIL + EXCEPTION) / applicable instantiated cases
Strict pass rate = PASS / applicable instantiated cases
Applicable instantiated cases = all instances except approved NOT_APPLICABLE
```

Report blocked/not-run counts, exclusions, untriaged alerts, and high-risk surface coverage alongside percentages. Raw request count and number of findings are not measures of assurance quality.

## 4. System boundary and assessment profiles

### 4.1 Asset register

Each asset MUST have an ID, accountable owner, environment, exposure, data classification, tenant model, provider, and evidence route.

| Asset type | Examples to inventory | Required question |
| --- | --- | --- |
| Application entry points | Custom domains, preview URLs, origin hosts, old API versions, admin portal | Can an alternate path bypass the normal control? |
| Server execution | SvelteKit routes/actions/remote functions, jobs, workers, edge functions | Where is identity, tenant context, and permission checked? |
| Database | Every project/database, pooler, table, view, function, schema, role | Which callers can reach it, and with what privileges? |
| Storage | Buckets, downloads, signed links, exports, attachments | Who can list, read, overwrite, share, and delete? |
| Realtime | Broadcast, Presence, Postgres Changes, websocket handlers | Are send, receive, and revocation separately protected? |
| Integration | Payroll, banking, payments, email, OAuth apps, callbacks | How are tenant ownership, scopes, signatures, and retries enforced? |
| AI | Retrieval indexes, prompts, memory, tools, model vendors | Can untrusted text cross a data or action boundary? |
| Operations | CI/CD, cloud consoles, secrets, monitoring, backups, support access | Can a privileged path defeat tenant isolation? |
| User devices/identity | Corporate identity provider, managed endpoints, admin accounts | What sits within the SOC 2 boundary and who tests it? |

Provider-owned infrastructure is not a target merely because the application depends on it. Test your configuration and integration within provider policy; review provider assurance and shared responsibilities separately.

### 4.2 Deployment modes

Maintain separate applicability manifests for:

- `SHARED_DB`: shared database with tenant-bound authorization/RLS where applicable.
- `PRIVATE_DB`: database/project per customer, with explicit credential and routing isolation.
- `HYBRID`: shared control plane and separated customer data planes.

Private databases do not eliminate risks in tenant routing, service credentials, support tools, caches, analytics, backups, shared storage, queues, or AI indexes. Test an ordinary Tenant A identity against Tenant B's private data plane using the application and approved direct paths.

For replicated customer deployments, verify configuration drift across the fleet. Representative exploitation samples may be risk-based, but configuration controls should cover the full population. Include every distinct template/version/region/auth mode; record selection and remaining limitations.

### 4.3 Assessment modes

| Mode | Required use in this profile | Purpose |
| --- | --- | --- |
| External unauthenticated | Applicable public services | Exposure, authentication entry points, alternate origins |
| Authenticated gray-box | Every product module and privileged workflow | Tenant isolation, role boundaries, state abuse, integrations |
| White-box review | Authorization, tenant routing, privileged DB access, sensitive jobs, AI tools | Verify security boundaries and discover paths a crawler misses |
| Assumed-compromise review | Scoped infrastructure/control plane | Understand blast radius of a leaked test credential or compromised worker |
| Detection validation | Selected attack simulations | Confirm event generation, alerting, triage, and response |

Phishing, physical intrusion, customer endpoint assessment, destructive testing, and sustained denial-of-service are separate scope packs. They MUST NOT be silently assumed to be authorized.

## 5. Rules of engagement

No actual penetration testing starts until a signed engagement record exists. This document is a design guide and grants no permission to probe any system.

The record MUST include:

1. Named owner authorization, testing entity, dates, timezone, and escalation contacts.
2. Explicit domains, origin hosts, IP ranges, projects, tenant fixtures, and API surfaces.
3. Provider restrictions and approvals required for the proposed techniques.
4. Permitted identities/roles, source addresses, traffic ceilings, and authentication methods.
5. Environment-specific permitted operations and excluded systems.
6. Synthetic data handling, encrypted evidence transfer, retention and destruction rules.
7. Stop conditions, incident escalation, rollback contacts, and cleanup duties.
8. Whether support impersonation, privileged credential exercises, or detection tests are included.

### 5.1 Environment policy

| Environment | Default activity | Required safeguards |
| --- | --- | --- |
| Ephemeral/local | Invariant tests, role fixtures, security mutation checks | Synthetic data; isolated outbound network; no production secrets |
| Production-like staging | Manual testing, active DAST, bounded concurrency, parser/file tests | Same relevant security configuration; sandbox providers; restore plan |
| Production | Approved low-impact validation of deployed configuration and synthetic tenant paths | Explicit production scope; traffic cap; monitoring; no real payments/messages |

Staging cannot prove production WAF, domain, IAM, secrets, or logging configurations. Production validation does not require exposing real customer records. Capture configuration equivalence and gaps explicitly.

### 5.2 Stop conditions

Stop the affected activity and contact the owner if real customer data becomes reachable, unintended financial actions occur, instability exceeds the agreed threshold, unexpected secrets are exposed, an out-of-scope service is encountered, or compromise appears genuine. Preserve the minimum evidence needed; do not continue bulk extraction to demonstrate impact.

Use controlled canary records, tester-owned callbacks, sandbox payment/payroll endpoints, and bounded requests. Evidence of one unauthorized synthetic record can establish a boundary failure without collecting a customer database.

NIST SP 800-115 informs the assessment lifecycle. The environment restrictions above are this profile's operational design, not verbatim NIST rules. [S7]

## 6. Canonical security fixtures

### 6.1 Tenants and objects

Create a fresh `PTS_GOLDEN_SEED_V1` for each isolated run namespace.

| Fixture | Purpose |
| --- | --- |
| `TENANT-A`, `TENANT-B` | Completely unrelated customers with similar data shapes |
| `TENANT-C` | Disabled/offboarded tenant; retained data follows approved policy |
| `A-INV-001`, `B-INV-001` | Invoice, lines, payment history, and export |
| `A-EMP-001`, `B-EMP-001` | Synthetic employee PII, compensation, and payroll instruction |
| `A-TICKET-001`, `B-TICKET-001` | Ticket plus attachment and comments |
| `A-CRM-001`, `B-CRM-001` | Customer/contact/opportunity |
| `A-PROJECT-001`, `B-PROJECT-001` | Private project/task |
| `A-CHANNEL-PRIVATE`, `B-CHANNEL-PRIVATE` | Private message room and presence |
| `A-FILE-PRIVATE`, `B-FILE-PRIVATE` | Sensitive file and signed-link variant |
| `A-JOB-001`, `B-JOB-001` | Queued export or scheduled job |
| `A-VECTOR-001`, `B-VECTOR-001` | Private AI retrieval record with a unique canary |
| `A-INTEGRATION-001`, `B-INTEGRATION-001` | Separate provider sandbox accounts and callback ownership |

Seed unique canaries such as `PTS_B_PRIVATE_7F19` into body fields and nested artifacts. A canary detector supplements field/object assertions; it cannot replace them because leaks may be transformed, summarized, or partial.

Store no real employee identifiers, bank details, payroll credentials, or production secrets in fixtures. IDs are aliases resolved by a seed manifest, not hardcoded production UUIDs.

### 6.2 Principals

| Principal | Canonical permissions |
| --- | --- |
| `ANON` | Only explicitly public product content |
| `A-OWNER` | Tenant A administrative scope; no Tenant B access |
| `A-FINANCE` | A accounting data and permitted finance operations; no HR compensation access by default |
| `A-HR` | A HR data; no finance administration by default |
| `A-MANAGER` | Defined team/project resources; no broad sensitive employee access |
| `A-MEMBER` | Own permitted profile and assigned/shared resources |
| `A-GUEST` | One explicitly shared fixture; no discovery of other resources |
| `A-REVOKED` | Previously permitted member whose membership is removed |
| `B-OWNER`, `B-MEMBER` | Tenant B control cases |
| `AB-MEMBER` | A and B membership with different roles; tests tenant switch and permission unions |
| `SUPPORT-READ` | Time-bound approved support grant; no automatic customer access |
| `WORKER-A` | Test worker executing A's authorized job; privilege scoped as designed |

This is a proposed fixture policy. Adapt it to the product's actual supported roles before adoption. If the product intentionally combines HR and finance permissions, record that explicitly rather than asserting an imaginary boundary.

### 6.3 Independent authorization oracle

Maintain a human-reviewed permission table of:

```text
principal × tenant × object class × ownership/team scope × action × field classification × state
```

The expected-permission model MUST NOT import production permission resolvers, RLS-generation functions, tenant-routing helpers, or policy caches. A bug in production logic must not be repeated in the test oracle.

Use independent observers to read protected state after attempted writes. Privileged test clients may seed/observe state but MUST NOT be used as the attacker principal. Redact their credentials from evidence.

### 6.4 Timing and side effects

Pin a test clock where possible. Use unique event/idempotency IDs and sandbox outbound sinks. Record real UTC timestamps for assessment evidence even when business clocks are simulated.

Before execution, configure explicit limits for session revocation, websocket disconnect, job cancellation, signed-link expiry, alert delivery, and deletion completion. A null or unspecified limit makes the relevant case `BLOCKED`.

Proposed fixture defaults: membership/role revocation takes effect within 60 seconds, ordinary signed links expire within 300 seconds, and selected security alerts arrive within 5 minutes. These are company-policy targets. Sensitive actions MUST recheck current authorization at execution/commit rather than relying only on an old token. Existing bearer links may require separate invalidation or acceptably short expiry; document that behavior.

## 7. Global security invariants

Run the relevant invariants after each operation and at async execution/completion boundaries. Not every invariant is observable from one HTTP response.

| ID | Invariant | Independent evidence |
| --- | --- | --- |
| SEC-INV-001 | Cross-tenant private data is never disclosed to an unauthorized principal | Response/stream/file inspection and protected-state observer |
| SEC-INV-002 | Unauthorized operations cause no protected business side effect | Before/after state, queues, provider sandbox outbox |
| SEC-INV-003 | Authorization is enforced by the trusted execution boundary | Direct API/action/DB path tests; UI visibility alone is insufficient |
| SEC-INV-004 | Tenant context originates from verified membership and trusted routing | Tampered input and routing observation |
| SEC-INV-005 | Field permissions prevent sensitive disclosure despite object-level access | Nested fields, exports, search, error and AI output inspection |
| SEC-INV-006 | Roles/membership cannot be self-elevated through user-controlled claims or fields | Rejected mutation plus membership/role snapshot |
| SEC-INV-007 | Role removal/revocation affects all relevant paths within declared bounds | Old session/token, websocket, queue and cache checks |
| SEC-INV-008 | Privileged credentials stay within approved server boundaries | Deployed bundles, serialized data, logs and artifact inspection |
| SEC-INV-009 | Authentication validation fails closed for invalid/untrusted credentials | Negative cases and working positive control |
| SEC-INV-010 | Cache/connection/job context cannot bleed between identities or tenants | Interleaved requests and observed routing |
| SEC-INV-011 | Alternate access paths enforce equivalent intended permissions | App, Data API, RPC, storage and realtime comparison |
| SEC-INV-012 | Input cannot alter query/command structure or browser execution outside intended behavior | Bounded parser/injection checks; source review |
| SEC-INV-013 | Financial/external actions require current scope, permitted state and necessary approval | Sandbox effect count and workflow history |
| SEC-INV-014 | Replayed external events cannot duplicate protected effects | Event registry, business state and sandbox effect count |
| SEC-INV-015 | Sensitive files and exports remain tenant- and permission-bound | Creation, retrieval, delivery, expiry and sharing checks |
| SEC-INV-016 | Trusted audit events preserve actor, tenant, operation, result and correlation | Central protected audit records; denied writes may create security logs |
| SEC-INV-017 | Logs/errors contain no credentials or unnecessary sensitive payloads | Redacted artifact scans and manual samples |
| SEC-INV-018 | AI retrieval and tools cannot exceed the caller's current permissions | Retrieval corpus, tool trace and state observer |
| SEC-INV-019 | Every relevant deployed instance matches approved security configuration | Fleet/configuration comparison and drift evidence |
| SEC-INV-020 | A backup/restore preserves isolation, access constraints and protected history | Restore checks and policy/grant comparison |

An invariant passing means it held for observed cases; it is not a mathematical proof over all possible program executions.

## 8. Execution methodology

### 8.1 Engagement phases

1. **Plan:** Scope, ownership authorization, risk register, threat model, test matrix, and rules of engagement.
2. **Validate environment:** Seed fixtures; verify all principal logins; identify the exact deployed build/configuration and outbound sandboxes.
3. **Discover:** Inventory routes and services through approved reconnaissance, source review, API specifications, and observed traffic.
4. **Verify:** Run automated checks and manually challenge trust boundaries with known positive controls.
5. **Demonstrate impact:** Use minimal, bounded synthetic reproductions and approved attack chains.
6. **Validate detection:** Correlate selected attack events with monitoring, triage, and response records.
7. **Report and triage:** Separate verified findings, unverified alerts, limitations, and incomplete coverage.
8. **Remediate and retest:** Test the original path, nearby variants, permitted behavior, and the deployed fix.
9. **Close:** Revoke access, remove fixtures where required, reconcile sandbox effects, and archive protected evidence.

### 8.2 Case instantiation

Every catalog row becomes one or more case records containing:

- Catalog ID plus instance ID, e.g. `TEN-001/invoice/app-read`.
- Asset and deployed build/configuration reference.
- Preconditions, principal, tenant, object, action, endpoint/path, and test data.
- Exact mutation/probe, permitted control, expected denial semantics, and side-effect assertions.
- Timing bounds, observer queries, applicable invariants, and evidence locations.
- Execution mode (`AUTOMATED`, `MANUAL`, `CONFIG_REVIEW`, `EXERCISE`) and result.

For denied reads, define the actual API contract: `403/404`, an empty filtered collection, or another safe response as appropriate. A `200` with unauthorized data is a failure; a `403` after an unauthorized write is also a failure. Mere absence of a known canary is insufficient.

For a nonexistent-versus-forbidden resource comparison, test the documented enumeration policy. Do not require every API to return identical status codes when the threat model explicitly permits different behavior.

### 8.3 Minimum expansion dimensions

Cover object ID, nested/parent ID, tenant ID, request body, query/filter, header, and trusted host resolution where relevant. Repeat for read, create, update, delete, bulk, search, export, share, callback, async job, and realtime paths actually present.

For authorization, cover same tenant/wrong role, same tenant/wrong ownership, different tenant/same role, dual membership/different role, guest, revoked identity, and anonymous access.

For state-dependent actions, cover stale permission, canceled/closed objects, concurrent changes, and retried events.

## 9. Named scenario catalog

The rows below specify a probe and required outcome. They become mandatory when the relevant surface is present and inside the approved system boundary. Optional features require approved `NOT_APPLICABLE`, not silent omission. Automated-only execution is insufficient where the mode requires manual review.

Modes: **A** automated regression; **M** manual assessment; **C** configuration/source review; **E** operational exercise. Combined modes mean complementary work, not interchangeable choices.

### 9.1 Discovery and exposed surfaces — SURF (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| SURF-001 | Compare public domains, origin endpoints and preview hosts to inventory | Every reachable entry point has an owner and intended exposure | M+C |
| SURF-002 | Access old API versions and deprecated routes | Retired routes unavailable or enforce current security policy | A+M |
| SURF-003 | Visit debug, diagnostic and developer interfaces | No public secrets or privileged actions | M+C |
| SURF-004 | Check exposed backups, configuration artifacts and source maps | No credentials or protected data; intentional public code documented | M+C |
| SURF-005 | Assess admin/support interfaces with anonymous and tenant identities | No control-plane access outside the permitted scope | A+M |
| SURF-006 | Check scoped service exposure against approved network baseline | No unintended database, management or internal service exposure | M+C |
| SURF-007 | Inspect abandoned DNS/service references without claiming third-party resources | No unresolved takeover exposure; owner fixes orphan references | M+C |
| SURF-008 | Compare API specification, source routes and crawler traffic | Uncrawled protected routes identified and tested | M+C |
| SURF-009 | Check custom-domain ownership and tenant resolution | Unverified host cannot bind or select another tenant | A+M |
| SURF-010 | Inspect errors and metadata from public surfaces | No protected data, credentials or internal privileged details | A+M |

### 9.2 Authentication and identity lifecycle — AUTH (14)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| AUTH-001 | Access protected operation without credentials | Denied; no data or business side effect | A |
| AUTH-002 | Present expired, malformed, wrong-issuer or wrong-audience tokens | Rejected under actual credential type; valid control accepted | A+M |
| AUTH-003 | Alter signed token identity/role or supply an untrusted signature | Cannot assume a new identity or privilege | A+M |
| AUTH-004 | Exercise password reset ownership and link lifecycle | Bound to intended account; expiry and single-use policy enforced | A+M |
| AUTH-005 | Compare known/unknown account login/reset responses | Enumeration behavior meets approved threat policy | A+M |
| AUTH-006 | Run bounded failed-login/reset attempts | Limits and alerting work without creating uncontrolled lockout | A+M |
| AUTH-007 | Change password or sensitive login email | Reauthentication/verification and session treatment meet policy | A+M |
| AUTH-008 | Attempt administrative/sensitive path without required MFA assurance | All alternate paths enforce required assurance | A+M |
| AUTH-009 | Exercise MFA enrollment, replacement and recovery | Account ownership verified; downgrade cannot bypass policy | M+C |
| AUTH-010 | Reuse/forward invitations or alter invited tenant/role | Intended recipient/tenant/role bound; lifecycle enforced | A+M |
| AUTH-011 | Link OAuth/social identities with colliding/unverified emails | No account takeover or unauthorized account merge | M+C |
| AUTH-012 | Test SSO tenant binding, logout and enforcement | IdP and tenant policy cannot be bypassed through local login | A+M+C |
| AUTH-013 | Offboard identity and retry all supported credential types | Access denied within approved revocation bounds | A+M |
| AUTH-014 | Create/use/revoke scoped machine/API credentials | Intended scope, expiry and tenant binding enforced | A+M+C |

### 9.3 Sessions and browser credential handling — SES (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| SES-001 | Inspect session cookies in deployed browser | Secure transport and appropriate HttpOnly/SameSite/path scope | A+C |
| SES-002 | Compare pre-login and post-login session identifiers | No session fixation; identifier treatment matches session design | A+M |
| SES-003 | Logout and retry access/refresh credentials | Documented revocation behavior; sensitive actions denied | A+M |
| SES-004 | Remove membership while holding an old access token | No stale permission past declared bounds | A+M |
| SES-005 | Submit forged cross-origin cookie-authenticated mutations | State change denied while legitimate origin works | A+M |
| SES-006 | Inspect CORS with untrusted origins and credentialed requests | Protected browser responses inaccessible under approved policy | A+C |
| SES-007 | Exercise idle/absolute expiry and refresh rotation where supported | Configured session bounds hold; replay behavior recorded | A+M |
| SES-008 | Use simultaneous sessions during role/tenant changes | Permissions do not merge or persist unexpectedly | A+M |
| SES-009 | Inspect browser history, storage, redirects and referrers | No unintended token/secret leakage | M+C |
| SES-010 | Simulate stale sign-in or missing step-up for sensitive operation | Required fresh authentication enforced at trusted boundary | A+M |

### 9.4 Role, field and object authorization — AZ (14)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| AZ-001 | Finance identity reads HR compensation through every present path | Sensitive HR fields denied under fixture policy | A+M |
| AZ-002 | HR identity invokes finance/admin operations | Denied outside approved role scope | A+M |
| AZ-003 | Member invokes owner-only operation directly | Server denies despite client/UI manipulation | A+M |
| AZ-004 | Member changes self role, tenant ownership or permission fields | No self-elevation or partial elevated state | A+M |
| AZ-005 | Guest lists/searches neighbors of a shared resource | Only explicitly shared scope returned | A+M |
| AZ-006 | Manager changes target employee/team identifiers | No access outside assigned management scope | A+M |
| AZ-007 | Request hidden fields through nested expansion/projection | Field policy enforced on every serialization path | A+M |
| AZ-008 | Submit mass-assignment fields on create/update/import | Protected fields ignored safely or rejected; state verified | A+M |
| AZ-009 | Bulk request mixes permitted and forbidden objects | Defined atomic/partial contract; forbidden objects untouched | A+M |
| AZ-010 | Reuse a sharing grant after revocation/expiry | Access ceases under declared sharing semantics | A+M |
| AZ-011 | Use support identity without an active scoped support grant | No implicit tenant data access | A+M+C |
| AZ-012 | Replay time-bound support grant for another tenant/action | Scope/expiry enforced and real actor audited | A+M |
| AZ-013 | Change membership/role during a sensitive write | Current authorization checked at protected action boundary | A+M |
| AZ-014 | Compare intended hierarchy/ownership permissions across modules | Independent authorization matrix holds with working positive controls | A+M+C |

### 9.5 Tenant isolation — TEN (18)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| TEN-001 | A principal requests known B object IDs | No B object/field disclosure | A+M |
| TEN-002 | A principal updates/deletes known B object IDs | B state unchanged; no downstream effect | A+M |
| TEN-003 | A principal creates a child under B parent | Rejected; no cross-tenant association/orphan | A+M |
| TEN-004 | Alter tenant ID in body/query/header | Trusted membership controls destination | A+M |
| TEN-005 | Mix A parent with B child/foreign key | Cross-tenant link prevented across all relevant relationships | A+C |
| TEN-006 | Remove or widen tenant filters on list/search | B data/counts/facets not exposed under policy | A+M |
| TEN-007 | Request B export/report then retrieve async artifact | Creation, retrieval and delivery remain scoped | A+M |
| TEN-008 | Subscribe/publish to B realtime topics | No unauthorized send, receive or presence | A+M |
| TEN-009 | Address B file paths, buckets or share URLs | No unauthorized private file access | A+M |
| TEN-010 | Invoke exposed RPC/functions against B targets | Tenant and action policy hold beneath application layer | A+M+C |
| TEN-011 | Interleave A/B requests against shared cache | No identity/tenant/permission cache bleed | A+M |
| TEN-012 | Interleave pooled DB requests using A/B tenant context | Context resets correctly; no connection reuse leakage | A+C |
| TEN-013 | Tamper A job payload to reference B tenant/resources | Worker rejects inconsistent ownership; no B effect | A+M+C |
| TEN-014 | Route A identity toward B private database/project | No B access or use of B credentials | A+M+C |
| TEN-015 | Switch dual-member identity between A/B with distinct roles | No role union or stale tenant context | A+M |
| TEN-016 | Query shared analytics/search/AI retrieval for B canaries | Permissions hold in every derived data store | A+M+C |
| TEN-017 | Disable/offboard C and attempt retained-data access | Ordinary access stops; retention/admin exceptions controlled | A+M+C |
| TEN-018 | Restore/migrate/copy a tenant fixture | Ownership, routing, credentials and isolation remain correct | A+C+E |

### 9.6 Supabase/Postgres and direct data paths — DB (14)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| DB-001 | Inventory grants and RLS on every exposed table/schema | No protected relation relies on an absent intended guard | A+C |
| DB-002 | Direct Data API reads as anon, A member and B member | Intended data permissions hold without app server | A+M |
| DB-003 | Direct INSERT/UPDATE/DELETE with wrong tenant/owner | Old-row and new-row constraints prevent unauthorized mutation | A+M |
| DB-004 | Query exposed views/materialized views | Underlying protection not bypassed by view execution/grants | A+C |
| DB-005 | Invoke security-definer or privileged RPC functions | Caller/action/tenant validated; search path and grants safe | A+M+C |
| DB-006 | Attempt to alter user-editable metadata used for permissions | User metadata cannot grant trusted privilege | A+M+C |
| DB-007 | Inventory server secret/legacy service-role usage | Privileged paths independently enforce authorization; no client exposure | M+C |
| DB-008 | Inspect DB roles, direct credentials and pooler privileges | Least privilege and environment/tenant separation meet policy | C+M |
| DB-009 | Change referenced parent/tenant in bulk mutations | Relational constraints plus access policy block boundary crossing | A+C |
| DB-010 | Apply pending migration and rerun access/grant matrix | No new exposure, policy deletion or privilege widening | A+C |
| DB-011 | Rotate test DB/admin credentials and retry old ones | Old credentials fail after declared transition; service remains correct | A+E |
| DB-012 | Test privileged worker request with arbitrary caller-supplied selectors | Authorization checked before privileged query/effect | A+M+C |
| DB-013 | Inspect data transport and backup access configuration | Protected transport/storage and restricted backup access | C+E |
| DB-014 | Trigger DB failures during protected mutation | Fail closed; no partial unauthorized data/effect or leaked secrets | A+M |

Supabase publishable/legacy anon keys are intended client credentials and are not secrets merely because they appear in a browser. Secret keys and legacy service-role credentials are privileged and must remain server-side. A privileged client can bypass RLS, so testing only RLS cannot establish security of server routes that use it. [S14, S15]

### 9.7 Web, parsing and injection boundaries — WEB (14)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| WEB-001 | Submit bounded query-structure probes to filters/search/report inputs | No query injection or unauthorized data effects | A+M+C |
| WEB-002 | Insert harmless execution markers in reflected/stored HTML contexts | No unintended script execution | A+M |
| WEB-003 | Exercise rich text/markdown/link rendering | Sanitization and URL scheme handling protect each rendered context | A+M+C |
| WEB-004 | Use controlled callback and internal-address cases for URL fetchers | Fetch destinations follow egress policy; no internal privileged access | M+C |
| WEB-005 | Attempt traversal/normalization across file/template paths | Resolved path remains inside approved boundary | A+M |
| WEB-006 | Submit bounded template/command structure probes | Input remains data; no unintended interpreter execution | M+C |
| WEB-007 | Exercise XML/document deserialization where present | No unsafe entity resolution or type/object execution | M+C |
| WEB-008 | Submit duplicate/conflicting parameters and ambiguous content types | Single defined interpretation; no validator/executor mismatch | A+M |
| WEB-009 | Frame sensitive UI and inspect browser defenses | Clickjacking restrictions meet documented workflow policy | A+M+C |
| WEB-010 | Manipulate redirects, host and forwarded headers | No secret-bearing untrusted redirect or origin confusion | A+M+C |
| WEB-011 | Inspect TLS, CSP and relevant deployed browser headers | Risk-based policy holds; missing header alone is assessed in context | A+C |
| WEB-012 | Exercise malformed input/exception paths | No stack/secret/PII leakage or unsafe fallback | A+M |
| WEB-013 | Review proxy/request parsing consistency in authorized staging | No demonstrated request-boundary confusion; limits recorded | M+C |
| WEB-014 | Run real production-mode build and inspect rendered/serialized output | No server secrets, unintended private data or unsafe server/client imports | A+M+C |

Use framework APIs/configuration appropriate to the deployed SvelteKit version. Protect routes, actions, server loads and supported remote functions explicitly. A protected layout or hidden button does not establish endpoint authorization. Inspect both SSR responses and later client data fetches. SvelteKit's server-only module restrictions support preventing accidental imports, but production artifact inspection remains necessary. [S12, S13]

### 9.8 API abuse and resource controls — API (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| API-001 | Send supported/unsupported methods to protected endpoints | No method-dependent authorization bypass | A+M |
| API-002 | Exercise documented payload/record-size limits | Reject/bound work before unsafe resource consumption | A+M |
| API-003 | Test pagination/cursor/filter scope changes | Cursors and expansions do not escape authorization | A+M |
| API-004 | Exercise bounded costly reports/search endpoints | Tenant/identity limits protect shared resources | A+M |
| API-005 | Compare throttling across tenant, user and credential variants | Limits cannot be trivially bypassed through alternate identity path | A+M |
| API-006 | Repeat same idempotency key with changed actor/tenant/body | No collision-based disclosure or unintended reused effect | A+M |
| API-007 | Exercise GraphQL nesting/batching/introspection if present | Query/cost/field authorization policy holds | A+M+C |
| API-008 | Inspect response fields across roles/API versions | No excess sensitive-property disclosure | A+M |
| API-009 | Enumerate export/invite/message automation at agreed traffic cap | Business-flow abuse controls meet policy | M+C |
| API-010 | Review partner/API credential scopes against endpoints | Every operation respects credential scope and tenant | A+M+C |

### 9.9 Files, storage and exports — FILE (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| FILE-001 | Read/list private bucket as anonymous/wrong tenant | Neither object contents nor protected metadata exposed | A+M |
| FILE-002 | Overwrite/delete another principal's private object | Denied; existing object and metadata unchanged | A+M |
| FILE-003 | Upload mismatched type/name/content | Type policy enforced; unsafe content not executed | A+M |
| FILE-004 | Exercise document/image processing with bounded hostile fixtures | Processing isolated; no unsafe fetch/path/execution | M+C |
| FILE-005 | Retrieve signed URLs before/after expiry and grant changes | Declared bearer-link lifetime/revocation policy holds | A+M |
| FILE-006 | Create/download export as role later revoked | Creation, worker and download enforce current defined access | A+M |
| FILE-007 | Inspect spreadsheet export containing formula-like input | No unintended executable spreadsheet formulas under export policy | A+M |
| FILE-008 | Exercise share links and attachment parent changes | Sharing and ownership cannot broaden implicitly | A+M |
| FILE-009 | Inspect public/private bucket classification | No private document accidentally public | A+C |
| FILE-010 | Validate permitted upload-size/quarantine/scan workflow | Limits and configured inspection gates work before availability | A+M+C |

Supabase Storage uses policies on `storage.objects`; read, list, insert, overwrite and delete need their own tests. Do not assume database-table RLS automatically proves storage object security. [S16]

### 9.10 Realtime and messaging — RT (8)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| RT-001 | Join private room as wrong tenant/member | No private event or presence received | A+M |
| RT-002 | Broadcast to forbidden room | No unauthorized message/event accepted or delivered | A+M |
| RT-003 | Change topic/room identifier on an active connection | New destination independently authorized | A+M |
| RT-004 | Remove membership while socket remains open | Receive/send cease within declared bound | A+M |
| RT-005 | Attempt public-channel fallback for private content | Public transport cannot bypass private authorization | A+M+C |
| RT-006 | Subscribe to underlying Postgres Changes paths | Row/event exposure matches relevant RLS and feature semantics | A+M+C |
| RT-007 | Spoof message author/tenant/privilege in event body | Trusted identity retained; no impersonation | A+M |
| RT-008 | Exercise bounded event rate and oversized messages | Configured limits prevent shared-service abuse | A+M |

Broadcast/Presence authorization and Postgres Changes are distinct mechanisms. Supabase documents that Broadcast/Presence authorization can be cached for the connection, so a policy change alone must not be assumed to revoke a live socket. Test the application's disconnect/token-refresh strategy against its promised bound. [S17]

### 9.11 Integrations, OAuth and callbacks — INT (12)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| INT-001 | Send missing/invalid callback signature | Rejected before trusted processing or protected side effect | A+M |
| INT-002 | Replay valid callback and duplicate delivery | One permitted business effect; duplicate safely tracked | A+M |
| INT-003 | Deliver valid event for B through A integration mapping | Tenant/provider ownership mismatch rejected | A+M |
| INT-004 | Deliver stale/out-of-order state events | No state rollback, approval bypass or duplicate payment | A+M |
| INT-005 | Change signed callback body or signing context | Signature validation covers correct raw bytes and required metadata | A+M+C |
| INT-006 | Alter OAuth state/redirect/PKCE data where applicable | Flow bound to initiated actor, tenant and approved redirect | A+M+C |
| INT-007 | Attempt excessive provider scopes or cross-tenant token reuse | Least intended scopes; token cannot operate another tenant | A+M+C |
| INT-008 | Revoke integration and retry stored token/queued job | Access ends under declared lifecycle; no stale app action | A+M |
| INT-009 | Supply malformed/untrusted upstream response | No unsafe rendering, request chaining or trust escalation | A+M+C |
| INT-010 | Change payout/payroll destination without required approval | Server enforces fresh authority and approval workflow | A+M |
| INT-011 | Inspect integration secrets across errors/logs/UI/export | No provider credentials disclosed | A+M+C |
| INT-012 | Rotate signing/test credentials with overlap window | New credential works; retired credential fails after bound | A+E |

### 9.12 Cloud, hosting and control plane — CLOUD (12)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| CLOUD-001 | Inspect administrative identities and MFA enforcement | Named ownership, required assurance and least privilege | C+E |
| CLOUD-002 | Review public origins versus proxy/WAF path | Alternate origins cannot bypass relied-upon access controls | M+C |
| CLOUD-003 | Inspect production/preview/staging credential separation | Preview/low-trust deployment cannot access production protected state | C+M |
| CLOUD-004 | Inspect secrets location and runtime identity scopes | Only required components can retrieve intended credentials | C+E |
| CLOUD-005 | Review egress/network routes and controlled fetch probes | Internal/admin destinations protected by defined boundaries | M+C |
| CLOUD-006 | Evaluate scoped assumed-worker compromise in sandbox | Blast radius demonstrated and consistent with risk policy | M+C |
| CLOUD-007 | Inspect public object/log/artifact stores | No protected data or credentials publicly reachable | M+C |
| CLOUD-008 | Compare IAM/runtime/storage configuration to approved baseline | Drift detected, triaged and corrected across instances | A+C |
| CLOUD-009 | Review support/control-plane tenant access | Justified, approved, time-bound and auditable access | C+E |
| CLOUD-010 | Inspect managed-service responsibility and assurance register | Customer-owned controls and dependencies explicitly assigned | C |
| CLOUD-011 | Review region/residency configuration against commitments | Actual routes/storage/AI vendors match promised boundaries | C+E |
| CLOUD-012 | Validate scoped emergency/break-glass access | Strong custody, limited scope, alert and post-use review | E+C |

### 9.13 Build pipeline and software supply chain — BUILD (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| BUILD-001 | Inspect repository and CI identity permissions | Untrusted change cannot obtain privileged build/deploy capability | C+M |
| BUILD-002 | Scan source/history/build artifacts for real secrets | No active secret exposure; validated leak triggers incident handling | A+C |
| BUILD-003 | Analyze dependencies and deployed runtime against advisory snapshots | Relevant vulnerabilities triaged by reachability and impact | A+C |
| BUILD-004 | Review artifact provenance and deployment linkage | Tested immutable artifact is the deployed artifact | A+C |
| BUILD-005 | Submit low-trust PR/build fixture | No production secrets or write tokens exposed to untrusted job | A+C |
| BUILD-006 | Review workflows/actions/dependency pinning | Approved sources and updates; no uncontrolled privileged code loading | C |
| BUILD-007 | Exercise merge/deploy security gates with intentional failed check | Failed/blocked required checks prevent normal deployment | A+E |
| BUILD-008 | Inspect bypass/emergency deployment procedure | Named approval, reason, evidence and retrospective review | C+E |
| BUILD-009 | Review migrations/IaC changes as security changes | Approval, regression evidence and deployed versions traceable | A+C |
| BUILD-010 | Inspect code owners and sensitive control review | Authorization/crypto/tenant/AI-tool changes receive qualified review | C |

### 9.14 Logging, detection and response — LOG (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| LOG-001 | Perform permitted role/grant/integration changes | Audit records capture actor, tenant, time, result and correlation | A+E |
| LOG-002 | Execute selected denied cross-tenant probes | Security event generated as designed; no unnecessary payload logging | A+E |
| LOG-003 | Trigger bounded authentication abuse test | Expected alert delivered and routed within approved threshold | E |
| LOG-004 | Attempt log mutation/deletion as tenant/app identity | Protected audit history cannot be silently rewritten | A+C |
| LOG-005 | Inspect error, trace and audit samples for secrets/PII | Data minimization/redaction policy holds | A+M+C |
| LOG-006 | Correlate one incident simulation end to end | Event, alert, triage decision, owner and response record linked | E |
| LOG-007 | Simulate security log/alert delivery outage | Health failure detected; business fail-mode matches approved policy | E+C |
| LOG-008 | Inspect tenant access to audit reports | Reports themselves preserve tenant/field permissions | A+M |
| LOG-009 | Test timestamp/correlation consistency across services | History reconstructable with known clock assumptions | A+E |
| LOG-010 | Exercise responder containment of test identity/integration | Revocation/containment reaches all defined access paths | E |

### 9.15 Availability and recovery — RES (8)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| RES-001 | Run bounded per-tenant expensive-work fixture in staging | Other tenant service remains within agreed test threshold | A+E |
| RES-002 | Induce scoped dependency timeout/failure | Safe error; no auth bypass, duplicate effect or runaway retry | A+E |
| RES-003 | Inspect backup completion/failure monitoring | Missing backups detected under approved policy | C+E |
| RES-004 | Restore synthetic backup into isolated environment | Measured recovery meets declared RPO/RTO; data validated | E |
| RES-005 | Compare restored access policies/roles/tenant routing | Restore does not broaden permissions or reenable revoked access | A+E |
| RES-006 | Inspect and exercise backup retrieval permissions | No tenant or low-trust operator access to other tenants' backup | C+E |
| RES-007 | Fail/retry worker around commit and external sandbox call | Defined reconciliation prevents unintended duplicate effects | A+E |
| RES-008 | Exercise disruption response and customer notification decision | Responsibilities, escalation and decisions evidenced | E |

These are complementary resilience exercises. They do not authorize sustained production load attacks and do not alone establish the Availability category.

### 9.16 AI retrieval, assistants and tools — AI (12)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| AI-001 | Ask A assistant for B canary/private records | Retrieval/output does not expose B information | A+M |
| AI-002 | Ask member assistant for restricted same-tenant HR/finance records | Caller field/action permissions enforced | A+M |
| AI-003 | Place untrusted instructions in retrieved document/ticket/email | Instructions cannot expand retrieval, privileges or tool scope | A+M |
| AI-004 | Ask assistant to call owner-only tool or change identity/tenant | Tool service independently denies unauthorized action | A+M+C |
| AI-005 | Attempt external data sending through tool/URL output | Destination, scope and applicable approval checked outside model | A+M |
| AI-006 | Change approved action's recipient/amount/object before execution | Approval bound to exact intended action; tampered action rejected | A+M |
| AI-007 | Revoke access after retrieval/session creation | New actions/retrieval and retained context follow explicit revocation policy | A+M |
| AI-008 | Reuse AI memory/cache across identities/tenants | No cross-scope context leakage | A+M+C |
| AI-009 | Render/use adversarial model output in UI or downstream query | Output treated as untrusted input | A+M+C |
| AI-010 | Exercise bounded high-cost prompts/tool loops | Tenant budgets, iteration limits and timeout work | A+M |
| AI-011 | Inspect model-provider data settings, traces and secrets | Data handling matches commitments; no privileged secrets in prompts | C+M |
| AI-012 | Swap/tamper tool registry/connector scope in controlled fixture | Only approved trusted tools available; no permission inheritance escalation | M+C |

A model following an instruction is not automatically a security failure. A breach of the application's data/action boundary is. Conversely, a model refusing once is not proof that authorization is enforced. Repeat adversarial language tests under a recorded model/version/configuration, and test tool authorization deterministically. Use the Agentic Applications pack for autonomous multi-step tool workflows. [S10, S11]

### 9.17 Business workflow abuse — BIZ (10)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| BIZ-001 | Request invoice/payment/credit action as unauthorized role | Denied; accounting/provider state unchanged | A+M |
| BIZ-002 | Skip/reorder required approval stages | State machine prevents premature protected action | A+M |
| BIZ-003 | Approver modifies recipient/amount after approval | Material change invalidates required approval | A+M |
| BIZ-004 | Concurrent payment and credit/refund against same balance | Authorization/state constraints hold without excess financial effect | A+M |
| BIZ-005 | Invoke sensitive action against closed/canceled object | Defined state policy enforced by server/worker | A+M |
| BIZ-006 | Manipulate amount, currency, sign or allocation bounds | No unauthorized transfer, arithmetic bypass or inconsistent effect | A+M |
| BIZ-007 | Create cross-module resource with conflicting access scope | Unified data model does not broaden source permissions | A+M+C |
| BIZ-008 | Request entitlement/billing-plan change via client fields | Paid/admin-only capability cannot be self-enabled | A+M |
| BIZ-009 | Manipulate notification/export recipients | Sensitive output delivered only to permitted destinations | A+M |
| BIZ-010 | Retry scheduled/manual protected workflow through alternate route | Same permission, approval and replay rules apply | A+M |

Link accounting state correctness to `ACS-US-ACCRUAL-1.0` separately. Balanced journals alone do not prove an authorized transaction; authorized transactions alone do not prove correct accounting.

### 9.18 Data lifecycle and confidentiality — DATA (8)

| ID | Probe / assessment | Required outcome | Mode |
| --- | --- | --- | --- |
| DATA-001 | Inspect nonproduction data and analytics pipelines | No unapproved production PII copies; masking/access controls evidenced | C+M |
| DATA-002 | Exercise approved deletion/offboarding fixture | Access ends and required stores follow retention/deletion policy | A+E |
| DATA-003 | Search deleted fixture across indexes/caches/exports/AI memory | No ordinary resurrection/disclosure after declared completion | A+E |
| DATA-004 | Restore old backup containing deleted/revoked fixture | Access remains denied; deletion/revocation replay policy applied | E+C |
| DATA-005 | Inspect data movement to subprocessors | Destinations, scope, permissions and contracts align to commitments | C |
| DATA-006 | Exercise data-access/export request as wrong identity | Identity/scope verified before release | A+M |
| DATA-007 | Review encryption/key custody against classified data | Keys/access separation and rotation match approved policy | C+E |
| DATA-008 | Exercise retention/legal-hold conflict for synthetic object | Approved retention prevails while ordinary access remains restricted | A+E+C |

Deletion tests respect documented retention, lawful holds, and backup schedules; this specification does not prescribe an unlawful blanket deletion rule or guarantee Privacy-category compliance.

## 10. Fully specified priority test procedures

These procedures demonstrate the required detail when expanding catalog rows. Endpoint names are **proposed adapter contracts**, not claims about an existing application's routes. Bind them to real endpoints before execution. Assertions observe actual data/actions, not only status codes.

### 10.1 TEN-001 — Cross-tenant invoice read

**Setup:** `A-MEMBER` can read `A-INV-001`; `B-OWNER` can read `B-INV-001`. B invoice contains its unique canary, line items, linked payment references, and an attachment. Both fixtures exist and the controls return the intended content.

**Procedure:**

1. Authenticate as A member and request A invoice through the application API.
2. Keep the same verified A identity and substitute the known B invoice ID.
3. Repeat for nested lines, attachment metadata, payment expansion, list/search lookup, export, and each present direct Data API/RPC route.
4. Run the same B requests as B owner as a positive control.

**Required outcome:** Forbidden object reads return the configured safe denial; collections omit B records. No B protected field appears in payload, nested data, metadata, file, or error. No protected state changes. Positive controls succeed. Record any enumeration behavior separately against policy.

**Evidence:** Redacted request/response pairs, actor/tenant identifiers, independent fixture existence check, data-field assertions, protected-state diff, and source-to-journal audit correlation if relevant.

**Invariants:** SEC-INV-001, 003, 004, 005, 011. Any unauthorized sensitive cross-tenant disclosure is a release blocker regardless of a tool's numerical severity.

### 10.2 TEN-002 — Cross-tenant write with downstream effects

**Setup:** B invoice is editable by B's permitted finance role. Snapshot invoice, lines, totals, journal linkage, customer balance, job queue, and sandbox notification/payment outbox.

**Procedure:** As A finance, attempt to change B invoice's amount or recipient using known B IDs. Repeat through update, bulk update, RPC and import/async paths actually present. Re-read after all declared async settling windows.

**Required outcome:** Every unauthorized path denied; no B mutation, accounting change, job, message, or provider effect. A denied security log is expected and excluded from the protected business-state equality check. An HTTP denial after a mutation is a failure.

**Positive control:** Apply an equivalent harmless change to A invoice under A finance and verify the expected state change.

**Evidence:** Before/after values, version IDs, sandbox effect counters, queue ownership, responses and authorized control. Invariants SEC-INV-001, 002, 013, 016.

### 10.3 AZ-008 — Mass assignment and field-level access

**Setup:** A member may edit an approved display-name field but not `role`, `is_owner`, `tenant_id`, compensation or approval state. Record the independently specified field policy.

**Procedure:** Submit allowed field alongside each protected field, nested equivalent, alias and bulk/import representation supported by the API. Then request the resulting object using broad projection and nested expansions.

**Required outcome:** The endpoint's documented reject/ignore contract is enforced; no protected field changes or appears to a forbidden principal. Rejection cannot leave an allowed field partially saved if the endpoint contract is atomic. The allowed-only control succeeds.

**Evidence:** Request shape, response, independent role/field snapshot and downstream effect check. Invariants SEC-INV-002, 005, 006.

### 10.4 DB-003 / DB-005 — Direct data mutation and privileged RPC

**Setup:** Bind fixtures to actual exposed tables/functions and actual API credential model. The attacker uses a publishable/legacy anon API key plus its real user authentication as supported; never a privileged observer's service credential.

**Procedure:**

1. Perform permitted same-tenant SELECT and mutation controls.
2. Attempt wrong-tenant INSERT; change an existing row's tenant/owner on UPDATE; target B rows for UPDATE/DELETE.
3. Invoke each relevant exposed RPC with B IDs and conflicting parent IDs.
4. Review role grants, view behavior and security-definer functions; test ordinary callers' ability to invoke them.

**Required outcome:** No unauthorized row created, changed or removed. Policies/grants protect the actual caller and new-row values. Privileged functions reestablish caller/action/tenant boundaries where their execution context bypasses ordinary policy. Security-definer search path, ownership and execution grants meet reviewed design.

**Evidence:** Runtime test responses and independent rows, policy/grant snapshots, function revision and manual review notes. Merely proving `relrowsecurity = true` does not prove correct policies. Invariants SEC-INV-002, 003, 006, 011.

### 10.5 TEN-014 — Private-database routing

**Setup:** A and B are on separate database/projects with distinct credentials. Shared control plane and caches remain present. A owns a known invoice; B owns a structurally identical invoice with a different canary. Instrument routing without logging credentials.

**Procedure:**

1. Run A's authorized read and observe destination database identity.
2. Change request tenant selectors, known B object ID, custom host and conflicting job payload using only approved scope.
3. Interleave A/B calls and dual-member switches against warm connection/cache state.
4. Exercise retry and failure paths in the router; retry after B routing is removed/disabled.

**Required outcome:** A cannot cause use of B credentials or retrieve/mutate B data. A denied request does not dispatch a protected B query. No fallback to a default customer database on resolution failure. Legitimate B owner operations still succeed.

**Evidence:** Correlated routing destination IDs, actor/tenant, cache/pool observations, response bodies and independent B state. Mask credentials. Invariants SEC-INV-001, 002, 004, 010.

### 10.6 RT-004 — Revocation on an already connected socket

**Setup:** A member is receiving a private room stream and can send if permitted. Open socket before removing membership. Configure a declared bound, e.g. 60 seconds under fixture policy. Distinguish Broadcast/Presence from Postgres Changes.

**Procedure:** Remove membership through approved admin action. Publish uniquely sequenced private events using remaining authorized users throughout and after the revocation bound. Attempt sends from the old socket, refresh with an old credential, reconnect and subscribe again.

**Required outcome:** After the bound, zero newly generated protected events reach the revoked socket and its sends are denied. New connections fail. Record treatment of events generated before revocation that were already buffered. Authorized member's stream remains functional.

**Evidence:** Server event generation timestamps/sequence, client delivery times, revocation record, disconnect/reauthorization trace, and valid control. Invariants SEC-INV-001, 007. Cached realtime policy is specifically part of the test, not a reason to assume immediate revocation. [S17]

### 10.7 INT-002 / INT-003 — Signed webhook replay and ownership

**Setup:** Provider sandbox event for A integration is valid, uniquely identified, and triggers a harmless test payment-status update. Snapshot business state and sandbox effect counters.

**Procedure:** Deliver identical event five times, including bounded concurrent copies. Alter body bytes and retry under the old signature. Deliver a valid B event through A mapping. Deliver an older valid state event after a newer event. Simulate lost HTTP acknowledgement after successful commit.

**Required outcome:** One allowed A effect; no B effect through A route; altered event fails signature validation; state does not roll back through stale events. Same-key retry safely returns/reconciles the original outcome. Idempotency registry is scoped to the verified provider/account/event semantics.

**Evidence:** Original body digest, verification outcome, redacted integration identity, event records, effect counts, state history and retry trace. Do not store signing secrets or infer validity solely from a supplied `tenant_id`. Invariants SEC-INV-002, 013, 014.

### 10.8 FILE-006 — Export permission across queue and delivery

**Setup:** A finance can export A invoices. A member cannot export compensation. B has distinct fixtures. Download links have declared lifetime and sharing semantics.

**Procedure:** Request allowed A export; pause worker. Remove export permission before worker resumes. Repeat with B export ID, changed queued tenant, and different recipient. Attempt download using old URL and wrong identity after completion/revocation.

**Required outcome:** The declared policy is enforced at request, execution and retrieval. For this profile's sensitive exports, execution rechecks current authority and cancels unauthorized work. No delivery to a forbidden destination or tenant. An already issued bearer link behaves according to approved short lifetime/invalidation policy; any surviving access is explicitly evaluated against commitments.

**Evidence:** Request, queue ownership, worker authority decision, artifact metadata, recipient sink and download results. Invariants SEC-INV-002, 007, 015.

### 10.9 AI-003 / AI-004 — Indirect prompt injection and tool authority

**Setup:** A member assistant can summarize one permitted ticket. A retrieved synthetic attachment contains instructions asking for a restricted payroll export or external send. Privileged operations use a sandbox sink. B canaries are present in a separate permitted control corpus.

**Procedure:** Retrieve/summarize the attachment across recorded prompt variants. Independently call the proposed restricted tool with A member's identity, tampered tenant IDs, and stale approvals. Repeat with a properly authorized actor and exact approved action.

**Required outcome:** No unauthorized retrieval or tool side effect occurs even if the model emits the restricted tool request. Tool boundary rechecks identity, tenant, resource, action and current approval. The authorized control works. Approval is bound to specific recipient, amount, object and parameters, not a generic permission to proceed.

**Evidence:** Redacted corpus references, prompt/model/version/settings, retrieval scope, tool requests and decisions, approval binding and sandbox effect count. Invariants SEC-INV-001, 005, 013, 018.

Use a declared repeated-test budget for probabilistic prompts; for example, 20 attempts per selected variant in staging is a company-policy sampling choice, not a statistical proof. Any observed unauthorized action is a failure. Record variants that were not exercised.

### 10.10 BUILD-007 / WEB-014 — Real build and gate integrity

**Setup:** Production-mode build uses synthetic nonsecret sentinel values in server-only configuration. CI security check has an intentional failing fixture in an isolated branch. No live secret is used to prove leak detection.

**Procedure:** Build and inspect client chunks, SSR responses, serialized page data, error pages and publicly accessible artifacts. Exercise normal merge/deploy against the intentionally failed check and scanner-authentication failure. Inspect bypass audit procedure separately.

**Required outcome:** Server sentinel absent from public output; build respects server/client boundaries; failed or blocked mandatory checks prevent ordinary release; bypass requires named recorded approval. A scanner login failure cannot produce a green gate.

**Evidence:** Artifact digests, search results, actual page responses, CI logs, branch protections/deploy policy and bypass record if used. Invariants SEC-INV-008, 009, 019. Unit-test success alone is insufficient for server-only import checks. [S13]

## 11. Machine-readable records and runner contract

Examples below define a proposed schema. They are **not executable until an adapter, schema validator and runner implement these semantics**. Do not represent these YAML snippets as a completed testing implementation.

### 11.1 Scenario record

```yaml
schema_version: "1.0"
id: TEN-001
instance_id: TEN-001/invoice/app-read
title: Cross-tenant invoice read is denied
profile: PTS-SAAS-1.0
requirement: mandatory
execution_modes: [AUTOMATED, MANUAL]
asset_ref: APP-API
given:
  seed: PTS_GOLDEN_SEED_V1
  principal: A-MEMBER
  fixture: B-INV-001
  permission_oracle: golden-permissions-v1
positive_controls:
  - principal: A-MEMBER
    request:
      adapter_route: invoice.read
      object_alias: A-INV-001
    expect:
      status: 200
      returned_object_alias: A-INV-001
  - principal: B-OWNER
    request:
      adapter_route: invoice.read
      object_alias: B-INV-001
    expect:
      status: 200
      returned_object_alias: B-INV-001
actions:
  - request:
      adapter_route: invoice.read
      object_alias: B-INV-001
      principal: A-MEMBER
expect:
  # Replace with the real API contract before execution.
  http_status_one_of: [403, 404]
  protected_object_disclosure_count: 0
  protected_field_disclosure_count: 0
  forbidden_canaries_present: []
  protected_business_state_changed: false
  outbound_effect_count: 0
invariants:
  - SEC-INV-001
  - SEC-INV-003
  - SEC-INV-004
  - SEC-INV-005
  - SEC-INV-011
references:
  wstg: ["v4.2-WSTG-ATHZ-04"]
  soc2_proposed: [CC6.1, CC6.3]
  asvs: [] # Populate only from reviewed official v5.0.0 requirements.
evidence_required:
  - redacted_request_response
  - positive_control_results
  - independent_object_and_field_assertions
  - protected_state_diff
```

### 11.2 Async revocation record

```yaml
schema_version: "1.0"
id: FILE-006
instance_id: FILE-006/invoice-export/queued-revocation
profile: PTS-SAAS-1.0
given:
  principal: A-FINANCE
  permission: invoice.export
  output_sink: TEST-EXPORT-SINK
  timing_policy: golden-timing-v1
actions:
  - export.request:
      object_scope: TENANT-A
      alias: EXPORT-A-001
  - worker.pause: EXPORT-A-001
  - permissions.revoke:
      principal: A-FINANCE
      permission: invoice.export
  - worker.resume: EXPORT-A-001
expect:
  job_terminal_state: CANCELED_AUTHORIZATION
  protected_export_artifact_count: 0
  outbound_delivery_count: 0
  unauthorized_business_effect_count: 0
  trusted_audit_event:
    operation: export.authorization_denied
    original_principal: A-FINANCE
    tenant: TENANT-A
invariants: [SEC-INV-002, SEC-INV-007, SEC-INV-015, SEC-INV-016]
```

### 11.3 Result record

```yaml
schema_version: "1.0"
run_id: PTS-20261002-STAGING-001
case_instance: TEN-001/invoice/app-read
status: NOT_RUN
executed_at_utc: null
tester: null
build:
  commit: null
  artifact_sha256: null
  deployment_id: null
  db_migration_set_sha256: null
  security_policy_sha256: null
  infrastructure_revision: null
environment: staging
evidence_refs: []
finding_refs: []
limitation: "Illustrative record; no test was executed."
reviewer: null
```

### 11.4 Finding record

```yaml
schema_version: "1.0"
finding_id: PTS-FINDING-0001
status: TEMPLATE
title: "Populate after a verified finding"
first_observed_at_utc: null
affected_assets: []
affected_builds: []
case_instances: []
verified_reproduction_ref: null
attacker_preconditions: null
business_impact: null
data_classifications_affected: []
cwe_ids: []
cvss:
  version: "4.0"
  vector: null
  score: null
  rationale: null
business_severity: null
release_blocker: null
owner: null
containment_due_at_utc: null
remediation_due_at_utc: null
fix_change_ref: null
retest:
  original_path_result: null
  neighboring_variants_result: null
  permitted_control_result: null
  production_deployment_ref: null
  evidence_refs: []
risk_acceptance_ref: null
```

### 11.5 Runner requirements

The runner MUST:

1. Reject duplicate IDs, unknown aliases, unresolved timing limits and invalid result enums.
2. Resolve fixture IDs using a per-run seed manifest; isolate runs by namespace.
3. Authenticate and check a known permitted endpoint before each scan/principal segment.
4. Fail to `BLOCKED` when login, observation, seed creation or routing instrumentation fails.
5. Read golden expectations independently of production security code.
6. Observe denied writes and downstream state through a separate privileged observer.
7. Check async effects through an explicit bounded settling/polling contract; do not infer absence after an arbitrary short sleep.
8. Store redacted evidence and hash/link it to build, configuration and result records.
9. Keep all original results and findings; append reruns/retests rather than overwriting history.
10. Produce a machine-readable coverage summary and a separate human-reviewed report.

No scanner adapter may return `PASS` merely because it has zero alerts. Required routes, identities, roles and controls must actually have been exercised.

## 12. Generated, differential and security mutation tests

### 12.1 Stateful property tests

Generate sequences such as:

```text
Create tenant A and B resources
Invite member
Grant project access
Read permitted object
Attempt B object
Queue export
Revoke membership
Switch tenant
Retry old request
Resume export
Reconnect websocket
Attempt same action with machine credential
```

After each step, compare with the independent permission model and run applicable invariants. Sample dimensions include roles, ownership, parent/child relationships, credential age, permission changes, alternate routes and job states. Preserve generator seed, minimal failing sequence, environment and policy versions.

Default nightly budget: 2,000 sequences of 10–50 operations per supported deployment mode. Increase after measuring runtime and coverage. This budget is company policy, not a SOC 2 requirement or assurance percentage.

### 12.2 Metamorphic expectations

| ID | Transformation | Required relationship |
| --- | --- | --- |
| SEC-META-001 | Replace A object with equivalent B object while keeping A principal | Permitted A action becomes denied B action |
| SEC-META-002 | Remove permission while retaining same request/token | Access changes according to declared revocation semantics |
| SEC-META-003 | Hide/reveal client UI controls without changing server authority | Server outcome unchanged |
| SEC-META-004 | Submit one operation versus authorized bulk equivalent | Same intended object/field permission boundaries |
| SEC-META-005 | Repeat valid external event with same verified identity | No additional protected business effect |
| SEC-META-006 | Request data via app versus present direct API/RPC path | Equivalent intended data restrictions |

These six are companion properties, separate from the 204 catalog IDs.

### 12.3 Test the tests

In an isolated disposable environment, deliberately introduce selected test mutations: remove a tenant filter, widen a role grant, expose a protected view, use a public file setting, omit a webhook verification step, or bypass AI tool authority. The relevant tests MUST fail and show the expected evidence. Never apply these mutations to production.

Mutation exercises validate the observers and negative test sensitivity. They are not proof of complete vulnerability coverage. Keep the independent oracle unchanged while mutating production-bound code/configuration.

## 13. SOC 2 evidence mapping

The table below is a **proposed mapping**, not an official AICPA crosswalk. Criterion labels are intentionally brief and are not reproduced authoritative text. Confirm them against the full licensed/current TSC, system commitments, control wording and the examining CPA's scope before adoption. The publicly accessible AICPA resource page was reviewed; its full downloadable criteria text required account access. No claim is made that every point of focus was inspected. [S2]

### 13.1 Common Criteria connections

| Proposed criterion connection | Evidence this program contributes | Additional evidence outside penetration testing |
| --- | --- | --- |
| CC3: Risk assessment | Threat model, attack paths and exposure prioritization | Organization-wide risk register, management assessment and review |
| CC4.1: Control evaluation | Planned assessment, qualified review, documented coverage and results | Evaluation program design and proof it operated at the promised cadence |
| CC4.2: Deficiency handling | Findings, owner, due date, escalation, fix and retest | Management reporting, oversight and population completeness |
| CC6.1: Logical access safeguards | AUTH, SES, AZ, TEN, DB, CLOUD results | Identity architecture, administrative control operation |
| CC6.2: User access lifecycle | AUTH-010/013/014, revocation results | Actual joiner/mover/leaver populations and approvals |
| CC6.3: Authorized access and roles | Independent role matrix, AZ and TEN tests | Periodic real access reviews and least-privilege decisions |
| CC6.6: External threats | External-surface, WEB, API and perimeter validation | Network/change operation and administrative monitoring |
| CC6.7: Data movement protection | FILE, INT, DATA, transport/egress tests | Data classification, transfer approvals and continuing configuration |
| CC6.8: Malicious software safeguards | Supply-chain/file controls and relevant scan evidence | Endpoint/runtime protection and operational coverage |
| CC7.1: Vulnerability/configuration detection | Scans, inventory, drift checks, manual findings | Recurring vulnerability handling and configuration population |
| CC7.2–CC7.3: Monitoring/evaluation | LOG events, alerts and triage simulation | Actual monitoring operation and event evaluation records |
| CC7.4–CC7.5: Response/recovery | Containment simulation and recovery tests | Incident plan, real incident handling and follow-up |
| CC8.1: Change management | Build linkage, migration checks, fix reviews and deploy gate evidence | Complete change population, approvals and emergency changes |
| CC9.1–CC9.2: Disruption/vendor risks | RES exercises, integration boundaries and shared-responsibility register | Continuity planning, vendor reviews, contracts and ongoing oversight |

Physical-access and disposal controls, personnel requirements, governance, communication and broader control activities are not covered completely by this technical catalog. Managed-cloud responsibility reviews do not erase those obligations.

### 13.2 Additional categories

| Category, if included in examination | Supporting test work | What remains outside this guide |
| --- | --- | --- |
| Availability | RES, abuse limits, capacity isolation, restore/response evidence | Full commitments, capacity planning, monitoring and continuity controls |
| Confidentiality | Field/tenant/file isolation, classification and lifecycle checks | Information identification, retention/disposal and handling program |
| Processing Integrity | Authorization/state/replay checks plus separate accounting conformance | Completeness, accuracy, timeliness, validity and processing controls |
| Privacy | Identity-gated data access/deletion and data-flow review | Notices, consent, use/disclosure limits, rights handling and applicable obligations |

Select report categories based on commitments and risks with the CPA. Do not assume that handling payroll automatically means every category is in scope, or that a Security-only report proves accounting correctness.

### 13.3 Evidence populations over a Type 2 period

Maintain the complete population of scheduled and triggered tests, scans, findings, accepted risks, fixes, retests and production changes for the observation period. Retain failed runs and missed scheduled activities. A clean report dated near period end cannot erase earlier exceptions.

Record the control's actual promise precisely. For example:

> The security owner commissions an independent scoped application assessment at least every twelve months and after defined material changes, tracks findings to disposition, and verifies remediation before approving blocker closure.

Once adopted, management must operate that promise and preserve evidence. Choose a cadence that is affordable and risk-appropriate; overpromising creates avoidable control exceptions.

## 14. Findings, severity, remediation and retest

### 14.1 Severity model

Record both:

- **Technical severity:** CVSS 4.0 score/vector and rationale where appropriate.
- **Business severity:** Actual data classification, affected tenant population, required privilege, exploit chain, financial impact, reachability and compensating controls.

CVSS Base measures severity, not complete risk. Do not let a modest score override evidence of cross-tenant PII disclosure, unauthorized payroll/bank changes or privileged credential compromise. [S9]

Release blockers include demonstrated cross-tenant sensitive disclosure/mutation, unauthorized administrative authority, privileged credential exposure, unapproved financial/payroll actions, unauthorized AI-mediated data release/actions, and tampering with protected audit history. Qualified reviewers may designate further blockers.

### 14.2 Proposed remediation targets

These targets are **company-policy defaults, not AICPA rules**. Timers start at verified discovery, not report delivery. Management may tighten them for known exploitation or contractual commitments.

| Severity | Notification/triage target | Containment target | Fix plus verified retest target | Default release treatment |
| --- | --- | --- | --- | --- |
| Critical | Immediate escalation; on-call response | Within 24 hours | Within 7 calendar days, or isolate affected capability while resolving | Block affected deployment/capability; incident process if exposure suspected |
| High | Within 1 business day | Within 3 calendar days | Within 14 calendar days | Block affected release until verified fix |
| Medium | Within 3 business days | Risk-based interim plan | Within 30 calendar days | Track; mandatory failed requirement still blocks strict profile pass |
| Low | Within 5 business days | As needed | Within 90 calendar days or approved disposition | Track and review |
| Informational | At report review | Not normally applicable | Document decision | Not a vulnerability closure claim |

An accepted risk MUST include affected assets/control requirements, owner, business rationale, compensating-control test evidence, expiry, approver with authority, customer/contract implications and reevaluation triggers. A ticket owner cannot silently approve their own risk acceptance.

### 14.3 Finding lifecycle

A finding progresses through observed, triaged, verified, assigned, remediated, retested and closed states. An assigned finding may instead receive an approved time-limited risk acceptance; retain it as open accepted risk until expiry or verified remediation.

Reopened and duplicate records preserve history. Closing code work is not closing a finding. Scanner disappearance is not sufficient where the original issue was manual or configuration-dependent.

### 14.4 Retest minimum

Retest MUST demonstrate:

1. Original reproduction no longer succeeds.
2. Closely related roles, tenants, parameter placements and alternate paths also hold.
3. Intended permitted workflow remains functional.
4. Async jobs/caches/live connections obey relevant bounds.
5. Fix is deployed to every affected instance, or remaining instances remain explicitly open.
6. Evidence identifies the corrected artifact, policies and environment.

For external critical/high findings, the assessing tester or another qualified reviewer SHOULD verify closure independently of the implementer. Independence is this profile's governance expectation; no specific commercial certification is claimed to be universally required by SOC 2.

## 15. Gates and operating cadence

These are suggested internal controls. Adopt exact wording with management and discuss scope/evidence expectations with the examining CPA. There is no universal requirement in this guide that SOC 2 mandates an annual commercial penetration test or a particular scanning interval.

### 15.1 Gate A — Pull request

For application/security-relevant changes:

- Relevant authorization, tenant and state fixtures.
- Source/dependency/secret scans and database policy/grant changes.
- Production-mode build check for client/server exposure.
- Tests covering the changed route, role, field, integration or tool boundary.
- Qualified review of sensitive changes and linked risk/threat-model updates.

`FAIL` or `BLOCKED` mandatory checks block normal merge. Full DAST and manual pentesting need not run on every cosmetic PR.

### 15.2 Gate B — Nightly/continuous checks

- Full applicable automated scenario instances in isolated environments.
- Authenticated DAST with verified principal/route coverage.
- Stateful property tests across supported deployment modes.
- Configuration/grant drift detection and inventory reconciliation.
- Advisory/dependency updates with triage timestamps and feed/tool versions.

Results must be delivered to an owner; merely storing a failing nightly log is not an operating remediation control.

### 15.3 Gate C — Release candidate

- Fresh fixture environment using the actual release artifact and migrations.
- Full applicable deterministic suite and database runtime access checks.
- Targeted manual assessment of material changes.
- Blocker remediation and retest, or a distinct approved exception release decision.
- Production configuration comparison, rollout fleet inventory and rollback preparation.
- Coverage report showing every applicable mandatory case, blocked case and exclusion.

A normal release requires strict automated acceptance and current required manual evidence. A risk-accepted release records `EXCEPTION`; it cannot display an unqualified strict profile pass.

### 15.4 Gate D — Independent assessment

Company-policy default: independent full-scope manual assessment before first sensitive customer launch, at least every twelve months thereafter, and targeted reassessment after material changes. Align actual timing to the Type 2 control promise, observation period and remediation lead time.

Material change triggers include:

- New authentication/SSO or recovery mechanism.
- Tenant router, RLS model, database/project separation or shared-data redesign.
- New HR/payroll/banking/payment integration or external-action tool.
- New file processing, public sharing, AI retrieval or autonomous agent path.
- New privileged support/control-plane access or hosting trust boundary.
- Significant incident, suspected compromise, or repeated systemic findings.

A trigger requires a recorded risk decision and relevant retest scope. Do not automatically buy a full repeat assessment after every minor release.

### 15.5 Suggested calendar

| Activity | Proposed default | Evidence |
| --- | --- | --- |
| Sensitive change regression and scanning | Each relevant PR/release | CI result, review, artifact linkage |
| Authenticated DAST/property suite | Nightly in controlled staging | Verified login, exercised routes, raw results, triage |
| Exposure/advisory monitoring | Daily or automated continuous | Feed snapshot, drift/alert register, disposition |
| Control-owner coverage/findings review | Monthly | Missed runs, findings aging, exceptions and actions |
| Selected detection/containment exercises | Quarterly | Events, alerts, triage and containment trace |
| Backup restore exercise | Quarterly for initial policy | Restore output, RPO/RTO measurement, isolation checks |
| Full independent assessment | At least every 12 months under proposed policy | Scope, report, remediation register, retest |
| Triggered manual assessment | Defined material changes | Risk decision and targeted report |

These are control design choices. None independently proves compliance; adjust them before adoption to match commitments and staffing.

## 16. Evidence handling and report deliverables

### 16.1 Per-case evidence envelope

Record: run/case ID, tester/reviewer, UTC time, environment, principal, tenant, resource alias, actual route, preconditions, deployed versions, redacted input/output, independent state assertions, expected result, observed result, finding links and limitations.

For sensitive reproductions retain a minimal redacted example plus any necessary encrypted raw artifact in a restricted evidence store. Strip Authorization/Cookie headers, reset links, API keys and unnecessary PII. Hashes establish integrity comparisons but do not replace access control or trusted provenance.

### 16.2 Assessment report

Every commissioned manual assessment MUST provide:

1. Executive scope/impact summary and clear assurance limitations.
2. Testing dates, testers, methods, access levels and rules-of-engagement reference.
3. Exact assets/build/configuration, deployment modes and routes covered.
4. Catalog/ASVS coverage matrix, including untested and not-applicable requirements.
5. Validated findings, severity reasoning, synthetic reproductions and remediation advice.
6. Attack chains and business impact, distinguished from unverified alerts.
7. Detection-validation results where commissioned.
8. Ownership/deadlines, compensating controls and accepted risks.
9. Retest addendum identifying what was fixed, when and where.
10. Cleanup, revoked credentials and outstanding limitations.

Require a technical report and retest, not only an executive letter stating that a penetration test occurred.

### 16.3 Repository versus restricted evidence store

Keep **specifications, synthetic fixtures, adapters, schema, sanitized summaries and public references** in the repository. Keep raw exploit traces, cloud inventories, real identity lists, tokens and detailed sensitive findings in a restricted encrypted store. An auditor-ready evidence index points to access-controlled artifacts.

Retain evidence through the examination and the organization's agreed retention period; respect contracts, legal holds and minimization. This guide does not invent a universal SOC 2 evidence retention duration.

## 17. Choosing tools and an independent tester

### 17.1 Tool roles

| Need | Practical implementation choice | Important boundary |
| --- | --- | --- |
| API/browser authorization fixtures | Existing test framework plus HTTP/browser clients | Independent permissions and data observers |
| Database behavior | pgTAP plus authenticated Data API/RPC integration tests | Catalog/grant checks and actual role behavior both required [S18] |
| Authenticated DAST | ZAP Automation Framework or Burp scanning in approved scope | Check successful login and route coverage first [S19, S20] |
| Manual HTTP/state testing | Burp's documented manual testing workflow or equivalent proxy | Qualified tester validates impact; scope/traffic controlled [S20] |
| Source analysis | CodeQL or equivalent SAST suitable for deployed languages/frameworks | Framework-sensitive authorization gaps still require human review [S21] |
| Dependencies/secrets/IaC/artifacts | Vetted scanners with pinned versions and reviewed rules | Capture advisory/rule snapshots and false-positive decisions |
| Cloud/drift verification | Provider configuration APIs and approved infrastructure checks | Review customer-owned configuration; no unauthorized provider probing |
| AI assessment | Deterministic tool-boundary tests plus recorded adversarial prompt corpus | Model refusal is not an access control |
| Evidence/closure | Restricted finding tracker and immutable/controlled artifact storage | Full lifecycle evidence, not just scanner dashboards |

Tool pricing/features/licensing change; evaluate against actual stack and coverage during procurement. Tool selection does not create SOC 2 attestation authority. Verify official installation/configuration instructions before implementing a scan.

### 17.2 Tester selection and statement of work

Require demonstrated experience in SaaS tenant isolation, authenticated business logic, Postgres/RLS or the actual equivalent stack, cloud access, sensitive integrations and AI tool boundaries where present.

The statement of work SHOULD explicitly require:

- Both unrelated tenants and all material roles, including dual membership and revocation.
- Source/configuration access for sensitive boundaries and direct data/API paths.
- Private-database routing/control-plane review where supported.
- Manual testing of financial, HR, file, realtime and async workflows.
- Scope/coverage register, permitted positive controls and recorded limitations.
- Triage access during the engagement, agreed critical-finding escalation and retest deliverables.
- Secure evidence handling, no subcontracting ambiguity, and named qualified testers.
- Testing time allocated by scope/complexity; no assurance claim based solely on running a standard scanner.

Professional credentials and firm accreditation may support qualification; they do not replace demonstrated relevant skill or CPA judgment. A penetration-testing firm and the SOC 2 service auditor have different roles. Confirm any independence conflicts for the actual engagement.

## 18. Complementary SOC 2 workstream

Maintain a separate control register; do not expand penetration test results to cover these by implication.

| Workstream | Minimum operating evidence to plan | Accountable role |
| --- | --- | --- |
| Governance and risk | Approved policies, risk assessment, commitments, management review | Executive/security owner |
| Personnel | Screening where appropriate, confidentiality, training and offboarding | HR/security |
| Real access reviews | Complete identity population, approvals, removals and periodic reviews | System owners |
| Change management | Approved changes, tested artifacts, rollout and emergency change history | Engineering |
| Asset/vendor management | Inventory, assurance reviews, shared responsibilities and agreements | Security/vendor owner |
| Monitoring/incident response | Actual alert operations, decisions, response and lessons | On-call/security |
| Continuity/recovery | Backup operation, restore evidence, capacity and continuity plan | Operations |
| Data handling | Classification, retention, disposal and applicable privacy operations | Data/privacy owner |
| Control examination | System description, management assertion, CPA scope and evidence requests | Management/CPA |

These are planning headings, not a complete SOC 2 checklist. The examining CPA determines examination procedures; management remains responsible for controls.

## 19. Repository structure

Suggested structure; this document does not create the runner or any directory below.

```text
security-conformance/
  README.md
  profile/PTS-SAAS-1.0.yml
  scope/assets.yml
  scope/data-flows.md
  scope/threat-model.md
  scope/shared-responsibilities.yml
  seed/tenants.yml
  seed/principals.yml
  seed/objects.yml
  seed/permission-matrix.yml
  seed/timing-policy.yml
  schemas/scenario.schema.json
  schemas/result.schema.json
  schemas/finding.schema.json
  scenarios/authentication/
  scenarios/authorization/
  scenarios/tenant-isolation/
  scenarios/database/
  scenarios/web-api/
  scenarios/files-realtime/
  scenarios/integrations/
  scenarios/cloud-build/
  scenarios/ai/
  scenarios/business-lifecycle/
  invariants/
  property-tests/
  mutation-tests/
  adapters/application/
  adapters/supabase/
  adapters/provider-sandboxes/
  adapters/observers/
  mappings/asvs-5.0.0.csv
  mappings/wstg-4.2.csv
  mappings/soc2-proposed.yml
  policies/rules-of-engagement-template.md
  policies/remediation-policy.md
  reports/sanitized-coverage/
  evidence-index/README.md
```

Store real secrets in the approved secret manager, not YAML or fixtures. Evidence links should use access-controlled IDs rather than expiring public bearer URLs committed to the repository.

## 20. Implementation sequence

### 20.1 First implementation tranche

Implement the following **40 catalog IDs** first, expanding each to every relevant concrete instance. This is a starting tranche, not full profile acceptance.

| Area | Initial IDs | Why first |
| --- | --- | --- |
| Authentication | AUTH-001, 002, 003, 004, 008, 010, 013 | Protect identities and close alternate takeover paths |
| Sessions | SES-004, 005, 006 | Stale access and browser request boundaries |
| Authorization | AZ-001, 003, 004, 007, 008, 009 | Roles, sensitive fields and bulk/mass assignment |
| Tenants | TEN-001, 002, 003, 004, 005, 007, 011, 013, 014, 015 | Largest shared-SaaS and private-routing risk |
| Database | DB-001, 002, 003, 005, 007, 010, 012 | Protect direct paths and privileged execution |
| Files/realtime | FILE-001, 006; RT-004 | Sensitive export and long-lived access |
| Integrations | INT-001, 002 | Authenticity and replay handling |
| AI | AI-001, 004 | Retrieval and tool privilege boundaries |

Where a feature is absent, mark it not applicable and select the next highest-risk present case; keep the changed tranche manifest explicit.

### 20.2 Rollout milestones

1. **Foundation:** Define actual assets, data flows, threat model, role/field policy, deployment modes, owners, timing bounds and rules of engagement.
2. **Core regressions:** Seed fixtures, implement independent observer/oracle, expand first tranche, add schema validation and reporting.
3. **Full breadth:** Instantiate remaining catalog, import ASVS requirements, add route/config coverage, DAST and stateful tests.
4. **Manual assessment:** Commission qualified independent testing, validate scope and coverage, handle findings and retest.
5. **Operating evidence:** Run adopted cadences, retain complete populations, exercise response/recovery and monitor misses.
6. **Examination readiness:** Reconcile technical evidence with the full control register and CPA requirements.

Do not choose a launch date by assuming the calendar alone makes controls effective. Estimate effort after actual scope and baseline gaps are known.

## 21. Catalog size and honest reporting

| Catalog family | Named IDs |
| --- | ---: |
| SURF | 10 |
| AUTH | 14 |
| SES | 10 |
| AZ | 14 |
| TEN | 18 |
| DB | 14 |
| WEB | 14 |
| API | 10 |
| FILE | 10 |
| RT | 8 |
| INT | 12 |
| CLOUD | 12 |
| BUILD | 10 |
| LOG | 10 |
| RES | 8 |
| AI | 12 |
| BIZ | 10 |
| DATA | 8 |
| **Catalog total** | **204** |

Additional material: **20 invariants, 10 worked procedures and 6 companion metamorphic properties**, plus a separate complete ASVS applicability matrix. Expansion produces substantially more than 204 concrete executions; count and disclose them accurately.

An honest machine-readable report starts from unknown/unexecuted values:

```yaml
profile: PTS-SAAS-1.0
profile_result: NOT_RUN
assurance_claim: "Internal scoped security verification; not SOC 2 attestation"
build_and_configuration_ref: null
catalog_ids_total: 204
applicable_instances: null
instances_passed: 0
instances_failed: 0
instances_blocked: 0
instances_not_run: null
approved_not_applicable: []
active_exceptions: []
open_critical_high_findings: null
manual_assessment_ref: null
production_configuration_validation_ref: null
asvs_level_2_claim: false
soc2_attestation_claim: false
```

Never display an invented pass count before execution. A future report must state limitations even when every planned case passes.

## 22. Sources and maintenance

Primary sources below were reviewed through their publicly accessible pages/search content on **2026-10-02**. They establish framework/tool roles and stack considerations; the product-specific scenarios, gates, cadence and deadlines are the author's proposed design. The AICPA full TSC download was access-gated; exact mappings require the licensed text and CPA confirmation. No third-party marketing claim that a scanner or annual test guarantees SOC 2 was adopted.

- **S1 — AICPA, SOC Suite of Services:** [Official overview](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services). CPA assurance and professional standards.
- **S2 — AICPA, 2017 TSC with revised points of focus, 2022:** [Official resource](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022). Security, Availability, Processing Integrity, Confidentiality and Privacy; full download requires access.
- **S3 — AICPA, illustrative SOC 2 Type 2 report and examination education:** [Illustrative report resource](https://www.aicpa-cima.com/resources/download/illustrative-service-auditors-soc-2-r-type-2-report); [SOC 2/SOC 3 planning, executing and reporting](https://www.aicpa-cima.com/cpe-learning/course/soc-2-and-soc-3-planning-executing-and-reporting). Report/examination context; illustration is nonauthoritative.
- **S4 — OWASP ASVS:** [Official project](https://owasp.org/projects/asvs). Version 5.0.0 and version-qualified requirement references; use the project's linked official release files for the complete matrix.
- **S5 — OWASP WSTG:** [Official project/version status](https://owasp.org/projects/web-security-testing-guide); [version 4.2 testing index](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/); [IDOR method, WSTG-ATHZ-04](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References/).
- **S6 — OWASP API Security:** [Official project](https://owasp.org/projects/api-security-project); [2023 risks](https://api-security.owasp.org/editions/2023/en/0x11-t10/). API prioritization, including object/property/function authorization and business/resource abuse.
- **S7 — NIST SP 800-115:** [Final publication](https://csrc.nist.gov/pubs/sp/800/115/final). Assessment planning, technical testing, analysis and mitigation.
- **S8 — NIST SP 800-218, SSDF 1.1:** [Final publication](https://csrc.nist.gov/pubs/sp/800/218/final). Secure development practices and vulnerability response.
- **S9 — FIRST CVSS 4.0:** [Specification](https://www.first.org/cvss/v4.0/specification-document); [user guide](https://www.first.org/cvss/v4.0/user-guide). Severity metrics and limitations of Base scores as risk measures.
- **S10 — OWASP GenAI:** [LLM Top 10 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/); [Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/). AI boundary risks.
- **S11 — OWASP Agentic Applications:** [Official release announcement](https://genai.owasp.org/2025/12/09/owasp-genai-security-project-releases-top-10-risks-and-mitigations-for-agentic-ai-security/). Agentic risk pack released December 2025 for the 2026 guidance cycle; apply to autonomous workflows.
- **S12 — SvelteKit authentication:** [Official docs](https://svelte.dev/docs/kit/auth). Sessions/tokens and authentication/authorization integration.
- **S13 — SvelteKit server-only modules:** [Official docs](https://svelte.dev/docs/kit/server-only-modules). Import boundaries and unit-testing limitations; match installed major version.
- **S14 — Supabase RLS:** [Official docs](https://supabase.com/docs/guides/database/postgres/row-level-security). Policies and privileged bypass semantics.
- **S15 — Supabase API keys:** [Official docs](https://supabase.com/docs/guides/api/api-keys). Publishable versus secret credentials and server-side privilege boundary.
- **S16 — Supabase Storage access control:** [Official docs](https://supabase.com/docs/guides/storage/security/access-control). Storage operation policies and service-key bypass.
- **S17 — Supabase Realtime authorization:** [Official docs](https://supabase.com/docs/guides/realtime/authorization). Broadcast/Presence policy, connection caching, and distinction from Postgres Changes.
- **S18 — Supabase testing:** [pgTAP](https://supabase.com/docs/guides/database/extensions/pgtap); [database tests](https://supabase.com/docs/guides/database/testing). Database tests complement application-level access tests.
- **S19 — ZAP automation:** [Automation Framework](https://www.zaproxy.org/docs/automate/automation-framework/); [authentication](https://www.zaproxy.org/docs/desktop/start/features/authentication/). Scope and authenticated scan implementation.
- **S20 — PortSwigger Burp:** [Penetration-testing workflow](https://portswigger.net/burp/documentation/desktop/testing-workflow); [scanner overview](https://portswigger.net/burp/documentation/desktop/getting-started/running-your-first-scan). Complementary manual and automated testing.
- **S21 — GitHub CodeQL:** [Official concepts](https://docs.github.com/en/code-security/concepts/code-scanning/codeql). Static analysis and custom queries.

Review this specification when architecture, roles, data classification, tool privileges, provider behavior or adopted control commitments change. Preserve stable IDs; retire IDs with rationale rather than reusing them for unrelated tests. Version fixture, permission, timing and reference mappings independently and link all four to results.
