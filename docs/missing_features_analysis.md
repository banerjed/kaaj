# Missing Features Analysis - BambooHR Comparison

## Executive Summary

After reviewing BambooHR screenshots and documentation, I've identified **25+ missing features** across multiple categories that should be added to our Employee Profile and HR Module specifications.

---

## 1. Employee Assets Management **[CRITICAL MISSING]**

### What BambooHR Has:
- Complete asset tracking system with:
  - Asset categories (Computer, Monitor, Hardware, Cell, etc.)
  - Asset descriptions
  - Serial numbers
  - Date assigned / Date returned tracking
  - Historical asset assignment log

### What We're Missing:
- **No asset management module at all**
- Cannot track company equipment assigned to employees
- No serial number tracking
- No asset lifecycle management
- No asset return tracking for offboarding

### Recommendation:
Add **Asset Management** as a new section in Employee Profile or HR Module:

```json
{
  "assets": [
    {
      "assetId": "uuid",
      "assetCategory": "computer|monitor|phone|hardware|vehicle|other",
      "assetDescription": "Macbook Pro 16-inch",
      "serialNumber": "AKITB-34234-JKL-00150",
      "manufacturer": "Apple",
      "model": "MacBook Pro M3",
      "dateAssigned": "2024-06-02",
      "assignedBy": "employeeId",
      "dateReturned": null,
      "returnedTo": null,
      "condition": "excellent|good|fair|poor",
      "value": 2500.00,
      "notes": "Includes charger and carrying case"
    }
  ]
}
```

---

## 2. Training & Certification Management **[CRITICAL MISSING]**

### What BambooHR Has:
- **Upcoming Training** tracking with due dates
- **Training Categories** (BambooHR Product Training, Quarterly Training, Required Annual Trainings)
- **Completed Training** history
- **Training due dates** and overdue indicators
- **Training status**: Not started, In progress, Completed, Past due/expired
- **Training assignments** per employee
- **Compliance training** tracking (HIPAA, OSHA, Sexual Harassment, Security)
- **Training categories and groups**

### What We're Missing:
- **No training module** in our specifications
- No way to track employee certifications
- No compliance training tracking
- No training due dates or reminders
- No training history

### Recommendation:
Add **Training Module** to HR specification:

```json
{
  "training": {
    "assignedTrainings": [
      {
        "trainingId": "uuid",
        "trainingName": "Annual Security Training",
        "trainingCategory": "Required Annual Trainings",
        "status": "not_started|in_progress|completed|past_due|expired",
        "dueDate": "2027-01-18",
        "assignedDate": "2026-01-18",
        "completedDate": null,
        "expirationDate": null,
        "isRequired": true,
        "trainingType": "online|in_person|video|document",
        "trainingUrl": "https://...",
        "completionCertificate": "file_uuid"
      }
    ],
    "completedTrainings": [
      {
        "trainingId": "uuid",
        "trainingName": "Getting Started in BambooHR",
        "completedDate": "2025-10-05",
        "score": 95,
        "certificateUrl": "/files/cert_uuid.pdf",
        "expiresOn": "2026-10-05"
      }
    ],
    "certifications": [
      {
        "certificationId": "uuid",
        "certificationName": "PMP",
        "issuingOrganization": "PMI",
        "issueDate": "2023-06-15",
        "expirationDate": "2026-06-15",
        "certificationNumber": "PMP-12345",
        "verificationUrl": "https://..."
      }
    ]
  }
}
```

---

## 3. Request/Change Management System **[CRITICAL MISSING]**

### What BambooHR Has:
- **"Request a Change" button** prominently displayed on employee profiles
- **Inbox with categorized requests**:
  - Time Off Requests (3)
  - Information Updates (1)
  - Asset Requests (3)
  - Compensation (3)
  - Employment Status (3)
  - Job Information (1)
  - Signatures (5)
  - Feedback (1)
  - Onboarding (9)
- **Request status tracking** (Urgent vs Other)
- **Request approval workflow**
- **"Sent Requests"** view for employees

### What We're Missing:
- No employee self-service change request system
- No workflow for approving employee-initiated changes
- No request categorization
- No request inbox for managers/HR
- No way for employees to request information updates

### Recommendation:
Add **Change Request** system (could integrate with Ticketing Module):

```json
{
  "changeRequest": {
    "requestId": "uuid",
    "requestType": "personal_info|compensation|employment_status|job_info|asset|other",
    "requestedBy": "employeeId",
    "requestedFor": "employeeId",
    "requestDate": "2025-10-28",
    "status": "pending|approved|rejected|more_info_needed",
    "urgency": "urgent|normal",
    "approvers": ["manager_id", "hr_admin_id"],
    "approvalChain": [
      {
        "approverId": "manager_id",
        "approvedAt": "2025-10-29T10:00:00Z",
        "status": "approved",
        "comments": "Approved for promotion"
      }
    ],
    "requestDetails": {
      "field": "jobTitle",
      "currentValue": "Software Engineer",
      "requestedValue": "Senior Software Engineer",
      "effectiveDate": "2025-11-01",
      "reason": "Promotion after performance review"
    }
  }
}
```

---

## 4. Employee Dashboard/Home View **[MISSING]**

### What BambooHR Has:
- **Personalized dashboard** showing:
  - Time off balance (135 hours vacation available, 8 hours scheduled)
  - What's happening (news feed of company events)
  - Pending tasks/onboarding tasks
  - My Direct Reports with status indicators
  - Celebrations (birthdays, anniversaries)
  - Who's Out Today/Tomorrow
  - Company Links
  - Time Off Usage charts
  - Headcount/Turnover widgets
  - Location distribution
  - Training status widgets
  - People without pay raises alert

### What We're Missing:
- No employee self-service dashboard
- No manager dashboard showing team status
- No at-a-glance metrics
- No company news feed
- No celebrations/birthdays widget

### Recommendation:
Add **Dashboard Module** with customizable widgets for different roles.

---

## 5. Social Media Integration **[MISSING]**

### What BambooHR Has:
- Social media links on employee profiles:
  - LinkedIn
  - Twitter
  - Facebook
  - Pinterest
  - Instagram

### What We're Missing:
- No social media fields in employee profile
- No professional network integration

### Recommendation:
Add to Employee Profile:

```json
{
  "socialMedia": {
    "linkedIn": "https://linkedin.com/in/...",
    "twitter": "@username",
    "facebook": "https://facebook.com/...",
    "instagram": "@username",
    "github": "https://github.com/...",
    "portfolio": "https://portfolio.com"
  }
}
```

---

## 6. Time Zone Display **[MISSING]**

### What BambooHR Has:
- **Current local time** displayed for each employee
  - "7:32 PM local time"
  - "8:03 PM local time"
- Time zone awareness in directory

### What We're Missing:
- No time zone field
- No current time display for employees
- No distributed team support features

### Recommendation:
Add to Employee Profile:

```json
{
  "timezone": "America/Los_Angeles",
  "currentLocalTime": "calculated_dynamically"
}
```

---

## 7. Employee Status Indicators **[MISSING]**

### What BambooHR Has:
- **"Out" status** badges on employee cards
  - "OUT SEP 29-OCT 4"
  - "Out Today - Oct 4"
  - "Out Oct 5"
  - "Out Oct 5 - 8"
- **Birthday indicators** in celebrations
- **Direct reports count** visible
- **Work anniversary tracking**

### What We're Missing:
- No visual status indicators
- No "out of office" status
- No availability status
- No direct reports count display

---

## 8. Directory Views (List, Directory, Org Chart) **[MISSING]**

### What BambooHR Has:
- **Three view modes**:
  - **List view** - Table format
  - **Directory view** - Card-based with photos
  - **Org Chart view** - Hierarchical tree
- Alphabetical sections (A, B, C, etc.)
- Photo-based directory cards
- Quick access to contact info

### What We're Missing:
- Only mentioned directory in API but no UI specification
- No org chart visualization
- No multiple view modes
- No alphabetical navigation

---

## 9. Employee Vitals Sidebar **[MISSING]**

### What BambooHR Has:
- **"Vitals" sidebar** with quick access to:
  - Phone numbers (extension and direct)
  - Email address
  - Social media links
  - Current local time
  - Location
  - Job title and employment type
  - Department and division
  - Employee number
  - Hire date with tenure calculation ("2y - 10m - 6d")
  - Direct reports list

### What We're Missing:
- No "vitals" summary view
- No tenure calculation
- No quick-access contact card

---

## 10. Custom Fields & Custom Tables **[CRITICAL MISSING]**

### What BambooHR Has:
- **Custom Fields** across tabs:
  - Personal
  - Job
  - Benefits
  - Training
  - Assets
- **Custom Tables** with:
  - General Layout (current state data)
  - Historical Layout (chronological data)
  - Multiple field types:
    - Short Answer
    - Long Answer
    - Checkbox
    - Employee List
    - List: Single Answer
    - List: Multiple Answers
    - Currency
    - Date
    - Number
  - Custom table builder with preview
  - Column sorting
  - Archiving capability

### What We're Missing:
- Employee Profile has "customFields" but very limited specification
- **No custom tables support**
- No historical data tracking for custom data
- No table builder interface specification
- Limited field types (only boolean, date, enum)

### Recommendation:
**Enhance Employee Profile custom fields**:

```json
{
  "customFieldTypes": {
    "supported": [
      "short_text",      // Single line text
      "long_text",       // Multi-line text
      "number",          // Numeric values
      "currency",        // Money values with currency code
      "date",            // Date picker
      "datetime",        // Date and time
      "boolean",         // Checkbox/toggle
      "single_select",   // Dropdown - single choice
      "multi_select",    // Multiple checkboxes
      "employee_list",   // Reference to other employees
      "file",            // File upload
      "url",             // Web link
      "email",           // Email address
      "phone"            // Phone number
    ]
  }
}
```

**Add Custom Tables feature**:

```json
{
  "customTables": [
    {
      "tableId": "uuid",
      "tableName": "Certifications",
      "employeeTab": "training",
      "layoutType": "historical|general",
      "columns": [
        {
          "columnId": "uuid",
          "columnName": "Certification Name",
          "fieldType": "short_text",
          "required": true,
          "order": 1
        },
        {
          "columnId": "uuid",
          "columnName": "Issue Date",
          "fieldType": "date",
          "required": true,
          "order": 2
        },
        {
          "columnId": "uuid",
          "columnName": "Expiration Date",
          "fieldType": "date",
          "required": false,
          "order": 3
        }
      ],
      "sortBy": "Issue Date",
      "sortOrder": "desc"
    }
  ]
}
```

---

## 11. Document Signing/E-Signatures **[MISSING]**

### What BambooHR Has:
- **Signature requests** in inbox
  - "You have 5 documents waiting for your signature"
  - W-4 forms
  - I-9 forms
  - Background check authorization
- E-signature workflow
- Document tracking

### What We're Missing:
- No e-signature integration
- No document workflow
- No signature tracking
- No compliance document management

---

## 12. Benefits Enrollment **[MISSING]**

### What BambooHR Has:
- **Benefits tab** on employee profile
- **"Ready to enroll in benefits?"** prompts
- **Elections due dates** tracking
- Benefits administration module
- Plan year management

### What We're Missing:
- No benefits enrollment in our HR Module
- No benefits tracking
- No open enrollment support
- No plan year concept

---

## 13. Compensation Planning **[MISSING]**

### What BambooHR Has:
- **Compensation Benchmarks** - "Compare your pay with similar orgs"
- **Compensation Planning Worksheets** - "Plan out the right combination of salaries, bonuses, and equity"
- **Compensation requests** in inbox
- **Pay raise tracking** - "5 Without Pay Raise for 12+ Months"

### What We're Missing:
- No compensation planning tools
- No market benchmarking
- No pay raise tracking
- No compensation history (only mentioned in use cases but not in schema)

---

## 14. Performance Management Integration **[MISSING]**

### What BambooHR Has:
- **Feedback requests** in inbox
  - "Daniel Vance has provided feedback about Ryota Saito"
- **Self Assessment** reminders
  - "Take a few minutes to complete your Self Assessment"
  - "Please complete your assessment by Jul 16 (79 days ago)"
- **Performance review workflow**

### What We're Missing:
- No performance review system
- No feedback mechanism
- No self-assessment
- No 360 reviews

---

## 15. Onboarding Task Management **[MISSING]**

### What BambooHR Has:
- **Onboarding tasks** with:
  - Task lists (HR Tasks, IT Setup, Manager Tasks, New Employee Paperwork)
  - Task counts ("6 tasks selected", "4 tasks selected")
  - **Task assignment** to specific employees
  - **Overdue task tracking** ("2 people have overdue tasks")
  - **Task templates** that auto-populate based on employee info
  - **Task status tracking**
- "Already Started" vs "Starting Friday, Jan 16" tracking
- "No one has overdue tasks" / "1 person on track" indicators

### What We're Missing:
- Mentioned in use cases but **no formal task management system** in specification
- No onboarding checklist feature
- No task templates
- No task assignment workflow
- Our ticketing module has "tasks" but they're ticket-specific, not onboarding-specific

---

## 16. Region/Division Field **[MISSING]**

### What BambooHR Has:
- **Region displayed** in employee vitals:
  - "North America"
  - "Europe"
  - "Asia-Pacific"
- Used for directory organization

### What We're Missing:
- No region or division field in employee profile
- Can affect reporting and compliance

---

## 17. Tenure Calculation **[MISSING]**

### What BambooHR Has:
- **Automatic tenure display**: "2y - 10m - 6d"
- Shown in employee vitals
- Useful for recognition and benefits eligibility

### What We're Missing:
- No automatic tenure calculation
- Only have start date, but no computed field

---

## 18. Employee Number vs Employee ID **[NEEDS CLARIFICATION]**

### What BambooHR Has:
- **Employee number** displayed as "#" (e.g., "# 5")
- Separate from employeeId (which might be internal)
- Short, human-readable number

### What We Have:
- Employee ID in format "ACME-2024-001"
- Employee Number as optional field
- **Unclear**: Are these meant to be different or the same?

### Recommendation:
**Clarify distinction**:
- `employeeId`: Unique identifier with org prefix (ACME-2024-001)
- `employeeNumber`: Simple sequential number for display (#5, #123)

---

## 19. "My Stuff" Section **[MISSING]**

### What BambooHR Has:
- **My Stuff widget** showing:
  - Training status (5 active trainings, 2 past due)
  - Benefits enrollment status
  - Compensation benchmarks access
  - Compensation planning worksheets
- Employee self-service shortcuts

### What We're Missing:
- No employee self-service section
- No "my stuff" aggregation

---

## 20. Who's Out Today/Calendar **[MISSING]**

### What BambooHR Has:
- **Who's Out** widget showing:
  - Today's absences
  - Upcoming absences
  - Visual team availability
- **Full Calendar** link

### What We're Missing:
- No team availability view
- No visual calendar of time off
- Time off mentioned in HR module but no availability dashboard

---

## 21. Company Links **[MISSING]**

### What BambooHR Has:
- **Company Links** section with shortcuts to:
  - Company website
  - Benefits portals (401k, Health, Vision, Dental)
  - Company policies (COVID-19)
  - "12 more links..." expandable

### What We're Missing:
- No company links/resources section
- No centralized link repository

---

## 22. Celebrations (Birthdays/Anniversaries) **[MISSING]**

### What BambooHR Has:
- **Celebrations widget** showing:
  - Upcoming birthdays
  - Work anniversaries
  - Employee photos with celebration dates
  - "Eric Asture - October 7 - Happy Birthday!"

### What We're Missing:
- Birthday in employee profile (mentioned as "Birth Date" in BambooHR personal tab screenshot)
- No work anniversary tracking
- No celebrations feature

### Recommendation:
Add to Employee Profile:

```json
{
  "personalInfo": {
    "birthDate": "1969-07-28",
    "age": 56,
    "hideAge": false
  },
  "metadata": {
    "workAnniversary": "calculated_from_start_date",
    "yearsOfService": 2
  }
}
```

---

## 23. Marital Status & Gender **[MISSING]**

### What BambooHR Has:
- **Gender** field (dropdown)
- **Marital Status** field (dropdown)
- Shown in "Basic Information" section

### What We're Missing:
- Gender field missing
- Marital status missing
- We have "pronouns" but not biological sex/gender (which might be needed for benefits, compliance)

### Recommendation:
Add to Employee Profile core identity:

```json
{
  "coreIdentity": {
    "gender": "male|female|non_binary|prefer_not_to_say|other",
    "maritalStatus": "single|married|domestic_partnership|divorced|widowed"
  }
}
```

---

## 24. Tax Information **[PARTIALLY MISSING]**

### What BambooHR Has:
- **SSN** field (masked as XXX-XX-XXXX)
- **Tax File Number** field

### What We Have:
- No SSN field
- No tax identification fields
- Mentioned in "compliance" but not in schema

### Recommendation:
Add to Employee Profile (encrypted):

```json
{
  "taxInformation": {
    "ssn": {
      "encrypted": true,
      "ciphertext": "...",
      "maskedDisplay": "XXX-XX-1234"
    },
    "taxFileNumber": {
      "encrypted": true,
      "ciphertext": "..."
    },
    "taxFilingStatus": "single|married_filing_jointly|married_filing_separately|head_of_household"
  }
}
```

---

## 25. Restore Archived Fields **[MISSING]**

### What BambooHR Has:
- **"Restore Archived Fields"** button
- Ability to archive unused custom fields
- Ability to restore previously archived fields

### What We're Missing:
- No archiving concept for custom fields
- No soft-delete for fields
- Only mentioned "deactivated" but no restore capability

---

## 26. Field History/Audit Trail per Employee **[MISSING]**

### What We Have:
- Audit logging mentioned generically
- Use cases show field changes

### What's Missing from Spec:
- No per-employee field change history view
- No "view history" for specific fields
- No change tracking UI specification

---

## Priority Recommendations

### **P0 - Must Add Before MVP**

1. **Asset Management** - Critical for IT and ops
2. **Training Management** - Required for compliance
3. **Change Request System** - Employee self-service essential
4. **Custom Tables** - Data flexibility requirement
5. **Birth Date, Gender, Marital Status** - Compliance and benefits
6. **SSN/Tax Information** - Payroll integration requirement

### **P1 - High Priority**

7. **Employee Dashboard** - User experience critical
8. **Time Zone Support** - Distributed workforce
9. **Tenure Calculation** - Benefits eligibility, recognition
10. **Social Media Links** - Professional networking
11. **Status Indicators** (Out of Office, etc.)
12. **Directory Multiple Views** (List, Cards, Org Chart)
13. **Vitals Sidebar** - Quick reference UX

### **P2 - Medium Priority**

14. **E-Signature Integration** - Document workflow
15. **Benefits Enrollment** - HR function
16. **Compensation Planning** - Strategic HR
17. **Performance Management** - Feedback & reviews
18. **Onboarding Tasks** - Structured onboarding
19. **Who's Out Calendar** - Team coordination
20. **Company Links** - Resource centralization
21. **Celebrations** - Culture & engagement

### **P3 - Nice to Have**

22. **Region/Division** - Additional org structure
23. **My Stuff Section** - Convenience
24. **Restore Archived Fields** - Admin convenience

---

## Schema Updates Required

### Employee Profile Specification

Add these new top-level sections:

1. `personalInfo.birthDate`
2. `personalInfo.gender`
3. `personalInfo.maritalStatus`
4. `socialMedia { }`
5. `taxInformation { }`
6. `assets [ ]`
7. `training { }`
8. `certifications [ ]`
9. `changeRequests [ ]`
10. `celebrations { }`
11. `timezone`
12. `region`
13. `companyLinks [ ]`

### HR Module Specification

Add new modules:

1. **Asset Management Module**
2. **Training & Development Module**
3. **Performance Management Module**
4. **Benefits Administration Module**
5. **Compensation Planning Module**
6. **Onboarding Module** (with task management)
7. **Change Request Workflow Module**

---

## Integration Points

Several features require integration between modules:

1. **Change Requests ↔ Ticketing Module**: Employee requests could create tickets
2. **Onboarding Tasks ↔ Ticketing Module**: Structured onboarding could use ticketing system
3. **Training ↔ Compliance**: Training completion affects compliance status
4. **Assets ↔ Offboarding**: Asset return required before final offboarding
5. **Time Off ↔ Dashboard**: Who's out today widget
6. **Performance ↔ Compensation**: Performance reviews trigger compensation planning

---

## Conclusion

We're missing **26 significant features** that are standard in mature HRIS systems like BambooHR. The most critical gaps are:

1. **Asset Management** - No way to track company equipment
2. **Training Management** - No compliance training tracking
3. **Change Request System** - No employee self-service workflow
4. **Custom Tables** - Limited data flexibility
5. **Core Fields Missing** - Birth date, gender, SSN, marital status

**Estimated Impact**: Adding these features would increase the specification by approximately **40-50%** in scope, but would make the system production-ready and competitive with market leaders.
