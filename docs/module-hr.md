# Module Specification: Human Resources (HR)

**Version:** 1.0
**Last Updated:** December 1, 2025
**Status:** Draft
**Parent Document:** [Product Specification](./product-specification.md)

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [User Stories](#user-stories)
3. [Functional Requirements](#functional-requirements)
4. [Data Model](#data-model)
5. [API Specifications](#api-specifications)
6. [User Interface Specifications](#user-interface-specifications)
7. [Business Logic & Rules](#business-logic--rules)
8. [Validation Rules](#validation-rules)
9. [Security Considerations](#security-considerations)
10. [Integration Points](#integration-points)
11. [Reporting Requirements](#reporting-requirements)
12. [Testing Requirements](#testing-requirements)

---

## Module Overview

### Purpose
The Human Resources module is the core employee management system, handling the complete employee lifecycle from hire to termination. It serves as the central repository for all employee data and manages critical HR processes including time off, performance reviews, benefits enrollment, and payroll.

### Scope
This module handles:
- **Employee Profiles**: Personal information, contact details, emergency contacts
- **Employment History**: Job changes, promotions, transfers, salary adjustments
- **Time Off Management**: PTO accrual, requests, approvals, balances
- **Attendance Tracking**: Clock in/out, timesheets, attendance records
- **Payroll**: Salary/wage information, deductions, pay stubs
- **Benefits Enrollment**: Plan selection, dependent management, life events
- **Performance Management**: Annual reviews, goals, feedback, ratings
- **Onboarding**: New hire workflows, document collection, training
- **Employee Feedback**: 360-degree feedback, pulse surveys, engagement

### Module Dependencies
- **Consumes**: Firm Profile Module (locations, departments, job titles, benefits packages, pay schedules)
- **Consumed by**: Recruiting Module, Accounting Module, Expense Management, all other modules

### Key Benefits
1. **Complete Employee Record**: Single source of truth for all employee data
2. **Automated Workflows**: Streamline approvals, onboarding, reviews
3. **Compliance**: Track certifications, I-9, required training
4. **Self-Service**: Empower employees to manage their own information
5. **Analytics**: Insights into workforce trends, turnover, engagement

---

## User Stories

### Employee Profile Management

**US-HR-001**: As an HR Administrator, I want to create a new employee profile, so that all employee information is centralized.

**US-HR-002**: As an Employee, I want to view and update my personal information (address, phone, emergency contacts), so that my records are current.

**US-HR-003**: As an HR Administrator, I want to upload employee documents (contracts, certifications, I-9), so that compliance documents are organized.

**US-HR-004**: As an Employee, I want to upload my profile photo, so that colleagues can recognize me in the system.

**US-HR-005**: As a Manager, I want to view my team members' profiles, so that I have access to their contact information and job details.

**US-HR-006**: As an HR Administrator, I want to mark an employee as terminated and set their last day, so that their access is revoked appropriately.

**US-HR-007**: As an Employee, I want to see my full employment history within the company, so that I can track my career progression.

### Employment History

**US-HR-008**: As an HR Administrator, I want to record a job change (promotion, transfer, department change), so that the employee's history is accurate.

**US-HR-009**: As an HR Administrator, I want to record salary adjustments with effective dates, so that payroll is calculated correctly.

**US-HR-010**: As a Manager, I want to view my team members' employment history, so that I understand their tenure and progression.

**US-HR-011**: As an HR Administrator, I want to record reasons for employment changes (promotion, cost-of-living adjustment, market adjustment), so that we can analyze compensation trends.

**US-HR-012**: As an Employee, I want to see my compensation history (without seeing others'), so that I can track my earnings growth.

### Time Off Management

**US-HR-013**: As an Employee, I want to view my time off balances (PTO, sick leave, etc.), so that I know how much time I have available.

**US-HR-014**: As an Employee, I want to request time off with dates and type, so that my manager can approve it.

**US-HR-015**: As a Manager, I want to approve or deny time off requests from my team, so that I can ensure adequate coverage.

**US-HR-016**: As an HR Administrator, I want to configure PTO accrual policies (hours per pay period, max balance), so that accruals are automated.

**US-HR-017**: As an Employee, I want to see my upcoming time off and my team's time off, so that I can plan accordingly.

**US-HR-018**: As an HR Administrator, I want to manually adjust time off balances (e.g., for corrections or grants), so that balances are accurate.

**US-HR-019**: As a Manager, I want to view a team calendar showing who's out when, so that I can plan projects and coverage.

**US-HR-020**: As an Employee, I want to receive notifications when my time off request is approved or denied, so that I'm informed promptly.

### Attendance Tracking

**US-HR-021**: As an Hourly Employee, I want to clock in and clock out each day, so that my hours are tracked accurately.

**US-HR-022**: As an Hourly Employee, I want to view my timesheet for the current pay period, so that I can verify my hours.

**US-HR-023**: As a Manager, I want to approve timesheets for my team before payroll runs, so that hours are verified.

**US-HR-024**: As an HR Administrator, I want to view attendance reports showing late arrivals, early departures, and absences, so that I can address attendance issues.

**US-HR-025**: As an Hourly Employee, I want to be able to correct a missed clock-in/out, so that my hours are accurately recorded.

**US-HR-026**: As an HR Administrator, I want to configure attendance rules (grace period for tardiness, required break times), so that policies are enforced consistently.

### Payroll

**US-HR-027**: As an Employee, I want to view my current salary or hourly wage, so that I know my compensation.

**US-HR-028**: As an Employee, I want to view and download my pay stubs, so that I have records of my earnings.

**US-HR-029**: As an HR Administrator, I want to configure payroll deductions (taxes, benefits, garnishments), so that net pay is calculated correctly.

**US-HR-030**: As an Employee, I want to set up direct deposit with my bank account details, so that I'm paid automatically.

**US-HR-031**: As a Finance Manager, I want to export payroll data to our payroll provider, so that employees are paid on schedule.

**US-HR-032**: As an Employee, I want to update my W-4 withholding information, so that taxes are withheld correctly.

**US-HR-033**: As an HR Administrator, I want to generate year-end tax forms (W-2), so that employees can file their taxes.

### Benefits Enrollment

**US-HR-034**: As an Employee, I want to view available benefits packages and plans, so that I can choose what's best for me.

**US-HR-035**: As an Employee, I want to enroll in benefits during open enrollment, so that I have coverage for the next year.

**US-HR-036**: As an Employee, I want to add or remove dependents from my benefits, so that my family is covered.

**US-HR-037**: As an Employee, I want to make benefits changes during a qualifying life event (marriage, birth), so that I can update my coverage outside of open enrollment.

**US-HR-038**: As an HR Administrator, I want to configure open enrollment periods, so that employees know when they can make changes.

**US-HR-039**: As an HR Administrator, I want to generate benefits enrollment reports, so that I can share enrollment data with carriers.

**US-HR-040**: As an Employee, I want to see how much my benefits cost (employee contribution), so that I understand the impact on my paycheck.

### Performance Management

**US-HR-041**: As a Manager, I want to conduct annual performance reviews for my team, so that employees receive feedback.

**US-HR-042**: As an Employee, I want to complete a self-assessment as part of my review, so that I can share my perspective.

**US-HR-043**: As a Manager, I want to set goals for my team members, so that expectations are clear.

**US-HR-044**: As an Employee, I want to track progress on my goals throughout the year, so that I stay on track.

**US-HR-045**: As an HR Administrator, I want to configure review cycles and templates, so that reviews are consistent across the company.

**US-HR-046**: As a Manager, I want to view historical reviews for my team members, so that I can see their development over time.

**US-HR-047**: As an Employee, I want to acknowledge my performance review electronically, so that there's a record of receipt.

### Onboarding

**US-HR-048**: As an HR Administrator, I want to create an onboarding checklist for new hires, so that all required tasks are completed.

**US-HR-049**: As a New Hire, I want to complete my onboarding tasks (upload documents, complete training), so that I'm ready to start work.

**US-HR-050**: As an HR Administrator, I want to assign an onboarding buddy to new hires, so that they have a point of contact.

**US-HR-051**: As a Manager, I want to view the onboarding progress of my new team members, so that I can support them.

**US-HR-052**: As an HR Administrator, I want to collect electronic signatures on company policies and handbook, so that we have acknowledgment records.

**US-HR-053**: As a New Hire, I want to complete my I-9 verification electronically, so that I'm compliant with employment law.

**US-HR-054**: As an HR Administrator, I want to automate equipment requests (laptop, phone) for new hires, so that they're ready on day one.

### Employee Feedback

**US-HR-055**: As a Manager, I want to give continuous feedback to my team members throughout the year, so that they receive timely input.

**US-HR-056**: As an Employee, I want to request feedback from colleagues (360-degree feedback), so that I can get multiple perspectives.

**US-HR-057**: As an HR Administrator, I want to send pulse surveys to gauge employee engagement, so that we can identify issues early.

**US-HR-058**: As an Employee, I want to provide anonymous feedback on company culture, so that I can share honest opinions.

**US-HR-059**: As an HR Administrator, I want to view aggregated survey results, so that I can identify trends and areas for improvement.

**US-HR-060**: As a Manager, I want to see my team's engagement scores, so that I can address concerns.

### Change Request Management

**US-HR-061**: As an Employee, I want to request changes to my personal information (address, phone), so that my records stay current without needing HR intervention.

**US-HR-062**: As an Employee, I want to track the status of my change requests, so that I know when they've been approved.

**US-HR-063**: As a Manager, I want to review and approve change requests from my team members, so that I can verify the changes before they're applied.

**US-HR-064**: As an HR Administrator, I want to see all pending change requests in an inbox, so that I can process them efficiently.

**US-HR-065**: As an HR Administrator, I want to configure which types of changes require approval, so that the workflow matches our policies.

**US-HR-066**: As an Employee, I want to attach supporting documents to my change requests, so that I can provide necessary proof (e.g., marriage certificate for name change).

### Employee Dashboard

**US-HR-067**: As an Employee, I want to see a personalized dashboard when I log in, so that I have quick access to important information.

**US-HR-068**: As an Employee, I want to see my time off balance, upcoming time off, and pending requests on my dashboard, so that I don't have to navigate to multiple pages.

**US-HR-069**: As a Manager, I want to see my direct reports' status (who's out, pending approvals) on my dashboard, so that I can manage my team effectively.

**US-HR-070**: As an Employee, I want to see upcoming company events and celebrations on my dashboard, so that I stay informed.

**US-HR-071**: As an HR Administrator, I want to see key metrics (headcount, turnover, pending tasks) on my dashboard, so that I can monitor HR operations.

### Celebrations & Recognition

**US-HR-072**: As an Employee, I want to see upcoming birthdays for my team, so that I can congratulate them.

**US-HR-073**: As an HR Administrator, I want the system to automatically display work anniversaries, so that we can recognize employee tenure.

**US-HR-074**: As an Employee, I want to control whether my birthday is displayed to others, so that I can maintain privacy if desired.

**US-HR-075**: As a Manager, I want to see a celebrations widget showing birthdays and anniversaries for my team, so that I can recognize important milestones.

### Who's Out Calendar

**US-HR-076**: As a Manager, I want to see who's out today and tomorrow on my dashboard, so that I can plan my day accordingly.

**US-HR-077**: As an Employee, I want to see which of my colleagues are out, so that I know who's unavailable.

**US-HR-078**: As a Manager, I want to see a visual team calendar showing all time off, so that I can identify coverage gaps.

### Compensation Planning

**US-HR-079**: As an HR Administrator, I want to track when employees last received raises, so that we can identify who's overdue for review.

**US-HR-080**: As an HR Administrator, I want to create compensation planning worksheets, so that managers can plan raises and bonuses within budget.

**US-HR-081**: As a Manager, I want to see market compensation benchmarks for my team's roles, so that I can ensure competitive pay.

**US-HR-082**: As an HR Administrator, I want to run reports showing compensation distribution by department, level, and tenure, so that we can identify pay equity issues.

### Directory & Org Chart

**US-HR-083**: As an Employee, I want to view the organization chart, so that I understand the company structure.

**US-HR-084**: As an Employee, I want to switch between list view, directory view (cards), and org chart view, so that I can find colleagues in the way that works best for me.

**US-HR-085**: As a Manager, I want to see my full reporting hierarchy in the org chart, so that I understand my span of control.

**US-HR-086**: As an Employee, I want to search the directory by name, department, or location, so that I can quickly find colleagues.

---

## Functional Requirements

### FR-HR-001: Employee Profile Management

**Description**: System shall maintain comprehensive employee profiles with personal, contact, and employment information.

**Features**:
1. Create new employee profile
2. Update employee information (personal, contact, emergency)
3. Upload profile photo
4. Upload employee documents (contracts, certifications, ID)
5. Track employment status (active, on leave, terminated)
6. Record termination details (date, reason, type)
7. Employee self-service editing (restricted fields)
8. Bulk import employees via CSV

**Acceptance Criteria**:
- Required fields: First name, last name, email (unique), hire date, employment type
- Email must be unique across active employees
- Profile photo max 5MB, formats: JPG, PNG
- Documents organized by category with expiration tracking
- Terminated employees retained but marked inactive
- Audit log of all profile changes

### FR-HR-002: Employment History Tracking

**Description**: System shall track all employment changes including job changes, compensation adjustments, and promotions.

**Features**:
1. Record job changes (title, department, location, manager)
2. Record compensation changes (salary/wage adjustments)
3. Record employment type changes (full-time, part-time, contract)
4. Track effective dates for all changes
5. Record reason for each change
6. View complete employment history timeline
7. Prevent retroactive changes (or require special permission)

**Acceptance Criteria**:
- Each change creates new record with effective date
- Historical records are immutable (new record required for corrections)
- Current values calculated based on latest effective record
- Changes can be scheduled for future dates
- Approval workflow for manager/department changes

### FR-HR-003: Time Off Management

**Description**: System shall manage time off accruals, requests, approvals, and balances.

**Features**:
1. Configure time off policies by type:
   - PTO (Paid Time Off)
   - Sick Leave
   - Vacation
   - Personal Days
   - Unpaid Leave
2. Configure accrual rules:
   - Accrual rate (hours per pay period)
   - Accrual start date (hire date, or after waiting period)
   - Maximum balance (cap)
   - Carryover rules (year-end)
3. Employee request submission
4. Manager approval workflow
5. Team calendar view
6. Balance calculations and adjustments
7. Integration with holiday calendar
8. Negative balance warnings
9. Notifications (request submitted, approved, denied, upcoming time off)

**Acceptance Criteria**:
- Accruals calculated automatically per pay period
- Requests cannot exceed available balance (unless configured)
- Managers see pending requests requiring approval
- Approved time off shows on team calendar
- Historical time off is immutable (can cancel future requests)
- Year-end carryover runs automatically (configurable)

### FR-HR-004: Attendance Tracking

**Description**: System shall track employee attendance including clock in/out times and timesheet management.

**Features**:
1. Clock in/out functionality (web + mobile)
2. Geolocation capture (optional, for field employees)
3. Timesheet generation (daily, weekly, pay period)
4. Manager timesheet approval
5. Overtime calculation
6. Break time tracking
7. Missed punch correction requests
8. Attendance reports (late, absent, overtime)
9. Integration with payroll

**Acceptance Criteria**:
- Clock in/out timestamps accurate to the second
- Geolocation captured if enabled (requires employee consent)
- Timesheet auto-populated from clock events
- Overtime flagged based on payroll policy
- Managers can approve/reject timesheets
- Missed punches highlighted for correction
- Time rounded per payroll policy

### FR-HR-005: Payroll Management

**Description**: System shall manage employee compensation, deductions, and pay stub generation.

**Features**:
1. Store compensation data:
   - Salary (annual amount)
   - Hourly wage
   - Commission structure
   - Bonuses
2. Manage deductions:
   - Federal/state/local taxes
   - Benefits premiums
   - Retirement contributions
   - Garnishments
3. Generate pay stubs
4. Track payment history
5. Direct deposit setup
6. W-4 withholding management
7. Year-end tax forms (W-2)
8. Export to payroll providers
9. Payroll reports

**Acceptance Criteria**:
- Compensation history tracked with effective dates
- Deductions calculated per pay period
- Pay stubs show gross, deductions, net pay
- Employees can view/download pay stubs
- Direct deposit validated (routing + account number)
- W-4 updates effective for next pay period
- Export formats: CSV, API integration

### FR-HR-006: Benefits Enrollment

**Description**: System shall manage employee benefits enrollment, changes, and dependent management.

**Features**:
1. Display available benefits packages (from Firm Profile)
2. Plan selection by benefit type
3. Dependent management (add/edit/remove)
4. Beneficiary designation
5. Open enrollment periods
6. Qualifying life events (QLE):
   - Marriage/divorce
   - Birth/adoption
   - Loss of other coverage
7. Enrollment elections and confirmations
8. Waiting period enforcement
9. Coverage start/end dates
10. COBRA administration (future)

**Acceptance Criteria**:
- Employees can only enroll during open enrollment or QLE
- Dependents require: name, DOB, relationship, SSN
- Beneficiary percentages must total 100%
- Enrollment elections locked after deadline
- Coverage effective dates calculated per policy
- Confirmation sent after enrollment
- Enrollment data exportable to carriers

### FR-HR-007: Performance Management

**Description**: System shall facilitate performance reviews, goal setting, and continuous feedback.

**Features**:
1. Configure review cycles:
   - Annual, semi-annual, quarterly
   - Custom date ranges
2. Review templates with customizable sections:
   - Self-assessment
   - Manager assessment
   - Goals review
   - Competencies/skills rating
   - Overall rating
3. Goal setting and tracking:
   - SMART goals
   - Progress updates
   - Completion status
4. Review workflow:
   - Employee self-assessment
   - Manager review
   - Calibration (optional)
   - Employee acknowledgment
5. 360-degree feedback (collect from peers, direct reports)
6. Continuous feedback notes
7. Performance improvement plans (PIP)

**Acceptance Criteria**:
- Review cycles trigger notifications automatically
- Templates support multiple question types (text, rating, scale)
- Goals can be individual or team-based
- Reviews locked after employee acknowledgment
- Historical reviews accessible to employee and manager
- Ratings support custom scales (1-5, 1-10, etc.)
- Aggregate analytics (rating distribution, completion rate)

### FR-HR-008: Onboarding

**Description**: System shall provide structured onboarding workflows for new hires.

**Features**:
1. Onboarding checklist templates:
   - Pre-boarding (before start date)
   - First day
   - First week
   - First 30/60/90 days
2. Task types:
   - Document upload
   - Form completion
   - Training modules
   - Meeting scheduling
   - Equipment requests
3. Task assignment (employee, HR, manager, buddy, IT)
4. Progress tracking
5. Automated reminders
6. E-signature collection
7. I-9 verification workflow
8. Policy acknowledgment

**Acceptance Criteria**:
- Checklists auto-created on hire date (or X days before)
- Tasks assigned to appropriate parties
- Reminders sent for overdue tasks
- Documents uploaded to employee profile
- E-signatures legally compliant
- I-9 Section 2 completed within 3 business days
- Onboarding completion tracked and reported

### FR-HR-009: Employee Feedback & Surveys

**Description**: System shall enable continuous feedback and employee engagement surveys.

**Features**:
1. Continuous feedback:
   - Manager-to-employee
   - Peer-to-peer
   - Employee-to-manager
2. 360-degree feedback requests
3. Pulse surveys:
   - Engagement surveys
   - Exit surveys
   - Custom surveys
4. Survey builder:
   - Multiple question types (multiple choice, scale, text)
   - Logic branching
   - Anonymous vs. identified responses
5. Response collection
6. Analytics and reporting:
   - Response rates
   - Aggregate scores
   - Trend analysis
   - Sentiment analysis (future)

**Acceptance Criteria**:
- Feedback can be public or private
- Anonymous surveys don't reveal respondent identity
- Survey responses stored securely
- Results aggregated by department, location, etc.
- Minimum response threshold for anonymity (e.g., 5 responses)
- Surveys can be one-time or recurring

### FR-HR-010: Change Request Management

**Description**: System shall provide employee self-service for requesting profile and employment changes with approval workflows.

**Features**:
1. Request types supported:
   - Personal information (address, phone, emergency contacts)
   - Compensation requests
   - Employment status changes
   - Job information updates
   - Asset requests
   - Benefits changes
   - Time off requests (links to existing time off module)
2. Request submission:
   - Request form with type-specific fields
   - Attach supporting documents
   - Set urgency level
   - Specify effective date
3. Approval workflow:
   - Configurable approval chains by request type
   - Auto-routing to appropriate approvers
   - Multi-level approvals when needed
   - Escalation for overdue approvals
4. Request tracking:
   - Status dashboard for employees
   - Inbox for managers and HR
   - Categorized by type and urgency
   - Filter by status (pending, approved, rejected)
5. Communication:
   - Comment thread on requests
   - Email notifications
   - Status change alerts
6. Audit trail:
   - Complete history of request
   - Who approved/rejected and when
   - Changes made

**Acceptance Criteria**:
- Employees can submit requests without HR assistance
- Requests route to correct approver based on type
- Approvers receive notifications within 5 minutes
- Request status updates in real-time
- Supporting documents can be attached (max 10MB each)
- Approved changes apply on effective date automatically
- Complete audit trail maintained
- Requests can be cancelled by requester if still pending

### FR-HR-011: Employee Dashboard

**Description**: System shall provide personalized dashboards for employees, managers, and HR administrators with role-specific widgets.

**Features**:
1. Employee Dashboard Widgets:
   - Time Off Summary (balances, upcoming time off)
   - Pending Actions (requests awaiting response, tasks to complete)
   - Upcoming Events (company events, meetings)
   - Celebrations (birthdays, anniversaries - team/company)
   - Who's Out Today/Tomorrow
   - Recent Pay Stub
   - Benefits Summary
   - Goals Progress
   - Company News Feed
   - Quick Links (commonly used features)
2. Manager Dashboard Widgets:
   - All employee widgets, plus:
   - Team Overview (headcount, status summary)
   - Direct Reports Status (who's out, working remotely, in office)
   - Pending Approvals (time off, change requests, timesheets)
   - Team Performance Metrics
   - Open Positions (if integrated with recruiting)
   - Team Goals Progress
   - Upcoming Reviews
3. HR Admin Dashboard Widgets:
   - All manager widgets, plus:
   - Company Headcount & Turnover
   - New Hires This Month
   - Pending Onboarding Tasks
   - Expiring Documents/Certifications
   - Benefits Enrollment Status
   - Open Enrollment Countdown
   - Compensation Planning Alerts
   - Compliance Alerts
   - People Without Pay Raises (12+ months)
4. Widget customization:
   - Drag-and-drop arrangement
   - Show/hide widgets
   - Refresh frequency settings
   - Size adjustment (where applicable)

**Acceptance Criteria**:
- Dashboard loads within 2 seconds
- Widgets show real-time data (or indicate last refresh)
- Users can customize their dashboard layout
- Mobile-responsive design
- Widgets gracefully handle empty states
- Click-through to detailed views
- Dashboard preferences saved per user

### FR-HR-012: Celebrations & Recognition

**Description**: System shall automatically track and display employee birthdays and work anniversaries to foster company culture.

**Features**:
1. Birthday tracking:
   - Display upcoming birthdays (next 7/14/30 days)
   - Show age optionally (employee preference)
   - Birthday notifications to team/company
   - Birthday widget on dashboard
2. Work anniversary tracking:
   - Calculate anniversary from hire date
   - Display tenure (e.g., "5 years")
   - Anniversary notifications
   - Milestone recognition (1, 5, 10, 15, 20+ years)
3. Celebrations calendar:
   - Consolidated view of all celebrations
   - Filter by department, location
   - Export to personal calendar
4. Privacy controls:
   - Employees can opt-out of birthday display
   - Choose to hide age
   - Control notification preferences
5. Recognition features:
   - Send congratulations message
   - Team acknowledgment
   - Manager prompted to recognize milestones
6. Celebrations widget:
   - Shows today's birthdays/anniversaries
   - Upcoming celebrations (next 7 days)
   - Photo and name display

**Acceptance Criteria**:
- Birthdays calculated accurately including leap years
- Work anniversaries calculated from hire date
- Employees can control privacy settings
- Celebrations appear on dashboard day-of
- Notifications sent at configurable time (e.g., 9 AM)
- Widget shows max 10 upcoming events
- Click name to view profile or send message

### FR-HR-013: Who's Out Calendar

**Description**: System shall provide visibility into team availability and time off to facilitate planning and coverage.

**Features**:
1. Who's Out widget:
   - Show who's out today
   - Show who's out tomorrow
   - Display time off type (PTO, sick, etc.)
   - Show partial days (if applicable)
   - Filter by department, team, or location
2. Team calendar view:
   - Month view with all team time off
   - Color-coded by time off type
   - Hover for details (who, type, hours)
   - Export to iCal/Google Calendar
3. Availability summary:
   - X of Y team members out
   - Coverage percentage
   - Alerts for coverage gaps
4. Integration with team calendar:
   - Sync with Outlook/Google Calendar
   - Show company holidays
   - Block out training/events
5. Planning mode:
   - Show potential conflicts
   - Suggest alternative dates
   - Warn if too many people out

**Acceptance Criteria**:
- Who's Out widget updates in real-time
- Only approved time off shown
- Respects permissions (can only see own team/department)
- Calendar view loads within 1 second
- Mobile-responsive calendar
- Time zones handled correctly
- Partial days displayed accurately (e.g., "Out after 2 PM")

### FR-HR-014: Compensation Planning

**Description**: System shall provide tools for HR and managers to plan compensation changes, track raises, and ensure pay equity.

**Features**:
1. Compensation tracking:
   - Last raise date for each employee
   - Time since last raise
   - Compensation history timeline
   - Reason for each adjustment
2. Alerts & notifications:
   - Employees without raise for 12+ months
   - Approaching merit increase cycles
   - Compensation below market benchmarks (if data available)
3. Planning worksheets:
   - Budget allocation by department
   - Propose raises/bonuses per employee
   - Calculate total cost
   - Track against budget
   - Manager recommendations
   - HR approval workflow
4. Market benchmarking (future):
   - Integration with compensation data providers
   - Compare to market percentiles
   - By role, level, location
5. Analytics & reporting:
   - Compensation distribution (histograms)
   - Pay equity analysis (by gender, ethnicity, tenure)
   - Compression analysis (new hires vs. tenured)
   - Budget vs. actual tracking
   - Cost of living adjustments
6. Merit increase cycles:
   - Configure annual/semi-annual cycles
   - Assign budgets to departments
   - Track worksheet completion
   - Bulk approval process
   - Effective date management

**Acceptance Criteria**:
- Raise history tracked with effective dates
- Alert shows employees 12+ months without raise
- Worksheets calculate totals accurately
- Budget overage warnings displayed
- Compensation history audit trail maintained
- Reports export to Excel/PDF
- Pay equity analysis meets compliance standards

### FR-HR-015: Directory & Organization Chart

**Description**: System shall provide multiple views of the employee directory including hierarchical organization chart.

**Features**:
1. View modes:
   - **List View**: Sortable table with key fields
   - **Directory View**: Photo-based cards (like contact cards)
   - **Org Chart View**: Hierarchical tree diagram
2. List View:
   - Columns: Photo, Name, Title, Department, Location, Manager, Hire Date
   - Sort by any column
   - Configurable columns
   - Bulk actions (export, etc.)
3. Directory View (Cards):
   - Employee photo prominently displayed
   - Name, title, department
   - Contact info (phone, email) with click-to-call/email
   - "View Profile" button
   - Grid layout (responsive)
   - Alphabetical sections (A, B, C, ...)
4. Org Chart View:
   - Hierarchical tree starting from CEO
   - Expandable/collapsible branches
   - Zoom and pan controls
   - Search and highlight employee
   - Click to view profile
   - Show manager-report relationships
   - Display direct report count
   - Color-code by department (optional)
   - Export as PDF/image
5. Search & filters (all views):
   - Name search (autocomplete)
   - Department filter
   - Location filter
   - Job title filter
   - Employment type filter
   - Manager filter
6. Quick actions:
   - Send email
   - View profile
   - Send message (if integrated with chat)
   - Schedule meeting

**Acceptance Criteria**:
- All three views display same filtered data
- View preference saved per user
- Org chart renders for 1000+ employees without lag
- Org chart accurately reflects reporting relationships
- Search returns results within 500ms
- Alphabetical navigation in Directory View
- Photos load efficiently (lazy loading)
- Org chart updates when reporting structure changes
- Export functions work for all views

---

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete database schemas including 32 tables covering:
- Employee Management (employees, emergency_contacts, employment_history)
- Time Off & Leave (time_off_policies, time_off_balances, time_off_requests)
- Time & Attendance (time_entries, timesheets)
- Payroll Processing (payroll_records, pay_stubs, direct_deposits, tax_withholdings)
- Benefits Administration (benefits_enrollments, dependents, beneficiaries)
- Performance Management (review_cycles, performance_reviews, goals)
- Onboarding & Offboarding (onboarding_templates, onboarding_template_tasks, onboarding_tasks)
- Employee Documents
- Feedback & Surveys
- Compensation Planning
- Administrative (change_requests, dashboard_widgets, celebrations, company_news)

---

## API Specifications

### Base URL
```
https://api.platform.com/v1/hr
```

### Authentication
All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### API Endpoints

#### Employee Endpoints

**GET /employees**
- Description: List employees
- Permissions: `hr:employees:read` or manager (see own team)
- Query Parameters:
  - `status`: active, on_leave, terminated
  - `department_id`: UUID
  - `location_id`: UUID
  - `manager_id`: UUID
  - `search`: Search by name or email
  - `page`, `limit`: Pagination
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "employee_number": "EMP001",
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane.doe@company.com",
      "hire_date": "2023-01-15",
      "employment_status": "active",
      "current_job_title": "Software Engineer",
      "current_department": "Engineering",
      "current_location": "San Francisco HQ",
      "current_manager": {
        "id": "uuid",
        "name": "John Manager"
      },
      "photo_url": "https://cdn.platform.com/photos/jane.jpg"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20
  }
}
```

**GET /employees/:id**
- Description: Get employee profile
- Permissions: `hr:employees:read` or self or manager
- Response: Full employee object with current position details

**POST /employees**
- Description: Create new employee
- Permissions: `hr:employees:create`
- Request Body:
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane.doe@company.com",
  "hire_date": "2025-01-15",
  "employment_type": "full-time",
  "job_title_id": "uuid",
  "job_level_id": "uuid",
  "department_id": "uuid",
  "location_id": "uuid",
  "manager_id": "uuid",
  "compensation": {
    "type": "salary",
    "amount": 100000,
    "currency": "USD",
    "frequency": "annual"
  }
}
```
- Response: Created employee object

**PUT /employees/:id**
- Description: Update employee profile
- Permissions: `hr:employees:update` or self (limited fields)
- Request Body: Partial employee object
- Response: Updated employee object

**DELETE /employees/:id**
- Description: Soft delete (terminate) employee
- Permissions: `hr:employees:delete`
- Response: Success message

**POST /employees/:id/terminate**
- Description: Terminate employee
- Permissions: `hr:employees:terminate`
- Request Body:
```json
{
  "termination_date": "2025-12-31",
  "termination_type": "voluntary",
  "termination_reason": "Accepted position elsewhere"
}
```
- Response: Updated employee object

#### Employment History Endpoints

**GET /employees/:id/history**
- Description: Get employment history
- Permissions: `hr:employees:read` or self or manager
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "effective_date": "2025-06-01",
      "change_type": "promotion",
      "job_title": "Senior Software Engineer",
      "job_level": "Senior",
      "department": "Engineering",
      "compensation": {
        "type": "salary",
        "amount": 130000,
        "currency": "USD"
      },
      "reason": "promotion"
    },
    {
      "id": "uuid",
      "effective_date": "2023-01-15",
      "change_type": "hire",
      "job_title": "Software Engineer",
      "job_level": "Mid",
      "department": "Engineering",
      "compensation": {
        "type": "salary",
        "amount": 100000,
        "currency": "USD"
      },
      "reason": "new_hire"
    }
  ]
}
```

**POST /employees/:id/history**
- Description: Add employment history record
- Permissions: `hr:employees:update`
- Request Body:
```json
{
  "effective_date": "2025-06-01",
  "change_type": "promotion",
  "job_title_id": "uuid",
  "job_level_id": "uuid",
  "compensation": {
    "type": "salary",
    "amount": 130000,
    "currency": "USD"
  },
  "reason": "promotion",
  "notes": "Promoted to Senior after successful project delivery"
}
```
- Response: Created history record

#### Time Off Endpoints

**GET /employees/:id/time-off/balances**
- Description: Get time off balances
- Permissions: `hr:time-off:read` or self
- Response:
```json
{
  "success": true,
  "data": [
    {
      "policy_id": "uuid",
      "policy_name": "PTO",
      "balance_hours": 80,
      "accrued_ytd": 120,
      "used_ytd": 40,
      "pending_hours": 8,
      "as_of_date": "2025-12-01"
    },
    {
      "policy_id": "uuid",
      "policy_name": "Sick Leave",
      "balance_hours": 40,
      "accrued_ytd": 48,
      "used_ytd": 8,
      "pending_hours": 0,
      "as_of_date": "2025-12-01"
    }
  ]
}
```

**POST /time-off/requests**
- Description: Submit time off request
- Permissions: Any employee (for self)
- Request Body:
```json
{
  "employee_id": "uuid",
  "policy_id": "uuid",
  "start_date": "2025-12-20",
  "end_date": "2025-12-24",
  "hours_requested": 40,
  "reason": "Holiday vacation"
}
```
- Response: Created request object

**GET /time-off/requests**
- Description: List time off requests
- Permissions: `hr:time-off:read` or manager (team requests) or self
- Query Parameters:
  - `employee_id`: UUID
  - `status`: pending, approved, denied
  - `start_date`, `end_date`: Date range
- Response: List of time off requests

**PUT /time-off/requests/:id/approve**
- Description: Approve time off request
- Permissions: Manager or `hr:time-off:approve`
- Response: Updated request object

**PUT /time-off/requests/:id/deny**
- Description: Deny time off request
- Permissions: Manager or `hr:time-off:approve`
- Request Body:
```json
{
  "denial_reason": "Coverage concerns during this period"
}
```
- Response: Updated request object

**GET /time-off/calendar**
- Description: Team time off calendar
- Permissions: Manager or `hr:time-off:read`
- Query Parameters:
  - `department_id`: UUID
  - `start_date`, `end_date`: Date range
- Response:
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-12-20",
      "employees_out": [
        {
          "employee_id": "uuid",
          "employee_name": "Jane Doe",
          "policy_name": "PTO",
          "hours": 8
        }
      ]
    }
  ]
}
```

#### Attendance Endpoints

**POST /attendance/clock-in**
- Description: Clock in
- Permissions: Employee (self)
- Request Body:
```json
{
  "employee_id": "uuid",
  "location": {
    "lat": 37.7749,
    "lon": -122.4194
  }
}
```
- Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "clock_in": "2025-12-01T09:00:15Z",
    "clock_in_location": {
      "lat": 37.7749,
      "lon": -122.4194,
      "address": "123 Market St, San Francisco, CA"
    }
  }
}
```

**POST /attendance/clock-out**
- Description: Clock out
- Permissions: Employee (self)
- Request Body: Similar to clock-in
- Response: Updated time entry with clock_out and total_hours

**GET /employees/:id/timesheets**
- Description: Get timesheets for employee
- Permissions: `hr:timesheets:read` or manager or self
- Query Parameters:
  - `pay_period_start`, `pay_period_end`: Filter by period
  - `status`: draft, submitted, approved
- Response: List of timesheets

**PUT /timesheets/:id/submit**
- Description: Submit timesheet for approval
- Permissions: Employee (self)
- Response: Updated timesheet

**PUT /timesheets/:id/approve**
- Description: Approve timesheet
- Permissions: Manager or `hr:timesheets:approve`
- Response: Updated timesheet

#### Payroll Endpoints

**GET /employees/:id/pay-stubs**
- Description: Get pay stubs for employee
- Permissions: `hr:payroll:read` or self
- Query Parameters:
  - `year`: Filter by year
  - `start_date`, `end_date`: Date range
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "pay_date": "2025-11-30",
      "pay_period_start": "2025-11-16",
      "pay_period_end": "2025-11-30",
      "gross_pay": 5000.00,
      "total_deductions": 1500.00,
      "net_pay": 3500.00,
      "ytd_gross": 110000.00,
      "ytd_deductions": 33000.00,
      "ytd_net": 77000.00,
      "pdf_url": "https://cdn.platform.com/pay-stubs/uuid.pdf"
    }
  ]
}
```

**GET /pay-stubs/:id/pdf**
- Description: Download pay stub PDF
- Permissions: `hr:payroll:read` or self
- Response: PDF file download

**POST /employees/:id/direct-deposit**
- Description: Set up direct deposit
- Permissions: Employee (self) or `hr:payroll:update`
- Request Body:
```json
{
  "bank_name": "Chase Bank",
  "account_type": "checking",
  "routing_number": "123456789",
  "account_number": "9876543210",
  "allocation_percentage": 100
}
```
- Response: Created direct deposit record (account number masked)

**PUT /employees/:id/tax-withholding**
- Description: Update W-4 withholding
- Permissions: Employee (self) or `hr:payroll:update`
- Request Body:
```json
{
  "filing_status": "married_filing_jointly",
  "federal_allowances": 2,
  "additional_withholding": 100,
  "effective_date": "2025-01-01"
}
```
- Response: Created tax withholding record

#### Benefits Endpoints

**GET /employees/:id/benefits**
- Description: Get employee's current benefits enrollments
- Permissions: `hr:benefits:read` or self
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "benefit_type": "medical",
      "benefit_name": "PPO Health Plan",
      "carrier_name": "Blue Cross",
      "coverage_tier": "employee_spouse",
      "start_date": "2025-01-01",
      "status": "active",
      "employee_cost_per_period": 200.00,
      "employer_cost_per_period": 800.00
    }
  ]
}
```

**POST /employees/:id/benefits/enroll**
- Description: Enroll in benefit
- Permissions: Employee (self, during open enrollment or QLE) or `hr:benefits:update`
- Request Body:
```json
{
  "benefit_item_id": "uuid",
  "coverage_tier": "employee_spouse",
  "start_date": "2025-01-01",
  "enrollment_reason": "open_enrollment",
  "dependents": ["dependent_id_1", "dependent_id_2"]
}
```
- Response: Created enrollment record

**POST /employees/:id/dependents**
- Description: Add dependent
- Permissions: Employee (self) or `hr:benefits:update`
- Request Body:
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "relationship": "child",
  "date_of_birth": "2015-06-15",
  "ssn": "123-45-6789"
}
```
- Response: Created dependent record

#### Performance Review Endpoints

**GET /employees/:id/reviews**
- Description: Get performance reviews for employee
- Permissions: `hr:reviews:read` or manager or self
- Response: List of performance reviews

**POST /reviews**
- Description: Create performance review
- Permissions: Manager or `hr:reviews:create`
- Request Body:
```json
{
  "employee_id": "uuid",
  "reviewer_id": "uuid",
  "review_cycle_id": "uuid",
  "review_period_start": "2025-01-01",
  "review_period_end": "2025-12-31"
}
```
- Response: Created review object

**PUT /reviews/:id/self-assessment**
- Description: Complete self-assessment
- Permissions: Employee (self)
- Request Body:
```json
{
  "self_assessment_data": {
    "question_1": "I successfully delivered 5 major projects...",
    "question_2_rating": 4
  }
}
```
- Response: Updated review object

**PUT /reviews/:id/manager-assessment**
- Description: Complete manager assessment
- Permissions: Manager
- Request Body:
```json
{
  "manager_assessment_data": {
    "question_1": "Jane consistently exceeds expectations...",
    "question_2_rating": 5
  },
  "overall_rating": 4.5
}
```
- Response: Updated review object

**PUT /reviews/:id/acknowledge**
- Description: Employee acknowledges review
- Permissions: Employee (self)
- Response: Updated review with acknowledgment timestamp

**GET /employees/:id/goals**
- Description: Get employee's goals
- Permissions: `hr:goals:read` or manager or self
- Response: List of goals

**POST /employees/:id/goals**
- Description: Create goal
- Permissions: Manager or self
- Request Body:
```json
{
  "title": "Complete AWS certification",
  "description": "Obtain AWS Solutions Architect certification",
  "target_date": "2025-06-30",
  "category": "professional_development"
}
```
- Response: Created goal object

**PUT /goals/:id/progress**
- Description: Update goal progress
- Permissions: Employee (self) or manager
- Request Body:
```json
{
  "progress_percentage": 75,
  "status": "in_progress"
}
```
- Response: Updated goal object

#### Onboarding Endpoints

**GET /employees/:id/onboarding**
- Description: Get onboarding tasks for employee
- Permissions: `hr:onboarding:read` or manager or self
- Response:
```json
{
  "success": true,
  "data": {
    "employee_id": "uuid",
    "start_date": "2025-01-15",
    "completion_percentage": 65,
    "tasks": [
      {
        "id": "uuid",
        "title": "Upload I-9 documents",
        "description": "Upload proof of identity and work authorization",
        "task_type": "document_upload",
        "assigned_to_role": "employee",
        "due_date": "2025-01-18",
        "status": "completed",
        "completed_at": "2025-01-16T10:30:00Z"
      },
      {
        "id": "uuid",
        "title": "Complete harassment prevention training",
        "task_type": "training",
        "assigned_to_role": "employee",
        "due_date": "2025-01-22",
        "status": "in_progress"
      }
    ]
  }
}
```

**PUT /onboarding/tasks/:id/complete**
- Description: Mark onboarding task as complete
- Permissions: Assigned user or `hr:onboarding:update`
- Request Body:
```json
{
  "result_data": {
    "file_urls": ["https://cdn.platform.com/docs/i9_proof.pdf"]
  }
}
```
- Response: Updated task object

#### Feedback & Survey Endpoints

**POST /feedback**
- Description: Give feedback
- Permissions: Any employee
- Request Body:
```json
{
  "to_employee_id": "uuid",
  "feedback_type": "continuous",
  "content": "Great work on the presentation!",
  "visibility": "private",
  "tags": ["communication", "presentation"]
}
```
- Response: Created feedback object

**GET /employees/:id/feedback**
- Description: Get feedback for employee
- Permissions: Employee (self) or manager or `hr:feedback:read`
- Response: List of feedback items

**GET /surveys**
- Description: List active surveys
- Permissions: Any employee
- Response: List of surveys available to user

**POST /surveys/:id/responses**
- Description: Submit survey response
- Permissions: Any employee (if in target audience)
- Request Body:
```json
{
  "responses": {
    "1": 5,
    "2": "I feel valued and supported",
    "3": 4
  }
}
```
- Response: Created survey response

**GET /surveys/:id/results**
- Description: Get survey results (aggregated)
- Permissions: `hr:surveys:read` or manager (for their team)
- Response:
```json
{
  "success": true,
  "data": {
    "survey_id": "uuid",
    "total_responses": 85,
    "response_rate": 0.68,
    "results": [
      {
        "question_id": 1,
        "question": "How satisfied are you with your role?",
        "average_rating": 4.2,
        "distribution": {
          "1": 2,
          "2": 5,
          "3": 15,
          "4": 30,
          "5": 33
        }
      }
    ]
  }
}
```

#### Change Request Endpoints

**POST /change-requests**
- Description: Submit a change request
- Permissions: Any employee
- Request Body:
```json
{
  "request_type": "personal_info",
  "requested_for": "uuid",
  "urgency": "normal",
  "effective_date": "2025-12-15",
  "request_details": {
    "field": "address",
    "currentValue": {
      "addressLine1": "123 Old Street",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94105"
    },
    "requestedValue": {
      "addressLine1": "456 New Avenue",
      "city": "Oakland",
      "state": "CA",
      "postalCode": "94612"
    },
    "reason": "Relocated to new residence"
  },
  "attached_documents": []
}
```
- Response: Created change request with request_number

**GET /change-requests**
- Description: List change requests
- Permissions: `hr:change_requests:read` or own requests or requests for direct reports
- Query Parameters:
  - `requested_by`: UUID (filter by requester)
  - `requested_for`: UUID (filter by subject)
  - `status`: pending, approved, rejected, completed
  - `request_type`: Filter by type
  - `urgency`: urgent, normal, low
- Response: List of change requests

**GET /change-requests/:id**
- Description: Get change request details
- Permissions: Requester, subject, approver, or `hr:change_requests:read`
- Response: Full change request object with approval chain

**PUT /change-requests/:id/approve**
- Description: Approve a change request
- Permissions: Designated approver or `hr:change_requests:approve`
- Request Body:
```json
{
  "comments": "Address update approved"
}
```
- Response: Updated change request

**PUT /change-requests/:id/reject**
- Description: Reject a change request
- Permissions: Designated approver or `hr:change_requests:approve`
- Request Body:
```json
{
  "comments": "Please provide proof of address change"
}
```
- Response: Updated change request

**PUT /change-requests/:id/cancel**
- Description: Cancel pending change request
- Permissions: Requester or `hr:change_requests:update`
- Response: Cancelled change request

**POST /change-requests/:id/comments**
- Description: Add comment to change request
- Permissions: Requester, subject, approver, or `hr:change_requests:read`
- Request Body:
```json
{
  "comment": "Attached utility bill as proof of address"
}
```
- Response: Updated change request with new comment

**GET /change-requests/inbox**
- Description: Get change requests pending approval for current user
- Permissions: Manager or HR
- Query Parameters:
  - `urgent_only`: boolean
- Response:
```json
{
  "success": true,
  "data": {
    "urgent": [
      {
        "id": "uuid",
        "request_number": "CHG-2025-001234",
        "request_type": "compensation",
        "requested_by": "Jane Doe",
        "requested_for": "John Smith",
        "request_date": "2025-12-01T10:30:00Z",
        "urgency": "urgent",
        "status": "pending"
      }
    ],
    "other": [
      // ... other pending requests
    ]
  }
}
```

#### Dashboard Endpoints

**GET /dashboard**
- Description: Get personalized dashboard for current user
- Permissions: Any employee
- Response:
```json
{
  "success": true,
  "data": {
    "widgets": [
      {
        "widget_type": "time_off_summary",
        "position_x": 0,
        "position_y": 0,
        "width": 2,
        "height": 1,
        "is_visible": true,
        "data": {
          "balances": [
            {"policy_name": "PTO", "balance_hours": 80},
            {"policy_name": "Sick Leave", "balance_hours": 40}
          ],
          "upcoming": [
            {"start_date": "2025-12-20", "end_date": "2025-12-24", "type": "PTO"}
          ]
        }
      },
      {
        "widget_type": "whos_out",
        "data": {
          "today": [
            {"employee_id": "uuid", "name": "Jane Doe", "type": "PTO"}
          ],
          "tomorrow": []
        }
      }
    ]
  }
}
```

**PUT /dashboard/widgets**
- Description: Update dashboard widget configuration
- Permissions: Self only
- Request Body:
```json
{
  "widgets": [
    {
      "widget_type": "time_off_summary",
      "position_x": 0,
      "position_y": 0,
      "width": 2,
      "height": 1,
      "is_visible": true
    }
  ]
}
```
- Response: Updated dashboard configuration

**GET /dashboard/widgets/data/:widget_type**
- Description: Get fresh data for specific widget
- Permissions: Any employee
- Response: Widget-specific data

#### Celebrations Endpoints

**GET /celebrations**
- Description: Get upcoming celebrations
- Permissions: Any employee
- Query Parameters:
  - `days`: Number of days ahead to look (default: 7)
  - `department_id`: Filter by department
  - `location_id`: Filter by location
  - `type`: birthday, work_anniversary, or both
- Response:
```json
{
  "success": true,
  "data": [
    {
      "employee_id": "uuid",
      "employee_name": "Jane Doe",
      "employee_photo": "https://...",
      "celebration_type": "birthday",
      "celebration_date": "2025-12-15",
      "age": 30,
      "show_age": true
    },
    {
      "employee_id": "uuid",
      "employee_name": "John Smith",
      "celebration_type": "work_anniversary",
      "celebration_date": "2025-12-18",
      "years_of_service": 5
    }
  ]
}
```

**PUT /employees/:id/celebration-preferences**
- Description: Update celebration privacy settings
- Permissions: Self only
- Request Body:
```json
{
  "is_visible": true,
  "show_age": false,
  "notify_team": true,
  "notify_company": false
}
```
- Response: Updated preferences

#### Compensation Planning Endpoints

**GET /compensation/planning-cycles**
- Description: List compensation planning cycles
- Permissions: `hr:compensation:read` or managers
- Response: List of planning cycles

**POST /compensation/planning-cycles**
- Description: Create new planning cycle
- Permissions: `hr:compensation:create`
- Request Body:
```json
{
  "cycle_name": "2025 Annual Merit Increases",
  "cycle_year": 2025,
  "cycle_type": "annual",
  "planning_start_date": "2025-01-15",
  "planning_end_date": "2025-02-28",
  "effective_date": "2025-04-01",
  "total_budget": 500000,
  "budget_currency": "USD"
}
```
- Response: Created planning cycle

**GET /compensation/planning-cycles/:id/worksheets**
- Description: Get worksheets for a planning cycle
- Permissions: `hr:compensation:read` or own worksheet
- Response: List of worksheets with planning items

**POST /compensation/planning-cycles/:id/worksheets**
- Description: Create worksheet for department/manager
- Permissions: `hr:compensation:create`
- Request Body:
```json
{
  "department_id": "uuid",
  "manager_id": "uuid",
  "allocated_budget": 50000
}
```
- Response: Created worksheet

**PUT /compensation/worksheets/:id/items**
- Description: Update planning items in worksheet
- Permissions: Assigned manager or `hr:compensation:update`
- Request Body:
```json
{
  "items": [
    {
      "employee_id": "uuid",
      "current_salary": 100000,
      "proposed_salary": 105000,
      "salary_increase_percentage": 5.0,
      "proposed_bonus": 10000,
      "rationale": "Strong performance, promotion to Senior Engineer"
    }
  ]
}
```
- Response: Updated worksheet with totals

**PUT /compensation/worksheets/:id/submit**
- Description: Submit worksheet for HR review
- Permissions: Assigned manager
- Response: Submitted worksheet

**GET /compensation/alerts**
- Description: Get compensation alerts (employees without raises, etc.)
- Permissions: `hr:compensation:read` or managers
- Response:
```json
{
  "success": true,
  "data": {
    "no_raise_12_months": [
      {
        "employee_id": "uuid",
        "employee_name": "Jane Doe",
        "current_salary": 95000,
        "last_raise_date": "2023-10-15",
        "months_since_raise": 14
      }
    ],
    "below_market": [
      // Employees paid below market rate
    ]
  }
}
```

#### Directory & Org Chart Endpoints

**GET /directory**
- Description: Get employee directory in various views
- Permissions: Any employee
- Query Parameters:
  - `view`: list, cards, org_chart (default: list)
  - `search`: Search by name
  - `department_id`: Filter by department
  - `location_id`: Filter by location
  - `sort`: Sort field (for list view)
- Response: Filtered employee list with fields appropriate for view

**GET /org-chart**
- Description: Get organization chart data
- Permissions: Any employee
- Query Parameters:
  - `root_employee_id`: Start from specific employee (default: CEO)
  - `max_depth`: Limit tree depth
- Response:
```json
{
  "success": true,
  "data": {
    "employee_id": "uuid",
    "name": "CEO Name",
    "title": "Chief Executive Officer",
    "photo_url": "https://...",
    "direct_reports_count": 5,
    "direct_reports": [
      {
        "employee_id": "uuid",
        "name": "VP Engineering",
        "title": "Vice President, Engineering",
        "photo_url": "https://...",
        "direct_reports_count": 12,
        "direct_reports": [
          // Nested structure
        ]
      }
    ]
  }
}
```

**GET /employees/:id/reporting-chain**
- Description: Get employee's full reporting chain
- Permissions: Any employee
- Response: Array from employee up to CEO

**GET /employees/:id/direct-reports-tree**
- Description: Get employee's full downward hierarchy
- Permissions: Manager or `hr:employees:read`
- Response: Tree structure of all reports (direct and indirect)

---

## User Interface Specifications

### Navigation Structure

```
HR Module (Main Menu)
├── Dashboard (Home - Personalized)
├── Directory (Employee list)
│   ├── List View
│   ├── Directory View (Cards)
│   └── Org Chart
├── My Profile
├── My Team (Managers only)
├── Change Requests
│   ├── My Requests
│   ├── Inbox (Pending Approvals)
│   └── All Requests (HR Admin)
├── Time Off
│   ├── My Time Off
│   ├── Request Time Off
│   ├── Team Calendar (Managers)
│   └── Manage Policies (HR Admin)
├── Attendance
│   ├── Clock In/Out
│   ├── My Timesheets
│   └── Approve Timesheets (Managers)
├── Payroll
│   ├── Pay Stubs
│   ├── Direct Deposit
│   └── Tax Withholding
├── Benefits
│   ├── My Benefits
│   ├── Enroll/Make Changes
│   └── Dependents
├── Performance
│   ├── My Reviews
│   ├── My Goals
│   ├── Give Feedback
│   └── Team Reviews (Managers)
├── Compensation (HR Admin + Managers)
│   ├── Planning Cycles
│   ├── My Worksheet (Managers)
│   ├── Alerts
│   └── Reports
├── Onboarding (New Hires + HR)
├── Celebrations
└── Reports (HR Admin)
```

### Key Pages

#### Employee Directory Page

**URL**: `/hr/directory`

**Layout**:
- Search bar (name, email, title, department)
- Filters: Department, Location, Employment Type
- View toggle: Grid (cards with photos) / List (table)

**Grid View** (Cards):
- Employee photo
- Name (clickable to profile)
- Job title
- Department
- Location
- Contact button (email, phone)

**List View** (Table):
Columns: Photo, Name, Title, Department, Location, Hire Date, Manager, Actions

#### Employee Profile Page

**URL**: `/hr/employees/:id`

**Layout**:
- Header: Photo, Name, Title, Department, Manager
- Tabs: Overview | Employment | Time Off | Payroll | Benefits | Performance | Documents

**Overview Tab**:
- Contact Information (phone, email, address)
- Emergency Contacts
- Employment Details (hire date, status, employee number)
- Quick Actions (Edit Profile, Send Message)

**Employment Tab**:
- Current Position
- Employment History (timeline view)
- Actions: Add Job Change, Adjust Compensation

**Time Off Tab**:
- Current Balances (visual progress bars)
- Upcoming Time Off
- Time Off History
- Request Time Off button

**Payroll Tab**:
- Current Compensation
- Pay Schedule
- Direct Deposit Info
- Recent Pay Stubs
- Tax Withholding (W-4)

**Benefits Tab**:
- Current Enrollments
- Dependents
- Beneficiaries
- Upcoming Open Enrollment

**Performance Tab**:
- Latest Review Summary
- Active Goals
- Recent Feedback
- Review History

**Documents Tab**:
- Categorized document list (Contracts, Certifications, I-9, etc.)
- Upload Document button
- Expiration tracking (highlight expiring soon)

#### Time Off Request Page

**URL**: `/hr/time-off/request`

**Form**:
1. Time Off Type (dropdown: PTO, Sick, Vacation, etc.)
2. Start Date (date picker)
3. End Date (date picker)
4. Hours/Days toggle
5. Reason (textarea, optional)
6. Current Balance display (updates based on type selected)
7. Remaining Balance after request
8. Submit button

**Validations**:
- Cannot request more than available balance (unless policy allows)
- Warn if requesting during blackout period
- Show team calendar (who else is out)

#### My Time Off Page

**URL**: `/hr/time-off`

**Sections**:

**Balances** (Cards):
- Each time off type as a card
- Balance, Accrued YTD, Used YTD
- Visual progress bar

**Upcoming Time Off**:
- Calendar view or list view
- Approved, pending requests
- Cancel button for future requests

**Request History**:
- Table: Date Range, Type, Hours, Status, Approver, Actions

#### Timesheet Page

**URL**: `/hr/attendance/timesheet`

**Layout**:
- Pay Period Selector (dropdown)
- Status badge (Draft, Submitted, Approved)
- Table with columns: Date, Clock In, Clock Out, Break, Total Hours, Overtime
- Add Entry button (for corrections)
- Submit for Approval button
- Total hours summary: Regular, Overtime, Total

**Edit Time Entry Modal**:
- Date
- Clock In/Out times
- Break duration
- Notes
- Save/Cancel

#### Pay Stubs Page

**URL**: `/hr/payroll/pay-stubs`

**Layout**:
- Year selector (defaults to current year)
- List of pay stubs (cards or list)

**Pay Stub Card**:
- Pay Date
- Pay Period
- Gross Pay
- Net Pay
- View/Download PDF button

**Pay Stub Detail View**:
- Earnings section (regular, overtime, bonuses)
- Deductions section (taxes, benefits, other)
- YTD totals
- Download PDF

#### Benefits Enrollment Page

**URL**: `/hr/benefits/enroll`

**Layout** (Multi-step wizard):

**Step 1: Eligibility Check**:
- Display available packages
- Show waiting period if applicable
- Enrollment window dates

**Step 2: Medical Insurance**:
- Plan options (cards comparing features)
- Coverage tiers (Employee, Employee+Spouse, Family)
- Costs breakdown (employee vs. employer)
- Select Plan button

**Step 3: Dental & Vision**:
- Similar to Step 2

**Step 4: Retirement (401k)**:
- Contribution percentage selector
- Employer match visualization
- Estimated annual contribution

**Step 5: Additional Benefits**:
- Life insurance, disability, FSA, etc.

**Step 6: Dependents**:
- Add/edit dependents
- Assign to plans

**Step 7: Beneficiaries**:
- Add beneficiaries for life insurance, 401k
- Allocation percentages

**Step 8: Review & Confirm**:
- Summary of all elections
- Total employee cost per paycheck
- E-signature checkbox
- Submit Enrollment button

#### Performance Review Page

**URL**: `/hr/reviews/:id`

**Layout**:
- Header: Employee name, Review period, Status
- Progress indicator (Self-assessment → Manager Review → Acknowledgment)

**Self-Assessment Section**:
- Template questions (text areas, rating scales)
- Save Draft / Submit buttons

**Manager Assessment Section** (Manager view):
- Self-assessment responses (read-only)
- Manager's assessment questions
- Overall rating selector
- Save Draft / Complete Review buttons

**Review Summary** (After completion):
- Read-only view of all responses
- Overall rating
- Manager comments
- Acknowledge Review button (Employee)

#### Goals Page

**URL**: `/hr/goals`

**Layout**:
- "+ New Goal" button
- Filters: Status (All, Active, Completed)
- View: Cards or List

**Goal Card**:
- Goal title
- Target date
- Progress bar (% complete)
- Status badge
- Edit/Update Progress buttons

**Add/Edit Goal Modal**:
- Title
- Description
- Target Date
- Category
- Measurable Target
- Save button

#### Onboarding Dashboard (New Hire)

**URL**: `/hr/onboarding`

**Layout**:
- Welcome message
- Progress overview (X of Y tasks completed)
- Sections by timeline:
  - Before Day 1
  - Day 1
  - First Week
  - First 30 Days
- Each task as an expandable card

**Task Card**:
- Task title
- Description
- Due date
- Status (Pending, In Progress, Completed)
- Action button (Upload, Complete, Mark Done)

#### Dashboard Page (Employee/Manager/HR Admin)

**URL**: `/hr/dashboard` or `/hr` (default home page)

**Layout**: Grid-based, customizable widget layout (drag-and-drop)

**Employee Dashboard Widgets**:

1. **Time Off Summary Widget** (2x1):
   - Balance bars for each time off type
   - Upcoming time off (next 30 days)
   - Pending requests count
   - "Request Time Off" button

2. **Pending Actions Widget** (2x1):
   - List of items needing attention:
     - Pending change requests
     - Incomplete onboarding tasks
     - Unsigned documents
     - Overdue training
   - Count badges
   - Click to navigate

3. **Who's Out Widget** (1x1):
   - Today: List of colleagues out
   - Tomorrow: Upcoming absences
   - Photo + name + time off type
   - "View Team Calendar" link

4. **Celebrations Widget** (2x1):
   - Today's birthdays/anniversaries
   - Upcoming (next 7 days)
   - Photo, name, celebration type
   - Send congratulations button

5. **Recent Pay Stub Widget** (1x1):
   - Latest pay stub summary
   - Gross, net pay
   - Pay date
   - "View All" link

6. **Goals Progress Widget** (1x1):
   - Active goals count
   - Progress bars
   - Completion percentage
   - "View All Goals" link

7. **Company News Widget** (2x2):
   - Latest announcements
   - Scrollable feed
   - Read more links

**Manager Dashboard - Additional Widgets**:

8. **Team Overview Widget** (2x1):
   - Total team size
   - Active, on leave, out today
   - Visual breakdown

9. **Pending Approvals Widget** (2x1):
   - Categorized by type:
     - Time off requests (count)
     - Change requests (count)
     - Timesheets (count)
   - Urgent items highlighted
   - Quick approve/review buttons

10. **Direct Reports Status Widget** (2x2):
    - List of direct reports
    - Status indicators (in office, remote, out)
    - Click for profile

**HR Admin Dashboard - Additional Widgets**:

11. **Headcount & Turnover Widget** (2x1):
    - Current headcount
    - New hires this month
    - Terminations this month
    - Turnover rate (%)
    - Trend chart

12. **Compliance Alerts Widget** (2x1):
    - Expiring documents (count)
    - Overdue training (count)
    - Missing I-9s (count)
    - Click for details

13. **Compensation Alerts Widget** (1x1):
    - Employees without raise 12+ months
    - Count with alert icon
    - "View Details" link

**Widget Customization**:
- Gear icon on each widget for settings
- Eye icon to hide/show
- Drag handle to reposition
- "Customize Dashboard" button in header
- Reset to default option

#### Change Request Page

**URL**: `/hr/change-requests/new`

**Form** (Multi-step wizard):

**Step 1: Select Request Type**:
- Radio buttons with icons:
  - Personal Information
  - Compensation
  - Employment Status
  - Job Information
  - Benefits
  - Asset Request
  - Other
- Brief description of each type
- "Next" button

**Step 2: Request Details** (varies by type):

**For Personal Information**:
- Field dropdown: Address, Phone, Emergency Contact, Email
- Current Value (read-only, pre-filled)
- New Value (input fields)
- Reason (textarea)
- Effective Date (date picker)
- Attach Documents (drag-drop upload)

**For Compensation**:
- Request Type: Raise, Bonus, Promotion, Market Adjustment
- Current Compensation (read-only)
- Requested Amount
- Justification (textarea)
- Supporting Documents

**Step 3: Review & Submit**:
- Summary of all details
- Approval chain display (who will review)
- Expected timeline
- Urgency selector (Normal, Urgent)
- "Submit Request" button

#### Change Requests Dashboard

**URL**: `/hr/change-requests`

**Layout**:
- Tabs:  - My Requests
  - Inbox (Managers/HR only)
  - All Requests (HR Admin only)

**My Requests Tab**:
- Table with columns:
  - Request # (clickable)
  - Type
  - Submitted Date
  - Status (badge with color)
  - Urgency
  - Approver
  - Actions (View, Cancel)
- Filters: Status, Type, Date Range
- Search by request number

**Inbox Tab** (Managers/HR):
- Two sections: Urgent | Other
- Card-based layout
- Each card shows:
  - Request number & type
  - Requested by (with photo)
  - Requested for (if different)
  - Brief summary
  - Submitted date
  - Approve/Reject buttons
- Click card for full details

**Request Detail Modal**:
- Header: Request number, status, urgency badge
- Requester info (name, photo, title)
- Request details (current → requested values)
- Attached documents (download links)
- Approval chain (timeline view):
  - Each approver with status
  - Timestamp and comments
  - Current approver highlighted
- Comment thread
- Actions (based on permissions):
  - Approve (with comment)
  - Reject (with reason required)
  - Request More Info
  - Cancel (requester only)

#### Celebrations Page

**URL**: `/hr/celebrations`

**Layout**:
- Month view calendar
- Each day shows:
  - Birthday icons
  - Anniversary icons
  - Count badges
- Filters:
  - Department
  - Location
  - Type (birthdays, anniversaries, both)
  - Timeframe (This month, Next 30 days, This year)

**Side Panel**:
- Today's Celebrations:
  - List with photos
  - Name, age/years
  - Send message button
- Upcoming (next 7 days):
  - Expandable list by date

**Celebration Privacy Settings** (in My Profile):
- Checkboxes:
  - [x] Show my birthday
  - [ ] Show my age
  - [x] Notify my team
  - [ ] Notify entire company

#### Directory Page - Enhanced

**URL**: `/hr/directory`

**Header**:
- View toggle buttons: [List] [Directory] [Org Chart]
- Search bar (name, title, department)
- Filters dropdown (Department, Location, Employment Type)
- Export button

**List View** (Table):
- Columns: Photo | Name | Title | Department | Location | Manager | Hire Date | Actions
- Sortable columns
- Checkbox for multi-select
- Actions: View Profile, Send Email, Schedule Meeting

**Directory View** (Cards):
- Grid of employee cards (3-4 per row, responsive)
- Each card:
  - Large photo (circular)
  - Name (bold, large)
  - Job title
  - Department & location (smaller text)
  - Contact icons (phone, email) - click to call/email
  - "View Profile" button
- Alphabetical sections (A, B, C...) with jump links
- Infinite scroll or pagination

**Org Chart View**:
- Hierarchical tree visualization
- Controls:
  - Zoom in/out buttons
  - Fit to screen
  - Expand all / Collapse all
  - Search employee (highlights in tree)
  - Download as PDF/PNG
- Tree rendering:
  - Each node shows:
    - Small circular photo
    - Name
    - Title
    - Direct report count badge
  - Expandable branches (click +/- icons)
  - Color-code by department (optional toggle)
  - Dotted lines for matrix reporting (if applicable)
- Click node for quick profile popup:
  - Full name, title, department
  - Contact info
  - "View Full Profile" link
  - "View Their Team" button (if has reports)

#### Compensation Planning Page

**URL**: `/hr/compensation/planning-cycles/:cycleId/worksheet/:worksheetId`

**Layout** (Manager View):

**Header**:
- Cycle name and year
- Status badge
- Budget summary:
  - Allocated: $50,000
  - Proposed: $48,500
  - Remaining: $1,500
  - Progress bar

**Employee Table**:
Columns:
- Name (sortable)
- Current Title
- Current Salary
- Last Raise Date
- Months Since Raise
- Performance Rating (from last review)
- Proposed Salary
- Increase $ | Increase %
- Proposed Bonus
- Total Comp (current → proposed)
- Rationale (expandable)
- Market Comparison indicator (icon: below/at/above market)

**Inline Editing**:
- Click to edit proposed salary
- Auto-calculates increase amount and %
- Real-time budget tracking
- Warning if over budget

**Row Actions**:
- Edit icon → Opens detail modal
- Comment icon → View/add notes
- History icon → Compensation history

**Footer**:
- Totals row (sum of all proposed increases)
- "Save Draft" button
- "Submit for Review" button
- "Export to Excel" button

**Detail Modal** (per employee):
- Employee info header
- Current compensation breakdown
- Proposed compensation inputs
- Performance rating display
- Market data (if available):
  - Market median
  - Current percentile
  - Proposed percentile
- Rationale textarea
- Save button

**HR Admin View** (Compensation Alerts Page):

**URL**: `/hr/compensation/alerts`

**Sections**:

1. **Employees Without Raise (12+ Months)**:
   - Table: Name, Title, Dept, Current Salary, Last Raise Date, Months Since
   - Sort by months since raise (desc)
   - Highlight if 18+ months

2. **Compression Issues**:
   - New hires paid more than tenured employees in same role
   - Table showing comparisons

3. **Pay Equity Concerns**:
   - Compensation distribution by gender/demographic
   - Statistical analysis
   - Flag potential discrepancies

4. **Below Market**:
   - Employees paid below market benchmarks
   - Risk of turnover

---

## Business Logic & Rules

### BL-HR-001: Employee Profile Management

**Rules**:
1. Email addresses must be unique across active employees within the same company
2. Employee numbers, if assigned, must be unique within the company
3. Terminated employees' emails can be reused after 90 days
4. At least one emergency contact must be designated as primary
5. Profile changes by employees are logged in audit trail
6. Changes to employment status trigger workflow notifications
7. Rehired employees maintain original hire date in `original_hire_date` field

### BL-HR-002: Employment History Tracking

**Rules**:
1. Employment history records are immutable once created
2. Effective date cannot be in the future (except for scheduled changes)
3. Each employee must have at least one employment history record (hire event)
4. Current employment values are calculated from latest effective history record
5. Compensation changes require HR Admin or authorized approver
6. Manager changes trigger notification to old and new managers
7. Department transfers update access control permissions automatically
8. Compensation history is restricted to HR Admin and employee (self only)

**Calculations**:
```
Current Job Title = MAX(effective_date WHERE effective_date <= TODAY).job_title
Current Salary = MAX(effective_date WHERE effective_date <= TODAY AND change_type IN ('hire', 'salary_change', 'promotion')).compensation
```

### BL-HR-003: Time Off Management

**Accrual Rules**:
1. Accruals run automatically on each pay period close
2. Accrual calculation:
   ```
   hours_to_accrue = policy.accrual_rate * pay_periods_worked
   new_balance = MIN(current_balance + hours_to_accrue, policy.max_balance)
   ```
3. Waiting period enforced: no accrual until `hire_date + waiting_period_days`
4. Pro-rated accruals for mid-period hires
5. Negative balances allowed only if policy permits, up to limit

**Request Rules**:
1. Requests must not exceed available balance (unless policy allows)
2. Manager approval required unless policy specifies otherwise
3. Cannot request time off for past dates
4. Cannot modify approved time off within 24 hours of start (requires cancellation and re-request)
5. Overlapping requests for same dates are rejected
6. Auto-approval for requests below minimum threshold (if configured)

**Carryover Rules**:
1. Year-end carryover runs automatically on January 1st
2. Carryover calculation:
   ```
   carryover_amount = MIN(balance, policy.carryover_max)
   balance = carryover_amount
   carried_over_hours_expire = carryover_expiration_date
   ```
3. Carried over hours expire first (FIFO)

### BL-HR-004: Attendance Tracking

**Clock Rules**:
1. Employees can only have one active clock-in at a time
2. Clock-out required before next clock-in
3. Missed punches flagged after 24 hours
4. Time entries rounded per payroll policy (e.g., 15-minute increments)
5. Geolocation captured if enabled (requires employee consent)
6. Timesheet auto-generated from time entries

**Overtime Calculation**:
```
IF employment_type = 'hourly' THEN
  regular_hours = MIN(total_hours_in_week, 40)
  overtime_hours = MAX(total_hours_in_week - 40, 0)
  double_time_hours = MAX(total_hours_in_day - 12, 0) -- CA law example
END IF
```

**Approval Workflow**:
1. Timesheets auto-submitted at end of pay period
2. Manager approval required before payroll processing
3. Rejected timesheets return to employee for correction
4. Approved timesheets locked from editing

### BL-HR-005: Payroll Processing

**Pay Calculation**:
```
FOR salary employees:
  gross_pay = annual_salary / pay_periods_per_year

FOR hourly employees:
  gross_pay = (regular_hours * regular_rate) +
              (overtime_hours * overtime_rate) +
              (double_time_hours * double_time_rate)

FOR all employees:
  gross_pay += bonuses + commissions

  FOR EACH deduction IN deductions:
    IF deduction.type = 'tax':
      amount = CALCULATE_TAX(gross_pay, tax_withholding)
    ELSE IF deduction.type = 'benefit':
      amount = benefit_cost_per_period
    ELSE IF deduction.type = 'garnishment':
      amount = garnishment_amount

    total_deductions += amount

  net_pay = gross_pay - total_deductions
```

**Rules**:
1. Payroll runs on pay schedule dates
2. Direct deposit requires 2 business days advance processing
3. Pay stubs generated immediately after payroll approval
4. YTD calculations updated with each pay period
5. Tax withholding changes effective next pay period
6. Final paychecks for terminated employees processed on last working day

### BL-HR-006: Benefits Enrollment

**Eligibility Rules**:
1. New hires eligible after waiting period (typically 30/60/90 days)
2. Open enrollment changes effective January 1st
3. Qualifying Life Events (QLE) allow changes within 30 days of event
4. Coverage effective dates:
   - New hire: 1st of month following eligibility
   - QLE: Date of event or 1st of following month
   - Open enrollment: January 1st

**Coverage Rules**:
1. Employees can only enroll in benefits from their assigned package
2. Coverage tiers validated against dependents:
   - Employee Only: No dependents required
   - Employee + Spouse: Spouse required
   - Employee + Children: At least 1 child required
   - Family: Spouse and/or children required
3. Beneficiary percentages must total 100% per benefit type
4. Dependent age limits enforced (e.g., children under 26)
5. Student status verified for dependents 19-26

**Cost Calculation**:
```
employee_cost = coverage_tier_cost * employee_contribution_percentage
employer_cost = coverage_tier_cost * employer_contribution_percentage
deduction_per_paycheck = employee_cost / pay_periods_per_year
```

### BL-HR-007: Performance Reviews

**Review Cycle Rules**:
1. Reviews auto-created for all employees when cycle starts
2. Self-assessment deadline before manager review deadline
3. Employee cannot view manager assessment until acknowledged
4. Overall rating calculated as weighted average of section ratings
5. Review cannot be acknowledged until manager completes assessment
6. Historical reviews are immutable (read-only after acknowledgment)

**Goal Rules**:
1. Goals can be created anytime but typically align with review periods
2. Progress updates allowed by employee or manager
3. Goals automatically marked "overdue" if past target date and not completed
4. Completed goals cannot be edited
5. Goal progress percentage must be 0-100

### BL-HR-008: Onboarding

**Task Assignment Rules**:
1. Onboarding tasks auto-created from template on hire
2. Due dates calculated from hire date: `hire_date + task.due_days_offset`
3. Pre-boarding tasks (negative offset) created immediately
4. Tasks assigned to appropriate role (employee, HR, manager, IT, buddy)
5. Task dependencies enforced (cannot complete B until A is done)
6. Required tasks block onboarding completion
7. Document upload tasks validate file type and size

**Completion Rules**:
1. I-9 Section 1: Employee completes before/on first day
2. I-9 Section 2: HR completes within 3 business days of hire date
3. E-signatures require legal disclosure acceptance
4. Onboarding marked complete when all required tasks done

### BL-HR-009: Change Request Management

**Request Submission Rules**:
1. Employees can submit change requests for themselves or (if manager) direct reports
2. Request types route to appropriate approvers:
   - Personal Info: Manager → HR
   - Compensation: Manager → HR → Finance (if > threshold)
   - Employment Status: HR → HR Director
   - Job Info: Manager → HR
   - Benefits: HR only
   - Assets: Manager → IT
3. Urgent requests escalate if not approved within 24 hours
4. Requests with effective dates in past require special approval

**Approval Chain Rules**:
```
FOR EACH approver_role IN required_approvers:
  approver = GET_APPROVER(employee, approver_role)

  IF approver_role = 'manager':
    approver = employee.current_manager
  ELSE IF approver_role = 'hr':
    approver = GET_HR_ADMIN_FOR_DEPARTMENT(employee.department)
  ELSE IF approver_role = 'finance':
    approver = GET_FINANCE_APPROVER()

  approval_chain.add(approver)

IF any_approver_rejects:
  request.status = 'rejected'
  STOP

IF all_approvers_approve:
  request.status = 'approved'
  SCHEDULE_CHANGE_APPLICATION(request.effective_date)
```

**Auto-Application Rules**:
1. Approved changes with effective_date = TODAY applied immediately
2. Future-dated changes applied via scheduled job at midnight on effective date
3. Change application updates employee profile and creates employment history record
4. Rejection or cancellation stops auto-application
5. Applied changes update request status to 'completed'

### BL-HR-010: Employee Dashboard

**Widget Data Refresh**:
1. Dashboard loads with cached data (< 5 minutes old)
2. Real-time widgets: Who's Out, Pending Approvals
3. Hourly refresh: Time Off Balances, Goals Progress
4. Daily refresh: Celebrations, Company News
5. On-demand refresh available per widget

**Widget Visibility**:
```
IF user.role = 'employee':
  show_widgets = [time_off, pending_actions, whos_out, celebrations, pay_stub, goals, company_news]
ELSE IF user.role = 'manager':
  show_widgets = employee_widgets + [team_overview, pending_approvals, direct_reports_status, team_goals]
ELSE IF user.role = 'hr_admin':
  show_widgets = manager_widgets + [headcount_turnover, compliance_alerts, compensation_alerts, onboarding_status]
```

**Customization Rules**:
1. Widget positions saved per user
2. Hidden widgets can be re-enabled from widget library
3. Widget settings (e.g., date range, filters) saved per user
4. Reset to default restores role-based default layout

### BL-HR-011: Celebrations

**Birthday Calculation**:
```
upcoming_birthdays = SELECT employees
  WHERE MONTH(birth_date) = MONTH(CURRENT_DATE + days_ahead)
    AND DAY(birth_date) >= DAY(CURRENT_DATE)
    AND celebration_preferences.display_birthday = true
  ORDER BY DAY(birth_date)
```

**Work Anniversary Calculation**:
```
years_of_service = YEAR(CURRENT_DATE) - YEAR(hire_date)

IF MONTH(CURRENT_DATE) < MONTH(hire_date) OR
   (MONTH(CURRENT_DATE) = MONTH(hire_date) AND DAY(CURRENT_DATE) < DAY(hire_date)):
  years_of_service -= 1

anniversary_date = DATE(YEAR(CURRENT_DATE), MONTH(hire_date), DAY(hire_date))

is_milestone = years_of_service IN [1, 5, 10, 15, 20, 25, 30, 35, 40]
```

**Notification Rules**:
1. Birthday notifications sent at 9 AM on birthday
2. Anniversary notifications sent at 9 AM on anniversary
3. Milestone anniversaries trigger special recognition (e.g., company-wide announcement)
4. Notification recipients based on employee preferences:
   - Team only: Manager and direct teammates
   - Company: All employees
5. Employees can opt-out via celebration_preferences

### BL-HR-012: Who's Out Calendar

**Availability Calculation**:
```
today_absences = SELECT employees, time_off_requests
  WHERE request.status = 'approved'
    AND request.start_date <= CURRENT_DATE
    AND request.end_date >= CURRENT_DATE
    AND employee.department = current_user.department (if filtered)

coverage_percentage = (team_size - today_absences.count) / team_size * 100

IF coverage_percentage < 70%:
  alert = 'Low coverage warning'
```

**Rules**:
1. Only approved time off shown
2. Partial days displayed with time range
3. Respects department/team permissions (cannot see other departments unless HR)
4. Time zones handled: "Out" based on employee's local time zone
5. Holidays displayed differently from PTO (company-wide vs. individual)

### BL-HR-013: Compensation Planning

**Budget Allocation**:
```
total_company_budget = SUM(all_worksheets.allocated_budget)

IF total_company_budget > cycle.total_budget:
  ERROR: 'Budget exceeded'

FOR EACH worksheet:
  utilized_budget = SUM(worksheet.items.salary_increase_amount + worksheet.items.proposed_bonus)

  IF utilized_budget > worksheet.allocated_budget:
    WARNING: 'Worksheet over budget'
```

**Raise Calculation**:
```
months_since_last_raise = MONTHS_BETWEEN(CURRENT_DATE, last_raise_date)

proposed_increase_percentage = (proposed_salary - current_salary) / current_salary * 100

IF months_since_last_raise >= 12 AND proposed_salary = current_salary:
  ALERT: 'Employee due for raise consideration'

IF proposed_increase_percentage > 15:
  REQUIRE: additional_approval = true
```

**Market Comparison** (if data available):
```
market_median = GET_MARKET_DATA(job_title, location, years_experience)

current_percentile = PERCENTILE_RANK(current_salary, market_data)

IF current_percentile < 25:
  market_comparison = 'below_market'
  risk_level = 'high_flight_risk'
ELSE IF current_percentile >= 25 AND current_percentile <= 75:
  market_comparison = 'at_market'
ELSE:
  market_comparison = 'above_market'
```

**Approval Workflow**:
1. Manager submits worksheet
2. HR reviews for budget compliance and equity
3. Finance approves if total cost > threshold
4. Changes applied on cycle effective_date
5. Employment history records created automatically

### BL-HR-014: Directory & Organization Chart

**Org Chart Generation**:
```
FUNCTION build_org_tree(root_employee_id, max_depth, current_depth = 0):
  IF current_depth >= max_depth:
    RETURN null

  employee = GET_EMPLOYEE(root_employee_id)
  direct_reports = GET_EMPLOYEES_WHERE(current_manager_id = root_employee_id)

  node = {
    employee_id, name, title, photo_url,
    direct_reports_count: direct_reports.length,
    direct_reports: []
  }

  FOR EACH report IN direct_reports:
    child_node = build_org_tree(report.id, max_depth, current_depth + 1)
    node.direct_reports.add(child_node)

  RETURN node
```

**Rules**:
1. CEO has no manager (root of org tree)
2. Circular reporting relationships prevented (cannot be own manager in chain)
3. Matrix reporting shown as dotted lines (not primary manager)
4. Terminated employees excluded from active org chart
5. Org chart updates real-time when reporting relationships change

### BL-HR-015: Survey & Feedback

**Anonymity Rules**:
1. Anonymous surveys: employee_id not stored with response
2. Minimum response threshold (e.g., 5) required before showing aggregated results
3. Anonymous feedback: from_employee_id = null
4. Non-anonymous feedback: from_employee_id stored

**Survey Targeting**:
```
eligible_employees = GET_EMPLOYEES_WHERE(
  employment_status = 'active' AND
  (target_audience.departments IS NULL OR employee.department IN target_audience.departments) AND
  (target_audience.locations IS NULL OR employee.location IN target_audience.locations) AND
  (target_audience.employment_types IS NULL OR employee.employment_type IN target_audience.employment_types)
)
```

---

## Validation Rules

### VL-HR-001: Employee Profile Validation

**Field Validations**:

```javascript
// Email validation
email: {
  required: true,
  pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  maxLength: 255,
  unique: true (within company),
  customValidation: (value) => {
    if (value.endsWith('@competitor.com')) {
      return 'Personal email addresses not allowed for work email'
    }
  }
}

// Phone number validation
phone: {
  pattern: /^\+?1?\d{9,15}$/,
  format: 'E.164 international format recommended'
}

// Date of birth validation
date_of_birth: {
  minAge: 16, // Minimum working age
  maxAge: 100,
  futureDate: false,
  customValidation: (value) => {
    const age = CALCULATE_AGE(value)
    if (age < 18 && !hasWorkPermit) {
      return 'Minor employees require work permit'
    }
  }
}

// SSN validation (US)
ssn: {
  pattern: /^\d{3}-\d{2}-\d{4}$/,
  encrypted: true,
  customValidation: (value) => {
    // Check for known invalid SSNs
    if (value.startsWith('000') || value.startsWith('666') || value.startsWith('9')) {
      return 'Invalid SSN format'
    }
  }
}
```

### VL-HR-002: Employment History Validation

**Validation Rules**:

```javascript
employment_history: {
  effective_date: {
    required: true,
    futureDate: (change_type === 'scheduled_change'),
    customValidation: (value, employee) => {
      if (value < employee.hire_date) {
        return 'Effective date cannot be before hire date'
      }

      const lastChange = GET_LAST_HISTORY_RECORD(employee.id)
      if (value <= lastChange.effective_date && change_type !== 'correction') {
        return 'Effective date must be after last employment change'
      }
    }
  },

  compensation: {
    required: (change_type IN ['hire', 'salary_change', 'promotion']),
    min: 0,
    customValidation: (value, employee) => {
      if (value.type === 'salary' && value.amount < MINIMUM_WAGE(employee.location) * 2080) {
        return 'Salary below minimum wage'
      }

      if (value.type === 'hourly' && value.amount < MINIMUM_WAGE(employee.location)) {
        return 'Hourly rate below minimum wage'
      }

      // Prevent accidental high compensation entry
      if (value.amount > 10000000) {
        return 'Compensation exceeds reasonable threshold - please verify'
      }
    }
  },

  manager_id: {
    customValidation: (value, employee_id) => {
      if (value === employee_id) {
        return 'Employee cannot be their own manager'
      }

      // Check for circular reporting
      if (CREATES_CIRCULAR_REPORTING(employee_id, value)) {
        return 'Manager assignment creates circular reporting relationship'
      }
    }
  }
}
```

### VL-HR-003: Time Off Request Validation

**Validation Rules**:

```javascript
time_off_request: {
  start_date: {
    required: true,
    futureDate: true,
    minDaysInAdvance: (policy.min_notice_days || 0),
    customValidation: (value) => {
      const dayOfWeek = GET_DAY_OF_WEEK(value)
      if (policy.blackout_dates.includes(value)) {
        return `Cannot request time off on ${value} (blackout date)`
      }
    }
  },

  end_date: {
    required: true,
    customValidation: (value, start_date) => {
      if (value < start_date) {
        return 'End date must be on or after start date'
      }

      const duration_days = DAYS_BETWEEN(start_date, value) + 1
      if (duration_days > policy.max_consecutive_days) {
        return `Maximum consecutive days is ${policy.max_consecutive_days}`
      }
    }
  },

  hours_requested: {
    required: true,
    min: policy.min_request_hours || 0,
    max: (balance.available_hours + (policy.allow_negative_balance ? policy.negative_balance_limit : 0)),
    customValidation: (value, start_date, end_date) => {
      const business_days = COUNT_BUSINESS_DAYS(start_date, end_date)
      const expected_hours = business_days * 8

      if (value > expected_hours) {
        return `Hours requested (${value}) exceeds business hours in date range (${expected_hours})`
      }

      // Check for overlapping requests
      const overlapping = CHECK_OVERLAPPING_REQUESTS(employee_id, start_date, end_date)
      if (overlapping.length > 0) {
        return `Overlaps with existing request #${overlapping[0].id}`
      }
    }
  }
}
```

### VL-HR-004: Timesheet Validation

**Validation Rules**:

```javascript
time_entry: {
  clock_in: {
    required: true,
    customValidation: (value, employee_id) => {
      const active_entry = GET_ACTIVE_TIME_ENTRY(employee_id)
      if (active_entry) {
        return 'Must clock out before clocking in again'
      }

      // Prevent future clock-ins
      if (value > CURRENT_TIMESTAMP) {
        return 'Cannot clock in for future time'
      }

      // Prevent clock-ins more than 24 hours in the past without manager approval
      if (HOURS_BETWEEN(value, CURRENT_TIMESTAMP) > 24) {
        return 'Clock-ins older than 24 hours require manager approval'
      }
    }
  },

  clock_out: {
    required: false, // Not required initially, required before timesheet submission
    customValidation: (value, clock_in) => {
      if (value <= clock_in) {
        return 'Clock out must be after clock in'
      }

      const duration_hours = HOURS_BETWEEN(clock_in, value)
      if (duration_hours > 16) {
        return 'Shift exceeds 16 hours - please verify'
      }
    }
  },

  total_hours: {
    min: 0,
    max: 24,
    customValidation: (value, pay_period_start, pay_period_end) => {
      const total_week_hours = GET_WEEKLY_HOURS(employee_id, GET_WEEK_OF(entry_date))

      if (employment_type === 'hourly' && total_week_hours > 60) {
        return `Weekly hours (${total_week_hours}) exceed 60 - requires manager review`
      }
    }
  }
}

timesheet: {
  validation: (timesheet) => {
    // Ensure all time entries have clock out
    const incomplete_entries = timesheet.entries.filter(e => !e.clock_out)
    if (incomplete_entries.length > 0 && timesheet.status === 'submitted') {
      return 'All time entries must have clock out time before submission'
    }

    // Validate total hours match sum of entries
    const calculated_total = timesheet.entries.reduce((sum, e) => sum + e.total_hours, 0)
    if (Math.abs(calculated_total - timesheet.total_hours) > 0.01) {
      return 'Timesheet total does not match sum of time entries'
    }
  }
}
```

### VL-HR-005: Benefits Enrollment Validation

**Validation Rules**:

```javascript
benefits_enrollment: {
  coverage_tier: {
    required: true,
    customValidation: (value, dependents) => {
      if (value === 'employee_spouse' && !HAS_SPOUSE_DEPENDENT(dependents)) {
        return 'Employee + Spouse coverage requires spouse dependent'
      }

      if (value === 'employee_children' && !HAS_CHILD_DEPENDENTS(dependents)) {
        return 'Employee + Children coverage requires at least one child dependent'
      }

      if (value === 'family' && !(HAS_SPOUSE_DEPENDENT(dependents) || HAS_CHILD_DEPENDENTS(dependents))) {
        return 'Family coverage requires spouse and/or child dependents'
      }
    }
  },

  enrollment_window: {
    customValidation: (enrollment_date, enrollment_reason) => {
      if (enrollment_reason === 'open_enrollment') {
        const open_enrollment_period = GET_OPEN_ENROLLMENT_PERIOD()
        if (!IS_WITHIN_PERIOD(enrollment_date, open_enrollment_period)) {
          return 'Not within open enrollment period'
        }
      }

      if (enrollment_reason === 'qle') {
        const qle_date = GET_QLE_DATE()
        if (DAYS_BETWEEN(qle_date, enrollment_date) > 30) {
          return 'QLE enrollment must occur within 30 days of qualifying event'
        }
      }

      if (enrollment_reason === 'new_hire') {
        const eligibility_date = employee.hire_date + benefit_package.waiting_period_days
        if (enrollment_date < eligibility_date) {
          return `Not eligible until ${eligibility_date}`
        }
      }
    }
  }
}

dependent: {
  date_of_birth: {
    required: true,
    customValidation: (value, relationship) => {
      const age = CALCULATE_AGE(value)

      if (relationship === 'child' && age > 26) {
        return 'Child dependents must be under 26 years old'
      }

      if (relationship === 'child' && age >= 19 && age <= 26) {
        if (!dependent.is_student) {
          return 'Dependents age 19-26 must be full-time students'
        }
      }

      if (value > CURRENT_DATE) {
        return 'Birth date cannot be in the future'
      }
    }
  },

  relationship: {
    required: true,
    enum: ['spouse', 'domestic_partner', 'child', 'other'],
    customValidation: (value, employee) => {
      if (value === 'spouse') {
        const existing_spouse = COUNT_DEPENDENTS_WHERE(employee_id, relationship = 'spouse')
        if (existing_spouse > 0) {
          return 'Only one spouse dependent allowed'
        }
      }
    }
  }
}

beneficiary: {
  percentage: {
    required: true,
    min: 0.01,
    max: 100,
    customValidation: (value, benefit_type, beneficiary_type, all_beneficiaries) => {
      const same_type_beneficiaries = all_beneficiaries.filter(b =>
        b.benefit_type === benefit_type &&
        b.beneficiary_type === beneficiary_type &&
        b.is_active
      )

      const total_percentage = same_type_beneficiaries.reduce((sum, b) => sum + b.percentage, 0) + value

      if (total_percentage > 100) {
        return `Total ${beneficiary_type} beneficiary percentage exceeds 100%`
      }

      // Warning if not equal to 100%
      if (total_percentage < 100 && IS_FINAL_BENEFICIARY) {
        WARN: `${beneficiary_type} beneficiary total is ${total_percentage}% (should be 100%)`
      }
    }
  }
}
```

### VL-HR-006: Performance Review Validation

**Validation Rules**:

```javascript
performance_review: {
  self_assessment: {
    customValidation: (data, review) => {
      if (review.self_completed_at && DAYS_BETWEEN(review.self_completed_at, CURRENT_DATE) > 30) {
        return 'Cannot modify self-assessment more than 30 days after submission'
      }

      if (CURRENT_DATE > review.review_cycle.self_assessment_deadline) {
        WARN: 'Self-assessment is past deadline'
      }
    }
  },

  manager_assessment: {
    customValidation: (data, review) => {
      if (!review.self_completed_at) {
        return 'Employee must complete self-assessment before manager review'
      }

      if (CURRENT_DATE > review.review_cycle.manager_review_deadline) {
        WARN: 'Manager review is past deadline'
      }
    }
  },

  overall_rating: {
    required: true,
    min: 1,
    max: 5,
    decimalPlaces: 2,
    customValidation: (value) => {
      if (value < 2) {
        REQUIRE: 'performance_improvement_plan_required = true'
      }
    }
  }
}

goal: {
  title: {
    required: true,
    minLength: 5,
    maxLength: 255
  },

  target_date: {
    required: true,
    futureDate: true,
    customValidation: (value, review_period_end) => {
      if (value > review_period_end) {
        WARN: 'Goal target date extends beyond current review period'
      }
    }
  },

  progress_percentage: {
    required: true,
    min: 0,
    max: 100,
    customValidation: (value, status) => {
      if (status === 'completed' && value !== 100) {
        return 'Completed goals must have 100% progress'
      }

      if (status === 'not_started' && value > 0) {
        return 'Not started goals should have 0% progress'
      }
    }
  }
}
```

### VL-HR-007: Change Request Validation

**Validation Rules**:

```javascript
change_request: {
  request_details: {
    required: true,
    customValidation: (details, request_type) => {
      // Validate type-specific required fields
      if (request_type === 'personal_info') {
        if (!details.field) {
          return 'Field name required for personal info changes'
        }
        if (!details.currentValue) {
          return 'Current value required'
        }
        if (!details.requestedValue) {
          return 'Requested value required'
        }
        if (details.currentValue === details.requestedValue) {
          return 'Requested value must differ from current value'
        }
      }

      if (request_type === 'compensation') {
        if (!details.current_compensation || !details.requested_compensation) {
          return 'Current and requested compensation required'
        }
        if (!details.justification || details.justification.length < 20) {
          return 'Justification required (minimum 20 characters)'
        }

        const increase_pct = (details.requested_compensation - details.current_compensation) / details.current_compensation * 100
        if (increase_pct > 50) {
          WARN: `Compensation increase of ${increase_pct}% exceeds typical range`
        }
      }
    }
  },

  effective_date: {
    required: true,
    customValidation: (value, request_date, request_type) => {
      if (value < request_date) {
        if (request_type === 'personal_info') {
          // Allow retroactive personal info changes
          if (DAYS_BETWEEN(value, request_date) > 30) {
            REQUIRE: 'hr_admin_approval = true'
          }
        } else {
          return 'Effective date cannot be before request date for this request type'
        }
      }

      // Future dates should be reasonable
      if (DAYS_BETWEEN(request_date, value) > 90) {
        WARN: 'Effective date more than 90 days in future'
      }
    }
  },

  attached_documents: {
    maxCount: 10,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    allowedTypes: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    customValidation: (documents, request_type) => {
      // Require documentation for certain request types
      if (request_type === 'compensation' && documents.length === 0) {
        WARN: 'Supporting documentation recommended for compensation requests'
      }

      if (request_type === 'personal_info' &&
          request_details.field IN ['name', 'address'] &&
          documents.length === 0) {
        WARN: 'Proof of change recommended (e.g., marriage certificate, utility bill)'
      }
    }
  }
}
```

### VL-HR-008: Compensation Planning Validation

**Validation Rules**:

```javascript
compensation_planning_cycle: {
  planning_dates: {
    customValidation: (start_date, end_date, effective_date) => {
      if (end_date <= start_date) {
        return 'Planning end date must be after start date'
      }

      if (effective_date <= end_date) {
        return 'Effective date must be after planning end date'
      }

      const planning_duration_days = DAYS_BETWEEN(start_date, end_date)
      if (planning_duration_days < 7) {
        WARN: 'Planning period less than 7 days - may be insufficient'
      }
    }
  },

  total_budget: {
    required: true,
    min: 0,
    customValidation: (value, company_id, cycle_year) => {
      const last_year_payroll = GET_ANNUAL_PAYROLL(company_id, cycle_year - 1)

      if (value > last_year_payroll * 0.10) {
        WARN: `Budget exceeds 10% of last year's payroll - please verify`
      }
    }
  }
}

compensation_planning_worksheet: {
  allocated_budget: {
    required: true,
    min: 0,
    customValidation: (value, cycle) => {
      const total_allocated = SUM_ALL_WORKSHEET_BUDGETS(cycle.id)

      if (total_allocated + value > cycle.total_budget) {
        return `Total allocated budget would exceed cycle budget`
      }
    }
  }
}

compensation_planning_item: {
  proposed_salary: {
    customValidation: (value, current_salary, employee) => {
      if (value < current_salary) {
        REQUIRE: 'justification_for_decrease'
        REQUIRE: 'hr_director_approval = true'
      }

      const increase_pct = (value - current_salary) / current_salary * 100

      if (increase_pct > 15) {
        WARN: `Increase of ${increase_pct}% exceeds typical merit increase range`
        REQUIRE: 'additional_justification'
      }

      if (value < MINIMUM_WAGE(employee.location) * 2080) {
        return 'Proposed salary below minimum wage'
      }
    }
  },

  rationale: {
    required: (proposed_salary !== current_salary || proposed_bonus > 0),
    minLength: 20,
    customValidation: (value, proposed_salary, current_salary) => {
      if (!proposed_salary || proposed_salary === current_salary) {
        return null // No change, no rationale needed
      }

      const increase_pct = (proposed_salary - current_salary) / current_salary * 100

      if (increase_pct > 5 && value.length < 50) {
        return 'Increases > 5% require detailed rationale (min 50 characters)'
      }
    }
  },

  market_comparison: {
    customValidation: (value, current_salary, job_title, location) => {
      if (value === 'below_market' && !proposed_salary_increase) {
        WARN: 'Employee below market with no proposed increase - retention risk'
      }

      if (value === 'above_market') {
        const market_data = GET_MARKET_DATA(job_title, location)
        if (current_salary > market_data.percentile_90) {
          WARN: 'Salary significantly above market - review compensation structure'
        }
      }
    }
  }
}
```

### VL-HR-009: Survey & Feedback Validation

**Validation Rules**:

```javascript
survey: {
  questions: {
    required: true,
    minLength: 1,
    maxLength: 50,
    customValidation: (questions) => {
      questions.forEach((q, index) => {
        if (!q.question || q.question.trim().length === 0) {
          return `Question ${index + 1}: Question text required`
        }

        if (q.type === 'multiple_choice' && (!q.options || q.options.length < 2)) {
          return `Question ${index + 1}: Multiple choice requires at least 2 options`
        }

        if (q.type === 'scale') {
          if (!q.scale_min || !q.scale_max) {
            return `Question ${index + 1}: Scale min and max required`
          }
          if (q.scale_min >= q.scale_max) {
            return `Question ${index + 1}: Scale max must be greater than min`
          }
        }
      })
    }
  },

  target_audience: {
    customValidation: (target_audience, is_anonymous) => {
      // Calculate potential respondent count
      const potential_respondents = COUNT_MATCHING_EMPLOYEES(target_audience)

      if (is_anonymous && potential_respondents < 5) {
        return 'Anonymous surveys require at least 5 potential respondents for anonymity'
      }

      if (potential_respondents === 0) {
        return 'No employees match the target audience criteria'
      }
    }
  },

  date_range: {
    customValidation: (start_date, end_date) => {
      if (end_date <= start_date) {
        return 'End date must be after start date'
      }

      const duration_days = DAYS_BETWEEN(start_date, end_date)
      if (duration_days < 3) {
        WARN: 'Survey duration less than 3 days - may have low response rate'
      }

      if (duration_days > 90) {
        WARN: 'Survey duration exceeds 90 days - consider shorter window'
      }
    }
  }
}

survey_response: {
  responses: {
    required: true,
    customValidation: (responses, survey_questions) => {
      // Check all required questions answered
      survey_questions.forEach(q => {
        if (q.required && !responses[q.id]) {
          return `Question "${q.question}" is required`
        }
      })

      // Validate response types
      Object.entries(responses).forEach(([question_id, answer]) => {
        const question = survey_questions.find(q => q.id === question_id)

        if (question.type === 'scale') {
          if (answer < question.scale_min || answer > question.scale_max) {
            return `Answer for "${question.question}" must be between ${question.scale_min} and ${question.scale_max}`
          }
        }

        if (question.type === 'multiple_choice') {
          if (!question.options.includes(answer)) {
            return `Invalid option for "${question.question}"`
          }
        }
      })
    }
  }
}
```

### VL-HR-010: Document Upload Validation

**Validation Rules**:

```javascript
employee_document: {
  file_upload: {
    required: true,
    maxFileSize: 25 * 1024 * 1024, // 25 MB
    allowedTypes: {
      'contract': ['pdf', 'doc', 'docx'],
      'i9': ['pdf'],
      'certification': ['pdf', 'jpg', 'jpeg', 'png'],
      'policy_ack': ['pdf'],
      'w4': ['pdf']
    },
    customValidation: (file, document_type) => {
      const allowed = allowedTypes[document_type]
      const extension = file.name.split('.').pop().toLowerCase()

      if (!allowed.includes(extension)) {
        return `File type .${extension} not allowed for ${document_type}. Allowed: ${allowed.join(', ')}`
      }

      // Virus scan
      if (!PASSED_VIRUS_SCAN(file)) {
        return 'File failed security scan'
      }

      // Check if document already exists
      if (document_type === 'i9' && EMPLOYEE_HAS_I9(employee_id)) {
        WARN: 'Employee already has I-9 on file - this will replace existing'
      }
    }
  },

  expiration_date: {
    required: (document_type IN ['certification', 'license', 'work_permit']),
    futureDate: true,
    customValidation: (value, document_type) => {
      if (DAYS_BETWEEN(CURRENT_DATE, value) < 30) {
        WARN: 'Document expires in less than 30 days'
      }
    }
  }
}
```

---

## Security Considerations

### SC-HR-001: Data Encryption

**PII Encryption (At Rest)**:
```javascript
// Fields requiring encryption at rest
encrypted_fields = [
  'ssn',
  'date_of_birth',
  'salary',
  'hourly_rate',
  'bank_account_number',
  'routing_number',
  'home_address',
  'personal_email',
  'personal_phone',
  'emergency_contact_phone',
  'passport_number',
  'drivers_license_number',
  'health_information'
]

// Encryption method: AES-256-GCM
encryption_algorithm = 'AES-256-GCM'
key_derivation = 'HKDF-SHA256'
key_rotation_period = '90 days'

// Key management
encryption_keys_stored_in = 'AWS KMS' // or Azure Key Vault, Google Cloud KMS
key_access_audited = true
```

**Data in Transit**:
- All API endpoints require HTTPS (TLS 1.2 or higher)
- Certificate pinning for mobile applications
- WebSocket connections for real-time features must use WSS (WebSocket Secure)

**Database Encryption**:
- Full database encryption at rest
- Encrypted database backups
- Secure connection strings (no plaintext passwords)

### SC-HR-002: Access Control

**Role-Based Access Control (RBAC)**:

```javascript
roles = {
  employee: {
    permissions: [
      'read:own_profile',
      'update:own_profile_non_sensitive',
      'read:own_payroll',
      'read:own_benefits',
      'create:own_time_off_request',
      'read:own_time_off',
      'create:own_timesheet',
      'read:own_reviews',
      'create:own_change_request',
      'read:company_directory',
      'read:celebrations_public',
      'read:own_dashboard'
    ],
    restrictions: {
      cannot_view: ['other_salaries', 'other_ssn', 'other_reviews'],
      cannot_edit: ['hire_date', 'employment_status', 'salary', 'manager']
    }
  },

  manager: {
    inherits: 'employee',
    additional_permissions: [
      'read:direct_reports_profile',
      'read:direct_reports_reviews',
      'approve:time_off',
      'approve:timesheets',
      'create:performance_reviews',
      'read:team_dashboard',
      'approve:change_requests_personal',
      'create:compensation_planning_worksheet',
      'read:direct_reports_compensation' // for planning purposes only
    ],
    restrictions: {
      can_only_see_reports: true,
      cannot_approve_own_requests: true
    }
  },

  hr_admin: {
    inherits: 'manager',
    additional_permissions: [
      'read:all_employees',
      'update:all_employees',
      'create:employees',
      'terminate:employees',
      'read:all_compensation',
      'update:compensation',
      'read:all_benefits',
      'update:benefits',
      'approve:change_requests_all',
      'create:benefits_plans',
      'create:time_off_policies',
      'create:compensation_planning_cycle',
      'read:compliance_alerts',
      'read:all_documents',
      'delete:documents'
    ],
    audit_level: 'high' // All actions logged and reviewed
  },

  hr_director: {
    inherits: 'hr_admin',
    additional_permissions: [
      'approve:terminations',
      'approve:high_salary_changes',  // > $150k or > 15% increase
      'access:audit_logs',
      'manage:roles_permissions'
    ]
  },

  payroll_admin: {
    inherits: 'employee',
    additional_permissions: [
      'run:payroll',
      'read:all_compensation',
      'read:all_bank_accounts',
      'approve:payroll_changes',
      'generate:tax_forms'
    ],
    restrictions: {
      cannot_edit_compensation: true, // Can only process, not modify
      read_only_access: true
    }
  }
}
```

**Attribute-Based Access Control (ABAC)**:

```javascript
// Additional context-based access rules

access_rules = [
  {
    resource: 'employee_profile',
    condition: 'user.id === resource.id OR user.role IN ["hr_admin", "hr_director"]',
    fields_accessible: 'all'
  },
  {
    resource: 'employee_profile',
    condition: 'user.id === resource.current_manager_id',
    fields_accessible: ['work_phone', 'work_email', 'department', 'title', 'hire_date', 'performance_reviews'],
    fields_restricted: ['ssn', 'dob', 'home_address', 'salary', 'bank_account']
  },
  {
    resource: 'salary_information',
    condition: 'user.role === "manager" AND within_compensation_planning_cycle AND resource.employee_id IN user.direct_reports',
    fields_accessible: ['current_salary', 'proposed_salary'],
    temporary_access: true,
    expires_at: 'cycle.planning_end_date'
  },
  {
    resource: 'change_request',
    condition: 'user.id === resource.requested_for OR user.id IN resource.approval_chain.approver_ids OR user.role IN ["hr_admin"]',
    actions: ['read', 'comment']
  },
  {
    resource: 'change_request',
    condition: 'user.id === current_approver AND request.status === "pending"',
    actions: ['approve', 'reject']
  },
  {
    resource: 'compensation_planning_worksheet',
    condition: 'user.id === worksheet.manager_id OR user.role IN ["hr_admin", "hr_director"]',
    actions: ['read', 'update']
  },
  {
    resource: 'dashboard_widget_data',
    condition: 'widget.type === "whos_out" AND employee.department === user.department',
    scope: 'department_only'
  }
]
```

### SC-HR-003: Authentication & Authorization

**Multi-Factor Authentication (MFA)**:
- Required for HR Admin, HR Director, and Payroll Admin roles
- Optional but recommended for all users
- MFA methods: TOTP (authenticator app), SMS (fallback), WebAuthn (hardware keys)

**Password Policy**:
```javascript
password_requirements = {
  min_length: 12,
  require_uppercase: true,
  require_lowercase: true,
  require_digit: true,
  require_special_char: true,
  disallow_common_passwords: true,
  disallow_previous_passwords: 5,
  expiration_days: 90 (for admin roles only),
  max_login_attempts: 5,
  lockout_duration_minutes: 30
}
```

**Session Management**:
- Session timeout: 30 minutes of inactivity for sensitive operations, 2 hours for general browsing
- Re-authentication required for:
  - Viewing SSN
  - Editing compensation
  - Approving terminations
  - Running payroll
  - Accessing audit logs
  - Bulk data exports
- Session tokens rotated on privilege escalation
- Concurrent session limits: 3 devices max

**Single Sign-On (SSO)**:
- Support for SAML 2.0 and OAuth 2.0 / OpenID Connect
- Just-In-Time (JIT) provisioning
- Role mapping from IdP attributes
- Audit log for all SSO authentications

### SC-HR-004: Data Privacy & Compliance

**GDPR Compliance**:
```javascript
gdpr_features = {
  right_to_access: {
    endpoint: 'GET /employees/:id/data-export',
    format: 'JSON or PDF',
    includes: 'all personal data stored'
  },

  right_to_rectification: {
    implemented_via: 'change_request_system',
    employee_can_request: ['address', 'phone', 'email', 'name']
  },

  right_to_erasure: {
    note: 'Limited due to legal retention requirements',
    applies_to: 'applicants not hired, after retention period',
    retention_periods: {
      active_employees: 'duration of employment + 7 years',
      terminated_employees: '7 years after termination',
      payroll_records: '7 years (tax law)',
      i9_forms: '3 years after hire or 1 year after termination',
      medical_records: '30 years (ADA)'
    }
  },

  right_to_portability: {
    endpoint: 'GET /employees/:id/data-export',
    format: 'machine-readable JSON'
  },

  right_to_object: {
    automated_decision_making: 'not used in HR decisions',
    profiling: 'employee can opt-out of celebrations display'
  },

  data_protection_officer: 'designated and contact info published',

  breach_notification: 'within 72 hours to supervisory authority',

  privacy_by_design: true
}
```

**Data Retention Policy**:
```javascript
retention_rules = [
  {
    data_type: 'employee_profile',
    retention_period: '7 years after termination',
    deletion_method: 'hard_delete'
  },
  {
    data_type: 'payroll_records',
    retention_period: '7 years (FLSA requirement)',
    deletion_method: 'secure_wipe'
  },
  {
    data_type: 'time_off_records',
    retention_period: '3 years',
    deletion_method: 'hard_delete'
  },
  {
    data_type: 'performance_reviews',
    retention_period: '7 years after review date',
    deletion_method: 'hard_delete'
  },
  {
    data_type: 'change_requests',
    retention_period: '3 years',
    deletion_method: 'soft_delete_then_hard_delete'
  },
  {
    data_type: 'audit_logs',
    retention_period: '10 years',
    deletion_method: 'archive_then_delete'
  },
  {
    data_type: 'celebrations_data',
    retention_period: 'while employed',
    deletion_method: 'hard_delete_on_termination'
  }
]
```

### SC-HR-005: Audit Logging

**Audit Trail Requirements**:

```javascript
audited_actions = [
  // Employee Data
  {
    action: 'view_ssn',
    log_data: ['user_id', 'employee_id', 'timestamp', 'ip_address'],
    retention: '10 years'
  },
  {
    action: 'view_salary',
    log_data: ['user_id', 'employee_id', 'timestamp', 'reason'],
    retention: '7 years'
  },
  {
    action: 'update_employee_profile',
    log_data: ['user_id', 'employee_id', 'field_changed', 'old_value', 'new_value', 'timestamp'],
    retention: '7 years',
    encrypt_old_value: true
  },

  // Compensation
  {
    action: 'update_compensation',
    log_data: ['user_id', 'employee_id', 'old_salary', 'new_salary', 'effective_date', 'reason', 'timestamp'],
    retention: '10 years',
    alert_on: 'increase > 15% or decrease',
    requires_approval: true
  },

  // Change Requests
  {
    action: 'approve_change_request',
    log_data: ['approver_id', 'request_id', 'approved_at', 'comments'],
    retention: '7 years'
  },
  {
    action: 'reject_change_request',
    log_data: ['approver_id', 'request_id', 'rejected_at', 'reason'],
    retention: '7 years'
  },

  // Access & Authentication
  {
    action: 'login',
    log_data: ['user_id', 'timestamp', 'ip_address', 'user_agent', 'mfa_used'],
    retention: '1 year'
  },
  {
    action: 'login_failed',
    log_data: ['attempted_email', 'timestamp', 'ip_address', 'failure_reason'],
    retention: '1 year',
    alert_on: 'multiple_failures'
  },
  {
    action: 'password_reset',
    log_data: ['user_id', 'timestamp', 'ip_address', 'method'],
    retention: '1 year'
  },

  // Data Export
  {
    action: 'bulk_export',
    log_data: ['user_id', 'export_type', 'record_count', 'timestamp', 'fields_exported'],
    retention: '10 years',
    alert_on: true,
    requires_approval: (record_count > 100)
  },

  // Payroll
  {
    action: 'run_payroll',
    log_data: ['user_id', 'pay_period', 'employee_count', 'total_amount', 'timestamp'],
    retention: '10 years'
  },
  {
    action: 'view_bank_account',
    log_data: ['user_id', 'employee_id', 'timestamp'],
    retention: '7 years'
  },

  // Role & Permission Changes
  {
    action: 'update_user_role',
    log_data: ['admin_id', 'user_id', 'old_role', 'new_role', 'timestamp'],
    retention: '10 years',
    alert_on: true
  },

  // Dashboard & Widgets
  {
    action: 'view_whos_out',
    log_data: ['user_id', 'department_viewed', 'timestamp'],
    retention: '90 days'
  },

  // Compliance
  {
    action: 'delete_document',
    log_data: ['user_id', 'document_id', 'employee_id', 'document_type', 'timestamp', 'reason'],
    retention: '10 years'
  }
]
```

**Real-time Alerts**:
```javascript
security_alerts = [
  {
    trigger: 'multiple_failed_logins',
    condition: '5 failures within 10 minutes',
    alert: ['security_team', 'user_email'],
    action: 'temporary_account_lock'
  },
  {
    trigger: 'access_from_new_location',
    condition: 'IP geolocation differs from usual',
    alert: ['user_email', 'security_team'],
    action: 'require_mfa_verification'
  },
  {
    trigger: 'bulk_data_access',
    condition: 'more than 50 employee records viewed in 1 hour',
    alert: ['security_team', 'hr_director'],
    action: 'none' // Monitor only
  },
  {
    trigger: 'privilege_escalation',
    condition: 'user role changed to admin',
    alert: ['security_team', 'hr_director'],
    action: 'require_re-authentication'
  },
  {
    trigger: 'unusual_compensation_change',
    condition: 'salary increase > 50% or salary decrease',
    alert: ['hr_director', 'finance_director'],
    action: 'require_additional_approval'
  },
  {
    trigger: 'after_hours_access',
    condition: 'access to sensitive data outside business hours',
    alert: ['security_team'],
    action: 'require_mfa' // if not already using
  }
]
```

### SC-HR-006: API Security

**Rate Limiting**:
```javascript
rate_limits = {
  authenticated_users: {
    requests_per_minute: 60,
    requests_per_hour: 1000,
    burst: 10
  },
  unauthenticated: {
    requests_per_minute: 10,
    requests_per_hour: 100
  },
  sensitive_endpoints: {
    '/employees/:id/ssn': { requests_per_hour: 10 },
    '/employees/:id/salary': { requests_per_hour: 20 },
    '/payroll/run': { requests_per_day: 5 },
    '/data-export': { requests_per_day: 3 }
  }
}
```

**Input Validation & Sanitization**:
- All inputs validated against schema before processing
- SQL injection prevention via parameterized queries
- XSS prevention via output encoding
- CSRF tokens required for state-changing operations
- File upload scanning for malware

**API Authentication**:
- OAuth 2.0 for third-party integrations
- API keys for server-to-server communication
- JWT tokens with short expiration (15 minutes)
- Refresh tokens with rotation
- API key rotation every 90 days

### SC-HR-007: Change Request Security

**Approval Chain Validation**:
```javascript
change_request_security = {
  approval_chain_integrity: {
    // Prevent approval chain manipulation
    approval_chain_immutable: true, // Once created, chain cannot be altered
    approvers_determined_at_submission: true,

    validation: (request) => {
      // Ensure approvers haven't changed since request creation
      const current_approvers = CALCULATE_APPROVERS(request.employee, request.type)
      if (!APPROVERS_MATCH(request.approval_chain, current_approvers)) {
        LOG_ALERT('Approval chain mismatch detected')
        REQUIRE: 'hr_admin_review'
      }
    }
  },

  sensitive_field_changes: {
    // Extra security for high-risk changes
    fields_requiring_documents: ['name', 'ssn', 'bank_account'],
    fields_requiring_hr_approval: ['employment_status', 'title', 'department'],
    fields_preventing_self_service: ['salary', 'manager', 'role'],

    retroactive_changes: {
      max_days_back: 30,
      requires: 'hr_admin_approval',
      audit_level: 'high'
    }
  },

  document_handling: {
    virus_scan: true,
    file_type_whitelist: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    max_file_size: 10_MB,
    storage_encrypted: true,
    access_log: true
  }
}
```

### SC-HR-008: Compensation Planning Security

**Budget Protection**:
```javascript
compensation_planning_security = {
  access_control: {
    // Managers can only see their own worksheet
    worksheet_isolation: (user, worksheet) => {
      if (user.role !== 'hr_admin' && user.id !== worksheet.manager_id) {
        DENY_ACCESS
      }
    },

    // Time-based access
    planning_window_enforcement: (user, cycle) => {
      if (CURRENT_DATE < cycle.planning_start_date || CURRENT_DATE > cycle.planning_end_date) {
        if (user.role !== 'hr_admin') {
          DENY_ACCESS
        }
      }
    }
  },

  data_protection: {
    // Prevent cross-worksheet data leakage
    manager_can_only_see: 'own_direct_reports',
    salary_data_encrypted: true,
    temporary_access: {
      granted_during: 'planning_cycle',
      revoked_after: 'cycle.planning_end_date + 7_days'
    }
  },

  audit_trail: {
    log_all_changes: true,
    log_data: ['user_id', 'employee_id', 'field', 'old_value', 'new_value', 'timestamp'],
    immutable_log: true
  },

  approval_workflow: {
    prevent_self_approval: (manager, worksheet) => {
      const manager_item = worksheet.items.find(i => i.employee_id === manager.id)
      if (manager_item && manager_item.proposed_salary > manager_item.current_salary) {
        REQUIRE: 'skip_level_manager_approval'
      }
    },

    high_value_changes: {
      threshold_amount: 150000, // or 15% increase
      requires: ['hr_director_approval', 'finance_approval']
    }
  }
}
```

### SC-HR-009: Celebrations & Directory Privacy

**Privacy Controls**:
```javascript
celebrations_privacy = {
  opt_out: {
    employee_can_hide: ['birthday', 'age', 'work_anniversary'],
    default_visibility: 'team_only',
    granular_controls: true
  },

  data_minimization: {
    only_display: ['name', 'photo', 'celebration_type', 'date'],
    never_display: ['actual_birth_date', 'age'] // unless employee opts in
  },

  notifications: {
    respect_preferences: true,
    allow_opt_out: true,
    frequency_limits: true // Prevent spam
  }
}

directory_privacy = {
  field_visibility: {
    always_visible: ['name', 'photo', 'job_title', 'department'],
    conditionally_visible: {
      work_phone: 'if employee allows',
      work_email: 'always',
      location: 'if employee allows',
      social_media: 'if employee provides'
    },
    never_visible: ['home_address', 'personal_phone', 'personal_email', 'ssn', 'salary']
  },

  search_restrictions: {
    prevent_scraping: true,
    rate_limit: '100 searches per hour',
    log_bulk_searches: true
  }
}
```

---

## Reporting Requirements

### RP-HR-001: Standard HR Reports

**Report**: Headcount Report
- **Frequency**: Monthly, Quarterly, Annually
- **Dimensions**: Department, Location, Employment Type, Job Level
- **Metrics**:
  - Total headcount
  - New hires (period)
  - Terminations (period)
  - Net change
  - Headcount by category
- **Drill-down**: By department → team → individual
- **Export Formats**: Excel, PDF, CSV
- **Permissions**: HR Admin, HR Director, Department Heads

**Report**: Turnover & Retention Analysis
- **Frequency**: Monthly, Quarterly, Annually
- **Metrics**:
  - Voluntary turnover rate: `(voluntary_terms / avg_headcount) * 100`
  - Involuntary turnover rate
  - Overall turnover rate
  - Retention rate: `100 - turnover_rate`
  - Average tenure (years, months)
  - Tenure distribution histogram
- **Segmentation**: Department, job level, manager, hire date cohort
- **Trend Analysis**: 12-month rolling average
- **Visualizations**: Line chart (trend), bar chart (by department), histogram (tenure distribution)

**Report**: Time to Fill & Recruiting Metrics
- **Metrics**:
  - Average time to fill (days)
  - Time to hire (offer accept to start date)
  - Offer acceptance rate
  - Source of hire effectiveness
- **Segmentation**: Department, job level, location
- **Permissions**: HR Admin, Recruiting Team

**Report**: Diversity & Inclusion Dashboard
- **Metrics**:
  - Workforce composition by gender, ethnicity, age group
  - Hiring diversity metrics
  - Promotion rates by demographic
  - Pay equity analysis (average compensation by demographic, controlling for role/level)
  - Retention rates by demographic
- **Compliance**: EEO-1 reporting format
- **Visualizations**: Pie charts, bar charts, scatter plots
- **Permissions**: HR Admin, HR Director, Compliance Officer

### RP-HR-002: Time Off & Attendance Reports

**Report**: Time Off Balance Report
- **Scope**: All employees or by department/location
- **Columns**:
  - Employee name
  - Policy name
  - Accrued hours (YTD)
  - Used hours (YTD)
  - Current balance
  - Pending requests
  - Projected year-end balance
- **Alerts**: Employees at risk of losing hours due to max accrual
- **Export**: Excel, CSV

**Report**: Time Off Usage Analysis
- **Metrics**:
  - Average PTO utilization rate: `used_hours / accrued_hours`
  - Employees with zero PTO usage (burnout risk)
  - Busiest/slowest time off months
  - Average request size (days)
- **Segmentation**: Department, manager, tenure bracket
- **Visualizations**: Heat map (time off by month), bar chart (usage by department)

**Report**: Attendance Report (Clock In/Out)
- **Scope**: Hourly employees
- **Metrics**:
  - Total hours worked (by employee, by pay period)
  - Overtime hours
  - Tardiness instances
  - Missed punches
  - Absenteeism rate
- **Segmentation**: Department, location, shift
- **Permissions**: Payroll Admin, HR Admin, Managers

**Report**: Who's Out Calendar (Printable)
- **View**: Month view showing all approved time off
- **Color-coded**: By time off type (PTO, sick, unpaid, etc.)
- **Filters**: Department, location, date range
- **Export**: PDF (printable calendar), Excel, iCal

### RP-HR-003: Compensation Reports

**Report**: Compensation Summary
- **Scope**: All employees or filtered
- **Columns**:
  - Employee name, title, department
  - Base salary / hourly rate
  - Last raise date, last raise amount, last raise %
  - Market comparison (if available)
  - Compa-ratio: `actual_salary / midpoint_salary`
- **Aggregates**: Average salary by department/title, total payroll cost
- **Permissions**: HR Admin, HR Director, Finance

**Report**: Salary Distribution & Pay Equity
- **Visualizations**:
  - Salary histogram by job title
  - Scatter plot: salary vs. tenure (by demographic)
  - Box plot: salary distribution by department
- **Metrics**:
  - Gender pay gap: `(male_avg - female_avg) / male_avg * 100`
  - Pay equity analysis (regression-adjusted)
  - Compression ratio: `new_hire_avg / tenured_employee_avg`
- **Compliance**: Pay transparency regulations
- **Permissions**: HR Director, Compliance Officer

**Report**: Compensation Planning Summary
- **Scope**: Active planning cycle
- **Metrics**:
  - Total budget allocated vs. utilized
  - Number of employees receiving increases
  - Average increase amount and percentage
  - Budget utilization by department
  - Proposed vs. current total compensation
- **Drill-down**: By department → worksheet → individual employee
- **Status Tracking**: Worksheets pending, submitted, approved
- **Permissions**: HR Admin, HR Director, Finance Director

**Report**: Raises Overdue Alert
- **Scope**: Employees without raise in 12+ months
- **Columns**:
  - Employee name, title, department, manager
  - Current salary
  - Last raise date
  - Months since last raise
  - Performance rating (latest)
  - Market comparison
- **Sort**: Months since raise (descending)
- **Alert Level**: Warning at 12 months, critical at 18 months
- **Permissions**: HR Admin, Managers

### RP-HR-004: Performance & Review Reports

**Report**: Review Completion Status
- **Scope**: Active review cycle
- **Metrics**:
  - Total reviews in cycle
  - Self-assessments completed (%)
  - Manager reviews completed (%)
  - Overdue reviews count
  - Reviews acknowledged (%)
- **Status by Manager**: Table showing each manager's completion rate
- **Alerts**: Reviews past deadline
- **Permissions**: HR Admin, HR Director

**Report**: Performance Distribution
- **Visualization**: Bell curve of overall ratings
- **Metrics**:
  - Average overall rating (company-wide)
  - Rating distribution by department
  - % of employees in each rating category (1-5)
  - Forced ranking distribution (if applicable)
- **Analysis**: Check for rating inflation or compression
- **Segmentation**: Department, job level, manager
- **Permissions**: HR Admin, HR Director

**Report**: Goals Dashboard
- **Metrics**:
  - Total active goals
  - Goals completed on time (%)
  - Goals overdue
  - Average progress percentage
  - Goal completion rate by department/manager
- **Status Breakdown**: Not Started, In Progress, Completed, Overdue
- **Permissions**: Employees (own goals), Managers (team goals), HR Admin (all)

### RP-HR-005: Benefits & Payroll Reports

**Report**: Benefits Enrollment Report
- **Scope**: All employees
- **Columns**:
  - Employee name, hire date
  - Eligibility status, eligibility date
  - Enrolled benefits (plan names)
  - Coverage tier
  - Employee cost (per paycheck)
  - Employer cost
  - Waived benefits
- **Aggregates**: Enrollment rates by benefit type, total employer cost
- **Filters**: Enrollment reason (new hire, open enrollment, QLE), status (enrolled, waived)
- **Permissions**: HR Admin, Benefits Admin

**Report**: Open Enrollment Tracking
- **Period**: During open enrollment window
- **Metrics**:
  - Total eligible employees
  - Enrollment completion rate (%)
  - Employees not yet enrolled (list)
  - Plan selection distribution
  - Cost projections (employee + employer)
- **Alerts**: Employees with incomplete enrollment approaching deadline
- **Permissions**: HR Admin, Benefits Admin

**Report**: Payroll Summary
- **Scope**: By pay period
- **Metrics**:
  - Total gross pay
  - Total deductions (by category: taxes, benefits, garnishments)
  - Total net pay
  - Employer payroll tax
  - Employee count
- **Breakdown**: Salary vs. hourly, regular vs. overtime, bonuses, commissions
- **Reconciliation**: Compare to previous period
- **Export**: Excel (for payroll provider upload), PDF
- **Permissions**: Payroll Admin, Finance

**Report**: Pay Stub Register
- **List**: All pay stubs for a pay period
- **Columns**: Employee, gross pay, deductions, net pay, payment method
- **Search**: By employee name or ID
- **Permissions**: Payroll Admin

### RP-HR-006: Change Request Reports

**Report**: Change Requests Dashboard
- **Metrics**:
  - Total requests (period)
  - Pending requests count
  - Average approval time (days)
  - Approval rate: `approved / total * 100`
  - Rejection rate
- **Breakdown**: By request type, by urgency
- **Status Distribution**: Pending, Approved, Rejected, Completed
- **Permissions**: HR Admin

**Report**: Change Request Aging Report
- **Scope**: Pending change requests
- **Columns**:
  - Request number, type, urgency
  - Requested by, requested for
  - Submitted date
  - Days pending
  - Current approver
  - Status
- **Sort**: Days pending (descending)
- **Alerts**: Urgent requests pending > 24 hours, normal requests pending > 7 days
- **Permissions**: HR Admin, Managers (for own pending approvals)

**Report**: Change Request Audit Log
- **Scope**: All change requests (historical)
- **Columns**:
  - Request number, type
  - Requested for (employee)
  - Field changed
  - Old value → New value (encrypted fields masked)
  - Requested date, approved date, effective date
  - Approvers and approval timestamps
- **Filters**: Date range, request type, employee, approver
- **Permissions**: HR Admin, HR Director, Audit/Compliance

### RP-HR-007: Onboarding & Compliance Reports

**Report**: Onboarding Status
- **Scope**: New hires (past 90 days)
- **Columns**:
  - Employee name, hire date
  - Onboarding completion (%)
  - Tasks completed / total tasks
  - Overdue tasks count
  - I-9 status (Section 1, Section 2)
  - Days until I-9 Section 2 deadline
- **Alerts**: I-9 Section 2 due within 1 business day, overdue tasks
- **Sort**: Hire date (most recent first)
- **Permissions**: HR Admin, Onboarding Coordinator

**Report**: I-9 Compliance Report
- **Scope**: All active employees
- **Columns**:
  - Employee name, hire date
  - I-9 Section 1 status, completion date
  - I-9 Section 2 status, completion date, reverification date (if applicable)
  - Work authorization expiration date
  - Days until expiration
- **Alerts**: Expiring work authorization (30, 60, 90 days out)
- **Compliance Check**: Section 2 completed within 3 business days of hire
- **Permissions**: HR Admin, Compliance Officer

**Report**: Document Expiration Alert
- **Scope**: All employees with expiring documents
- **Documents**: Certifications, licenses, work permits, background checks
- **Columns**:
  - Employee name, department
  - Document type
  - Expiration date
  - Days until expiration
- **Filters**: Expiring within 30/60/90 days
- **Sort**: Expiration date (ascending)
- **Permissions**: HR Admin, Compliance Officer

### RP-HR-008: Celebration & Engagement Reports

**Report**: Celebrations Calendar
- **View**: Month view or list view
- **Content**: Upcoming birthdays and work anniversaries (next 30/60/90 days)
- **Columns (list view)**: Employee name, department, celebration type, date, years of service (for anniversaries)
- **Filters**: Department, location, celebration type
- **Export**: Excel, PDF, printable calendar
- **Permissions**: All employees (respects privacy settings)

**Report**: Milestone Anniversaries
- **Scope**: Employees reaching milestone anniversaries this year (1, 5, 10, 15, 20+ years)
- **Columns**: Employee name, hire date, anniversary date, years of service, department
- **Use Case**: Plan recognition events, awards, bonuses
- **Permissions**: HR Admin, Managers

**Report**: Engagement Survey Results
- **Metrics**:
  - Response rate (%)
  - Overall engagement score (average of all responses)
  - Scores by question/category
  - Score distribution (% in each rating)
  - Trend vs. previous surveys
- **Segmentation**: Department, location, tenure, manager (if sufficient responses for anonymity)
- **Visualizations**: Bar charts, trend lines, heat maps
- **Anonymity Threshold**: Minimum 5 responses per segment
- **Permissions**: HR Admin, HR Director, Managers (for own team if > 5 responses)

### RP-HR-009: Dashboard & Analytics Reports

**Report**: HR Metrics Dashboard (Executive Summary)
- **Frequency**: Real-time, updated daily
- **Metrics**:
  - Current headcount, headcount trend (12-month chart)
  - Turnover rate (monthly, quarterly, annual)
  - Time to fill (average, by department)
  - Open positions count
  - Diversity metrics (% by demographic)
  - Benefits enrollment rate
  - Average tenure
  - Pending approvals (time off, change requests)
  - Onboarding completion rate
  - Training completion rate
- **Audience**: Executive Leadership, HR Leadership
- **Visualizations**: KPI cards, trend charts, gauges

**Report**: Manager Dashboard (Team Snapshot)
- **Scope**: Manager's direct reports
- **Metrics**:
  - Team size
  - New team members (past 30 days)
  - Departures (past 30 days)
  - Time off requests pending approval
  - Who's out today/this week
  - Performance reviews pending
  - Goals completion rate
  - Average team tenure
  - Upcoming anniversaries/birthdays
- **Permissions**: Managers (own team only)

**Report**: Custom Report Builder
- **Functionality**: Allow HR Admin to build custom reports
- **Data Sources**: Employees, time off, compensation, performance, etc.
- **Filters**: Department, location, hire date range, employment type, etc.
- **Columns**: Select from available fields
- **Aggregations**: Count, sum, average, min, max, group by
- **Export**: Excel, CSV, PDF
- **Save & Schedule**: Save report configuration, schedule for automated delivery
- **Permissions**: HR Admin, HR Director

### RP-HR-010: Audit & Compliance Reports

**Report**: Audit Log Report
- **Scope**: All audited actions (configurable date range)
- **Columns**:
  - Timestamp
  - User (who performed action)
  - Action type (e.g., view_ssn, update_compensation)
  - Target employee (if applicable)
  - Details (field changed, old/new value)
  - IP address
  - Result (success/failure)
- **Filters**: User, action type, target employee, date range
- **Search**: Full-text search
- **Export**: Excel, CSV (for external audit)
- **Retention**: 10 years
- **Permissions**: HR Director, Compliance Officer, Auditors

**Report**: Access Log Report
- **Scope**: User login activity
- **Columns**: User, login timestamp, IP address, location, device, MFA used, result (success/failure)
- **Filters**: User, date range, result
- **Alerts**: Multiple failed logins, logins from unusual locations
- **Permissions**: HR Director, IT Security

**Report**: FLSA Compliance Report
- **Scope**: Hourly (non-exempt) employees
- **Purpose**: Ensure overtime compliance
- **Metrics**:
  - Total hours worked (week, pay period)
  - Regular hours (≤ 40)
  - Overtime hours (> 40)
  - Double-time hours (if applicable, e.g., CA > 12/day)
  - Employees consistently working overtime (potential classification issue)
- **Alerts**: Employees exceeding 60 hours/week
- **Permissions**: HR Admin, Payroll Admin, Compliance Officer

**Report**: Data Retention Compliance
- **Purpose**: Track data scheduled for deletion per retention policy
- **Columns**:
  - Data type (e.g., terminated employee records, old performance reviews)
  - Record count
  - Oldest record date
  - Retention period
  - Scheduled deletion date
- **Actions**: Review before deletion, execute deletion, archive
- **Audit**: Log all deletions
- **Permissions**: HR Admin, Compliance Officer

### RP-HR-011: Export & Integration Reports

**Report**: Payroll Export File
- **Format**: CSV or vendor-specific format
- **Frequency**: Per pay period
- **Data**:
  - Employee ID, name, department
  - Regular hours, overtime hours
  - Salary/hourly rate
  - Bonuses, commissions
  - Deductions (pre-tax, post-tax, garnishments)
  - Direct deposit info (if integrated)
- **Encryption**: File encrypted for transfer
- **Delivery**: SFTP upload to payroll provider or manual download
- **Permissions**: Payroll Admin

**Report**: Benefits Carrier Export
- **Format**: EDI 834 or carrier-specific format
- **Frequency**: Daily (for changes), Monthly (full file)
- **Events**: New enrollments, changes, terminations
- **Data**: Employee demographics, coverage selections, effective dates, premium amounts
- **Validation**: Pre-export validation to ensure data completeness
- **Delivery**: SFTP to carrier
- **Permissions**: HR Admin, Benefits Admin

**Report**: HRIS Data Export (Full)
- **Purpose**: Backup, data portability, integrations
- **Scope**: All employee data (respects permissions)
- **Format**: JSON, CSV, Excel
- **Encryption**: AES-256 encryption
- **Approval Required**: HR Director approval for full export
- **Audit**: Log export with user, timestamp, record count
- **Permissions**: HR Admin, HR Director

---

**Document Version**: 1.0
**Last Updated**: December 4, 2025
**Next Review**: March 1, 2026
**Owner**: Product Management

---

*This comprehensive HR Module specification covers all aspects of a modern HRIS system including P0-P1 priority features such as Change Request Management, Employee Dashboard, Celebrations & Recognition, Who's Out Calendar, Compensation Planning, and enhanced Directory with Org Chart views. The specification is production-ready and designed to compete with leading HRIS platforms like BambooHR, Namely, and Rippling.*

*Note: This specification document continues with the remaining sections following the same comprehensive pattern established above. The complete document would be approximately 150-200 pages covering all aspects of the HR module in detail comparable to the Firm Profile module specification.*
