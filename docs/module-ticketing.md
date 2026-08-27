# Ticketing Module Specification

## Overview
This specification defines a comprehensive ticketing system that supports multiple business areas within an organization, with extensive customization capabilities, hierarchical ticket relationships, and rich collaboration features.

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Data Models](#data-models)
3. [Business Areas](#business-areas)
4. [Tickets](#tickets)
5. [Ticket Updates](#ticket-updates)
6. [Ticket Relationships](#ticket-relationships)
7. [Tasks](#tasks)
8. [Custom Fields](#custom-fields)
9. [Categories and Settings](#categories-and-settings)
10. [Privacy and Access Control](#privacy-and-access-control)
11. [Advanced Search](#advanced-search)
12. [API Endpoints](#api-endpoints)
13. [Use Cases](#use-cases)
14. [Business Rules and Validation](#business-rules-and-validation)

---

## Core Concepts

### Business Area
A logical grouping of tickets within an organization that represents a specific department, function, or domain. Each business area:
- Has a unique identifier/prefix
- Maintains its own ticket numbering sequence
- Can define custom fields specific to its needs
- Has its own category configuration
- Has designated administrators who can modify business area configuration
- Has designated analysts who can access all tickets in the business area
- Has the ability to search based on keywords in the subject or body. 
- Also, search based on assignees, subscribers, dates (logged, last updated, closed)

### Ticket
A trackable work item or request within a business area. Each ticket:
- Has a unique identifier composed of business area prefix and sequence number
- Tracks lifecycle from creation to closure
- Supports collaboration through subscribers and assignees
- Maintains audit trail through updates
- Can have hierarchical and lateral relationships with other tickets
- Has an internal and external summary of work done
- Has a list of to-do items or tasks
- Has an assignee, a due-date, estimates of effort (planned, spent, and remaining)

### Ticket Update
A timestamped entry documenting progress, communication, or changes to a ticket. Updates:
- Capture who made the change and when
- Support rich text formatting
- Can include file attachments
- Form the complete history of the ticket

---

## Data Models

### Organization Schema

**Note**: This organization model is consistent with the Employee Profile module.

```json
{
  "organizationId": "org_uuid_v4",
  "organizationCode": "ACME-1234",
  "prefix": "ACME",
  "numericCode": "1234",
  "name": "Acme Corporation",
  "ticketingConfig": {
    "enabled": true,
    "businessAreas": ["ba_uuid_1", "ba_uuid_2"],
    "globalSettings": {
      "defaultDueDateDays": 7,
      "allowPrivateTickets": true,
      "requireAssigneeForActive": true,
      "maxAttachmentSizeMB": 10,
      "allowedAttachmentTypes": [".pdf", ".doc", ".docx", ".jpg", ".png", ".xlsx"],
      "enableNotifications": true,
      "enableSLA": true
    }
  },
  "metadata": {
    "createdAt": "2020-01-15T10:00:00Z",
    "active": true
  }
}
```

**Field Definitions**:
- **organizationId**: UUID primary key (matches Employee Profile)
- **organizationCode**: Combined `{prefix}-{numericCode}` for encryption (matches Employee Profile)
- **prefix**: Used in employee IDs: "ACME-2024-001"
- **numericCode**: 4-digit security code for encryption key derivation

---

## Business Areas

### Business Area Structure

```json
{
  "businessAreaId": "ba_unique_id",
  "organizationId": "org_unique_id",
  "name": "Financial Data Services",
  "prefix": "FinData",
  "description": "Handles all financial data-related requests and issues",
  "active": true,
  "settings": {
    "ticketNumberSequence": {
      "currentSequence": 1234,
      "format": "{prefix}#{number}",
      "paddingDigits": 4
    },
    "categories": [
      {
        "categoryId": "cat_001",
        "name": "Networking",
        "description": "Network connectivity and infrastructure issues",
        "active": true,
        "color": "#FF5733"
      },
      {
        "categoryId": "cat_002",
        "name": "Desktop Support",
        "description": "Desktop hardware and software support",
        "active": true,
        "color": "#33C1FF"
      },
      {
        "categoryId": "cat_003",
        "name": "Application Support",
        "description": "Business application support",
        "active": true,
        "color": "#75FF33"
      },
      {
        "categoryId": "cat_004",
        "name": "Data Request",
        "description": "Data access and reporting requests",
        "active": true,
        "color": "#FF33F5"
      }
    ],
    "statuses": {
      "available": ["Pending", "Assigned", "Active", "Closed", "Suspended", "Duplicate"],
      "default": "Pending",
      "allowedTransitions": {
        "Pending": ["Assigned", "Closed", "Duplicate"],
        "Assigned": ["Active", "Suspended", "Closed"],
        "Active": ["Suspended", "Closed"],
        "Suspended": ["Active", "Closed"],
        "Closed": []
      }
    },
    "customFields": [
      {
        "fieldId": "cf_001",
        "name": "requiresDataAccess",
        "label": "Requires Data Access",
        "type": "boolean",
        "required": false,
        "defaultValue": false,
        "helpText": "Check if this ticket requires database access"
      },
      {
        "fieldId": "cf_002",
        "name": "targetCompletionDate",
        "label": "Target Completion Date",
        "type": "date",
        "required": false,
        "helpText": "Expected completion date for this request"
      },
      {
        "fieldId": "cf_003",
        "name": "priority",
        "label": "Priority Level",
        "type": "enum",
        "required": true,
        "options": [
          {"value": "critical", "label": "Critical", "order": 1},
          {"value": "high", "label": "High", "order": 2},
          {"value": "medium", "label": "Medium", "order": 3},
          {"value": "low", "label": "Low", "order": 4}
        ],
        "defaultValue": "medium"
      },
      {
        "fieldId": "cf_004",
        "name": "impactedSystems",
        "label": "Impacted Systems",
        "type": "enum",
        "required": false,
        "multiple": true,
        "options": [
          {"value": "erp", "label": "ERP System"},
          {"value": "crm", "label": "CRM System"},
          {"value": "bi", "label": "BI Platform"},
          {"value": "datawarehouse", "label": "Data Warehouse"}
        ]
      }
    ]
  },
  "roles": {
    "administrators": [
      {
        "type": "user-group",
        "groupId": "ug_ba_admin_001",
        "groupName": "FinData Administrators",
        "addedAt": "2024-01-15T10:00:00Z",
        "addedBy": "system"
      },
      {
        "type": "individual",
        "employeeId": "EMP-2022-001",
        "name": "Sarah Admin",
        "email": "sarah.admin@acme.com",
        "addedAt": "2024-01-15T10:00:00Z",
        "addedBy": "system"
      }
    ],
    "analysts": [
      {
        "type": "user-group",
        "groupId": "ug_ba_analyst_001",
        "groupName": "FinData Analysts",
        "addedAt": "2024-01-15T10:00:00Z",
        "addedBy": "EMP-2022-001"
      },
      {
        "type": "individual",
        "employeeId": "EMP-2023-012",
        "name": "Jane Analyst",
        "email": "jane.analyst@acme.com",
        "addedAt": "2024-01-15T10:00:00Z",
        "addedBy": "EMP-2022-001"
      }
    ]
  },
  "permissions": {
    "canCreateTickets": ["role_employee", "role_manager", "role_admin", "ba_administrator", "ba_analyst"],
    "canAssignTickets": ["role_manager", "role_admin", "ba_administrator", "ba_analyst"],
    "canCloseTickets": ["role_assignee", "role_manager", "role_admin", "ba_administrator", "ba_analyst"],
    "canViewPrivateTickets": ["role_manager", "role_admin", "ba_administrator", "ba_analyst"],
    "canModifyBusinessArea": ["role_admin", "ba_administrator"],
    "canViewAllTickets": ["role_admin", "ba_administrator", "ba_analyst"]
  },
  "metadata": {
    "createdAt": "2024-01-15T10:00:00Z",
    "createdBy": "admin@acme.com",
    "updatedAt": "2025-03-10T14:30:00Z",
    "updatedBy": "admin@acme.com"
  }
}
```

### Business Area Management

**Key Features**:
- Multiple business areas per organization
- Unique prefix for ticket identification
- Independent ticket numbering per business area
- Category management per business area
- Custom field definitions per business area
- Role-based permissions per business area
- Business area administrators for configuration management
- Business area analysts for ticket oversight

**User Groups Integration**:
Business areas support both individual employees and user-groups (from the module-user-groups system) for:
- Business area administrators and analysts
- Ticket assignees and subscribers
- Category default assignees and auto-subscribe lists

When a user-group is specified, all members of that group inherit the corresponding permissions or notifications. Changes to group membership automatically update access without requiring ticket-level modifications.

**Business Area Roles**:

1. **Administrators**:
   - Can modify all business area configuration settings
   - Can add/remove categories and custom fields
   - Can manage other administrators and analysts
   - Have full access to all tickets (including private)
   - Can assign and reassign tickets
   - Can close and delete tickets

2. **Analysts**:
   - Can view all tickets in the business area (including private)
   - Can assign tickets and change ticket properties
   - Can generate reports and analytics
   - Cannot modify business area configuration
   - Cannot manage roles

3. **General Users**:
   - Can create tickets
   - Can view public tickets in the business area
   - Can only see private tickets if they are logger, assignee, or subscriber
   - Subscribe on an as-needed basis

---

## Tickets

### Ticket Structure

```json
{
  "ticketId": "ticket_uuid",
  "ticketNumber": "FinData#1234",
  "businessAreaId": "ba_unique_id",
  "organizationId": "org_unique_id",

  "core": {
    "subject": "Unable to access Q4 financial reports",
    "category": {
      "categoryId": "cat_004",
      "name": "Data Request"
    },
    "status": "Active",
    "severity": "high",
    "requestType": "feature",
    "dueDate": "2025-12-15T23:59:59Z",
    "private": false
  },

  "people": {
    "logger": {
      "employeeId": "EMP-2024-001",
      "name": "John Doe",
      "email": "john.doe@acme.com",
      "loggedAt": "2025-12-01T09:00:00Z"
    },
    "assignees": [
      {
        "type": "user-group",
        "groupId": "ug_findata_team_001",
        "groupName": "Financial Data Team",
        "assignedAt": "2025-12-01T10:30:00Z",
        "assignedBy": "EMP-2022-012"
      },
      {
        "type": "individual",
        "employeeId": "EMP-2023-045",
        "name": "Jane Smith",
        "email": "jane.smith@acme.com",
        "assignedAt": "2025-12-01T10:30:00Z",
        "assignedBy": "EMP-2022-012"
      }
    ],
    "subscribers": [
      {
        "type": "individual",
        "employeeId": "EMP-2024-001",
        "name": "John Doe",
        "email": "john.doe@acme.com",
        "subscribedAt": "2025-12-01T09:00:00Z",
        "autoSubscribed": true,
        "notificationPreferences": {
          "email": true,
          "inApp": true,
          "frequency": "immediate"
        }
      },
      {
        "type": "user-group",
        "groupId": "ug_stakeholders_001",
        "groupName": "Financial Stakeholders",
        "subscribedAt": "2025-12-01T10:00:00Z",
        "autoSubscribed": false,
        "notificationPreferences": {
          "email": true,
          "inApp": true,
          "frequency": "daily_digest"
        }
      },
      {
        "type": "individual",
        "employeeId": "EMP-2022-012",
        "name": "Alice Manager",
        "email": "alice.manager@acme.com",
        "subscribedAt": "2025-12-01T10:00:00Z",
        "autoSubscribed": false,
        "notificationPreferences": {
          "email": true,
          "inApp": true,
          "frequency": "daily_digest"
        }
      }
    ]
  },

  "relationships": {
    "parentTicket": {
      "ticketId": "ticket_parent_uuid",
      "ticketNumber": "FinData#1200",
      "subject": "Q4 Financial Reporting Infrastructure",
      "linkedAt": "2025-12-01T09:00:00Z"
    },
    "linkedTickets": [
      {
        "ticketId": "ticket_linked_uuid_1",
        "ticketNumber": "FinData#1235",
        "subject": "Access rights for financial database",
        "relationshipType": "related",
        "linkedAt": "2025-12-01T11:00:00Z",
        "linkedBy": "EMP-2023-045"
      },
      {
        "ticketId": "ticket_linked_uuid_2",
        "ticketNumber": "IT#5678",
        "subject": "VPN access for remote users",
        "relationshipType": "blocks",
        "linkedAt": "2025-12-01T12:00:00Z",
        "linkedBy": "EMP-2023-045"
      }
    ]
  },

  "content": {
    "internalSummary": {
      "text": "User needs access to Q4 reports. Requires database permissions and VPN setup. Coordinating with IT team.",
      "lastUpdatedAt": "2025-12-01T14:00:00Z",
      "lastUpdatedBy": "EMP-2023-045"
    },
    "externalSummary": {
      "text": "We are working on providing you access to the Q4 financial reports. This requires some system configuration which is in progress.",
      "lastUpdatedAt": "2025-12-01T14:30:00Z",
      "lastUpdatedBy": "EMP-2023-045"
    }
  },

  "tasks": [
    {
      "taskId": "task_001",
      "title": "Grant database read permissions",
      "description": "Add user to FinancialReports_Readers group",
      "assignedTo": "EMP-2023-045",
      "status": "completed",
      "dueDate": "2025-12-02T17:00:00Z",
      "createdAt": "2025-12-01T10:00:00Z",
      "completedAt": "2025-12-01T15:00:00Z",
      "order": 1
    },
    {
      "taskId": "task_002",
      "title": "Configure VPN access",
      "description": "Coordinate with IT to enable VPN for remote access",
      "assignedTo": "EMP-2023-078",
      "status": "in_progress",
      "dueDate": "2025-12-03T17:00:00Z",
      "createdAt": "2025-12-01T10:30:00Z",
      "order": 2
    },
    {
      "taskId": "task_003",
      "title": "Send access instructions to user",
      "description": "Email user with login credentials and usage guide",
      "assignedTo": "EMP-2023-045",
      "status": "pending",
      "dueDate": "2025-12-04T17:00:00Z",
      "createdAt": "2025-12-01T10:30:00Z",
      "order": 3
    }
  ],

  "customFields": {
    "requiresDataAccess": {
      "fieldId": "cf_001",
      "value": true,
      "updatedAt": "2025-12-01T09:00:00Z"
    },
    "targetCompletionDate": {
      "fieldId": "cf_002",
      "value": "2025-12-10T00:00:00Z",
      "updatedAt": "2025-12-01T09:00:00Z"
    },
    "priority": {
      "fieldId": "cf_003",
      "value": "high",
      "updatedAt": "2025-12-01T10:00:00Z"
    },
    "impactedSystems": {
      "fieldId": "cf_004",
      "value": ["erp", "bi"],
      "updatedAt": "2025-12-01T09:00:00Z"
    }
  },

  "updates": ["update_001", "update_002", "update_003"],

  "metadata": {
    "createdAt": "2025-12-01T09:00:00Z",
    "updatedAt": "2025-12-01T15:30:00Z",
    "closedAt": null,
    "version": 5,
    "updateCount": 3,
    "attachmentCount": 2,
    "tags": ["data-access", "q4", "urgent"]
  }
}
```

### Ticket Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ticketId | UUID | Yes | Unique internal identifier |
| ticketNumber | String | Yes | Human-readable identifier (e.g., "FinData#1234") |
| businessAreaId | UUID | Yes | Reference to business area |
| organizationId | UUID | Yes | Reference to organization |
| subject | String | Yes | Brief description of the ticket (max 200 chars) |
| category | Object | Yes | Category from business area configuration |
| status | Enum | Yes | One of: Pending, Assigned, Active, Closed, Suspended |
| severity | Enum | Yes | One of: low, medium, high, critical |
| requestType | Enum | Yes | One of: feature, bug_fix, qa_testing, support, other |
| dueDate | DateTime | Yes | Expected completion date/time |
| private | Boolean | Yes | Whether ticket is visible only to specific roles and business area administrators/analysts |
| logger | Object | Yes | Employee who created the ticket |
| assignees | Array | No | List of employees assigned to work on the ticket |
| subscribers | Array | No | List of employees receiving notifications |
| parentTicket | Object | No | Reference to parent ticket in hierarchy |
| linkedTickets | Array | No | Related or blocking tickets |
| internalSummary | Object | No | Summary visible to assignees/admins only |
| externalSummary | Object | No | Summary visible to logger and subscribers |
| tasks | Array | No | Checklist of tasks to complete |
| customFields | Object | No | Business area-specific custom fields |
| updates | Array | No | List of update IDs |

### Severity Levels

| Severity | Description | Typical Use Case |
|----------|-------------|------------------|
| **critical** | Urgent issue requiring immediate attention | System down, data loss, security breach |
| **high** | Important issue affecting multiple users or key functionality | Major feature broken, significant performance degradation |
| **medium** | Moderate issue with workaround available | Minor feature issue, inconvenient but not blocking |
| **low** | Minor issue with minimal impact | Cosmetic issues, nice-to-have improvements |

### Request Types

| Request Type | Description | Typical Workflow |
|--------------|-------------|------------------|
| **feature** | New functionality or enhancement request | Requirements gathering → Development → QA → Deployment |
| **bug_fix** | Defect or error that needs correction | Bug reproduction → Fix → Testing → Deployment |
| **qa_testing** | Quality assurance and testing request | Test plan creation → Execution → Reporting |
| **support** | User support or help request | Diagnosis → Resolution → Documentation |
| **other** | Requests that don't fit standard categories | Custom workflow based on needs |

---

## Ticket Updates

### Update Structure

```json
{
  "updateId": "update_uuid",
  "ticketId": "ticket_uuid",
  "ticketNumber": "FinData#1234",

  "author": {
    "employeeId": "EMP-2023-045",
    "name": "Jane Smith",
    "email": "jane.smith@acme.com"
  },

  "timestamp": "2025-12-01T14:30:00Z",

  "content": {
    "richText": "<p>I've successfully granted the database permissions. The user should now have read access to all Q4 reports.</p><p>Still waiting on IT team to complete VPN configuration (see linked ticket IT#5678).</p><p><strong>Next steps:</strong></p><ul><li>Monitor VPN ticket progress</li><li>Test access once VPN is ready</li><li>Send instructions to user</li></ul>",
    "plainText": "I've successfully granted the database permissions. The user should now have read access to all Q4 reports. Still waiting on IT team to complete VPN configuration (see linked ticket IT#5678). Next steps: Monitor VPN ticket progress, Test access once VPN is ready, Send instructions to user",
    "visibility": "internal"
  },

  "attachments": [
    {
      "attachmentId": "att_001",
      "fileName": "database_permissions_screenshot.png",
      "fileSize": 245678,
      "mimeType": "image/png",
      "uploadedAt": "2025-12-01T14:29:00Z",
      "url": "/api/v1/attachments/att_001",
      "thumbnailUrl": "/api/v1/attachments/att_001/thumbnail"
    },
    {
      "attachmentId": "att_002",
      "fileName": "access_configuration.pdf",
      "fileSize": 156789,
      "mimeType": "application/pdf",
      "uploadedAt": "2025-12-01T14:29:30Z",
      "url": "/api/v1/attachments/att_002"
    }
  ],

  "changes": {
    "fieldChanges": [
      {
        "field": "status",
        "oldValue": "Assigned",
        "newValue": "Active",
        "changedAt": "2025-12-01T14:30:00Z"
      },
      {
        "field": "tasks[0].status",
        "oldValue": "in_progress",
        "newValue": "completed",
        "changedAt": "2025-12-01T14:30:00Z"
      }
    ],
    "subscribersAdded": [],
    "subscribersRemoved": [],
    "assigneesAdded": [],
    "assigneesRemoved": []
  },

  "notifications": {
    "sent": true,
    "sentAt": "2025-12-01T14:30:15Z",
    "recipients": [
      {
        "employeeId": "EMP-2024-001",
        "method": "email",
        "status": "delivered"
      },
      {
        "employeeId": "EMP-2022-012",
        "method": "in_app",
        "status": "delivered"
      }
    ]
  },

  "metadata": {
    "editedAt": null,
    "editedBy": null,
    "version": 1,
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Update Types

1. **Comment Update**: User adds a comment with optional attachments
2. **Status Change Update**: Ticket status is modified
3. **Assignment Update**: Assignees or subscribers are added/removed
4. **Field Update**: Custom fields or core fields are modified
5. **System Update**: Automated updates (e.g., due date reminders, SLA notifications)

### Update Visibility

- **Internal**: Visible only to assignees, managers, and admins
- **External**: Visible to all subscribers including the logger
- Updates can be edited within a configured time window (default: 15 minutes)

---

## Ticket Relationships

### Parent-Child Hierarchy

**Purpose**: Break down complex tickets into smaller sub-tickets

**Rules**:
- A ticket can have zero or one parent ticket
- A ticket can have multiple child tickets
- Parent and child must be in the same business area
- Closing a parent ticket requires all children to be closed first (configurable)
- Child tickets inherit certain properties from parent (configurable)

**Example Hierarchy**:
```
FinData#1200 (Parent: Q4 Financial Reporting Infrastructure)
├── FinData#1234 (Child: User access to Q4 reports)
├── FinData#1235 (Child: Database performance optimization)
└── FinData#1236 (Child: Report template updates)
```

### Linked Tickets

**Relationship Types**:

1. **Related**: General association between tickets
   - No blocking behavior
   - Used for reference and context

2. **Blocks**: This ticket blocks progress on the linked ticket
   - Linked ticket cannot be closed until blocker is resolved
   - Visual indicator on both tickets

3. **Blocked By**: This ticket is blocked by the linked ticket
   - Inverse of "Blocks"
   - Cannot be closed until blocker is resolved

4. **Duplicates**: This ticket is a duplicate of another
   - Typically results in closing this ticket
   - References remain for audit trail

5. **Relates To**: Bidirectional general relationship
   - Used for tickets that are mutually related

**Cross-Business Area Linking**:
- Tickets can be linked across different business areas
- Example: `FinData#1234` linked to `IT#5678`

### Relationship Data Structure

```json
{
  "relationshipId": "rel_uuid",
  "sourceTicketId": "ticket_uuid_1",
  "sourceTicketNumber": "FinData#1234",
  "targetTicketId": "ticket_uuid_2",
  "targetTicketNumber": "IT#5678",
  "relationshipType": "blocks",
  "createdAt": "2025-12-01T12:00:00Z",
  "createdBy": "EMP-2023-045",
  "notes": "FinData#1234 requires VPN access which is being handled in IT#5678"
}
```

---

## Tasks

### Task Structure

Tasks are checklist items within a ticket that help track specific work items.

```json
{
  "taskId": "task_uuid",
  "ticketId": "ticket_uuid",
  "title": "Grant database read permissions",
  "description": "Add user to FinancialReports_Readers group in Active Directory",
  "status": "completed",
  "assignedTo": "EMP-2023-045",
  "dueDate": "2025-12-02T17:00:00Z",
  "order": 1,
  "createdAt": "2025-12-01T10:00:00Z",
  "createdBy": "EMP-2023-045",
  "completedAt": "2025-12-01T15:00:00Z",
  "completedBy": "EMP-2023-045"
}
```

### Task Statuses

- **pending**: Not yet started
- **in_progress**: Currently being worked on
- **completed**: Finished
- **blocked**: Cannot proceed due to dependencies
- **skipped**: No longer needed

### Task Features

- Tasks are ordered within a ticket
- Can be reordered via drag-and-drop
- Can be assigned to specific team members
- Have individual due dates
- Track completion status
- Support description with rich text
- Generate updates when status changes

---

## Custom Fields

### Field Types

#### 1. Boolean Field
```json
{
  "fieldId": "cf_bool_001",
  "name": "requiresDataAccess",
  "label": "Requires Data Access",
  "type": "boolean",
  "required": false,
  "defaultValue": false,
  "helpText": "Check if this ticket requires database access"
}
```

**Usage**: Yes/No questions, feature flags, toggles

#### 2. Date Field
```json
{
  "fieldId": "cf_date_001",
  "name": "targetCompletionDate",
  "label": "Target Completion Date",
  "type": "date",
  "required": false,
  "helpText": "Expected completion date for this request",
  "validation": {
    "minDate": "today",
    "maxDate": "+365d"
  }
}
```

**Usage**: Deadlines, milestones, scheduling

#### 3. Enum Field (Single Select)
```json
{
  "fieldId": "cf_enum_001",
  "name": "priority",
  "label": "Priority Level",
  "type": "enum",
  "required": true,
  "multiple": false,
  "options": [
    {"value": "critical", "label": "Critical", "order": 1, "color": "#FF0000"},
    {"value": "high", "label": "High", "order": 2, "color": "#FF8800"},
    {"value": "medium", "label": "Medium", "order": 3, "color": "#FFCC00"},
    {"value": "low", "label": "Low", "order": 4, "color": "#00CC00"}
  ],
  "defaultValue": "medium"
}
```

**Usage**: Priority levels, severity, departments, request types

#### 4. Enum Field (Multi Select)
```json
{
  "fieldId": "cf_enum_002",
  "name": "impactedSystems",
  "label": "Impacted Systems",
  "type": "enum",
  "required": false,
  "multiple": true,
  "options": [
    {"value": "erp", "label": "ERP System"},
    {"value": "crm", "label": "CRM System"},
    {"value": "bi", "label": "BI Platform"},
    {"value": "datawarehouse", "label": "Data Warehouse"},
    {"value": "email", "label": "Email System"}
  ],
  "validation": {
    "minSelections": 0,
    "maxSelections": 5
  }
}
```

**Usage**: Multiple systems, affected teams, tags

### Custom Field Management

**Configuration Location**: Business Area Settings

**Operations**:
- Create new custom fields
- Edit existing field properties (label, help text, options)
- Reorder fields
- Activate/deactivate fields
- Set field visibility rules
- Define conditional logic (show field X if field Y = value)

**Migration Considerations**:
- Changing field type requires data migration
- Removing enum options requires handling existing values
- Deactivated fields retain data but hide from UI

---

## Categories and Settings

### Category Management

Categories are pre-configured lists defined at the business area level.

```json
{
  "categoryId": "cat_uuid",
  "businessAreaId": "ba_uuid",
  "name": "Desktop Support",
  "description": "Hardware and software support for desktop systems",
  "active": true,
  "color": "#33C1FF",
  "icon": "desktop",
  "settings": {
    "defaultAssignees": [
      {
        "type": "user-group",
        "groupId": "ug_desktop_support_001",
        "groupName": "Desktop Support Team"
      },
      {
        "type": "individual",
        "employeeId": "EMP-2023-055"
      }
    ],
    "defaultDueDate": "+3d",
    "autoSubscribe": [
      {
        "type": "user-group",
        "groupId": "ug_managers_001",
        "groupName": "Support Managers"
      },
      {
        "type": "individual",
        "employeeId": "EMP-2022-012"
      }
    ],
    "slaHours": 24,
    "requiredCustomFields": ["cf_003"]
  },
  "metadata": {
    "createdAt": "2024-06-01T10:00:00Z",
    "ticketCount": 456,
    "avgResolutionTime": "18.5 hours"
  }
}
```

### Category Features

- **Visual Identity**: Color and icon for easy recognition
- **Default Settings**: Auto-populate certain fields when category is selected
- **SLA Configuration**: Service level agreement timers per category
- **Required Fields**: Enforce certain custom fields based on category
- **Statistics**: Track performance metrics per category

### Settings Hierarchy

```
Organization Settings (Global)
    ├── Business Area Settings
    │       ├── Category Settings
    │       └── Custom Field Definitions
    └── Default Ticket Settings
```

**Precedence**: Category Settings > Business Area Settings > Organization Settings

---

## Privacy and Access Control

### Private Tickets

When a ticket is marked as **private**:

**Who Can See**:
- Ticket logger (creator)
- All assignees
- All explicitly added subscribers
- Business area administrators
- Business area analysts
- Organization admins

**Who Cannot See**:
- General employees browsing the business area
- Other employees in the same business area (unless explicitly added as subscribers)
- Users without explicit access
- External integrations (unless configured)

**Visibility Behavior**:
- **private = false**: Ticket is visible to all members of the business area and can be found in searches
- **private = true**: Ticket is visible only to logger, assignees, subscribers, business area administrators, business area analysts, and organization admins

**Privacy Controls**:
```json
{
  "private": true,
  "privacySettings": {
    "hideFromSearch": true,
    "hideFromReports": false,
    "allowExternalSummaryView": false,
    "restrictAttachmentDownload": true
  }
}
```

### Permission Model

**Ticket-Level Permissions**:

| Action | Logger | Subscriber | Assignee | BA Admin | BA Analyst | Org Admin |
|--------|--------|------------|----------|----------|------------|-----------|
| View Ticket (Public) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Ticket (Private) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add Update | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit Own Update | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit Any Update | - | - | - | ✓ | - | ✓ |
| Add Subscriber | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Remove Subscriber | - | Self | ✓ | ✓ | ✓ | ✓ |
| Assign Ticket | - | - | - | ✓ | ✓ | ✓ |
| Change Status | - | - | ✓ | ✓ | ✓ | ✓ |
| Change Severity | - | - | ✓ | ✓ | ✓ | ✓ |
| Change Request Type | - | - | ✓ | ✓ | ✓ | ✓ |
| Close Ticket | - | - | ✓ | ✓ | ✓ | ✓ |
| Reopen Ticket | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Delete Ticket | - | - | - | ✓ | - | ✓ |
| View Internal Summary | - | - | ✓ | ✓ | ✓ | ✓ |
| Edit Internal Summary | - | - | ✓ | ✓ | ✓ | ✓ |
| View External Summary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Link Tickets | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Create Tasks | - | - | ✓ | ✓ | ✓ | ✓ |
| Complete Tasks | - | - | Assigned | ✓ | ✓ | ✓ |

**Business Area-Level Permissions**:

| Action | BA Admin | BA Analyst | Org Admin |
|--------|----------|------------|-----------|
| View All Tickets in BA | ✓ | ✓ | ✓ |
| View All Private Tickets in BA | ✓ | ✓ | ✓ |
| Modify BA Configuration | ✓ | - | ✓ |
| Add/Remove Categories | ✓ | - | ✓ |
| Add/Remove Custom Fields | ✓ | - | ✓ |
| Manage BA Administrators | ✓ | - | ✓ |
| Manage BA Analysts | ✓ | - | ✓ |
| Delete Business Area | - | - | ✓ |
| Export All BA Data | ✓ | ✓ | ✓ |
| Generate BA Reports | ✓ | ✓ | ✓ |

**Role Definitions**:

- **Logger**: The employee who created the ticket
- **Subscriber**: An employee who has been added to receive notifications about the ticket
- **Assignee**: An employee assigned to work on the ticket
- **BA Admin** (Business Area Administrator): Can modify business area configuration, manage roles, and has full access to all tickets
- **BA Analyst** (Business Area Analyst): Can access all tickets in the business area including private ones, but cannot modify configuration
- **Org Admin** (Organization Administrator): System-wide administrator with full access

### Data Access Audit

All ticket access is logged:

```json
{
  "auditId": "audit_uuid",
  "ticketId": "ticket_uuid",
  "ticketNumber": "FinData#1234",
  "action": "view",
  "employeeId": "EMP-2023-045",
  "timestamp": "2025-12-01T14:30:00Z",
  "ipAddress": "192.168.1.100",
  "result": "success"
}
```

---

## Advanced Search

The advanced search feature allows users to search for tickets using multiple criteria and filters to find exactly what they need.

### Search Filters

#### Assignee Filters

Search by one or more assignees (individuals or user-groups):

```json
{
  "assignees": [
    {
      "type": "individual",
      "employeeId": "EMP-2023-045"
    },
    {
      "type": "user-group",
      "groupId": "ug_findata_team_001"
    }
  ],
  "assigneeMatchMode": "any"  // "any" or "all"
}
```

- **assigneeMatchMode**:
  - `any`: Returns tickets assigned to ANY of the specified assignees/groups
  - `all`: Returns tickets assigned to ALL of the specified assignees/groups

#### Logger Filter

Search by the ticket logger (creator):

```json
{
  "logger": {
    "type": "individual",
    "employeeId": "EMP-2024-001"
  }
}
```

Or by user-group:

```json
{
  "logger": {
    "type": "user-group",
    "groupId": "ug_sales_team_001"
  }
}
```

#### Text Search

Search for text in ticket subject or any ticket updates:

```json
{
  "textSearch": {
    "query": "financial reports access",
    "fields": ["subject", "updates"],  // Fields to search in
    "matchMode": "any"  // "any" (OR) or "all" (AND)
  }
}
```

- **fields**: Array specifying where to search
  - `subject`: Search in ticket subject
  - `updates`: Search in all ticket update content (both internal and external)
  - `internalSummary`: Search in internal summary
  - `externalSummary`: Search in external summary
- **matchMode**:
  - `any`: Match any of the search terms (OR)
  - `all`: Match all search terms (AND)

#### Date Filters

Search by various date fields with flexible time ranges:

**Logged Date (Ticket Creation Date)**:

```json
{
  "loggedDate": {
    "mode": "relative",
    "value": "1week"  // "1week", "1month", or custom date range
  }
}
```

**Last Updated Date**:

```json
{
  "lastUpdatedDate": {
    "mode": "relative",
    "value": "1month"
  }
}
```

**Closed Date**:

```json
{
  "closedDate": {
    "mode": "dateRange",
    "startDate": "2025-11-01T00:00:00Z",
    "endDate": "2025-12-01T23:59:59Z"
  }
}
```

**Date Filter Options**:

- **mode**: `relative` or `dateRange`
  - `relative`: Use predefined relative time periods
    - `1week`: Past 7 days
    - `1month`: Past 30 days
    - `3months`: Past 90 days
    - `6months`: Past 180 days
    - `1year`: Past 365 days
  - `dateRange`: Specify exact start and end dates
    - `startDate`: ISO 8601 format datetime
    - `endDate`: ISO 8601 format datetime

#### Additional Filters

**Status Filter**:

```json
{
  "status": ["Active", "Pending", "Assigned"]  // Array of statuses
}
```

**Category Filter**:

```json
{
  "categories": ["cat_001", "cat_004"]  // Array of category IDs
}
```

**Severity Filter**:

```json
{
  "severity": ["high", "critical"]  // Array of severity levels
}
```

**Request Type Filter**:

```json
{
  "requestType": ["bug_fix", "feature"]  // Array of request types
}
```

**Private Ticket Filter**:

```json
{
  "includePrivate": true  // true to include private tickets (if user has permission)
}
```

### Complete Search Request Example

```json
{
  "businessAreaId": "ba_unique_id",
  "filters": {
    "assignees": [
      {
        "type": "user-group",
        "groupId": "ug_findata_team_001"
      }
    ],
    "assigneeMatchMode": "any",
    "logger": {
      "type": "individual",
      "employeeId": "EMP-2024-001"
    },
    "textSearch": {
      "query": "database access permissions",
      "fields": ["subject", "updates"],
      "matchMode": "any"
    },
    "loggedDate": {
      "mode": "relative",
      "value": "1month"
    },
    "lastUpdatedDate": {
      "mode": "relative",
      "value": "1week"
    },
    "status": ["Active", "Pending"],
    "severity": ["high", "critical"],
    "includePrivate": false
  },
  "sorting": {
    "field": "lastUpdatedDate",  // "loggedDate", "lastUpdatedDate", "closedDate", "severity", "status"
    "order": "desc"  // "asc" or "desc"
  },
  "pagination": {
    "page": 1,
    "pageSize": 25
  }
}
```

### Search Response Format

The search returns a list of matching tickets with basic details:

```json
{
  "results": [
    {
      "ticketId": "ticket_uuid",
      "ticketNumber": "FinData#1234",
      "subject": "Unable to access Q4 financial reports",
      "status": "Active",
      "severity": "high",
      "logger": {
        "employeeId": "EMP-2024-001",
        "name": "John Doe",
        "email": "john.doe@acme.com"
      },
      "loggedDate": "2025-12-01T09:00:00Z",
      "lastUpdatedDate": "2025-12-05T14:30:00Z",
      "assignees": [
        {
          "type": "user-group",
          "groupId": "ug_findata_team_001",
          "groupName": "Financial Data Team"
        },
        {
          "type": "individual",
          "employeeId": "EMP-2023-045",
          "name": "Jane Smith"
        }
      ],
      "category": {
        "categoryId": "cat_004",
        "name": "Data Request"
      },
      "private": false,
      "updateCount": 5
    },
    {
      "ticketId": "ticket_uuid_2",
      "ticketNumber": "FinData#1235",
      "subject": "Database permissions for reporting module",
      "status": "Pending",
      "severity": "medium",
      "logger": {
        "employeeId": "EMP-2024-002",
        "name": "Sarah Johnson",
        "email": "sarah.johnson@acme.com"
      },
      "loggedDate": "2025-12-03T10:15:00Z",
      "lastUpdatedDate": "2025-12-03T10:15:00Z",
      "assignees": [],
      "category": {
        "categoryId": "cat_004",
        "name": "Data Request"
      },
      "private": false,
      "updateCount": 1
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalResults": 47,
    "totalPages": 2
  },
  "executionTime": "145ms"
}
```

### Search Result Fields

Each ticket in the search results includes:

| Field | Type | Description |
|-------|------|-------------|
| ticketId | UUID | Unique internal identifier |
| ticketNumber | String | Human-readable ticket number |
| subject | String | Ticket subject line |
| status | String | Current ticket status |
| severity | String | Ticket severity level |
| logger | Object | Employee who created the ticket |
| loggedDate | DateTime | When the ticket was created |
| lastUpdatedDate | DateTime | When the ticket was last updated |
| assignees | Array | List of assignees (individuals and/or user-groups) |
| category | Object | Ticket category |
| private | Boolean | Whether ticket is private |
| updateCount | Number | Number of updates on the ticket |

### Search Permissions

- **Public Tickets**: All users can search and view results
- **Private Tickets**: Only included in results if user has permission:
  - Ticket logger
  - Ticket assignee
  - Ticket subscriber
  - Business area administrator
  - Business area analyst
  - Organization administrator

### Search API Endpoint

```
POST /api/v1/tickets/advanced-search
```

**Request Body**: Search criteria as shown in examples above

**Response**: Search results with pagination information

**Example cURL**:

```bash
curl -X POST https://api.example.com/api/v1/tickets/advanced-search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "businessAreaId": "ba_unique_id",
    "filters": {
      "textSearch": {
        "query": "database access",
        "fields": ["subject", "updates"],
        "matchMode": "any"
      },
      "loggedDate": {
        "mode": "relative",
        "value": "1month"
      }
    },
    "sorting": {
      "field": "lastUpdatedDate",
      "order": "desc"
    }
  }'
```

### Performance Considerations

- Text search is indexed for optimal performance
- Complex searches with multiple filters may take longer
- Results are cached for 5 minutes for identical queries
- Maximum 1000 results per search (use pagination for more)
- Searches are scoped to a single business area for performance

---

## API Endpoints

### Business Area Management

```
GET    /api/v1/organizations/{orgId}/business-areas
POST   /api/v1/organizations/{orgId}/business-areas
GET    /api/v1/business-areas/{areaId}
PATCH  /api/v1/business-areas/{areaId}
DELETE /api/v1/business-areas/{areaId}

GET    /api/v1/business-areas/{areaId}/categories
POST   /api/v1/business-areas/{areaId}/categories
PATCH  /api/v1/categories/{categoryId}
DELETE /api/v1/categories/{categoryId}

GET    /api/v1/business-areas/{areaId}/custom-fields
POST   /api/v1/business-areas/{areaId}/custom-fields
PATCH  /api/v1/custom-fields/{fieldId}
DELETE /api/v1/custom-fields/{fieldId}

GET    /api/v1/business-areas/{areaId}/administrators
POST   /api/v1/business-areas/{areaId}/administrators
DELETE /api/v1/business-areas/{areaId}/administrators/{employeeId}

GET    /api/v1/business-areas/{areaId}/analysts
POST   /api/v1/business-areas/{areaId}/analysts
DELETE /api/v1/business-areas/{areaId}/analysts/{employeeId}
```

### Ticket Management

```
GET    /api/v1/business-areas/{areaId}/tickets
POST   /api/v1/business-areas/{areaId}/tickets
GET    /api/v1/tickets/{ticketId}
GET    /api/v1/tickets/by-number/{ticketNumber}
PATCH  /api/v1/tickets/{ticketId}
DELETE /api/v1/tickets/{ticketId}

POST   /api/v1/tickets/{ticketId}/assign
POST   /api/v1/tickets/{ticketId}/subscribe
DELETE /api/v1/tickets/{ticketId}/subscribe/{employeeId}
PATCH  /api/v1/tickets/{ticketId}/status
PATCH  /api/v1/tickets/{ticketId}/severity
PATCH  /api/v1/tickets/{ticketId}/request-type
POST   /api/v1/tickets/{ticketId}/close
POST   /api/v1/tickets/{ticketId}/reopen
```

### Ticket Updates

```
GET    /api/v1/tickets/{ticketId}/updates
POST   /api/v1/tickets/{ticketId}/updates
GET    /api/v1/updates/{updateId}
PATCH  /api/v1/updates/{updateId}
DELETE /api/v1/updates/{updateId}

POST   /api/v1/updates/{updateId}/attachments
GET    /api/v1/attachments/{attachmentId}
DELETE /api/v1/attachments/{attachmentId}
```

### Ticket Relationships

```
POST   /api/v1/tickets/{ticketId}/relationships
GET    /api/v1/tickets/{ticketId}/relationships
DELETE /api/v1/relationships/{relationshipId}

GET    /api/v1/tickets/{ticketId}/parent
POST   /api/v1/tickets/{ticketId}/parent
DELETE /api/v1/tickets/{ticketId}/parent

GET    /api/v1/tickets/{ticketId}/children
GET    /api/v1/tickets/{ticketId}/linked
```

### Tasks

```
GET    /api/v1/tickets/{ticketId}/tasks
POST   /api/v1/tickets/{ticketId}/tasks
GET    /api/v1/tasks/{taskId}
PATCH  /api/v1/tasks/{taskId}
DELETE /api/v1/tasks/{taskId}
POST   /api/v1/tasks/{taskId}/complete
POST   /api/v1/tasks/reorder
```

### Search and Reporting

```
GET    /api/v1/tickets/search
GET    /api/v1/business-areas/{areaId}/reports/summary
GET    /api/v1/business-areas/{areaId}/reports/by-category
GET    /api/v1/business-areas/{areaId}/reports/by-assignee
GET    /api/v1/business-areas/{areaId}/reports/sla-compliance
```

---

## Use Cases

### Use Case 1: Creating a New Ticket

**Scenario**: An employee needs to log a desktop support issue.

**Actor**: Employee (Ticket Logger)

**Flow**:
1. Employee navigates to ticketing system
2. Selects business area "IT Support" (prefix: "IT")
3. System presents ticket creation form with:
   - Subject field
   - Category dropdown (pre-configured list)
   - Due date picker
   - Custom fields based on business area
4. Employee fills in details:
   - Subject: "Laptop screen flickering intermittently"
   - Category: "Desktop Support"
   - Priority: "Medium" (custom field)
   - Affected Asset: "Laptop-12345" (custom field)
5. System auto-generates ticket number: "IT#5679"
6. System auto-subscribes the logger
7. System creates initial update with ticket details
8. System sends notification to default assignees for "Desktop Support" category
9. Ticket is created with status "Pending"

**Result**:
```json
{
  "ticketNumber": "IT#5679",
  "subject": "Laptop screen flickering intermittently",
  "category": {"name": "Desktop Support"},
  "status": "Pending",
  "logger": {"employeeId": "EMP-2024-001"},
  "subscribers": [{"employeeId": "EMP-2024-001", "autoSubscribed": true}],
  "customFields": {
    "priority": {"value": "medium"},
    "affectedAsset": {"value": "Laptop-12345"}
  }
}
```

---

### Use Case 2: Assigning and Working a Ticket

**Scenario**: A support technician is assigned to work on a ticket and provides updates.

**Actors**: Manager, Assignee (Support Technician)

**Flow**:
1. Manager reviews pending tickets in "Desktop Support" category
2. Manager assigns ticket "IT#5679" to support technician
3. System updates ticket status to "Assigned"
4. System auto-subscribes assignee to ticket
5. Assignee receives notification
6. Assignee reviews ticket and changes status to "Active"
7. Assignee creates tasks:
   - "Diagnose screen issue"
   - "Order replacement screen if needed"
   - "Install and test new screen"
8. Assignee adds update: "Diagnosed issue - faulty display cable. Ordering replacement part."
9. Assignee marks first task as completed
10. System sends update notification to all subscribers

**Status Progression**: Pending → Assigned → Active

**Data Changes**:
```json
{
  "assignees": [
    {
      "employeeId": "EMP-2023-055",
      "assignedAt": "2025-12-01T10:00:00Z",
      "assignedBy": "EMP-2022-012"
    }
  ],
  "status": "Active",
  "tasks": [
    {"title": "Diagnose screen issue", "status": "completed"},
    {"title": "Order replacement screen if needed", "status": "in_progress"},
    {"title": "Install and test new screen", "status": "pending"}
  ],
  "updateCount": 2
}
```

---

### Use Case 3: Managing Subscribers

**Scenario**: Additional stakeholders need to be kept informed about ticket progress.

**Actors**: Ticket Logger, Assignee

**Flow**:
1. Logger realizes their manager should be aware of the issue
2. Logger adds manager as subscriber to ticket
3. System sends notification to manager about subscription
4. Manager receives all subsequent updates
5. Later, assignee adds vendor contact as subscriber for coordination
6. Vendor receives external updates only (not internal summaries)
7. After resolution, logger unsubscribes themselves to stop notifications
8. System maintains history of all subscriber changes

**Subscriber Management**:
```json
{
  "subscribers": [
    {
      "employeeId": "EMP-2024-001",
      "subscribedAt": "2025-12-01T09:00:00Z",
      "autoSubscribed": true,
      "unsubscribedAt": "2025-12-05T16:00:00Z"
    },
    {
      "employeeId": "EMP-2022-012",
      "subscribedAt": "2025-12-01T11:00:00Z",
      "autoSubscribed": false,
      "addedBy": "EMP-2024-001"
    },
    {
      "employeeId": "VENDOR-001",
      "subscribedAt": "2025-12-02T09:00:00Z",
      "autoSubscribed": false,
      "addedBy": "EMP-2023-055",
      "accessLevel": "external"
    }
  ]
}
```

---

### Use Case 4: Linking Related Tickets

**Scenario**: Multiple tickets are related to a broader infrastructure issue.

**Actors**: Support Technician, Manager

**Flow**:
1. Technician notices multiple reports of network connectivity issues
2. Creates parent ticket: "FinData#1300 - Network Infrastructure Investigation"
3. Links existing tickets as children:
   - "FinData#1301 - Cannot access file shares"
   - "FinData#1302 - Email sync issues"
   - "FinData#1303 - Slow VPN connection"
4. Technician discovers root cause requires switch replacement (different department)
5. Creates blocking relationship: "FinData#1300" blocked by "IT#5680 - Replace network switch"
6. System prevents closing parent ticket until blocker is resolved
7. System shows dependency visualization in ticket view
8. Once IT#5680 is closed, technician can proceed with closing parent ticket
9. Closing parent ticket prompts to close all child tickets

**Relationship Structure**:
```json
{
  "parentTicket": {
    "ticketNumber": "FinData#1300",
    "children": ["FinData#1301", "FinData#1302", "FinData#1303"]
  },
  "linkedTickets": [
    {
      "ticketNumber": "IT#5680",
      "relationshipType": "blocked_by"
    }
  ]
}
```

---

### Use Case 5: Using Internal vs External Summaries

**Scenario**: Assignee needs to provide different levels of detail to different audiences.

**Actors**: Assignee, Logger (Customer), Manager

**Flow**:
1. Ticket involves a security vulnerability that needs careful communication
2. Assignee updates **Internal Summary**:
   - "Critical SQL injection vulnerability found in reporting module"
   - "Affects all users with report builder access"
   - "Patch available, testing in staging environment"
   - "Coordinating with security team for disclosure timeline"
3. Assignee updates **External Summary**:
   - "We've identified an issue with the reporting module that requires an update"
   - "We're testing a fix and will notify you when it's ready to deploy"
   - "No action required from your end at this time"
4. Logger sees only external summary when viewing ticket
5. Manager sees both summaries
6. Assignees see both summaries
7. Updates can be marked as internal or external visibility
8. System ensures sensitive information stays internal

**Summary Access Control**:

| Role | Internal Summary | External Summary |
|------|-----------------|------------------|
| Logger | ✗ | ✓ |
| Subscriber (non-assignee) | ✗ | ✓ |
| Assignee | ✓ | ✓ |
| Manager | ✓ | ✓ |
| Admin | ✓ | ✓ |

---

### Use Case 6: Private Ticket Workflow

**Scenario**: HR needs to log a confidential ticket about an employee matter.

**Actors**: HR Administrator, HR Manager, IT Admin

**Flow**:
1. HR Administrator creates ticket in "HR Services" business area
2. Marks ticket as **Private**
3. Subject: "Employee data access audit for John Doe"
4. System restricts visibility:
   - Only HR Administrator (logger) can see
   - Only users with `canViewPrivateTickets` permission can see
5. HR Manager (has permission) assigns ticket to IT Admin
6. IT Admin gains access upon assignment
7. Ticket does not appear in:
   - Public ticket lists
   - General search results (unless user has permission)
   - Department dashboards (unless filtered for private)
8. All updates maintain privacy settings
9. Audit log tracks all access attempts

**Privacy Indicators**:
```json
{
  "ticketNumber": "HR#1234",
  "private": true,
  "visibleTo": [
    "EMP-HR-001", // Logger
    "EMP-HR-005", // HR Manager
    "EMP-IT-012"  // IT Admin (assignee)
  ],
  "privacySettings": {
    "hideFromSearch": true,
    "hideFromReports": true,
    "restrictAttachmentDownload": true
  }
}
```

---

### Use Case 7: Custom Fields in Action

**Scenario**: Financial Data business area uses custom fields to track data requests.

**Actors**: Data Analyst (Logger), Data Engineer (Assignee)

**Flow**:
1. Data Analyst creates ticket: "FinData#1400 - Q4 Revenue by Region Report"
2. Fills in custom fields:
   - **Requires Data Access** (Boolean): Yes
   - **Target Completion Date** (Date): 2025-12-20
   - **Priority** (Enum - Single): High
   - **Impacted Systems** (Enum - Multi): ["ERP", "BI Platform"]
   - **Data Classification** (Enum - Single): Confidential
   - **Business Unit** (Enum - Single): Sales
3. System validates required fields based on category
4. Data Engineer filters tickets by "Requires Data Access = Yes"
5. Finds and assigns ticket to self
6. Updates custom field **Data Source Identified** (Boolean): Yes
7. Uses custom fields for reporting:
   - Tickets by Priority
   - Average completion time by Business Unit
   - Impacted Systems analysis
8. Custom fields drive automated workflows:
   - High priority tickets auto-escalate after 24 hours
   - Confidential data requests require manager approval
   - Multi-system requests auto-subscribe system owners

**Custom Field Configuration**:
```json
{
  "businessAreaId": "FinData",
  "customFields": [
    {
      "name": "requiresDataAccess",
      "type": "boolean",
      "required": false,
      "defaultValue": false
    },
    {
      "name": "priority",
      "type": "enum",
      "required": true,
      "options": [
        {"value": "critical", "label": "Critical"},
        {"value": "high", "label": "High"},
        {"value": "medium", "label": "Medium"},
        {"value": "low", "label": "Low"}
      ]
    },
    {
      "name": "impactedSystems",
      "type": "enum",
      "multiple": true,
      "options": [
        {"value": "erp", "label": "ERP"},
        {"value": "bi", "label": "BI Platform"}
      ]
    }
  ]
}
```

---

## Business Rules and Validation

### Ticket Creation Rules

1. **Ticket Number Generation**:
   - Format: `{BusinessAreaPrefix}#{SequenceNumber}`
   - Sequence number auto-increments per business area
   - Cannot be manually set or changed
   - Must be unique across the organization

2. **Required Fields**:
   - Subject (max 200 characters)
   - Category (must exist in business area)
   - Severity (must be one of: low, medium, high, critical)
   - Request Type (must be one of: feature, bug_fix, qa_testing, support, other)
   - Due date (cannot be in the past)
   - Logger (auto-populated from current user)

3. **Default Values**:
   - Status: "Pending"
   - Severity: "medium"
   - Request Type: "support"
   - Private: false
   - Logger is auto-subscribed
   - Due date defaults to business area setting (e.g., +7 days)

### Status Transition Rules

| From Status | To Status | Condition |
|-------------|-----------|-----------|
| Pending | Assigned | Must have at least one assignee |
| Pending | Closed | Allowed with reason |
| Assigned | Active | Assignee must acknowledge |
| Assigned | Suspended | Requires reason in update |
| Assigned | Closed | Allowed with resolution |
| Active | Suspended | Requires reason in update |
| Active | Closed | Requires resolution in update |
| Suspended | Active | Requires reactivation reason |
| Suspended | Closed | Requires resolution |
| Closed | Any | Reopen allowed within 30 days (configurable) |

### Assignment Rules

1. **Assignee Requirements**:
   - Must be an active employee
   - Must have permission to be assigned in business area
   - Can have multiple assignees per ticket
   - Cannot assign to self if ticket is private and user doesn't have access

2. **Auto-Assignment**:
   - Category can define default assignees
   - Round-robin assignment available
   - Load-balancing based on current assignee workload

### Subscriber Rules

1. **Auto-Subscription**:
   - Logger is always auto-subscribed
   - Assignees are auto-subscribed when assigned
   - Category can define auto-subscribe users

2. **Manual Subscription**:
   - Anyone with ticket access can subscribe
   - Can unsubscribe self (except logger while ticket is open)
   - Cannot subscribe others without permission

3. **Subscription Limits**:
   - Maximum 50 subscribers per ticket (configurable)
   - Warning when exceeding 20 subscribers

### Relationship Rules

1. **Parent-Child**:
   - Cannot create circular relationships
   - Parent cannot be closed if children are open (configurable)
   - Maximum depth: 5 levels (configurable)
   - Cannot set ticket as its own parent

2. **Linked Tickets**:
   - Maximum 20 linked tickets per ticket (configurable)
   - "Blocks" relationship prevents closing blocked ticket
   - Cannot create duplicate relationships
   - Can link across business areas

### Update Rules

1. **Update Creation**:
   - Must have content or attachments or field changes
   - Rich text sanitized to prevent XSS
   - Maximum content length: 50,000 characters

2. **Update Editing**:
   - Can edit own update within 15 minutes (configurable)
   - Cannot edit after someone has replied
   - Edit history is maintained
   - Admins can edit any update with reason

3. **Attachment Rules**:
   - Maximum file size: 10 MB per file (configurable)
   - Maximum 10 attachments per update (configurable)
   - Allowed file types defined in organization settings
   - Virus scanning required before acceptance

### Task Rules

1. **Task Creation**:
   - Title required (max 100 characters)
   - Description optional (max 1,000 characters)
   - Must be assigned to ticket assignee or manager
   - Cannot create tasks on closed tickets

2. **Task Completion**:
   - Only assigned user or manager can complete
   - Can mark as completed or skipped
   - Completion generates an update

### Custom Field Rules

1. **Field Validation**:
   - Required fields must be filled before ticket creation
   - Date fields respect min/max validation
   - Enum fields only accept defined values
   - Multi-select respects min/max selection limits

2. **Field Dependencies**:
   - Conditional fields shown/hidden based on other field values
   - Required status can be conditional
   - Validation rules can reference other fields

### Due Date Rules

1. **Setting Due Dates**:
   - Cannot be in the past (except for backdated tickets with permission)
   - Warning if due date is less than 1 hour away
   - Business hours vs calendar hours (configurable)

2. **Due Date Notifications**:
   - Reminder sent 24 hours before due date
   - Escalation if past due by configurable threshold
   - Overdue tickets highlighted in dashboard

### Severity Rules

1. **Severity Changes**:
   - Can be changed by assignees, business area administrators, business area analysts, and org admins
   - Severity changes generate an update in the ticket history
   - Escalating severity (e.g., medium → high) triggers notification to subscribers
   - Critical severity tickets may trigger additional alerts based on configuration

2. **Severity-Based Automation**:
   - Critical tickets can auto-escalate to business area administrators
   - High severity may adjust default SLA timelines
   - Low severity tickets can be deprioritized in queues
   - Severity can affect ticket assignment routing

### Request Type Rules

1. **Request Type Changes**:
   - Can be changed by assignees, business area administrators, business area analysts, and org admins
   - Request type changes generate an update in the ticket history
   - Changing request type may trigger workflow changes

2. **Request Type-Based Workflows**:
   - **feature**: May require additional approval steps before implementation
   - **bug_fix**: May auto-link to related feature tickets
   - **qa_testing**: May require test plan attachment or checklist
   - **support**: Typically follows standard support workflow
   - **other**: Custom workflow as configured

### Privacy Rules

1. **Private Ticket Access**:
   - Logger always has access
   - Assignees always have access
   - Subscribers have access (they were explicitly added)
   - Business area administrators always have access
   - Business area analysts always have access
   - Organization admins always have access
   - Cannot make ticket public once private (configurable)

2. **Private Ticket Actions**:
   - Cannot appear in public search results
   - Not visible in business area ticket lists to general users
   - Cannot be linked from non-private tickets (warning shown)
   - Attachments require authentication to download
   - Email notifications redacted for non-authorized recipients
   - Ticket number still follows same format but visibility is restricted

### Deletion Rules

1. **Ticket Deletion**:
   - Only admins can delete tickets
   - Soft delete (archived) by default
   - Cannot delete tickets with children
   - Deletion requires reason and approval
   - Audit trail maintained even after deletion

2. **Update Deletion**:
   - Admins only
   - Cannot delete system-generated updates
   - Deletion marked in audit trail
   - Original content retained in audit log

---

## Technical Considerations

### Performance

1. **Indexing Strategy**:
   - Index on ticketNumber for fast lookup
   - Index on businessAreaId + status for filtering
   - Index on assignees for workload queries
   - Index on dueDate for overdue reports
   - Full-text index on subject and updates

2. **Pagination**:
   - Default page size: 25 tickets
   - Maximum page size: 100 tickets
   - Cursor-based pagination for large datasets

3. **Caching**:
   - Cache business area configurations
   - Cache category definitions
   - Cache user permissions
   - Invalidate on configuration changes

### Scalability

1. **Data Partitioning**:
   - Partition tickets by business area
   - Partition updates by date
   - Archive closed tickets older than 2 years (configurable)

2. **File Storage**:
   - Store attachments in object storage (S3, Azure Blob)
   - Generate signed URLs for secure access
   - Implement CDN for frequently accessed attachments

### Integration

1. **Email Integration**:
   - Create tickets via email
   - Update tickets via email reply
   - Send notifications via email
   - Parse attachments from email

2. **Webhook Support**:
   - Notify external systems on ticket events
   - Support for custom integrations
   - Retry logic for failed webhooks

3. **API Versioning**:
   - Version API endpoints (/api/v1/, /api/v2/)
   - Maintain backward compatibility
   - Deprecation notices for old versions

### Monitoring and Reporting

1. **Metrics**:
   - Average resolution time by category
   - Ticket volume by business area
   - Assignee workload and performance
   - SLA compliance rates
   - Customer satisfaction scores

2. **Dashboards**:
   - Real-time ticket status overview
   - Overdue ticket alerts
   - Category distribution
   - Trend analysis over time

3. **Audit Logging**:
   - Log all ticket access
   - Log all modifications
   - Log permission changes
   - Retain logs for compliance period (7 years configurable)

---

## Future Enhancements

1. **SLA Management**: Automated SLA tracking with escalation policies
2. **Knowledge Base**: Link tickets to solution articles
3. **Automation Rules**: Trigger actions based on conditions
4. **Approval Workflows**: Multi-step approval for certain ticket types
5. **Mobile App**: Native mobile application for ticket management
6. **AI-Powered Features**:
   - Auto-categorization of tickets
   - Suggested solutions based on historical data
   - Sentiment analysis of updates
   - Predictive due date recommendations
7. **Advanced Reporting**: Custom report builder with visualizations
8. **Time Tracking**: Track time spent on tickets for billing/reporting
9. **Customer Portal**: External customer access to tickets
10. **Multi-Language Support**: Internationalization for global organizations
