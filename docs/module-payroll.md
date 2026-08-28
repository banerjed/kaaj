# Module Specification: Payroll (US & India)

**Version:** 1.0
**Last Updated:** December 1, 2025
**Status:** Draft
**Parent Documents:**
- [Product Specification](./product-specification.md)
- [Technical Architecture](./architecture-technical.md)
- [Compensation Framework](./compensation-framework.md)

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Geographic Scope](#geographic-scope)
3. [User Stories](#user-stories)
4. [Functional Requirements](#functional-requirements)
5. [Data Model](#data-model)
6. [Tax Calculation Engine](#tax-calculation-engine)
7. [Payroll Processing Workflow](#payroll-processing-workflow)
8. [Compliance & Reporting](#compliance--reporting)
9. [API Specifications](#api-specifications)
10. [User Interface Specifications](#user-interface-specifications)
11. [Integration Points](#integration-points)
12. [Testing Requirements](#testing-requirements)

---

## Module Overview

### Purpose
The Payroll module processes employee compensation, calculates taxes and deductions, generates pay stubs, and ensures compliance with US federal, state, and Indian tax regulations. It integrates with the compensation framework to support diverse pay structures.

### Scope

**In Scope**:
- ✅ Payroll processing for US (federal + all 50 states + DC)
- ✅ Payroll processing for India (PAN, TDS, EPF, ESI)
- ✅ Multi-currency payroll (USD, INR)
- ✅ Tax calculation and withholding
- ✅ Statutory deductions (Social Security, Medicare, EPF, ESI)
- ✅ Voluntary deductions (401k, health insurance, etc.)
- ✅ Pay stub generation
- ✅ Direct deposit and check payments
- ✅ Tax form generation (W-2, 1099, Form 16)
- ✅ Compliance reporting
- ✅ Garnishment processing
- ✅ Off-cycle/bonus payroll runs
- ✅ Payroll corrections and adjustments

**Out of Scope** (Phase 1):
- ❌ Countries other than US and India
- ❌ Actual payment processing (integration with payment providers)
- ❌ Time & attendance hardware integration
- ❌ Union dues and collective bargaining agreements
- ❌ Workers' compensation insurance

### Key Features

1. **Multi-Jurisdiction Tax Compliance**
   - US Federal: FICA, Medicare, federal income tax
   - All 50 US states: State income tax, SDI, local taxes
   - India: PAN, TDS, Professional Tax, EPF, ESI

2. **Flexible Pay Structures**
   - Salary, hourly, commission, bonus, equity
   - Part-time, full-time, contractor
   - Multiple pay rates and premiums

3. **Automated Tax Calculations**
   - Real-time tax calculation engine
   - Annual tax table updates
   - Multi-state tax allocation

4. **Comprehensive Deductions**
   - Pre-tax: 401k, HSA, health insurance
   - Post-tax: Roth 401k, garnishments
   - Employer contributions

5. **Audit Trail & Compliance**
   - Complete payroll history
   - Tax deposit tracking
   - Regulatory report generation

---

## Geographic Scope

### United States Coverage

#### Federal Requirements
- **Federal Income Tax (FIT)**: IRS tax brackets, W-4 withholding
- **FICA**: Social Security (6.2% up to wage base limit)
- **Medicare**: 1.45% + 0.9% Additional Medicare Tax (high earners)
- **FUTA**: Federal Unemployment Tax (employer-paid)
- **Forms**: W-2, W-3, 940, 941, 944

#### State Coverage (All 50 States + DC)

**No State Income Tax** (9 states):
- Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington, Wyoming

**State Income Tax** (41 states + DC):
- Progressive brackets: CA, NY, NJ, etc.
- Flat tax: CO, IL, IN, KY, MA, MI, NC, PA, UT
- State-specific rules and credits

**State Unemployment Insurance (SUI)**:
- All 50 states (employer-paid)
- State-specific rates and wage bases

**State Disability Insurance (SDI)**:
- CA, HI, NJ, NY, RI, PR (employee contribution)

**Local Taxes**:
- City/county taxes: NYC, Philadelphia, Detroit, etc.
- School district taxes: OH, PA

#### State-Specific Requirements

| State | Special Requirements |
|-------|---------------------|
| CA | SDI, ETT, high compliance burden |
| NY | SDI, NYC taxes, Yonkers taxes |
| PA | Local Earned Income Tax (EIT), LST |
| OH | School district taxes, RITA |
| NJ | Multiple local taxes, SDI/UI |
| TX | No income tax, franchise tax |
| WA | No income tax, paid family leave |
| OR | Transit tax (TriMet) |

### India Coverage

#### Central Government (Federal)
- **Income Tax (TDS)**: Progressive slabs, standard deduction
- **Professional Tax**: State-level but centrally regulated (₹2,500/year max)
- **PAN**: Permanent Account Number (required)
- **Forms**: Form 16, Form 24Q, ITR

#### Statutory Contributions

**Employee Provident Fund (EPF)**:
- Employee: 12% of basic + DA
- Employer: 12% of basic + DA (3.67% to EPF, 8.33% to EPS)
- Wage ceiling: ₹15,000/month

**Employee State Insurance (ESI)**:
- Employee: 0.75% of gross (if gross ≤ ₹21,000/month)
- Employer: 3.25% of gross
- Applicable to employees earning ≤ ₹21,000/month

**National Pension System (NPS)**:
- Voluntary or mandatory (government employees)
- Tax benefits under Section 80CCD

#### Income Tax Structure (FY 2024-25)

**Old Tax Regime**:
- ₹0 - 2.5L: 0%
- ₹2.5L - 5L: 5%
- ₹5L - 10L: 20%
- Above ₹10L: 30%
- Standard deduction: ₹50,000
- HRA, 80C, 80D exemptions

**New Tax Regime** (default):
- ₹0 - 3L: 0%
- ₹3L - 6L: 5%
- ₹6L - 9L: 10%
- ₹9L - 12L: 15%
- ₹12L - 15L: 20%
- Above ₹15L: 30%
- Standard deduction: ₹50,000 (from FY24-25)

#### State-Level (India)
- **Professional Tax**: Varies by state (Maharashtra, Karnataka, etc.)
  - Karnataka: ₹200/month (₹2,400/year)
  - Maharashtra: ₹175-300/month
  - Tamil Nadu: ₹135-208/month
  - West Bengal: ₹110-150/month

#### Compliance Requirements
- **TDS Deposit**: Monthly (24Q form quarterly)
- **EPF Remittance**: Monthly by 15th
- **ESI Remittance**: Monthly by 15th
- **Form 16**: Annual (by June 15)
- **ITR Filing**: Employee responsibility

---

## User Stories

### Payroll Processing

**US-PAY-001**: As a Payroll Administrator, I want to run payroll for a pay period, so that employees are paid on time.

**US-PAY-002**: As a Payroll Administrator, I want the system to automatically calculate federal and state taxes, so that withholding is accurate.

**US-PAY-003**: As a Payroll Administrator, I want to process off-cycle payments (bonuses, corrections), so that employees receive additional payments promptly.

**US-PAY-004**: As a Payroll Administrator, I want to process payroll for employees in multiple states, so that state taxes are calculated correctly.

**US-PAY-005**: As a Payroll Administrator, I want to process payroll in multiple currencies (USD, INR), so that global employees are paid correctly.

### Employee Self-Service

**US-PAY-006**: As an Employee in the US, I want to view my pay stubs with tax withholding details, so that I understand my earnings and deductions.

**US-PAY-007**: As an Employee in India, I want to view my salary slip with EPF, ESI, and TDS deductions, so that I can track my contributions.

**US-PAY-008**: As an Employee, I want to update my tax withholding (W-4 in US, Form 12BB in India), so that my taxes are withheld correctly.

**US-PAY-009**: As an Employee, I want to download my W-2 (US) or Form 16 (India) for tax filing, so that I can file my tax return.

**US-PAY-010**: As an Employee, I want to set up or change my direct deposit details, so that my paycheck is deposited to the correct account.

### Tax Compliance

**US-PAY-011**: As a Payroll Administrator, I want to generate quarterly tax reports (941, 24Q), so that I can file timely with authorities.

**US-PAY-012**: As a Payroll Administrator, I want to generate year-end tax forms (W-2, Form 16), so that employees can file their tax returns.

**US-PAY-013**: As a Payroll Administrator in the US, I want the system to track multi-state tax withholding for employees who work in multiple states, so that we're compliant.

**US-PAY-014**: As a Payroll Administrator in India, I want to calculate TDS based on employee's chosen tax regime (old vs new), so that withholding is correct.

**US-PAY-015**: As a Tax Administrator, I want to receive alerts when tax deposit deadlines approach, so that we avoid penalties.

### Deductions Management

**US-PAY-016**: As a Payroll Administrator, I want to process pre-tax deductions (401k, HSA, health insurance), so that taxable income is reduced.

**US-PAY-017**: As a Payroll Administrator, I want to process court-ordered garnishments with priority rules, so that we comply with garnishment orders.

**US-PAY-018**: As a Payroll Administrator in India, I want to automatically calculate EPF and ESI contributions, so that statutory compliance is maintained.

**US-PAY-019**: As an Employee, I want to enroll in voluntary deductions (parking, gym membership), so that payments are deducted from my paycheck.

### Reporting & Analytics

**US-PAY-020**: As a Finance Manager, I want to view payroll cost reports by department, location, and pay type, so that I can analyze labor costs.

**US-PAY-021**: As a CFO, I want to forecast payroll expenses based on headcount and compensation, so that I can budget accurately.

**US-PAY-022**: As a Payroll Administrator, I want to generate payroll register reports showing all payments and deductions, so that I can reconcile with general ledger.

**US-PAY-023**: As a Compliance Officer, I want to audit payroll transactions for accuracy and compliance, so that we pass regulatory audits.

---

## Functional Requirements

### FR-PAY-001: Multi-Jurisdiction Tax Calculation

**Description**: System shall calculate federal, state, and local taxes for US employees and central/state taxes for Indian employees.

**Features**:

**US Tax Calculation**:
1. Federal income tax based on W-4 (2020+ version)
2. FICA: Social Security (6.2%, wage base limit $168,600 for 2024)
3. Medicare: 1.45% + 0.9% Additional Medicare Tax (wages > $200,000)
4. State income tax (41 states + DC with varying rates)
5. State disability insurance (CA, HI, NJ, NY, RI)
6. Local taxes (city, county, school district)
7. Employer taxes: FUTA (6% on first $7,000, credit up to 5.4%)

**India Tax Calculation**:
1. Income tax (TDS) based on salary structure and tax regime choice
2. Professional tax (state-specific, max ₹2,500/year)
3. EPF: 12% employee + 12% employer (on basic + DA, ceiling ₹15,000)
4. ESI: 0.75% employee + 3.25% employer (if gross ≤ ₹21,000)
5. Standard deduction, HRA, 80C exemptions (old regime)

**Acceptance Criteria**:
- Tax rates updated annually via configuration
- Supports tax treaty exceptions
- Handles mid-year changes (new hire, termination, rate changes)
- Calculates YTD cumulative taxes
- Respects tax exemption limits (Social Security wage base, EPF ceiling)
- Alerts when approaching tax limits

**Multi-State Tax Allocation**:
- Track work location by state
- Allocate wages to each state
- Apply reciprocal agreements (e.g., NJ/PA)
- Calculate resident vs non-resident withholding

### FR-PAY-002: Pay Period Management

**Description**: System shall support multiple pay frequencies and schedule payroll runs.

**Features**:
1. Pay frequencies: weekly, bi-weekly, semi-monthly, monthly
2. Calendar-based pay period generation
3. Pay date calculation (with holiday adjustment)
4. Off-cycle payroll runs (bonuses, corrections, terminations)
5. Payroll calendar with cut-off dates
6. Preview mode (test run before finalizing)
7. Multi-currency payroll (USD, INR)

**Acceptance Criteria**:
- Support multiple pay schedules per tenant
- Handle timezone differences for pay dates
- Allow retroactive corrections
- Lock finalized payroll runs
- Unlock with audit trail if needed

### FR-PAY-003: Gross-to-Net Calculation

**Description**: System shall calculate gross wages, apply all deductions, and arrive at net pay.

**Calculation Flow**:
```
1. Calculate Gross Wages
   - Base pay (salary/hourly × hours)
   - Overtime (hours × overtime rate)
   - Commissions earned in period
   - Bonuses
   - Shift differentials
   - Allowances (taxable)

2. Calculate Pre-Tax Deductions
   - 401k/403b contributions
   - Health insurance premiums
   - HSA/FSA contributions
   - Parking/transit (pre-tax)
   - Other pre-tax benefits

3. Calculate Taxable Wages
   = Gross Wages - Pre-Tax Deductions

4. Calculate Taxes
   - Federal income tax
   - State income tax
   - Local taxes
   - FICA (Social Security + Medicare)
   - SDI (if applicable)
   - India: TDS, Professional Tax

5. Calculate Statutory Deductions
   - India: EPF employee share (12%)
   - India: ESI employee share (0.75%)

6. Calculate Post-Tax Deductions
   - Roth 401k
   - Garnishments (with priority)
   - Loans/advances repayment
   - Voluntary deductions

7. Calculate Net Pay
   = Gross Wages - All Deductions
```

**Acceptance Criteria**:
- Calculation matches manual calculation
- Handles negative net pay (flag for review)
- Respects deduction priorities (garnishments first)
- Calculates YTD totals accurately
- Supports retro adjustments

### FR-PAY-004: Deduction Management

**Description**: System shall manage employee deductions with proper sequencing and limits.

**Deduction Types**:

**Pre-Tax** (reduces taxable income):
- 401k traditional ($23,000 limit for 2024, $30,500 if 50+)
- Health insurance premiums
- HSA ($4,150 individual, $8,300 family for 2024)
- FSA ($3,200 limit for 2024)
- Dependent care FSA ($5,000 limit)
- Commuter benefits ($315/month transit + $315/month parking)

**Post-Tax**:
- Roth 401k (same limits as traditional, but post-tax)
- Roth IRA (if offered)
- Supplemental insurance
- Charitable contributions
- Union dues
- Parking (if not pre-tax)

**Statutory**:
- FICA taxes
- India: EPF, ESI
- Court-ordered garnishments

**Deduction Priority** (when net pay insufficient):
1. Taxes (cannot be reduced)
2. Garnishments (court-ordered)
3. Statutory deductions (EPF, ESI)
4. Pre-tax deductions
5. Post-tax voluntary deductions

**Acceptance Criteria**:
- Enforce annual contribution limits
- Alert when limits reached
- Catch-up contributions for 50+ (US)
- Garnishment calculation per federal/state rules
- Multiple garnishment prioritization

### FR-PAY-005: Payment Methods

**Description**: System shall support multiple payment methods and generate payment files.

**Payment Methods**:
1. **Direct Deposit** (ACH in US, NEFT/RTGS in India)
   - Primary account (checking/savings)
   - Split deposits (multiple accounts, %, or fixed amounts)
   - Net pay or specific amount

2. **Check**
   - Physical check printing
   - Check register
   - Void/reissue

3. **Cash** (limited use)
   - Cash payment receipt
   - Signature required

4. **Paycard** (prepaid debit card)
   - Load amount to card

**Payment File Generation**:
- NACHA file format (US ACH)
- Bank-specific formats (India: ICICI, HDFC, SBI formats)
- Encryption and secure transmission
- Prenote testing for new accounts
- Payment confirmation/reconciliation

**Acceptance Criteria**:
- Validate routing/account numbers
- Support prenote (zero-dollar verification)
- Generate payment files in required format
- Track payment status (pending, cleared, failed)
- Handle payment reversals/returns

### FR-PAY-006: Pay Stub Generation

**Description**: System shall generate detailed pay stubs for all employees.

**US Pay Stub Contents**:
- Employee info (name, address, SSN last 4, employee ID)
- Pay period dates, pay date
- Earnings:
  - Regular hours/salary
  - Overtime hours
  - Other earnings (commission, bonus, etc.)
  - Current period and YTD amounts
- Taxes:
  - Federal income tax
  - Social Security
  - Medicare
  - State income tax
  - Local taxes
  - Current period and YTD
- Deductions:
  - Pre-tax (401k, health insurance, etc.)
  - Post-tax (Roth, garnishments, etc.)
  - Current period and YTD
- Net pay
- Payment method details
- Leave balances (optional)

**India Salary Slip Contents**:
- Employee info (name, PAN, UAN, employee ID)
- Pay period, payment date
- Earnings:
  - Basic salary
  - HRA (House Rent Allowance)
  - Conveyance allowance
  - Special allowance
  - Other allowances
  - Gross salary
- Deductions:
  - EPF employee contribution
  - ESI employee contribution (if applicable)
  - Professional tax
  - TDS (Tax Deducted at Source)
  - Other deductions
- Net salary
- Employer contributions (EPF, ESI)
- YTD totals

**Format Options**:
- PDF (password-protected)
- Email delivery
- Employee portal access
- Print

**Acceptance Criteria**:
- All pay stubs accurate and complete
- Available within 1 day of pay date
- Secure access (employee can only see own)
- Historical pay stubs accessible
- Compliant with state/country requirements

### FR-PAY-007: Tax Form Generation

**Description**: System shall generate annual tax forms for employees and government filing.

**US Tax Forms**:

**W-2** (Wage and Tax Statement):
- Box 1: Wages, tips, other compensation
- Box 2: Federal income tax withheld
- Box 3: Social Security wages
- Box 4: Social Security tax withheld
- Box 5: Medicare wages and tips
- Box 6: Medicare tax withheld
- Boxes 12: Retirement contributions, etc.
- Boxes 15-20: State/local taxes
- Generated by January 31
- Filed with SSA (W-3 transmittal)

**1099-NEC** (Non-Employee Compensation):
- For contractors paid ≥ $600
- Generated by January 31

**940** (Employer's Annual Federal Unemployment Tax):
- FUTA tax return
- Due January 31

**941** (Employer's Quarterly Federal Tax Return):
- Quarterly report of wages and taxes
- Due by end of month following quarter

**India Tax Forms**:

**Form 16** (TDS Certificate):
- Part A: Employer and employee details, TDS summary
- Part B: Salary details, deductions, tax computation
- Issued by June 15 after financial year end
- Required for employee ITR filing

**Form 24Q** (TDS Return):
- Quarterly TDS return filed by employer
- Due dates: July 31, Oct 31, Jan 31, May 31

**Form 12BA** (Perquisites and Profits):
- Details of perquisites provided

**Acceptance Criteria**:
- Forms accurate and complete
- Generated on time
- Electronic filing ready (XML format)
- Corrections/amendments supported
- State-specific variations (W-2)

### FR-PAY-008: Payroll Corrections & Adjustments

**Description**: System shall support corrections to processed payroll.

**Correction Types**:
1. **Retroactive Pay Adjustments**
   - Salary increases with retroactive effective date
   - Missed overtime or bonuses
   - Tax calculation errors

2. **Deduction Corrections**
   - Missed or incorrect deductions
   - Refund of over-deducted amounts

3. **Tax Corrections**
   - Incorrect withholding
   - State tax adjustments
   - YTD cumulative adjustments

4. **Off-Cycle Payments**
   - Bonus payments
   - Termination pay
   - Commission corrections

**Correction Methods**:
- Next paycheck adjustment (most common)
- Off-cycle payment
- Manual check
- Tax-only adjustment (W-2c for prior year)

**Acceptance Criteria**:
- Full audit trail of corrections
- Recalculates YTD totals
- Updates tax forms if needed
- Alerts affected employees
- Requires approval for large adjustments

### FR-PAY-009: Compliance & Audit Trail

**Description**: System shall maintain complete audit trail for compliance.

**Audit Requirements**:
1. Track all payroll changes:
   - Who made the change
   - When it was made
   - What was changed (old vs new value)
   - Reason for change

2. Payroll run history:
   - Preview runs (test mode)
   - Finalized runs
   - Corrections/reversals
   - Payment status

3. Tax deposit tracking:
   - Amount deposited
   - Deposit date
   - Confirmation number
   - Authority (IRS, state, EPF, ESI)

4. Employee changes affecting payroll:
   - Compensation changes
   - Withholding changes (W-4, Form 12BB)
   - Direct deposit changes
   - Deduction enrollment

**Retention**:
- Payroll records: 7 years (US), 7 years (India)
- Tax returns: Permanent
- Time records: 3 years (FLSA)
- W-4/Form 12BB: Current + 4 years

**Acceptance Criteria**:
- Immutable audit log
- Searchable and filterable
- Export for external audits
- Meets SOX requirements (if applicable)

---

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete database schemas including:
- Payroll Runs and Payroll Run Employees
- Tax Withholding Certificates (US W-4, India Form 12BB)
- Tax Rates and Deduction Definitions
- Employee Deductions and Tax Deposits
- India-specific tables (india_salary_structure, india_tax_declarations)

The data models support:
- Multi-country payroll (US and India)
- Complex tax calculations with progressive brackets
- Pre-tax and post-tax deductions
- Employer contributions (401k match, EPF, ESI)
- YTD tracking for tax forms
- Garnishments and loan repayments

---

## Tax Calculation Engine

### US Federal Tax Calculation

```typescript
function calculateFederalIncomeTax(
  taxableWages: number,
  payPeriod: string, // weekly, bi-weekly, semi-monthly, monthly
  w4: W4Data
): number {
  // IRS Publication 15-T (2024)
  // Using percentage method

  // Step 1: Adjust wages for Form W-4 entries
  let adjustedWages = taxableWages;

  // Step 2(a): Multiple jobs or spouse works
  if (w4.step2Amount > 0) {
    adjustedWages += w4.step2Amount / getPayPeriodsPerYear(payPeriod);
  }

  // Step 3: Dependent credits
  const dependentCredit = w4.step3Dependents / getPayPeriodsPerYear(payPeriod);

  // Step 4(a): Other income
  if (w4.step4aOtherIncome > 0) {
    adjustedWages += w4.step4aOtherIncome / getPayPeriodsPerYear(payPeriod);
  }

  // Step 4(b): Deductions
  const deductions = w4.step4bDeductions / getPayPeriodsPerYear(payPeriod);
  adjustedWages -= deductions;

  // Get tax brackets for filing status and pay period
  const brackets = getTaxBrackets(w4.filingStatus, payPeriod, 2024);

  // Calculate tax using bracket method
  let tax = 0;
  let previousBracketMax = 0;

  for (const bracket of brackets) {
    if (adjustedWages > bracket.threshold) {
      const taxableInBracket = Math.min(
        adjustedWages - bracket.threshold,
        bracket.max - bracket.threshold
      );
      tax += taxableInBracket * bracket.rate;
      previousBracketMax = bracket.max;
    } else {
      break;
    }
  }

  // Subtract dependent credit
  tax = Math.max(0, tax - dependentCredit);

  // Step 4(c): Extra withholding
  tax += w4.step4cExtraWithholding;

  return roundToTwoDecimals(tax);
}

// 2024 Federal tax brackets (annual)
const federalBrackets2024 = {
  single: [
    { threshold: 0, max: 11600, rate: 0.10 },
    { threshold: 11600, max: 47150, rate: 0.12 },
    { threshold: 47150, max: 100525, rate: 0.22 },
    { threshold: 100525, max: 191950, rate: 0.24 },
    { threshold: 191950, max: 243725, rate: 0.32 },
    { threshold: 243725, max: 609350, rate: 0.35 },
    { threshold: 609350, max: Infinity, rate: 0.37 }
  ],
  married_filing_jointly: [
    { threshold: 0, max: 23200, rate: 0.10 },
    { threshold: 23200, max: 94300, rate: 0.12 },
    { threshold: 94300, max: 201050, rate: 0.22 },
    { threshold: 201050, max: 383900, rate: 0.24 },
    { threshold: 383900, max: 487450, rate: 0.32 },
    { threshold: 487450, max: 731200, rate: 0.35 },
    { threshold: 731200, max: Infinity, rate: 0.37 }
  ],
  // ... other filing statuses
};
```

### US State Tax Calculation Examples

```typescript
// California progressive tax
function calculateCaliforniaIncomeTax(
  taxableWages: number,
  filingStatus: string,
  payPeriod: string
): number {
  const brackets = getCaBrackets(filingStatus, 2024);
  // Similar progressive calculation
  // CA has 9 tax brackets, top rate 13.3%
}

// Illinois flat tax
function calculateIllinoisIncomeTax(
  taxableWages: number,
  payPeriod: string
): number {
  return taxableWages * 0.0495; // 4.95% flat rate
}

// No state income tax
function calculateTexasIncomeTax(): number {
  return 0; // Texas has no state income tax
}
```

### India Tax Calculation

```typescript
function calculateIndiaTDS(
  employee: Employee,
  salaryStructure: IndiaSalaryStructure,
  taxDeclarations: IndiaTaxDeclarations,
  currentMonth: number
): number {
  const fy = getCurrentFinancialYear(); // e.g., FY2024-25

  // Step 1: Calculate gross annual income
  const grossAnnual = calculateGrossAnnual(salaryStructure);

  // Step 2: Calculate exemptions and deductions
  let exemptions = 0;

  if (taxDeclarations.taxRegime === 'old_regime') {
    // Standard deduction
    exemptions += 50000;

    // HRA exemption
    exemptions += calculateHRAExemption(
      salaryStructure.hra * 12,
      salaryStructure.basic_salary * 12,
      taxDeclarations.rentPaidMonthly * 12,
      taxDeclarations.metroCity
    );

    // Section 80C (PPF, ELSS, etc.) - Max ₹1.5L
    exemptions += Math.min(taxDeclarations.section_80c, 150000);

    // Section 80D (Health insurance) - Max ₹25K/₹50K
    exemptions += Math.min(taxDeclarations.section_80d, 25000);

    // Section 24 (Home loan interest) - Max ₹2L
    exemptions += Math.min(taxDeclarations.home_loan_interest, 200000);

    // LTA exemption
    exemptions += taxDeclarations.lta_claimed;
  } else {
    // New regime: Only standard deduction
    exemptions = 50000;
  }

  // Step 3: Taxable income
  const taxableIncome = grossAnnual - exemptions;

  // Step 4: Calculate tax based on regime
  let annualTax = 0;

  if (taxDeclarations.taxRegime === 'new_regime') {
    annualTax = calculateNewRegimeTax(taxableIncome);
  } else {
    annualTax = calculateOldRegimeTax(taxableIncome);
  }

  // Step 5: Add cess (4%)
  annualTax = annualTax * 1.04;

  // Step 6: Adjust for previous employer TDS (if mid-year joining)
  annualTax -= taxDeclarations.previous_employer_tds;

  // Step 7: Calculate monthly TDS
  const monthsRemaining = 12 - currentMonth + 1;
  const monthlyTDS = annualTax / monthsRemaining;

  return roundToTwoDecimals(monthlyTDS);
}

function calculateNewRegimeTax(taxableIncome: number): number {
  const brackets = [
    { from: 0, to: 300000, rate: 0 },
    { from: 300000, to: 600000, rate: 0.05 },
    { from: 600000, to: 900000, rate: 0.10 },
    { from: 900000, to: 1200000, rate: 0.15 },
    { from: 1200000, to: 1500000, rate: 0.20 },
    { from: 1500000, to: Infinity, rate: 0.30 }
  ];

  return calculateProgressiveTax(taxableIncome, brackets);
}

function calculateHRAExemption(
  hraReceived: number,
  basicSalary: number,
  rentPaid: number,
  metroCity: boolean
): number {
  // HRA exemption is minimum of:
  // 1. Actual HRA received
  // 2. 50% of basic (metro) or 40% of basic (non-metro)
  // 3. Rent paid - 10% of basic

  const percentOfBasic = metroCity ? 0.50 : 0.40;
  const option1 = hraReceived;
  const option2 = basicSalary * percentOfBasic;
  const option3 = rentPaid - (basicSalary * 0.10);

  return Math.min(option1, option2, Math.max(0, option3));
}

function calculateEPF(
  basicPlusDA: number,
  isEmployee: boolean
): number {
  // EPF calculation
  // Wage ceiling: ₹15,000/month
  const wageCeiling = 15000;
  const applicableWages = Math.min(basicPlusDA, wageCeiling);

  const rate = 0.12; // 12%

  return roundToTwoDecimals(applicableWages * rate);
}

function calculateESI(
  grossSalary: number,
  isEmployee: boolean
): number {
  // ESI applicable only if gross ≤ ₹21,000/month
  if (grossSalary > 21000) {
    return 0;
  }

  const rate = isEmployee ? 0.0075 : 0.0325; // 0.75% employee, 3.25% employer
  return roundToTwoDecimals(grossSalary * rate);
}
```

### Social Security & Medicare Calculation

```typescript
function calculateFICA(
  grossWages: number,
  ytdGross: number,
  taxYear: number
): { socialSecurity: number; medicare: number; additionalMedicare: number } {
  // Social Security: 6.2% up to wage base
  const ssWageBase = getSocialSecurityWageBase(taxYear); // $168,600 for 2024
  const ssWages = Math.min(grossWages, Math.max(0, ssWageBase - ytdGross));
  const socialSecurity = ssWages * 0.062;

  // Medicare: 1.45% on all wages
  const medicare = grossWages * 0.0145;

  // Additional Medicare: 0.9% on wages > $200,000 (single), $250,000 (married)
  const additionalMedicareThreshold = 200000; // Simplified, adjust based on filing status
  let additionalMedicare = 0;

  if (ytdGross + grossWages > additionalMedicareThreshold) {
    const excessWages = Math.max(
      0,
      ytdGross + grossWages - additionalMedicareThreshold
    );
    additionalMedicare = excessWages * 0.009;
  }

  return {
    socialSecurity: roundToTwoDecimals(socialSecurity),
    medicare: roundToTwoDecimals(medicare),
    additionalMedicare: roundToTwoDecimals(additionalMedicare)
  };
}
```

---

## Payroll Processing Workflow

### Standard Payroll Run Process

```
1. INITIATE PAYROLL RUN
   - Select pay period
   - Select employees (or auto-select based on pay schedule)
   - Set run type (regular, off-cycle, bonus)

2. IMPORT TIME DATA
   - Pull approved timesheets
   - Import hours worked (regular, overtime, PTO)
   - Validate time data completeness

3. CALCULATE EARNINGS
   - Base pay (salary/hourly × hours)
   - Overtime (hours × overtime rate)
   - Commissions (based on sales/quota achievement)
   - Bonuses
   - Allowances
   - Shift differentials
   → GROSS PAY

4. APPLY PRE-TAX DEDUCTIONS
   - 401k contributions
   - Health insurance premiums
   - HSA/FSA contributions
   - Pre-tax parking/transit
   → TAXABLE WAGES

5. CALCULATE TAXES
   US:
   - Federal income tax (W-4 method)
   - Social Security (6.2%, wage base check)
   - Medicare (1.45% + 0.9% additional)
   - State income tax
   - SDI (if applicable)
   - Local taxes

   India:
   - TDS (based on projections and declarations)
   - Professional tax (state-specific)
   - EPF employee (12% of basic+DA, ceiling ₹15K)
   - ESI employee (0.75% if gross ≤ ₹21K)

6. APPLY POST-TAX DEDUCTIONS
   - Roth 401k
   - Garnishments (priority order)
   - Loan repayments
   - Voluntary deductions
   → NET PAY

7. CALCULATE EMPLOYER TAXES
   US:
   - Social Security employer match (6.2%)
   - Medicare employer match (1.45%)
   - FUTA (0.6% after credit, first $7K)
   - SUI (state-specific rate)

   India:
   - EPF employer (12% split: 3.67% EPF + 8.33% EPS)
   - ESI employer (3.25%)
   - NPS employer (if applicable)

8. REVIEW & VALIDATION
   - Verify calculations
   - Check for negative net pay
   - Review exceptions (high overtime, low net pay)
   - Compare to previous pay period (variance check)

9. APPROVE PAYROLL
   - Payroll admin reviews
   - Finance approves
   - Lock payroll run

10. GENERATE PAY STUBS
    - Create PDF pay stubs
    - Email to employees
    - Post to employee portal

11. GENERATE PAYMENT FILES
    - ACH file (NACHA format for US)
    - Bank file (India: NEFT/RTGS format)
    - Check register
    - Encrypt and transmit securely

12. SUBMIT PAYMENTS
    - Upload to bank
    - Track payment status
    - Confirm successful processing

13. UPDATE RECORDS
    - Update YTD totals
    - Update employee balances (PTO, etc.)
    - Post to general ledger
    - Update tax liability accounts

14. FILE TAXES
    - Schedule tax deposits (federal/state/EPF/ESI)
    - Track deposit deadlines
    - Generate deposit confirmations
```

### Off-Cycle Payroll

For bonuses, corrections, or terminations outside regular payroll:

```
1. Create off-cycle payroll run
2. Select specific employees
3. Enter special payments (bonus, retroactive pay, final pay)
4. Calculate taxes:
   - Supplemental wage method (US: 22% federal flat or aggregate)
   - India: Add to annual projections, recalculate TDS
5. Generate payment
6. Update YTD totals
7. Include in quarterly/annual tax reports
```

---

## Compliance & Reporting

### US Compliance Requirements

#### Quarterly Reports

**Form 941** (Employer's Quarterly Federal Tax Return):
- Due: April 30, July 31, October 31, January 31
- Reports: Wages, tips, federal income tax, Social Security, Medicare
- Required for all employers

**State Quarterly Returns**:
- State unemployment insurance (SUI)
- State withholding tax
- State disability insurance (where applicable)
- Due dates vary by state

#### Annual Reports

**Form W-2** (Wage and Tax Statement):
- Due to employees: January 31
- Due to SSA: January 31 (with Form W-3)
- Includes federal, state, and local taxes

**Form W-3** (Transmittal of Wage and Tax Statements):
- Summary of all W-2s
- Filed with SSA

**Form 940** (Employer's Annual Federal Unemployment Tax):
- Due: January 31
- Reports FUTA tax

**1099-NEC** (Non-Employee Compensation):
- For contractors paid ≥ $600
- Due: January 31

**ACA Reporting** (if applicable):
- Forms 1095-B/C (employee copies)
- Forms 1094-B/C (IRS filing)
- Employer mandate reporting

#### Tax Deposits

**Federal Tax Deposits** (FICA + federal income tax):
- Monthly depositor: 15th of following month
- Semi-weekly depositor: Wed/Fri based on pay date
- Via EFTPS (Electronic Federal Tax Payment System)

**State Tax Deposits**:
- Varies by state (monthly, quarterly, annually)

### India Compliance Requirements

#### Monthly Requirements

**TDS Deposit**:
- Due: 7th of following month
- Via Challan 281 (online payment)

**EPF Remittance**:
- Due: 15th of following month
- File ECR (Electronic Challan cum Return)
- Via EPFO portal

**ESI Remittance**:
- Due: 15th of following month (contribution period)
- Due: 21st of following month (payment)
- Via ESIC portal

**Professional Tax**:
- Due: varies by state (typically 10th-20th of month)

#### Quarterly Requirements

**Form 24Q** (TDS Return):
- Due: July 31, October 31, January 31, May 31
- Quarterly TDS return for salary
- File via TRACES portal

#### Annual Requirements

**Form 16** (TDS Certificate):
- Due: June 15 (after FY end)
- Issued to each employee
- Part A: Deductor and deductee details, TDS summary
- Part B: Salary details, deductions, tax computation

**Form 12BA** (Perquisites):
- Details of perquisites provided to employee

**EPF Annual Returns**:
- Form 3A, 6A (due September 30)

**ESI Annual Returns**:
- Form 7 (due November 12)

### Audit Requirements

**Payroll Records Retention**:
- US: 4-7 years (varies by record type and state)
- India: 7 years minimum
- Records to retain:
  - Payroll registers
  - Time cards/timesheets
  - Tax forms and returns
  - Deduction authorizations
  - Garnishment orders

**SOX Compliance** (if applicable):
- Segregation of duties
- Access controls
- Change management
- Audit trails

---

## API Specifications

### Base URL
```
https://api.platform.com/v1/payroll
```

### API Endpoints

#### Payroll Run Management

**POST /payroll-runs**
- Description: Create new payroll run
- Permissions: `payroll:runs:create`
- Request Body:
```json
{
  "pay_period_start": "2025-01-01",
  "pay_period_end": "2025-01-15",
  "pay_date": "2025-01-20",
  "run_type": "regular",
  "country": "US",
  "pay_schedule_id": "uuid",
  "employee_ids": ["uuid1", "uuid2"] // Optional, default: all active
}
```
- Response: Created payroll run object

**GET /payroll-runs/:id**
- Description: Get payroll run details
- Permissions: `payroll:runs:read`
- Response:
```json
{
  "id": "uuid",
  "pay_period_start": "2025-01-01",
  "pay_period_end": "2025-01-15",
  "pay_date": "2025-01-20",
  "run_status": "draft",
  "employee_count": 150,
  "total_gross_pay": 350000.00,
  "total_net_pay": 245000.00,
  "total_taxes": 87500.00,
  "currency": "USD"
}
```

**POST /payroll-runs/:id/calculate**
- Description: Calculate payroll (preview mode)
- Permissions: `payroll:runs:calculate`
- Response: Calculated payroll with employee details

**POST /payroll-runs/:id/approve**
- Description: Approve payroll for payment
- Permissions: `payroll:runs:approve`
- Response: Updated payroll run

**POST /payroll-runs/:id/finalize**
- Description: Finalize payroll (lock for changes)
- Permissions: `payroll:runs:finalize`
- Response: Finalized payroll run

**POST /payroll-runs/:id/payment-file**
- Description: Generate payment file (ACH/NEFT)
- Permissions: `payroll:runs:payment`
- Response:
```json
{
  "file_url": "https://secure.../payment_file.ach",
  "file_type": "NACHA",
  "total_amount": 245000.00,
  "employee_count": 150
}
```

#### Employee Payroll

**GET /payroll-runs/:run_id/employees**
- Description: List employees in payroll run
- Permissions: `payroll:employees:read`
- Response: List of payroll run employees with calculations

**GET /payroll-runs/:run_id/employees/:employee_id**
- Description: Get detailed payroll for single employee
- Permissions: `payroll:employees:read` or self
- Response:
```json
{
  "employee_id": "uuid",
  "employee_name": "John Doe",
  "earnings": {
    "regular_pay": 4000.00,
    "overtime_pay": 600.00,
    "commission": 1500.00,
    "total": 6100.00
  },
  "pretax_deductions": {
    "401k": 400.00,
    "health_insurance": 200.00,
    "total": 600.00
  },
  "taxable_wages": {
    "federal": 5500.00,
    "social_security": 5500.00,
    "medicare": 5500.00,
    "state": 5500.00
  },
  "taxes": {
    "federal_income_tax": 825.00,
    "social_security": 341.00,
    "medicare": 79.75,
    "state_income_tax": 275.00,
    "total": 1520.75
  },
  "posttax_deductions": {
    "roth_401k": 200.00,
    "total": 200.00
  },
  "net_pay": 3779.25,
  "payment_method": "direct_deposit"
}
```

#### Tax Forms

**GET /tax-forms/w2/:year**
- Description: Get W-2 forms for employees
- Permissions: `payroll:tax-forms:read`
- Query Parameters:
  - `employee_id`: Filter by employee
- Response: List of W-2 data

**POST /tax-forms/w2/:year/generate**
- Description: Generate W-2 PDFs for year
- Permissions: `payroll:tax-forms:generate`
- Response: Batch job ID

**GET /tax-forms/form16/:financial_year**
- Description: Get Form 16 for India employees
- Permissions: `payroll:tax-forms:read` or self
- Response: Form 16 data and PDF URL

**GET /tax-forms/941/:quarter/:year**
- Description: Get Form 941 data
- Permissions: `payroll:tax-forms:read`
- Response: Quarterly tax report data

#### Tax Withholding

**POST /employees/:employee_id/w4**
- Description: Submit W-4 form
- Permissions: Employee (self) or `payroll:withholding:update`
- Request Body:
```json
{
  "tax_year": 2024,
  "filing_status": "single",
  "multiple_jobs": false,
  "step3_dependents": 0,
  "step4c_extra_withholding": 50.00
}
```
- Response: Created withholding certificate

**POST /employees/:employee_id/india-tax-declarations**
- Description: Submit India tax declarations
- Permissions: Employee (self) or `payroll:withholding:update`
- Request Body:
```json
{
  "financial_year": "FY2024-25",
  "tax_regime": "new_regime",
  "section_80c": 150000,
  "section_80d": 25000,
  "hra_exemption_claimed": 180000,
  "rent_paid_monthly": 20000,
  "metro_city": true
}
```
- Response: Created tax declarations

#### Reports

**GET /reports/payroll-register**
- Description: Detailed payroll register
- Query Parameters:
  - `start_date`, `end_date`
  - `department_id`, `location_id`
  - `format`: json, csv, pdf
- Response: Payroll register data

**GET /reports/tax-liability**
- Description: Tax liability summary
- Query Parameters:
  - `period`: quarter or year
  - `tax_type`: federal, state, fica, etc.
- Response: Tax liability breakdown

**GET /reports/labor-cost**
- Description: Labor cost analysis
- Query Parameters:
  - `start_date`, `end_date`
  - `group_by`: department, location, pay_type
- Response: Labor cost metrics

---

## User Interface Specifications

### Payroll Dashboard

**URL**: `/payroll/dashboard`

**Layout**:
- Current pay period countdown
- Upcoming payroll runs (next 3 months)
- Pending approvals
- Tax deposit deadlines
- Quick actions (Run Payroll, View Reports)

**Widgets**:
1. **Payroll Summary**
   - Current period gross pay
   - Current period net pay
   - Tax withholding total
   - Employer tax liability

2. **Compliance Calendar**
   - Upcoming tax deposit due dates
   - Quarterly filing deadlines
   - Year-end form deadlines

3. **Alerts**
   - Employees missing W-4/tax declarations
   - Failed direct deposits
   - Tax deposit past due
   - Payroll exceptions (negative net pay, etc.)

### Run Payroll Page

**URL**: `/payroll/run`

**Steps**:

**Step 1: Select Period**
- Pay schedule dropdown
- Auto-populated dates
- Employee count preview

**Step 2: Import Time**
- Show pending timesheets
- Option to auto-approve or require manager approval
- Time entry summary

**Step 3: Calculate**
- Run calculation engine
- Show progress bar
- Display calculation summary

**Step 4: Review**
- Employee list with gross/net pay
- Exception highlighting (negative pay, high overtime, etc.)
- Variance from previous period
- Drill down to employee details

**Step 5: Approve**
- Summary totals
- Approval checkbox
- Digital signature
- Submit for payment processing

**Step 6: Generate Payments**
- Payment file download
- Direct deposit summary
- Check printing queue

### Employee Pay Stub Page

**URL**: `/payroll/pay-stubs` (Employee self-service)

**Layout**:
- Current year pay stubs (list)
- YTD summary card
- Download options (PDF, print)

**Pay Stub Display**:
- Company logo
- Employee info (name, ID, address)
- Pay period and pay date
- Earnings table (description, hours, rate, amount, YTD)
- Deductions table (pre-tax, taxes, post-tax, YTD)
- Net pay (highlighted)
- Payment method details
- Leave balances

### Tax Forms Page

**URL**: `/payroll/tax-forms`

**Sections**:

**For Employees**:
- My W-2 / Form 16
- Download PDF
- Tax summary

**For Payroll Admin**:
- Generate W-2s (batch)
- Generate Form 941/24Q
- Generate Form 940
- E-file tax returns

### India-Specific: Salary Structure Page

**URL**: `/payroll/salary-structure/:employee_id`

**Display CTC Breakdown**:
```
Annual CTC: ₹12,00,000

Fixed Components (Monthly):
├── Basic Salary: ₹40,000
├── HRA (50%): ₹20,000
├── Conveyance: ₹1,600
├── Special Allowance: ₹18,400
└── Monthly Gross: ₹80,000

Variable Components:
├── Performance Bonus: ₹50,000 (annual)
└── Annual Bonus: ₹50,000

Employer Contributions:
├── EPF Employer: ₹4,800/month
├── ESI Employer: ₹2,600/month
└── Gratuity: ₹1,850/month

Deductions:
├── EPF Employee: ₹4,800
├── ESI Employee: ₹600
├── Professional Tax: ₹200
└── TDS: ₹7,083

Net Salary (Monthly): ₹66,317
```

---

## Integration Points

### Time & Attendance Integration

- Import approved timesheets
- Regular hours, overtime hours, PTO hours
- Multi-state work location tracking
- Shift differential tracking

### Compensation Framework Integration

- Base compensation (salary, hourly, commission)
- Variable compensation (bonuses, commissions earned)
- Equity vesting events
- Allowances and stipends
- Overtime rules

### Benefits Module Integration

- Health insurance premiums (pre-tax)
- 401k/NPS contributions
- HSA/FSA deductions
- Life insurance premiums

### General Ledger Integration

- Payroll expense posting
- Tax liability accounts
- Deduction liability accounts
- Employer tax expense

### Banking Integration

- ACH file generation (NACHA format)
- India: NEFT/RTGS file generation
- Direct deposit verification (prenote)
- Payment status tracking

### Tax Filing Integration

- E-file federal tax returns (IRS)
- E-file state tax returns
- India: TRACES portal integration (Form 24Q)
- EPF/ESI portal integration

---

## Testing Requirements

### Unit Tests

**Tax Calculation**:
- ✓ Federal tax calculation (all brackets)
- ✓ State tax (progressive, flat, no tax)
- ✓ FICA (wage base limit check)
- ✓ Additional Medicare Tax
- ✓ India TDS (old and new regime)
- ✓ EPF calculation (ceiling check)
- ✓ ESI calculation (eligibility check)
- ✓ Multi-state tax allocation

**Gross to Net**:
- ✓ Salary employee calculation
- ✓ Hourly employee with overtime
- ✓ Commission-based employee
- ✓ Pre-tax deduction ordering
- ✓ Post-tax deduction ordering
- ✓ Garnishment calculation
- ✓ Negative net pay handling

**YTD Calculations**:
- ✓ YTD totals accurate
- ✓ Mid-year hire prorations
- ✓ Retroactive adjustments
- ✓ Bonus supplemental tax method

### Integration Tests

**Payroll Run**:
- ✓ Full payroll run (draft to payment file)
- ✓ Off-cycle payroll
- ✓ Payroll corrections
- ✓ Multi-currency payroll (USD and INR)

**Tax Filing**:
- ✓ W-2 generation (all boxes correct)
- ✓ Form 941 accuracy
- ✓ Form 16 generation
- ✓ Form 24Q data correctness

### Compliance Tests

**US Compliance**:
- ✓ W-4 2020+ processing
- ✓ State reciprocal agreements
- ✓ Local tax calculations (NYC, Philadelphia, etc.)
- ✓ Garnishment priority rules
- ✓ 401k limit enforcement

**India Compliance**:
- ✓ TDS calculation accuracy (both regimes)
- ✓ HRA exemption calculation
- ✓ EPF ceiling enforcement
- ✓ ESI eligibility check
- ✓ Professional tax (state-specific)

### End-to-End Tests

**US Payroll**:
- ✓ Full-time salaried employee (CA)
- ✓ Part-time hourly employee (TX, no state tax)
- ✓ Sales rep with commission (NY)
- ✓ Multi-state employee (works in NJ, lives in PA)
- ✓ Employee with garnishment

**India Payroll**:
- ✓ Employee with old tax regime (₹8L CTC)
- ✓ Employee with new tax regime (₹15L CTC)
- ✓ ESI-eligible employee (₹18K gross)
- ✓ Mid-year joiner with previous employer TDS

---

## Summary

This Payroll module provides:

✅ **Multi-Jurisdiction**: US (federal + all 50 states) and India
✅ **Comprehensive Tax Calculation**: Federal, state, local, TDS, EPF, ESI
✅ **Flexible Compensation**: Integrates with compensation framework
✅ **Compliance-Ready**: W-2, 941, Form 16, 24Q, EPF, ESI returns
✅ **Multi-Currency**: USD and INR support
✅ **Audit Trail**: Complete payroll history and tax deposit tracking
✅ **Employee Self-Service**: Pay stubs, tax forms, withholding updates
✅ **Secure Payments**: ACH, NEFT/RTGS file generation

**Next Steps**:
1. Review and approve specification
2. Build tax calculation engine
3. Implement payroll run workflow
4. Create employee self-service portal
5. Build compliance reporting
6. Test with sample payrolls for all scenarios

---

**Document Version**: 1.0
**Last Updated**: December 1, 2025
**Owner**: Product Management & Payroll Team
