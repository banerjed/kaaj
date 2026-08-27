# Module: Time Tracking & Timesheet Billing

**Version:** 1.0
**Last Updated:** 2025-12-06
**Module ID:** `time_tracking`
**Dependencies:** `project_management`, `employee_profile`, `accounting`, `client_portal`

---

## Overview

Comprehensive time tracking and timesheet management system for service providers. Features include start/stop timers, billable vs non-billable hour tracking, approval workflows, and automatic conversion of approved hours into client invoices.

### Key Features

✅ **Real-Time Tracking** - Start/stop timers with automatic duration calculation
✅ **Manual Time Entry** - Log time retrospectively with detailed descriptions
✅ **Billable Hours** - Distinguish billable vs non-billable time
✅ **Multi-Level Approvals** - Manager and client approval workflows
✅ **Auto-Invoicing** - Convert approved hours directly to invoices
✅ **Rate Management** - Employee rates, project rates, client rates with overrides
✅ **Timesheet Views** - Daily, weekly, monthly views with calendar integration
✅ **Mobile Support** - Track time on-the-go with mobile apps
✅ **Expense Tracking** - Log billable expenses alongside time
✅ **Reporting** - Utilization, profitability, and billing reports

---

## Database Schema

### Time Entries Table

```sql
CREATE TABLE time_entries (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Employee
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Project & Task
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id),

    -- Time Details
    entry_date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,

    -- Duration (calculated or manual)
    duration_minutes INTEGER,
    hours DECIMAL(8,2) NOT NULL, -- Calculated from duration or manual entry

    -- Entry Type
    entry_type VARCHAR(20) DEFAULT 'timer',
    -- 'timer', 'manual', 'imported', 'auto_generated'
    is_running BOOLEAN DEFAULT false, -- Timer currently active

    -- Description
    description TEXT NOT NULL,
    internal_notes TEXT, -- Not visible to client

    -- Billing
    is_billable BOOLEAN DEFAULT true,
    hourly_rate DECIMAL(10,2),
    amount DECIMAL(10,2), -- hours * hourly_rate
    currency VARCHAR(3) DEFAULT 'USD',

    -- Rate Source
    rate_source VARCHAR(50), -- 'employee_rate', 'project_rate', 'client_rate', 'task_rate', 'manual'

    -- Categorization
    activity_type VARCHAR(100),
    -- 'development', 'design', 'meeting', 'research', 'admin', 'qa', 'support'
    tags VARCHAR(50)[],

    -- Approval Workflow
    status VARCHAR(20) DEFAULT 'draft',
    -- 'draft', 'submitted', 'approved', 'rejected', 'invoiced', 'paid'

    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_to UUID REFERENCES employees(id), -- Approver

    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,

    -- Invoicing
    invoice_id UUID REFERENCES invoices(id),
    invoice_line_item_id UUID,
    invoiced_at TIMESTAMP WITH TIME ZONE,

    -- Locking (prevent changes after approval/invoicing)
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID REFERENCES employees(id),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),
    updated_by UUID REFERENCES employees(id),

    -- Constraints
    CONSTRAINT valid_time_range CHECK (
        (start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    ),
    CONSTRAINT valid_hours CHECK (hours >= 0 AND hours <= 24),
    CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 0)
);

-- Indexes
CREATE INDEX idx_time_entries_tenant ON time_entries(tenant_id);
CREATE INDEX idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX idx_time_entries_project ON time_entries(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_time_entries_task ON time_entries(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_time_entries_client ON time_entries(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_time_entries_date ON time_entries(entry_date);
CREATE INDEX idx_time_entries_status ON time_entries(status);
CREATE INDEX idx_time_entries_running ON time_entries(employee_id, is_running) WHERE is_running = true;
CREATE INDEX idx_time_entries_invoice ON time_entries(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_time_entries_tags ON time_entries USING GIN(tags);
```

### Timesheets Table

```sql
CREATE TABLE timesheets (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Employee
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Period
    period_type VARCHAR(20) NOT NULL, -- 'weekly', 'bi_weekly', 'monthly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Totals
    total_hours DECIMAL(10,2) DEFAULT 0.00,
    billable_hours DECIMAL(10,2) DEFAULT 0.00,
    non_billable_hours DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(15,2) DEFAULT 0.00,

    -- Entry Count
    entry_count INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'draft',
    -- 'draft', 'submitted', 'approved', 'rejected', 'partially_invoiced', 'fully_invoiced'

    -- Submission
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_to UUID REFERENCES employees(id),

    -- Approval
    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_employee_period UNIQUE(tenant_id, employee_id, period_start, period_end),
    CONSTRAINT valid_period CHECK (period_end > period_start)
);

CREATE INDEX idx_timesheets_tenant ON timesheets(tenant_id);
CREATE INDEX idx_timesheets_employee ON timesheets(employee_id);
CREATE INDEX idx_timesheets_period ON timesheets(period_start, period_end);
CREATE INDEX idx_timesheets_status ON timesheets(status);
```

### Timesheet Entries (Join Table)

```sql
CREATE TABLE timesheet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,

    -- Snapshot at submission time (prevent retroactive changes)
    hours_at_submission DECIMAL(8,2),
    amount_at_submission DECIMAL(10,2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_timesheet_entry UNIQUE(timesheet_id, time_entry_id)
);

CREATE INDEX idx_timesheet_entries_timesheet ON timesheet_entries(timesheet_id);
CREATE INDEX idx_timesheet_entries_time_entry ON timesheet_entries(time_entry_id);
```

### Hourly Rates Configuration

```sql
CREATE TABLE hourly_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Subject (priority order: task > project > client > employee > default)
    rate_type VARCHAR(50) NOT NULL,
    -- 'employee_default', 'employee_role', 'client', 'project', 'task', 'activity'

    -- References (only one should be set based on rate_type)
    employee_id UUID REFERENCES employees(id),
    role_id UUID REFERENCES roles(id),
    client_id UUID REFERENCES clients(id),
    project_id UUID REFERENCES projects(id),
    task_id UUID REFERENCES tasks(id),
    activity_type VARCHAR(100),

    -- Rate
    hourly_rate DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Effective Period
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,

    -- Billing Type
    is_billable BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES employees(id),

    CONSTRAINT valid_effective_period CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);

CREATE INDEX idx_hourly_rates_tenant ON hourly_rates(tenant_id);
CREATE INDEX idx_hourly_rates_employee ON hourly_rates(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_hourly_rates_client ON hourly_rates(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_hourly_rates_project ON hourly_rates(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_hourly_rates_effective ON hourly_rates(effective_from, effective_to);
```

### Billable Expenses

```sql
CREATE TABLE billable_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Employee
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Project
    project_id UUID REFERENCES projects(id),
    client_id UUID REFERENCES clients(id),

    -- Expense Details
    expense_date DATE NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100),
    -- 'travel', 'meals', 'software', 'hardware', 'supplies', 'mileage', 'other'

    -- Amount
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Markup
    markup_percentage DECIMAL(5,2) DEFAULT 0.00,
    markup_amount DECIMAL(10,2) DEFAULT 0.00,
    billable_amount DECIMAL(10,2) NOT NULL,

    -- Receipt
    has_receipt BOOLEAN DEFAULT false,
    receipt_attachment_id UUID REFERENCES document_storage(id),

    -- Billing
    is_billable BOOLEAN DEFAULT true,
    is_reimbursable BOOLEAN DEFAULT false, -- Employee reimbursement

    -- Status
    status VARCHAR(20) DEFAULT 'draft',
    -- 'draft', 'submitted', 'approved', 'rejected', 'invoiced', 'reimbursed'

    approved_by UUID REFERENCES employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,

    invoice_id UUID REFERENCES invoices(id),
    invoiced_at TIMESTAMP WITH TIME ZONE,

    reimbursed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_amount CHECK (amount >= 0),
    CONSTRAINT valid_markup CHECK (markup_percentage >= 0 AND markup_percentage <= 200)
);

CREATE INDEX idx_billable_expenses_tenant ON billable_expenses(tenant_id);
CREATE INDEX idx_billable_expenses_employee ON billable_expenses(employee_id);
CREATE INDEX idx_billable_expenses_project ON billable_expenses(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_billable_expenses_date ON billable_expenses(expense_date);
CREATE INDEX idx_billable_expenses_status ON billable_expenses(status);
```

---

## API Endpoints

### Time Entries

```
GET    /api/time-entries                    # List time entries (filtered by date range)
GET    /api/time-entries/:id                # Get time entry details
POST   /api/time-entries                    # Create manual time entry
PUT    /api/time-entries/:id                # Update time entry
DELETE /api/time-entries/:id                # Delete time entry (if not locked)

# Timer Controls
POST   /api/time-entries/start              # Start timer
POST   /api/time-entries/:id/stop           # Stop running timer
GET    /api/time-entries/running            # Get currently running timers

# Bulk Operations
POST   /api/time-entries/bulk-create        # Import multiple entries
PUT    /api/time-entries/bulk-update        # Update multiple entries
DELETE /api/time-entries/bulk-delete        # Delete multiple entries

# Status Changes
PATCH  /api/time-entries/:id/submit         # Submit for approval
PATCH  /api/time-entries/:id/approve        # Approve entry
PATCH  /api/time-entries/:id/reject         # Reject entry
```

### Timesheets

```
GET    /api/timesheets                      # List timesheets
GET    /api/timesheets/:id                  # Get timesheet details
POST   /api/timesheets                      # Create timesheet
PUT    /api/timesheets/:id                  # Update timesheet
DELETE /api/timesheets/:id                  # Delete timesheet

# Workflow
POST   /api/timesheets/:id/submit           # Submit for approval
POST   /api/timesheets/:id/approve          # Approve timesheet
POST   /api/timesheets/:id/reject           # Reject timesheet
POST   /api/timesheets/:id/reopen           # Reopen for edits

# Time Entry Management
POST   /api/timesheets/:id/add-entries      # Add time entries to timesheet
DELETE /api/timesheets/:id/remove-entries   # Remove entries from timesheet

# Invoicing
POST   /api/timesheets/:id/create-invoice   # Convert to invoice
```

### Hourly Rates

```
GET    /api/hourly-rates                    # List all rates
GET    /api/hourly-rates/:id                # Get rate details
POST   /api/hourly-rates                    # Create rate
PUT    /api/hourly-rates/:id                # Update rate
DELETE /api/hourly-rates/:id                # Delete rate

# Rate Calculations
GET    /api/hourly-rates/calculate          # Get effective rate for context
POST   /api/hourly-rates/bulk-update        # Update multiple rates
```

### Billable Expenses

```
GET    /api/billable-expenses               # List expenses
GET    /api/billable-expenses/:id           # Get expense details
POST   /api/billable-expenses               # Create expense
PUT    /api/billable-expenses/:id           # Update expense
DELETE /api/billable-expenses/:id           # Delete expense

POST   /api/billable-expenses/:id/submit    # Submit for approval
POST   /api/billable-expenses/:id/approve   # Approve expense
POST   /api/billable-expenses/:id/reject    # Reject expense
```

### Reports

```
GET    /api/reports/time-summary            # Time summary by period
GET    /api/reports/utilization             # Employee utilization rates
GET    /api/reports/billable-vs-non         # Billable vs non-billable breakdown
GET    /api/reports/project-time            # Time by project
GET    /api/reports/unbilled-time           # Approved but not yet invoiced
GET    /api/reports/employee-time           # Time by employee
```

---

## Business Logic

### Timer Management

```javascript
// Start timer
async function startTimer({ employeeId, projectId, taskId, description }) {
  // Check for existing running timer
  const runningTimer = await findRunningTimer(employeeId);
  if (runningTimer) {
    throw new Error('Please stop the current timer before starting a new one');
  }

  // Determine hourly rate
  const hourlyRate = await calculateEffectiveRate({
    employeeId,
    projectId,
    taskId,
    date: new Date()
  });

  const timeEntry = await createTimeEntry({
    employee_id: employeeId,
    project_id: projectId,
    task_id: taskId,
    description,
    entry_date: new Date(),
    start_time: new Date(),
    is_running: true,
    hourly_rate,
    status: 'draft'
  });

  return timeEntry;
}

// Stop timer
async function stopTimer(timeEntryId) {
  const timeEntry = await getTimeEntry(timeEntryId);

  if (!timeEntry.is_running) {
    throw new Error('Timer is not running');
  }

  const endTime = new Date();
  const durationMinutes = Math.round(
    (endTime - new Date(timeEntry.start_time)) / 1000 / 60
  );

  const hours = parseFloat((durationMinutes / 60).toFixed(2));
  const amount = parseFloat((hours * timeEntry.hourly_rate).toFixed(2));

  await updateTimeEntry(timeEntryId, {
    end_time: endTime,
    duration_minutes: durationMinutes,
    hours,
    amount,
    is_running: false
  });

  return getTimeEntry(timeEntryId);
}
```

### Hourly Rate Calculation

```javascript
// Calculate effective hourly rate with priority cascade
async function calculateEffectiveRate({
  employeeId,
  projectId = null,
  taskId = null,
  clientId = null,
  activityType = null,
  date = new Date()
}) {
  // Priority order: task > project > client > activity > employee role > employee default

  // 1. Task-specific rate
  if (taskId) {
    const taskRate = await getActiveRate({
      rate_type: 'task',
      task_id: taskId,
      date
    });
    if (taskRate) return taskRate.hourly_rate;
  }

  // 2. Project-specific rate
  if (projectId) {
    const projectRate = await getActiveRate({
      rate_type: 'project',
      project_id: projectId,
      date
    });
    if (projectRate) return projectRate.hourly_rate;
  }

  // 3. Client-specific rate
  if (clientId) {
    const clientRate = await getActiveRate({
      rate_type: 'client',
      client_id: clientId,
      date
    });
    if (clientRate) return clientRate.hourly_rate;
  }

  // 4. Activity type rate
  if (activityType) {
    const activityRate = await getActiveRate({
      rate_type: 'activity',
      activity_type: activityType,
      date
    });
    if (activityRate) return activityRate.hourly_rate;
  }

  // 5. Employee role rate
  const employee = await getEmployee(employeeId);
  if (employee.role_id) {
    const roleRate = await getActiveRate({
      rate_type: 'employee_role',
      role_id: employee.role_id,
      date
    });
    if (roleRate) return roleRate.hourly_rate;
  }

  // 6. Employee default rate
  const employeeRate = await getActiveRate({
    rate_type: 'employee_default',
    employee_id: employeeId,
    date
  });

  if (employeeRate) return employeeRate.hourly_rate;

  // Fallback to tenant default
  const tenant = await getTenant();
  return tenant.default_hourly_rate || 0;
}
```

### Timesheet Auto-Generation

```javascript
// Generate timesheets automatically at period end
async function generateTimesheets(periodEnd) {
  const employees = await getActiveEmployees();

  for (const employee of employees) {
    const period = calculatePeriod(employee.timesheet_frequency, periodEnd);

    // Get all unsubmitted time entries for period
    const entries = await getTimeEntries({
      employee_id: employee.id,
      entry_date_gte: period.start,
      entry_date_lte: period.end,
      status: 'draft'
    });

    if (entries.length === 0) continue;

    // Calculate totals
    const totals = entries.reduce((acc, entry) => ({
      total_hours: acc.total_hours + entry.hours,
      billable_hours: acc.billable_hours + (entry.is_billable ? entry.hours : 0),
      non_billable_hours: acc.non_billable_hours + (!entry.is_billable ? entry.hours : 0),
      total_amount: acc.total_amount + entry.amount
    }), { total_hours: 0, billable_hours: 0, non_billable_hours: 0, total_amount: 0 });

    // Create timesheet
    const timesheet = await createTimesheet({
      employee_id: employee.id,
      period_type: employee.timesheet_frequency,
      period_start: period.start,
      period_end: period.end,
      ...totals,
      entry_count: entries.length
    });

    // Associate entries with timesheet
    for (const entry of entries) {
      await createTimesheetEntry({
        timesheet_id: timesheet.id,
        time_entry_id: entry.id,
        hours_at_submission: entry.hours,
        amount_at_submission: entry.amount
      });
    }
  }
}
```

### Auto-Invoice from Approved Hours

```javascript
// Convert approved timesheet to invoice
async function createInvoiceFromTimesheet(timesheetId) {
  const timesheet = await getTimesheet(timesheetId);

  if (timesheet.status !== 'approved') {
    throw new Error('Timesheet must be approved before invoicing');
  }

  // Get all time entries in timesheet
  const timesheetEntries = await getTimesheetEntries(timesheetId);
  const timeEntries = await Promise.all(
    timesheetEntries.map(te => getTimeEntry(te.time_entry_id))
  );

  // Group by project/client
  const groupedByProject = groupBy(timeEntries, 'project_id');

  const invoices = [];

  for (const [projectId, entries] of Object.entries(groupedByProject)) {
    const project = await getProject(projectId);
    const billableEntries = entries.filter(e => e.is_billable);

    if (billableEntries.length === 0) continue;

    // Create invoice
    const invoice = await createInvoice({
      client_id: project.client_id,
      project_id: projectId,
      invoice_date: new Date(),
      due_date: addDays(new Date(), 30),
      currency: project.currency
    });

    // Add line items
    for (const entry of billableEntries) {
      await createInvoiceLineItem({
        invoice_id: invoice.id,
        description: `${entry.description} (${entry.employee.name})`,
        quantity: entry.hours,
        unit_price: entry.hourly_rate,
        amount: entry.amount,
        time_entry_id: entry.id
      });

      // Mark time entry as invoiced
      await updateTimeEntry(entry.id, {
        invoice_id: invoice.id,
        status: 'invoiced',
        invoiced_at: new Date(),
        is_locked: true
      });
    }

    // Calculate invoice totals
    await recalculateInvoiceTotals(invoice.id);

    invoices.push(invoice);
  }

  // Update timesheet status
  await updateTimesheet(timesheetId, {
    status: invoices.length > 0 ? 'fully_invoiced' : timesheet.status
  });

  return invoices;
}
```

### Time Entry Locking Rules

```javascript
// Prevent editing of invoiced or approved hours
function canEditTimeEntry(timeEntry, user) {
  // Locked entries cannot be edited
  if (timeEntry.is_locked) {
    return {
      allowed: false,
      reason: 'Time entry is locked (invoiced or approved)'
    };
  }

  // Invoiced entries cannot be edited
  if (timeEntry.invoice_id) {
    return {
      allowed: false,
      reason: 'Time entry has been invoiced'
    };
  }

  // Only owner or admin can edit
  if (timeEntry.employee_id !== user.employee_id && !user.is_admin) {
    return {
      allowed: false,
      reason: 'You can only edit your own time entries'
    };
  }

  // Cannot edit approved entries (must reject first)
  if (timeEntry.status === 'approved') {
    return {
      allowed: user.is_manager,
      reason: 'Approved entries can only be edited by managers'
    };
  }

  return { allowed: true };
}
```

---

## UI Components

### Timer Widget

```javascript
const TimerWidget = () => {
  const [runningTimer, setRunningTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (runningTimer) {
      const interval = setInterval(() => {
        const start = new Date(runningTimer.start_time);
        const now = new Date();
        setElapsed(Math.floor((now - start) / 1000));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [runningTimer]);

  const handleStart = async () => {
    const timer = await startTimer({
      employeeId: currentUser.employee_id,
      projectId: selectedProject,
      taskId: selectedTask,
      description: timerDescription
    });
    setRunningTimer(timer);
  };

  const handleStop = async () => {
    await stopTimer(runningTimer.id);
    setRunningTimer(null);
    setElapsed(0);
  };

  return (
    <div className="timer-widget">
      {runningTimer ? (
        <>
          <div className="timer-display">
            {formatDuration(elapsed)}
          </div>
          <div className="timer-description">
            {runningTimer.description}
          </div>
          <Button onClick={handleStop} color="danger">
            Stop Timer
          </Button>
        </>
      ) : (
        <QuickTimerStart onStart={handleStart} />
      )}
    </div>
  );
};
```

### Timesheet Calendar View

```javascript
const TimesheetCalendar = ({ employeeId, periodStart, periodEnd }) => {
  const entries = useTimeEntries({
    employeeId,
    startDate: periodStart,
    endDate: periodEnd
  });

  const entriesByDate = groupBy(entries, 'entry_date');

  return (
    <Calendar
      startDate={periodStart}
      endDate={periodEnd}
      renderDay={(date) => {
        const dayEntries = entriesByDate[date] || [];
        const totalHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);

        return (
          <DayCell
            date={date}
            hours={totalHours}
            entries={dayEntries}
            onClick={() => openDayDetail(date)}
          />
        );
      }}
    />
  );
};
```

### Approval Queue

```javascript
const TimesheetApprovalQueue = () => {
  const pendingTimesheets = useTimesheets({
    status: 'submitted',
    submitted_to: currentUser.employee_id
  });

  const handleApprove = async (timesheetId) => {
    await approveTimesheet(timesheetId);
    showToast('Timesheet approved');
  };

  const handleReject = async (timesheetId, reason) => {
    await rejectTimesheet(timesheetId, reason);
    showToast('Timesheet rejected');
  };

  return (
    <div className="approval-queue">
      {pendingTimesheets.map(timesheet => (
        <TimesheetCard
          key={timesheet.id}
          timesheet={timesheet}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  );
};
```

---

## Integration Points

### With Project Management
- Start timers directly from tasks
- Auto-populate project and task context
- Update task actual hours in real-time

### With Accounting/Invoicing
- Convert approved hours to invoice line items
- Apply project billing rates automatically
- Track invoiced vs unbilled time

### With Payroll
- Export non-billable hours for payroll processing
- Track employee productive time
- Support different pay rates for different activities

### With Client Portal
- Show billable hours summary to clients
- Allow clients to review time before invoicing
- Display detailed time entry descriptions

---

## Permissions & Security

**Permission Levels:**
- **Employee**: Can create/edit own time entries, view own timesheets
- **Manager**: Can approve team timesheets, view team time reports
- **Finance**: Can lock time entries, create invoices from time
- **Client**: View-only access to billable hours (if enabled)
- **Admin**: Full access to all time tracking data

---

## Best Practices

1. **Track Time Daily** - Don't wait until end of week to log hours
2. **Detailed Descriptions** - Explain what work was performed
3. **Mark Non-Billable Clearly** - Distinguish internal vs client time
4. **Submit Weekly** - Regular submission for faster invoicing
5. **Use Timers** - More accurate than manual entry
6. **Review Before Submit** - Check all entries for accuracy
7. **Client-Friendly Language** - Write descriptions clients will understand

---

**Related Modules:**
- [Project & Task Management](./module-project-management-v2.md)
- [Accounting](./module-accounting.md)
- [Client Portal](./module-client-portal.md)
- [Proposals & Contracts](./module-proposals-contracts.md)
