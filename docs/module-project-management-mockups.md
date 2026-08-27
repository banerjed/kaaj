# Monday.com-Inspired Mockups Summary

**Date:** 2025-12-28
**Purpose:** Visual mockups for Project Management v2.0 based on Monday.com UI patterns

---

## Completed Mockups

### ✅ 1. Objectives Dashboard (`objectives-dashboard.html`)

**Features Demonstrated:**
- **Strategic Layer** - New Objectives concept (Tenant → Objectives → Projects hierarchy)
- **Card-Based Layout** - Visual organization by client, department, or initiative
- **KPI Tracking** - Revenue targets, completion metrics, health status
- **Stats Overview** - 4-card dashboard showing aggregate metrics
- **Team Visualization** - Avatar groups showing team members
- **Multiple Objective Types:**
  - Client-based (Acme Corp Partnership)
  - Department (Engineering Excellence)
  - Service Line (Design Services)
  - Initiative (Q1 Marketing Campaign)
  - Internal (Operations)

**Key UI Components:**
- Objective cards with gradient icons
- Progress bars for completion tracking
- Badge system for status (On Track, At Risk, In Progress)
- Metric displays (Revenue, Projects, Completion %)
- Project chips showing active projects
- Call-to-action buttons (View Dashboard, Manage)

---

## Mockups To Be Created

### 2. Projects Table View with Typed Columns

**Purpose:** Showcase Monday.com-style column system with 30+ column types

**Features to Include:**
- **Table Layout** - Spreadsheet-like interface
- **Column Types:**
  - Status column (color-coded states)
  - Person/People column (assignees with avatars)
  - Timeline column (date ranges with bars)
  - Number columns (budget, hours with formatting)
  - Formula column (budget remaining, profit margin)
  - Mirror column (client data referenced from another board)
  - Priority column (dropdown)
  - Tags column (multi-select labels)
- **Column Headers** - Sortable, filterable, customizable
- **Inline Editing** - Click to edit cells
- **Column Menu** - Add, hide, reorder columns
- **Grouping** - Group by status, assignee, etc.
- **Summary Row** - Totals, averages at bottom

**Sample Columns:**
```
| Project Name | Status | Owner | Timeline | Budget | Actual Cost | Profit Margin (Formula) | Client (Mirror) | Priority |
```

### 3. Task Detail Modal with Column Values

**Purpose:** Show detailed task view with all custom column values

**Features:**
- **Modal Layout** - Full-screen or large centered modal
- **Task Header** - Task name, number, quick actions
- **Tab Navigation:**
  - Details - All column values displayed
  - Subtasks - Nested task list
  - Time Entries - Time tracking logs
  - Files - Attachments with versioning
  - Comments - Discussion thread
  - Activity - Change log
- **Column Value Editors:**
  - Status picker with colors
  - People picker with search
  - Date picker with calendar
  - Timeline with drag handles
  - Number inputs with formatting
  - Formula display (read-only with calculation)
  - Tags multi-select
  - Dropdown selectors
- **Actions Bar** - Save, Cancel, Delete, Duplicate

### 4. Dashboard with Widgets

**Purpose:** Executive dashboard with cross-project analytics

**Features:**
- **Grid Layout** - 12x12 grid system
- **Widget Types:**
  - **Chart Widget:**
    - Bar chart (Tasks by Status)
    - Line chart (Revenue Trend)
    - Pie chart (Budget Distribution)
  - **Number Widget:**
    - Total Active Projects
    - Budget Utilization %
    - Hours Logged This Week
  - **Table Widget:**
    - Top 10 Projects by Budget
    - Overdue Tasks
  - **Gantt Widget:**
    - Project timeline across multiple projects
  - **Workload Widget:**
    - Team capacity visualization
  - **Calendar Widget:**
    - Upcoming milestones
- **Widget Configuration:**
  - Data source selector (which projects)
  - Filters (status, date range)
  - Chart type selector
  - Color customization
- **Drag-and-Drop** - Repositionable widgets
- **Add Widget** - Button to add new widgets

### 5. Automation Builder

**Purpose:** Visual workflow automation interface

**Features:**
- **Automation List** - All automations for a project/objective
- **Automation Builder:**
  - **Trigger Selection:**
    - Column change (status → done)
    - Date arrives (due date -1 day)
    - Task created
    - Schedule (every Monday 9am)
  - **Condition Builder:**
    - IF column = value
    - AND/OR logic
    - Multiple conditions
  - **Action Builder:**
    - Update column
    - Notify person
    - Send email
    - Create task
    - Move to group
  - **Visual Flow:** Trigger → Conditions → Actions
- **Templates** - Pre-built automation recipes
- **AI Suggestions** - Recommended automations
- **Execution Log** - History of runs
- **Toggle Active/Inactive**

**Example Automation:**
```
WHEN status changes to "Done"
  AND priority is "High"
THEN notify project_manager
  AND move to "Completed" group
  AND send email to client
```

### 6. Calendar View

**Purpose:** Timeline-based project and task visualization

**Features:**
- **View Modes:**
  - Month view (grid calendar)
  - Week view (time slots)
  - Day view (hourly schedule)
- **Calendar Items:**
  - Tasks (by due date)
  - Milestones (markers)
  - Project timelines (bars)
- **Color Coding:**
  - By status
  - By project
  - By assignee
- **Drag-and-Drop** - Reschedule by dragging
- **Multiple Calendars:**
  - My Tasks
  - Team Calendar
  - All Projects
- **Filters:**
  - Show/hide by project
  - Filter by assignee
  - Filter by status

### 7. Workload View

**Purpose:** Team capacity planning and balancing

**Features:**
- **Horizontal Timeline** - Week/month view
- **Team Members** - One row per person
- **Capacity Visualization:**
  - Total hours available (40 hrs/week)
  - Allocated hours (by tasks assigned)
  - Overallocation warning (red)
- **Task Bars:**
  - Show tasks assigned to each person
  - Color-coded by project
  - Hover shows task details
- **Drag-and-Drop:**
  - Move tasks between people
  - Adjust task duration
- **Capacity Settings:**
  - Set hours per week per person
  - PTO/holidays (reduced capacity)
- **Filters:**
  - Show specific projects
  - Date range selector

---

## Design Patterns from Monday.com

### Color System
- **Status Colors:**
  - Gray: To Do / Not Started
  - Blue: In Progress
  - Yellow/Orange: In Review / Pending
  - Red: Blocked / At Risk
  - Green: Done / On Track

### Typography
- **Hierarchy:**
  - Page titles: 32px bold
  - Section headers: 20px semibold
  - Column headers: 12px uppercase
  - Body text: 14px regular

### Spacing
- **8px Grid System:**
  - Small gaps: 8px
  - Medium gaps: 16px
  - Large gaps: 24px
  - Section spacing: 32px

### Interactive Elements
- **Hover States:**
  - Table rows: Light gray background
  - Buttons: Darker shade + shadow
  - Cards: Elevated shadow
- **Click States:**
  - Buttons: Slight scale down
  - Inputs: Blue border + shadow

### Column Types Visualized

#### Status Column
```
┌─────────────┐
│ ● In Progress │ (Blue dot + text)
└─────────────┘
```

#### Person Column
```
┌─────────────┐
│ [JD] John Doe │ (Avatar + name)
└─────────────┘
```

#### Timeline Column
```
┌──────────────────┐
│ Jan 15 - Jan 30  │
│ ████████░░░░░░░░ │ (Progress bar)
└──────────────────┘
```

#### Number Column
```
┌─────────────┐
│  $1,500.00  │ (Formatted currency)
└─────────────┘
```

#### Formula Column
```
┌─────────────┐
│  $450.75    │ (Read-only, calculated)
│  ↑ Calculated │
└─────────────┘
```

#### Mirror Column
```
┌─────────────┐
│ Acme Corp   │
│ ↑ From Clients │ (Data from another board)
└─────────────┘
```

---

## Component Library

### Atoms
- `badge` - Status badges with color + dot
- `avatar` - User avatar (initials or image)
- `button` - Primary, secondary, danger styles
- `input` - Text input with focus states
- `select` - Dropdown selector
- `checkbox` - Checkbox with accent color
- `progress-bar` - Linear progress indicator

### Molecules
- `stat-card` - Metric display with value + change
- `column-header` - Sortable, filterable column title
- `table-cell` - Editable table cell by type
- `tag-list` - Multi-select tags
- `avatar-group` - Stacked avatars with count
- `date-picker` - Calendar selector
- `timeline-bar` - Visual date range

### Organisms
- `kanban-board` - Multi-column drag-drop board
- `data-table` - Full-featured table with columns
- `objective-card` - Strategic objective display
- `dashboard-widget` - Configurable widget
- `automation-flow` - Visual automation builder
- `modal-dialog` - Full modal with tabs

---

## Next Steps

1. **Complete Remaining Mockups:**
   - Projects Table View (most important - shows column system)
   - Task Detail Modal (second priority - shows editing)
   - Dashboard with Widgets (executive view)
   - Automation Builder (workflow automation)
   - Calendar View (timeline visualization)
   - Workload View (capacity planning)

2. **Interactive Prototypes:**
   - Add JavaScript for interactivity
   - Drag-and-drop functionality
   - Modal open/close
   - Column sorting/filtering
   - Real-time updates simulation

3. **Additional Views:**
   - Gantt Chart View (project timeline)
   - Map View (location-based tasks)
   - Form View (data collection)
   - Files View (attachment gallery)

4. **Mobile Responsive:**
   - Adapt layouts for tablet/mobile
   - Touch-friendly controls
   - Simplified views for small screens

---

## Key Monday.com Features Implemented

### ✅ Already in Mockups
- Objectives (Strategic Layer)
- Card-based organization
- KPI tracking
- Team visualization
- Status badges
- Progress indicators

### 🚧 To Be Implemented in Remaining Mockups
- Typed Column System (30+ types)
- Formula Columns
- Mirror Columns
- Cross-project Dashboards
- Visual Automation Builder
- Multiple View Types (Table, Calendar, Gantt, Workload)
- Inline Editing
- Drag-and-Drop
- Column Customization
- Widget System

### 🎯 Service Provider Enhancements
- Client billing integration
- Hourly rate columns
- Time tracking columns
- Proposal-to-project workflow
- Invoice generation
- Contract management links

---

**Document Status:** In Progress
**Next Priority:** Projects Table View with Typed Columns
**Total Mockups Planned:** 7
**Completed:** 1 of 7
