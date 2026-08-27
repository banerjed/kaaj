# Missing Functionality Analysis

This document compares the product specification against existing HTML mockups to identify which functionality is not yet visualized.

**Analysis Date:** December 26, 2025
**Product Spec Version:** 1.3 (December 21, 2025)

---

## Existing Mockups Coverage

### ✅ Fully Represented Modules

1. **Dashboard** (`dashboard.html`)
   - Stats overview cards
   - Upcoming time off
   - Recent activity feed
   - Quick actions
   - Department summary

2. **Employee Management** (`employees.html`)
   - Employee list with filters
   - Search and pagination
   - List/grid view toggle
   - Bulk selection

3. **Employee Profile** (`employee-detail.html`)
   - Profile header with photo
   - Tab navigation structure
   - Collapsible sections (progressive disclosure)
   - Employment details
   - Quick stats sidebar

4. **Payroll Processing** (`payroll.html`)
   - Payroll summary
   - Deduction breakdown
   - Pre-processing checklist
   - Confirmation modals
   - Warning alerts

5. **Time Off Management** (`time-off.html`)
   - Approval workflow
   - Request cards with details
   - Conflict warnings
   - Request time off modal
   - Multi-tab filtering

6. **Ticketing System** (`tickets.html`)
   - Ticket list with severity badges
   - Status indicators
   - Category filtering
   - SLA tracking
   - Multi-business area support

7. **Project Management** (`projects.html`)
   - Kanban board layout
   - Task cards with priorities
   - Progress indicators
   - View switcher (Kanban/List/Gantt)

8. **Time Tracking** (`time-tracking.html`)
   - Active timer display
   - Timesheet grid
   - Billable vs non-billable designation
   - Week navigation
   - Approval workflow

---

## ❌ Missing Mockups by Priority

### High Priority - Phase 1 Core Modules

#### 1. **Firm Profile / Settings**
**Module**: Firm Profile Module
**Priority**: Critical (Phase 1 foundation)

**Missing Screens:**
- Company information and branding settings
- Multi-location office management
- Department hierarchy editor
- Employee titles and role definitions
- Payroll policies configuration
- Benefits package templates
- Holiday calendar management

**Why Important:**
- Foundation for all other modules
- Required for proper organizational structure
- Needed for payroll and HR module configuration

**Spec Reference:** `module-firm-profile.md`

---

#### 2. **Change Request Form**
**Module**: Change Requests Module
**Priority**: High (Phase 1 employee self-service)

**Missing Screens:**
- Change request submission form with types:
  - Personal information changes
  - Tax & payroll changes (W-4, direct deposit)
  - Benefits changes
  - Work arrangement changes
  - Asset & equipment requests
  - Training & development requests
- Approval workflow visualization
- Document upload interface
- Request status tracking
- Approval/rejection interface for managers

**Why Important:**
- Core self-service functionality for employees
- Reduces HR administrative burden
- Demonstrates approval workflow patterns

**Spec Reference:** `module-change-requests.md`

---

#### 3. **Compensation Details**
**Module**: Compensation Module
**Priority**: High (Phase 1 HR core)

**Missing Screens:**
- Comprehensive compensation breakdown view
- Base compensation configuration (salary, hourly, commission)
- Variable compensation (bonuses, commissions)
- Equity compensation details (stock options, RSUs, vesting schedules)
- Allowances & stipends configuration
- Shift differentials and premiums
- Multi-currency support interface
- Compensation history timeline
- FTE calculation display

**Why Important:**
- Critical for payroll processing
- Required for complete employee profiles
- Complex module that benefits from UI visualization

**Spec Reference:** `module-compensation.md`

---

#### 4. **Performance Review**
**Module**: HR Module - Performance Management
**Priority**: High (Phase 1 HR core)

**Missing Screens:**
- Review form interface with rating scales
- Goal setting and tracking
- Feedback collection (360-degree feedback)
- Self-assessment forms
- Manager review forms
- Review cycle management
- Performance improvement plans (PIP)
- Historical review timeline

**Why Important:**
- Core HR functionality
- Annual/quarterly process requiring clear UX
- Demonstrates form complexity and workflows

**Spec Reference:** `module-hr.md` (Performance Reviews section)

---

### Medium Priority - Phase 1B Service Provider Suite

#### 5. **CRM / Sales Pipeline**
**Module**: CRM Module
**Priority**: Medium (Phase 1B)

**Missing Screens:**
- Lead list with scoring
- Visual pipeline with drag-and-drop stages
- Deal/opportunity cards
- Lead capture forms
- Activity tracking (calls, emails, meetings)
- Pipeline analytics dashboard
- Lead → Opportunity → Deal → Project workflow
- Contact management

**Why Important:**
- Core service provider functionality
- Demonstrates drag-and-drop interactions
- Shows integration with projects and proposals

**Spec Reference:** `service-provider-modules-overview.md`

---

#### 6. **Proposals & Contracts**
**Module**: Proposals, Estimates & Contract Management
**Priority**: Medium (Phase 1B)

**Missing Screens:**
- Proposal builder interface (drag-and-drop)
- Service catalog browser
- Contract template editor
- E-signature workflow (DocuSign-style)
- Version control and revision tracking
- Approval workflow for proposals
- Proposal → Project conversion flow
- Multi-currency pricing tables

**Why Important:**
- Critical service provider workflow
- Demonstrates complex document creation
- Shows integration with projects and billing

**Spec Reference:** `service-provider-modules-overview.md`

---

#### 7. **Client Portal**
**Module**: Client Portal
**Priority**: Medium (Phase 1B)

**Missing Screens:**
- Client login and dashboard
- Project progress view (client-facing)
- Document download/upload interface
- Invoice viewing and payment
- Support ticket submission (client view)
- Communication center
- Contract and proposal access

**Why Important:**
- Demonstrates external-facing UI
- Shows white-label/branding capabilities
- Different user type (client vs employee)

**Spec Reference:** `service-provider-modules-overview.md`

---

#### 8. **Document Management**
**Module**: Document Management
**Priority**: Medium (Phase 1B)

**Missing Screens:**
- File browser with folder structure
- Document preview pane
- Version history view
- Permission control interface
- Upload with drag-and-drop
- Full-text search results
- Document tagging interface
- Storage quota visualization

**Why Important:**
- Common pattern across many apps
- Demonstrates file handling and organization
- Shows permission complexity

**Spec Reference:** `service-provider-modules-overview.md`

---

#### 9. **Retainer / Recurring Project Management**
**Module**: Retainer Management
**Priority**: Medium (Phase 1B)

**Missing Screens:**
- Retainer agreement setup
- Usage vs allocated hours visualization
- Retainer balance tracking dashboard
- Hour bank management
- Overage alerts and billing
- Recurring task generation interface
- Retainer performance analytics

**Why Important:**
- Unique to service providers
- Demonstrates recurring billing patterns
- Shows usage tracking and alerts

**Spec Reference:** `service-provider-modules-overview.md`

---

### Lower Priority - Phase 2 Future Modules

#### 10. **Recruiting / ATS**
**Module**: Recruiting Module
**Priority**: Low (Phase 2)

**Missing Screens:**
- Job requisition creation
- Applicant tracking board (Kanban-style)
- Resume/CV review interface
- Interview scheduling calendar
- Candidate evaluation forms
- Offer letter generation
- Integration with employee onboarding

**Why Important:**
- Common HR need
- Similar to ticketing/project Kanban patterns
- Shows hiring funnel visualization

**Spec Reference:** Product spec Phase 2 section

---

#### 11. **Accounting Module**
**Module**: Accounting
**Priority**: Low (Phase 2)

**Missing Screens:**
- Chart of accounts browser
- General ledger view
- Accounts receivable dashboard
- Financial reports (P&L, Balance Sheet, Cash Flow)
- Journal entry forms
- Multi-entity/multi-currency support
- Budget vs actual comparison

**Why Important:**
- Complex financial module
- Required for complete business management
- Shows advanced reporting and analytics

**Spec Reference:** `module-accounting.md`

---

#### 12. **Expense Management**
**Module**: Expense Management
**Priority**: Low (Phase 2)

**Missing Screens:**
- Expense report creation
- Receipt upload/capture (mobile-first)
- Expense approval workflow
- Policy compliance checking
- Reimbursement tracking
- Corporate card reconciliation
- Mileage calculator

**Why Important:**
- Common employee self-service feature
- Mobile-first design considerations
- Shows approval workflows

**Spec Reference:** Product spec Phase 2 section

---

#### 13. **Accounts Payable**
**Module**: Accounts Payable
**Priority**: Low (Phase 2)

**Missing Screens:**
- Vendor management list
- Invoice capture interface (OCR)
- Three-way matching (PO, receipt, invoice)
- Payment scheduling calendar
- Approval workflow
- 1099 vendor tracking
- Payment batch processing

**Why Important:**
- Complements accounting module
- Shows invoice processing workflows
- Demonstrates OCR and automation

**Spec Reference:** Product spec Phase 2 section

---

## 🔧 Partially Represented Features

### AI Assistant
**Status**: Placeholder only
**What Exists**: Chatbot icon in bottom-right corner (all pages)
**What's Missing**:
- Expanded chat window with conversation history
- Multi-turn conversation interface
- Contextual suggestions and quick actions
- File attachment handling
- Voice input interface
- Integration demonstrations with actual module actions

**Spec Reference:** `module-ai-assistant.md`

---

### Employee Profile Tabs
**Status**: Structure exists, content incomplete
**What Exists**: Tab navigation structure in `employee-detail.html`
**What's Missing**:
- Compensation tab content (full compensation breakdown)
- Time Off tab content (PTO balance, history)
- Performance tab content (review history, goals)
- Documents tab content (employee documents, forms)

---

### HR Management
**Status**: Navigation link only
**What Exists**: Link in sidebar navigation
**What's Missing**: Entire module interface covering:
- Onboarding workflows
- Offboarding processes
- Benefits enrollment
- Attendance tracking
- Document management
- Compliance reporting

**Spec Reference:** `module-hr.md`

---

## 📊 Coverage Summary

### By Phase

| Phase | Total Modules | Mockups Complete | Mockups Partial | Missing |
|-------|--------------|------------------|-----------------|---------|
| Phase 1 Core | 8 | 4 (50%) | 1 (12.5%) | 3 (37.5%) |
| Phase 1B Service | 7 | 2 (29%) | 0 (0%) | 5 (71%) |
| Phase 2 Future | 4 | 0 (0%) | 0 (0%) | 4 (100%) |
| **Total** | **19** | **6 (32%)** | **1 (5%)** | **12 (63%)** |

### By Priority

| Priority | Missing Mockups | Examples |
|----------|----------------|----------|
| High | 4 | Firm Settings, Change Requests, Compensation, Performance |
| Medium | 5 | CRM, Proposals, Client Portal, Documents, Retainer |
| Low | 4 | Recruiting, Accounting, Expenses, AP |

---

## 🎯 Recommended Next Steps

### Immediate (Complete Phase 1)

1. **Firm Settings** - Critical foundation module
2. **Change Request Form** - Key self-service feature
3. **Compensation Details** - Required for payroll integration
4. **Performance Review** - Core HR functionality

### Short Term (Phase 1B Core)

5. **CRM / Pipeline** - Service provider essential
6. **Proposals** - Service provider essential
7. **Client Portal** - External user experience

### Medium Term (Phase 1B Complete)

8. **Document Management** - Universal need
9. **Retainer Management** - Service provider specific

### Long Term (Phase 2)

10. **Recruiting** - HR expansion
11. **Accounting** - Financial management
12. **Expenses** - Employee self-service
13. **AP** - Financial operations

---

## 📝 Design Patterns to Demonstrate

The missing mockups would help showcase these UX patterns not yet visualized:

1. **Organizational Hierarchy Editor** (Firm Settings - Department structure)
2. **Multi-Step Form Wizard** (Change Requests - complex submission)
3. **Document Builder** (Proposals - drag-and-drop editor)
4. **External User Portal** (Client Portal - different UI paradigm)
5. **File Manager** (Document Management - tree view + preview)
6. **Visual Pipeline Editor** (CRM - drag-and-drop stages)
7. **Usage Tracking Dashboard** (Retainer - gauges and alerts)
8. **Calendar-Based Scheduling** (Recruiting - interview scheduling)
9. **Financial Reports** (Accounting - P&L, Balance Sheet)
10. **Mobile-First Capture** (Expenses - receipt photos)

---

**Last Updated:** December 26, 2025
**Next Review:** After completing Phase 1 priority mockups
