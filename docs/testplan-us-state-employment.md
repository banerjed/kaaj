# US State Employment Records And Statutory Documents Test Plan

**Status:** draft
**Created:** August 29, 2026
**Scope:** Spec-based test plan for US per-state employment records and local
statutory employment documents.
**Initial states:** New Jersey, New York, Massachusetts, California,
Washington, Pennsylvania.
**External source retrieval date:** August 29, 2026.

---

## Purpose

This plan defines how Kaaj should test US state employment records, onboarding
packets, payroll jurisdiction inputs, statutory notices, and document retention
against the specifications.

This is a high-risk area. Incorrect state packets, missing notices, wrong local
withholding, or stale effective-date rules can create legal and payroll harm.
Every rule here must be verified against official sources before automation is
treated as authoritative. This document is a test-planning artifact, not legal
advice.

The source URLs below were checked as an initial planning snapshot on
August 29, 2026. Automation must still store each rule with its own retrieved
date, effective date, and version label.

---

## Required Product Behavior

For every US worker, Kaaj must be able to determine and test:

- Work state.
- Residence state.
- Work locality and residence locality where local taxes/notices apply.
- Remote, hybrid, or office worksite.
- Employer legal entity.
- Employer size threshold.
- Employment type.
- Exempt/nonexempt classification.
- Pay basis and pay frequency.
- Primary language for statutory notices.
- New hire, rehire, transfer, leave, termination, and reinstatement state.
- Applicable document packet.
- Applicable new hire reporting obligation.
- Applicable withholding forms.
- Applicable leave, disability, family leave, sick leave, workers'
  compensation, unemployment, and local tax records.
- Effective-date version of every statutory rule used.

---

## Federal Baseline

These requirements apply before state-specific rules are layered in.

| Area | Test Requirement | Source |
|---|---|---|
| Federal withholding | New employees provide Form W-4; missing W-4 defaults to the IRS fallback withholding treatment; revised W-4 timing is tested | IRS Form W-4 and Publication 15/15-T |
| I-9 employment eligibility | Section 1, Section 2, reverification, remote examination where applicable, and retention are tested | USCIS Form I-9 and Handbook for Employers M-274 |
| New hire reporting | Every new hire must route to a state directory or approved multistate reporting flow | HHS/ACF Office of Child Support Services new hire reporting |
| Workplace posters | Federal workplace posting requirements are selected by coverage and workforce facts | US Department of Labor poster guidance, OSHA poster guidance |
| FMLA | Covered-employer notices, handbook/general notice, language/accessibility rules, and leave interactions are tested | US Department of Labor FMLA guidance |

Federal source URLs:

- https://www.irs.gov/forms-pubs/about-form-w-4
- https://www.irs.gov/publications/p15
- https://www.irs.gov/publications/p15t
- https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274
- https://www.acf.hhs.gov/css/employers/employer-responsibilities/new-hire-reporting
- https://www.dol.gov/general/topics/posters
- https://www.dol.gov/agencies/whd/fmla/posters
- https://www.osha.gov/publications/poster

---

## Test Dimensions

Every state suite must cover these dimensions:

- New hire.
- Rehire after separation.
- Transfer into the state.
- Transfer out of the state.
- Residence state differs from work state.
- Remote worker home treated as worksite where applicable.
- Mid-pay-period state move.
- Exempt employee.
- Salaried nonexempt employee.
- Hourly employee.
- Commission employee.
- Part-time employee.
- Temporary employee.
- Independent contractor where the state requires reporting.
- Employer below/above size threshold.
- Primary language with official translated notice available.
- Termination or separation.
- Leave event.
- Withholding form update.
- Local tax or city tax change.
- Statutory document version change.

---

## State Matrix

### New Jersey

Primary test areas:

- New hire and rehire reporting to the New Jersey State Directory of New Hires
  within 20 days.
- Independent contractor reporting where applicable.
- NJ-W4 collection and payroll withholding records.
- Earned sick leave notice, accrual, privacy, documentation limits, language
  handling, and five-year recordkeeping.
- Temporary Disability Insurance and Family Leave Insurance payroll
  contributions, employer notices, workplace posters, quarterly earnings
  reporting, and private-plan coverage.
- Job-protected leave changes effective July 17, 2026.
- NJFLA eligibility where applicable.
- Required employer poster packet and translated notices.
- PA/NJ reciprocal withholding scenarios.

Golden cases:

- `NJ-HIRE-001`: NJ office employee, English primary language, standard new
  hire packet.
- `NJ-HIRE-002`: NJ employee, Spanish primary language, earned sick leave notice
  in Spanish when official translation exists.
- `NJ-REMOTE-001`: NJ resident remote employee working for NY legal entity.
- `NJ-PA-001`: PA resident working in NJ, reciprocal tax handling.
- `NJ-LEAVE-001`: Employee takes TDI/FLI-related leave after July 17, 2026.
- `NJ-SICK-001`: Planned sick leave with seven-day notice policy.
- `NJ-SICK-002`: One-day sick leave where documentation must not be required.

Assertions:

- New hire report due date is 20 calendar days from hire/re-hire/return to work.
- Rehire/reporting logic handles break-in-service rules.
- Sick leave accrues at one hour per 30 hours worked, unless front-loaded.
- Sick leave packet includes written notice and poster requirement.
- Sick leave records retain hours worked, accrual/advance, use, payout, and
  carryover for five years.
- TDI/FLI payroll contribution limits use the source-versioned year.
- TDI/FLI written notices are included at hire and when the employee requests
  information or notifies employer of leave need.

Official source URLs:

- https://www.njchildsupport.gov/employers/responsibilities
- https://employerservices.njchildsupport.gov/reporting_fundamentals
- https://www.nj.gov/treasury/taxation/prntempl.shtml
- https://www.nj.gov/labor/myworkrights/leave-benefits/sick-leave/
- https://www.nj.gov/labor/wageandhour/tools-resources/forms-publications/employer-poster-packet/
- https://www.nj.gov/labor/myleavebenefits/employer/index.shtml
- https://business.nj.gov/pages/employer-requirements

### New York

Primary test areas:

- New hire reporting within 20 calendar days.
- Rehire after 60 or more consecutive days.
- Independent contractor reporting for contracts over the state threshold.
- Form IT-2104 and IT-2104.1 where nonresident allocation applies.
- NY State, NYC, and Yonkers withholding.
- Wage Theft Prevention Act pay notice at hire, including English and primary
  language where NYSDOL provides a translation.
- Pay stub/wage statement requirements.
- Paid Family Leave and Disability Benefits coverage, waivers, notices, and
  deductions.
- Paid sick leave records and protected-use rules.
- Sexual harassment prevention policy and annual training.
- Lactation policy at hire and annually.

Golden cases:

- `NY-HIRE-001`: NY employee outside NYC/Yonkers, standard IT-2104.
- `NY-NYC-001`: Employee works in NYC and requires NYC withholding treatment.
- `NY-YONKERS-001`: Employee works or resides in Yonkers.
- `NY-NONRES-001`: NJ resident working in NY with IT-2104.1 allocation.
- `NY-REHIRE-001`: Rehire exactly after 60 consecutive days.
- `NY-WTPA-001`: Spanish-primary hourly employee receives translated wage
  notice.
- `NY-CONTRACTOR-001`: Contractor contract exceeds reporting threshold.

Assertions:

- New hire report due date is 20 calendar days from first compensated service.
- Rehire report is required after 60 or more consecutive days of separation.
- IT-2104 is required for accurate NY/NYC/Yonkers withholding.
- IT-2104.1 is required for nonresident allocation where applicable.
- Missing current NY withholding form falls back according to NY withholding
  guidance, not federal allowances from post-2020 W-4.
- Wage notice includes pay rate, pay basis, overtime where applicable, payday,
  legal employer, DBA, address, phone, and allowances.
- Wage notice language is selected from official NYSDOL translations.
- PFL/DB notice and deduction expectations are source-versioned by year.

Official source URLs:

- https://www.tax.ny.gov/bus/wt/newhire.htm
- https://www.tax.ny.gov/forms/income_with_allow_forms.htm
- https://www.tax.ny.gov/bus/wt/amount_deduct.htm
- https://dol.ny.gov/node/52536
- https://dol.ny.gov/posting-requirements-under-nys-labor-law
- https://dol.ny.gov/notice-pay-rate
- https://paidfamilyleave.ny.gov/employers

### Massachusetts

Primary test areas:

- New hire reporting within 14 days of first day of work.
- Independent contractor reporting where required.
- Rehire, return from unpaid leave of 30 or more days, retirement, and workers'
  compensation claim reporting.
- Form M-4 and Massachusetts withholding.
- PFML written notices, contribution rules, employer-size threshold, reporting,
  and mandatory poster.
- Earned sick time accrual and employer-size paid/unpaid threshold.
- Workplace poster packet, including wage/hour, earned sick time, PFML,
  unemployment, workers' compensation, MCAD, parental leave, and other
  applicable postings.
- Overtime and exempt classification.

Golden cases:

- `MA-HIRE-001`: MA employee, 10-person employer, sick time unpaid threshold.
- `MA-HIRE-002`: MA employee, 11-person employer, sick time paid threshold.
- `MA-NHR-001`: Employer with 25 or more employees must file new hire reports
  online.
- `MA-PFML-001`: Employer below PFML employer contribution threshold.
- `MA-PFML-002`: Employer above PFML employer contribution threshold.
- `MA-LEAVE-001`: Employee returns from unpaid leave after 30 or more days.
- `MA-WC-001`: Workers' compensation claim triggers reporting obligation.

Assertions:

- New hire report due date is 14 days from first day of work or reinstatement.
- Required reporting fields include FEIN, legal/payroll address, employee legal
  name, mailing address, work status, SSN, and first day.
- Employees and independent contractors are distinguished for reporting.
- Sick time accrues at one hour per 30 hours worked, up to 40 hours per year.
- Sick time is paid for employers with 11 or more employees and unpaid below
  that threshold.
- Sick-time documentation requests are restricted to limited circumstances.
- PFML notices and posters are included by employer status and source-versioned
  contribution year.

Official source URLs:

- https://www.mass.gov/how-to/report-new-hires
- https://www.mass.gov/info-details/learn-about-the-new-hire-reporting-program
- https://www.mass.gov/lists/massachusetts-dor-withholding-tax-forms
- https://www.mass.gov/info-details/employer-tax-obligations
- https://www.mass.gov/info-details/earned-sick-time
- https://www.mass.gov/info-details/massachusetts-workplace-poster-requirements
- https://www.mass.gov/info-details/information-for-employers-about-paid-family-and-medical-leave

### California

Primary test areas:

- New Employee Registry reporting within 20 calendar days.
- Rehire after separation of at least 60 consecutive days.
- DE 4 and federal W-4 collection for new hires and changed withholding.
- Missing DE 4 fallback withholding treatment.
- EDD employer payroll tax account number and required employer registration
  timing.
- Independent contractor reporting where required.
- Labor Code section 2810.5 wage notice at hire and within seven days of
  covered changes unless another allowed method applies.
- Paid sick leave minimums and 2810.5 notice updates.
- SDI/PFL/PIT payroll withholding and UI/ETT employer taxes.
- Required notices, pamphlets, posters, IWC wage orders, workers'
  compensation, harassment/discrimination notices, and language-specific forms.

Golden cases:

- `CA-HIRE-001`: CA employee receives W-4, DE 4, 2810.5 notice, new hire report.
- `CA-HIRE-002`: Spanish-primary employee receives language-specific forms
  where official translations exist.
- `CA-DE4-001`: Employee submits W-4 but not DE 4.
- `CA-REHIRE-001`: Rehire after 60 consecutive days.
- `CA-WAGE-001`: Pay rate decreases and requires 2810.5 change notice.
- `CA-SICK-001`: Employee on 10-hour shifts receives paid sick leave minimum
  based on the more protective five days/40 hours rule.
- `CA-IC-001`: Independent contractor over reporting threshold.

Assertions:

- New hire report due date is 20 calendar days from start-of-work date.
- Rehire report is required after at least 60 consecutive days of separation.
- DE 4 and W-4 are both collected for California PIT and federal withholding.
- Missing DE 4 uses the California fallback treatment.
- 2810.5 notice is a standalone record, not buried inside an agreement.
- 2810.5 covered changes produce a new notice within seven calendar days unless
  the allowed pay-stub method applies.
- Electronic notice flow supports acknowledgement and printable copy.
- Paid sick leave packet uses current California minimums and local ordinance
  override flag.

Official source URLs:

- https://edd.ca.gov/en/payroll_taxes/new_hire_reporting/
- https://edd.ca.gov/en/Payroll_Taxes/Reporting_Requirements
- https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding
- https://edd.ca.gov/en/Payroll_Taxes/Required_Filings_and_Due_Dates
- https://edd.ca.gov/en/Payroll_Taxes/Forms_and_Publications
- https://edd.ca.gov/en/payroll_taxes/am_i_required_to_register_as_an_employer
- https://dir.ca.gov/dlse/FAQs-NoticeToEmployee.html
- https://www.dir.ca.gov/dlse/Paid_Sick_Leave.htm
- https://dir.ca.gov/dlse/dlse-forms.htm
- https://calcivilrights.ca.gov/posters/

### Washington

Primary test areas:

- New and rehired employee reporting within 20 days.
- Rehire after no work for the employer in the past 60 days.
- No state income tax withholding, but state payroll and employment programs
  still apply.
- Paid sick leave accrual, carryover, normal hourly compensation, local
  ordinance overrides, written policy rules, and 90-day use timing.
- Paid Family and Medical Leave premiums, quarterly wage/hour reporting,
  employer-size threshold, voluntary plans, required notifications, required
  posters, and job-protection changes effective January 1, 2026.
- WA Cares premium where applicable.
- Workers' compensation and L&I postings.
- Overtime/exemption threshold and duties-test flags.

Golden cases:

- `WA-HIRE-001`: WA employee with no state income tax form but required new
  hire and leave/sick documents.
- `WA-REHIRE-001`: Rehire after 60 days.
- `WA-SICK-001`: Part-time worker accrues paid sick leave.
- `WA-SICK-002`: Overtime hours count toward sick leave accrual.
- `WA-PFML-001`: Employer below 50 employees collects employee premiums only.
- `WA-PFML-002`: Employer with 50 or more employees owes employer PFML share.
- `WA-PFML-003`: Employer with 25 or more WA employees has job-protection
  obligations under 2026 rules.

Assertions:

- New hire report due date is 20 days from hire or rehire.
- Paid sick leave accrues at one hour per 40 hours worked.
- Sick leave accrual starts on first day of work.
- Paid sick leave can be used no later than 90 days after start of work.
- Carryover of unused paid sick leave of 40 hours or less is supported.
- Written policy is required when employer uses a non-calendar accrual year or
  certain policy choices.
- PFML premium rate, Social Security wage cap, employer/employee split, and
  employer-size rule are source-versioned by year.
- Required PFML employee notices, job-protection notices, posters, and paycheck
  inserts are selected by year and language.

Official source URLs:

- https://esd.wa.gov/employer-requirements/reporting-new-and-rehired-employees
- https://www.dshs.wa.gov/esa/division-child-support/new-hire-reporting
- https://www.lni.wa.gov/workers-rights/leave/paid-sick-leave/
- https://www.lni.wa.gov/workers-rights/leave/paid-sick-leave/paid-sick-leave-minimum-requirements
- https://paidleave.wa.gov/employers/
- https://paidleave.wa.gov/estimate-your-paid-leave-payments/
- https://paidleave.wa.gov/help-center/employers/
- https://paidleave.wa.gov/job-protection-requirements-for-employers/

### Pennsylvania

Primary test areas:

- New hire reporting for employees who live or work in Pennsylvania.
- Rehire/return-to-work reporting.
- State employer withholding at Pennsylvania personal income tax rate.
- Reciprocal-state handling with Indiana, Maryland, Ohio, New Jersey,
  Virginia, and West Virginia.
- REV-419 Employee's Nonwithholding Application Certificate.
- Act 32 local Earned Income Tax and Local Services Tax withholding.
- PSD code and EIT rate lookup by home and work address.
- Residency Certification Form upon hire and address change.
- Philadelphia or other local overlay where applicable.
- Mandatory postings, unemployment compensation, workers' compensation, equal
  pay, child labor, minimum wage, and separation/reduced-hours forms.

Golden cases:

- `PA-HIRE-001`: PA resident and PA worksite, state and local withholding.
- `PA-NJ-001`: NJ resident working in PA with reciprocal-state handling and
  REV-419.
- `PA-REMOTE-001`: PA resident remote worker whose home is the worksite for
  local tax purposes.
- `PA-PSD-001`: Home PSD differs from work PSD.
- `PA-PHILLY-001`: Philadelphia work or residence local tax overlay.
- `PA-REHIRE-001`: Seasonal worker returns after break in wages.
- `PA-SEPARATION-001`: Separating employee receives required unemployment
  compensation information.

Assertions:

- New hire packet includes required state reporting fields and does not allow
  email submission where prohibited by state guidance.
- Pennsylvania PIT is withheld from resident employees and nonresidents
  performing services in Pennsylvania unless reciprocal-state rules and
  certificate requirements apply.
- REV-419 certificate is stored, versioned, and renewed where required.
- Local EIT/LST withholding uses home and work PSD codes and official rates.
- Residency Certification Form is completed upon hire and address change.
- Mandatory poster packet is selected by employer facts and language where
  applicable.
- Separation/reduced-hours notices are produced when the separation workflow
  requires them.

Official source URLs:

- https://www.pa.gov/services/dli/report-newly-hired-employees
- https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding
- https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/gross-compensation
- https://dced.pa.gov/local-government/local-income-tax-information/
- https://dced.pa.gov/local-government/local-income-tax-information/psd-codes-and-eit-rates/
- https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/mandatory-postings
- https://www.pa.gov/agencies/dli/notices

---

## Cross-State Golden Scenarios

These scenarios must be in the first golden fixture set:

| ID | Scenario | Risk |
|---|---|---|
| `XSTATE-001` | NJ resident working in NY, with NY withholding and nonresident allocation | `R0` |
| `XSTATE-002` | PA resident working in NJ, reciprocal withholding | `R0` |
| `XSTATE-003` | NJ resident working in PA, reciprocal withholding and REV-419 decision | `R0` |
| `XSTATE-004` | NY employee working in NYC for part of the year and outside NYC for part of the year | `R0` |
| `XSTATE-005` | PA employee with different home and work PSD codes | `R0` |
| `XSTATE-006` | CA employee changes pay rate and receives updated 2810.5 notice | `R0` |
| `XSTATE-007` | WA employee has no state income tax withholding but does have PFML, WA Cares, and sick leave records | `R0` |
| `XSTATE-008` | MA employee returns from unpaid leave after 30 or more days and triggers reporting | `R0` |
| `XSTATE-009` | Employee moves from NJ to PA mid-pay-period | `R0` |
| `XSTATE-010` | Employee is rehired exactly before and after the state's rehire reporting threshold | `R0` |
| `XSTATE-011` | Spanish-primary employee in NJ, NY, CA, and MA receives the correct translated notices where official translations exist | `R0` |
| `XSTATE-012` | Remote employee home address changes from NY to WA and payroll/state packet changes prospectively | `R0` |

---

## Statutory Document Packet Assertions

Every onboarding packet test must assert:

- Packet jurisdiction decision inputs.
- Federal forms and notices.
- State withholding forms.
- State new hire reporting output.
- Wage/pay notice where required.
- Sick leave notice where required.
- Paid family/medical/disability leave notice where required.
- Workers' compensation/unemployment notices where required.
- Local tax forms where required.
- Language selection.
- Effective-date version of each document.
- Employee acknowledgement or signature where required.
- HR completion task where employer action is required.
- Retention category and purge eligibility date.
- Audit event for packet generation and completion.

---

## Rule-Version Registry

The automated implementation should maintain a registry shaped like this:

```text
rule_id
jurisdiction
topic
source_url
source_title
retrieved_at
effective_from
effective_to
version_label
applicability
expected_documents
expected_data_fields
test_fixture_ids
review_owner
```

Historical outputs must keep their original `rule_id`. When a state updates a
form or threshold, create a new rule version and run both old and new fixtures.

---

## Review Checklist

Before any state employment compliance feature is accepted:

- Every state rule cites an official source.
- Every source has a retrieval date and effective-date basis.
- Work state, residence state, and locality are independently tested.
- Rehire thresholds are tested at, before, and after the boundary.
- Translated notice selection is tested.
- Employer-size thresholds are tested on both sides.
- New hire reporting contains exactly the state-required fields.
- Withholding forms are versioned and reproducible.
- Leave/payroll contribution rates are versioned by year.
- Document packet generation creates audit events.
- Missing required document blocks the relevant workflow or creates a high-risk
  compliance alert.
