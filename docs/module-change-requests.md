# Employee Change Request System Specification

## Overview
The Change Request System enables employees to submit requests for changes to their personal information, benefits, and employment records through a self-service portal. Requests follow an approval workflow before being applied to the employee profile, ensuring proper authorization and audit trails.

## Purpose
- **Employee Self-Service**: Empower employees to request profile updates without direct HR intervention
- **Approval Workflows**: Ensure changes are reviewed and approved by appropriate personnel
- **Audit Trail**: Maintain complete history of requested changes and approval decisions
- **Compliance**: Support regulatory requirements for data change tracking
- **Efficiency**: Reduce HR administrative burden for routine changes

## Request Types

### 1. Personal Information Changes
Changes to core identity and contact information:
- Name change (legal name, preferred name)
- Contact information (email, phone, address)
- Emergency contacts (add, update, remove)
- Marital status change
- Dependent information

**Approval Required**: Yes (HR Admin)
**Supporting Documents**: May require (e.g., marriage certificate, court order for name change)

### 2. Tax & Payroll Changes
Changes to tax withholding and payment information:
- Tax withholding (W-4 in US, equivalent elsewhere)
- Direct deposit information
- Payment allocation across accounts

**Approval Required**: Yes (Payroll Admin)
**Supporting Documents**: Required (voided check, bank letter)

### 3. Benefits Changes
Enrollment and changes to benefits:
- Health insurance enrollment/changes
- Retirement plan contributions
- Life insurance beneficiaries
- FSA/HSA elections

**Approval Required**: Yes (Benefits Admin)
**Timing Restrictions**: May only be allowed during open enrollment or qualifying life events

### 4. Work Arrangement Changes
Changes to work schedule and location:
- Remote work request
- Flexible schedule request
- Office location change
- Work hours modification

**Approval Required**: Yes (Manager + HR Admin)
**Effective Date**: Future date typically required

### 5. Profile & Social Changes
Changes to social/public profile information:
- Profile picture
- Pronouns
- Bio/introduction
- Hobbies and interests
- Affinity group membership

**Approval Required**: No (Self-service, immediate)
**Exception**: Changes are logged but applied immediately

### 6. Asset & Equipment Requests
Requests related to company assets:
- Request new equipment
- Report damaged/lost equipment
- Request equipment upgrade
- Equipment return (offboarding)

**Approval Required**: Yes (Manager + IT Admin)

### 7. Training & Development
Requests for training and certifications:
- Request training course enrollment
- Report external certification completion
- Request conference/event attendance

**Approval Required**: Yes (Manager + L&D Admin)
**Budget Check**: May require budget approval

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](../packages/database/reference/schema.sql) for complete data structures including:
- Core Request Structure (requestId, workflow, approvers)
- Change Object Structure (field-level changes with encryption support)
- Supporting Document Management (with encryption and retention policies)
- Workflow and approval chain structures
- Notification configuration

---

## Workflow States

### Request Status Flow

```
submitted → pending_approval → approved → applying → completed
                ↓
            rejected → closed
                ↓
            cancelled → closed
                ↓
            needs_revision → revised → pending_approval
```

**Status Definitions**:

1. **submitted**: Request has been created and submitted by employee
2. **pending_approval**: Waiting for approver action at current workflow step
3. **needs_revision**: Approver has requested changes/clarification
4. **revised**: Employee has resubmitted after making requested revisions
5. **approved**: All required approvals obtained
6. **applying**: System is applying changes to employee profile
7. **completed**: Changes successfully applied to profile
8. **rejected**: Request denied by an approver
9. **cancelled**: Employee or admin cancelled the request
10. **closed**: Terminal state (rejected or cancelled)

### Approval Workflow Patterns

#### Pattern 1: Single Approver
Simple changes requiring only one approval:
```
Employee → Manager → Auto-Apply
```

#### Pattern 2: Multi-Level Approval
Complex changes requiring multiple approvals:
```
Employee → Manager → HR Admin → Payroll Admin → Auto-Apply
```

#### Pattern 3: Parallel Approval
Changes requiring concurrent approvals:
```
Employee → [Manager + HR Admin] → Auto-Apply
```
(Both must approve before proceeding)

#### Pattern 4: Conditional Approval
Approval path depends on change details:
```
Employee → Manager
  ├─ If cost < $500 → Auto-Apply
  └─ If cost >= $500 → Finance Admin → Auto-Apply
```

## Request Categories

### Personal Information Categories
- `name_change`: Legal name, preferred name
- `contact_update`: Email, phone, address
- `emergency_contact`: Add/update/remove emergency contacts
- `marital_status`: Marital status change
- `dependent_info`: Dependent information

### Employment Categories
- `department_transfer`: Department change
- `location_change`: Office/remote location
- `schedule_change`: Work hours, flexible schedule
- `manager_change`: Reporting manager change

### Compensation & Benefits Categories
- `tax_withholding`: W-4 or equivalent
- `direct_deposit`: Bank account information
- `benefits_enrollment`: Health, dental, vision
- `retirement_contribution`: 401k, pension changes
- `beneficiary_update`: Life insurance beneficiaries

### Development Categories
- `training_request`: Request training course
- `certification_update`: Report new certification
- `conference_request`: Conference attendance

## Permissions & Access Control

### Role-Based Permissions

| Role | Submit Own | View Own | Cancel Own | View Team | Approve Team | View All | Approve All | Admin Config |
|------|------------|----------|------------|-----------|--------------|----------|-------------|--------------|
| **Employee** | ✓ | ✓ | ✓ | - | - | - | - | - |
| **Manager** | ✓ | ✓ | ✓ | ✓ | ✓ | - | - | - |
| **HR Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Payroll Admin** | - | - | - | - | Payroll only | ✓ | Payroll only | Payroll only |
| **Benefits Admin** | - | - | - | - | Benefits only | ✓ | Benefits only | Benefits only |
| **IT Admin** | - | - | - | - | Asset only | ✓ | Asset only | Asset only |

### Field-Level Restrictions
Some fields may have additional restrictions:
- **SSN/Tax ID**: Only viewable by Payroll Admin and HR Admin
- **Salary Information**: Only viewable by HR Admin and employee's chain of command
- **Medical Information**: Only viewable by Benefits Admin and employee
- **Performance Data**: Only viewable by Manager, HR Admin, and employee

## Supporting Documents

### Document Management

See [schema.sql](../packages/database/reference/schema.sql) for the complete document structure including encryption details, virus scanning, and retention policies.

### Supported Document Types
- **Identity Documents**: Passport, driver's license, government ID
- **Legal Documents**: Marriage certificate, divorce decree, court orders
- **Financial Documents**: Voided check, bank letter, tax forms
- **Medical Documents**: Doctor's note, disability documentation
- **Educational Documents**: Diploma, transcript, certification
- **Other**: General supporting documentation

### Document Requirements by Request Type
- **Name Change**: Marriage certificate, divorce decree, or court order
- **Direct Deposit**: Voided check or bank letter
- **Benefits Enrollment**: Dependent documentation (birth certificates, etc.)
- **Work Arrangement**: None typically, but may require documentation for ADA accommodations

## Validation Rules

### Pre-Submission Validation
Before a request can be submitted:
1. **Required Fields**: All required fields must be filled
2. **Format Validation**: Email, phone, dates follow correct formats
3. **Business Rules**: Effective dates not in the past (for future changes)
4. **Supporting Documents**: Required documents are attached
5. **Change Uniqueness**: No duplicate pending requests for same field

### Approval Validation
Before an approver can approve:
1. **Approver Authorization**: Approver has permission for this request type
2. **No Conflicts**: No conflicting pending requests
3. **Data Integrity**: Proposed values pass validation rules
4. **Effective Date**: Effective date is valid

### Application Validation
Before changes are applied:
1. **All Approvals**: All required approvals obtained
2. **Data Consistency**: Proposed changes still valid
3. **No Superseded Requests**: No newer request supersedes this one
4. **Effective Date Reached**: Current date >= effective date (for scheduled changes)

## Notifications

### Notification Events

1. **Request Submitted**
   - To: Employee (confirmation), Approvers (action required)
   - Content: Request summary, link to review

2. **Approval Granted**
   - To: Employee (status update), Next approver (action required)
   - Content: Who approved, comments, next steps

3. **Request Rejected**
   - To: Employee, Submitter's manager (if different)
   - Content: Who rejected, reason, next steps

4. **Revision Needed**
   - To: Employee
   - Content: What needs revision, approver comments

5. **Request Completed**
   - To: Employee, All approvers, HR Admin
   - Content: Confirmation of applied changes

6. **Request Cancelled**
   - To: Employee, Pending approvers
   - Content: Cancellation reason

### Notification Channels
- **Email**: Primary notification method
- **In-App**: Notification center in employee portal
- **SMS**: For urgent/time-sensitive requests (optional)
- **Slack/Teams**: Integration with collaboration tools (optional)

## API Endpoints

### Request Management

```
POST   /api/v1/change-requests
- Submit new change request
- Request body: request details, changes, documents
- Returns: requestId, status, workflow details

GET    /api/v1/change-requests
- List change requests
- Query params: status, requestType, employeeId, dateRange
- Returns: paginated list of requests

GET    /api/v1/change-requests/{requestId}
- Get single change request
- Returns: full request details with workflow status

PATCH  /api/v1/change-requests/{requestId}
- Update request (before approval, or for revisions)
- Request body: updated fields
- Returns: updated request

DELETE /api/v1/change-requests/{requestId}
- Cancel request
- Only allowed if status is submitted or pending_approval
- Returns: cancellation confirmation
```

### Approval Actions

```
POST   /api/v1/change-requests/{requestId}/approve
- Approve a request at current workflow step
- Request body: { "comments": "optional comments" }
- Returns: updated request with new workflow status

POST   /api/v1/change-requests/{requestId}/reject
- Reject a request
- Request body: { "reason": "rejection reason", "comments": "details" }
- Returns: updated request with rejected status

POST   /api/v1/change-requests/{requestId}/request-revision
- Request employee to revise and resubmit
- Request body: { "revisionNeeded": "what to revise", "comments": "details" }
- Returns: updated request with needs_revision status
```

### Document Management

```
POST   /api/v1/change-requests/{requestId}/documents
- Upload supporting document
- Request body: multipart/form-data
- Returns: documentId, upload confirmation

GET    /api/v1/change-requests/{requestId}/documents/{documentId}
- Download document
- Returns: file binary with appropriate headers

DELETE /api/v1/change-requests/{requestId}/documents/{documentId}
- Delete document (before request approval)
- Returns: deletion confirmation
```

### Bulk Operations

```
GET    /api/v1/change-requests/pending-approvals
- Get all requests pending current user's approval
- Returns: list of requests requiring action

POST   /api/v1/change-requests/bulk-approve
- Approve multiple requests at once
- Request body: array of requestIds with comments
- Returns: bulk operation results
```

## Security Considerations

### Data Protection
- **Encryption**: All PII in change requests encrypted at rest
- **Document Encryption**: Supporting documents encrypted using organization key
- **Transmission**: All API calls use TLS 1.3+
- **Access Logs**: All access to change requests logged for audit

### Authorization
- **Employee Isolation**: Employees can only view/submit their own requests
- **Manager Scope**: Managers can only approve for direct reports
- **Admin Controls**: HR/Payroll admins have broader access, logged extensively
- **Approval Authority**: Approvers validated against current organizational structure

### Audit Trail
- **Immutable Log**: All request actions logged and cannot be modified
- **Change History**: Complete history of request from submission to completion
- **Document Retention**: Supporting documents retained per compliance requirements
- **GDPR Compliance**: Support for data export and right to erasure

## Business Rules

### General Rules
1. **One Active Request**: Employee can have only one active request per field/category
2. **Future Effective Dates**: Changes with future effective dates scheduled for automatic application
3. **Retroactive Changes**: Retroactive changes require special approval (Org Admin)
4. **Withdrawal**: Employee can withdraw request before final approval
5. **Superseding Requests**: Newer approved request supersedes older pending request

### Request-Specific Rules

#### Name Changes
- Require legal documentation
- Update all systems simultaneously
- Notify all relevant parties
- Update email aliases if applicable

#### Tax/Payroll Changes
- Effective next pay period or future pay period
- Cannot be retroactive without payroll admin override
- Validate account numbers with checksum

#### Benefits Changes
- Must occur during open enrollment or qualifying life event
- Qualifying events must be documented within 30 days
- Changes effective first of following month

#### Work Arrangement Changes
- Require manager approval minimum 2 weeks in advance
- Remote work may require equipment provisioning
- Location changes may affect tax jurisdiction

## Integration Requirements

### Employee Profile Integration
- Changes applied directly to employee profile after approval
- Field-level encryption maintained
- Audit trail linked to profile change history

### Payroll System Integration
- Tax withholding changes sync to payroll system
- Direct deposit changes validated and synced
- Effective dates aligned with pay periods

### Benefits System Integration
- Enrollment changes sync to benefits provider
- Beneficiary updates synced in real-time
- Qualifying life events trigger benefits system workflows

### IT Systems Integration
- Asset requests create tickets in IT system
- Equipment provisioning triggered automatically
- Email/access changes synced to identity management

### Notification Systems Integration
- Email service for notifications
- Slack/Teams for real-time updates
- SMS gateway for urgent notifications

## Reporting & Analytics

### Standard Reports
1. **Pending Approvals Report**: All requests awaiting approval, by approver
2. **Request Volume Report**: Count of requests by type, status, time period
3. **Approval Metrics**: Average time to approval, approval/rejection rates
4. **Employee Activity**: Requests submitted per employee, frequency
5. **Compliance Report**: Audit trail for specific request types

### Analytics & Insights
- **Bottleneck Analysis**: Identify slow approval steps
- **Request Patterns**: Common request types, seasonal trends
- **Approval Velocity**: Track time from submission to completion
- **Rejection Analysis**: Common rejection reasons, improvement opportunities

## Implementation Phases

### Phase 1: Core Functionality (MVP)
- Basic request submission and approval workflow
- Personal information and contact changes
- Single-level approval workflows
- Email notifications
- Basic audit logging

### Phase 2: Enhanced Workflows
- Multi-level and parallel approval workflows
- Conditional approval routing
- Benefits and payroll change requests
- Document management with encryption
- Enhanced notifications (in-app, SMS)

### Phase 3: Advanced Features
- Custom workflows per organization
- Integration with external systems (payroll, benefits)
- Advanced analytics and reporting
- Mobile app support
- Automated compliance checks

### Phase 4: AI & Automation
- Smart routing based on request content
- Automated document verification
- Predictive approval recommendations
- Chatbot for request assistance
- Anomaly detection for fraud prevention

## Compliance & Legal

### Regulatory Requirements
- **GDPR**: Support data portability and erasure requests
- **SOX**: Maintain immutable audit trails for public companies
- **HIPAA**: Protect medical information in benefits changes
- **PCI DSS**: Secure handling of payment card data (if applicable)

### Data Retention
- **Active Requests**: Retained indefinitely while active
- **Completed Requests**: 7 years retention standard
- **Rejected/Cancelled**: 3 years retention
- **Supporting Documents**: Same retention as request
- **Audit Logs**: Minimum 10 years

### Legal Holds
- Support for legal hold on specific requests
- Prevent deletion during active litigation
- Maintain chain of custody for documents

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-03 | Initial specification |
