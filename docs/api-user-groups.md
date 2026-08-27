# User Groups API Documentation

## Overview

The User Groups API provides endpoints for managing user groups within an organization. Groups function as aliases for collections of users, simplifying permission management and access control.

All endpoints require authentication and are scoped to the authenticated user's tenant.

**Base URL**: `/api/v1/groups`

**Authentication**: Bearer token (JWT)

---

## Endpoints

### 1. List All Groups

Get a paginated list of all user groups in the organization.

**Endpoint**: `GET /api/v1/groups`

**Required Permission**: `groups:read:all`

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Results per page (default: 20, max: 100) |
| search | string | No | Search by group name or display name |
| group_type | string | No | Filter by type: `department`, `team`, `project`, `functional`, `affinity`, `custom` |
| is_active | boolean | No | Filter by active status (default: true) |
| department_id | UUID | No | Filter by associated department |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "tenant_id": "acme-tenant-uuid",
      "name": "findata-analysts-group@acme.org",
      "display_name": "Financial Data Analysts",
      "description": "Team responsible for analyzing financial data and generating reports",
      "group_type": "functional",
      "parent_group_id": null,
      "department_id": "finance-dept-uuid",
      "location_id": null,
      "owner_user_id": "owner-user-uuid",
      "is_active": true,
      "is_system_group": false,
      "member_count": 12,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

---

### 2. Get Group by ID

Retrieve details of a specific group.

**Endpoint**: `GET /api/v1/groups/:id`

**Required Permission**: `groups:read:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Response**: `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "acme-tenant-uuid",
  "name": "findata-analysts-group@acme.org",
  "display_name": "Financial Data Analysts",
  "display_name_i18n": {
    "en-US": "Financial Data Analysts",
    "es-ES": "Analistas de Datos Financieros"
  },
  "description": "Team responsible for analyzing financial data and generating reports",
  "description_i18n": {
    "en-US": "Team responsible for analyzing financial data and generating reports",
    "es-ES": "Equipo responsable de analizar datos financieros y generar informes"
  },
  "group_type": "functional",
  "parent_group_id": null,
  "department_id": "finance-dept-uuid",
  "department": {
    "id": "finance-dept-uuid",
    "name": "Finance Department"
  },
  "location_id": null,
  "owner_user_id": "owner-user-uuid",
  "owner": {
    "id": "owner-user-uuid",
    "email": "john.doe@acme.org",
    "first_name": "John",
    "last_name": "Doe"
  },
  "is_active": true,
  "is_system_group": false,
  "member_count": 12,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "created_by": "admin-user-uuid",
  "updated_by": "admin-user-uuid"
}
```

**Error Responses**:
- `404 Not Found` - Group not found
- `403 Forbidden` - Insufficient permissions

---

### 3. Create Group

Create a new user group.

**Endpoint**: `POST /api/v1/groups`

**Required Permission**: `groups:create:all`

**Request Body**:
```json
{
  "name": "findata-analysts-group@acme.org",
  "display_name": "Financial Data Analysts",
  "display_name_i18n": {
    "en-US": "Financial Data Analysts",
    "es-ES": "Analistas de Datos Financieros"
  },
  "description": "Team responsible for analyzing financial data and generating reports",
  "group_type": "functional",
  "parent_group_id": null,
  "department_id": "finance-dept-uuid",
  "location_id": null,
  "owner_user_id": "owner-user-uuid"
}
```

**Validation Rules**:
- `name`: Required, must be unique within tenant, must match email format
- `display_name`: Required, max 255 characters
- `group_type`: Required, must be one of: `department`, `team`, `project`, `functional`, `affinity`, `custom`
- `parent_group_id`: Optional, must reference existing group
- `department_id`: Optional, must reference existing department
- `owner_user_id`: Optional, must reference existing user

**Response**: `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "acme-tenant-uuid",
  "name": "findata-analysts-group@acme.org",
  "display_name": "Financial Data Analysts",
  "group_type": "functional",
  "is_active": true,
  "member_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Validation errors
- `409 Conflict` - Group name already exists
- `403 Forbidden` - Insufficient permissions

---

### 4. Update Group

Update an existing group's details.

**Endpoint**: `PATCH /api/v1/groups/:id`

**Required Permission**: `groups:update:all` or `groups:update:owned` (if user is group owner)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Request Body** (all fields optional):
```json
{
  "display_name": "Senior Financial Data Analysts",
  "description": "Updated description",
  "group_type": "functional",
  "parent_group_id": "parent-group-uuid",
  "department_id": "finance-dept-uuid",
  "owner_user_id": "new-owner-uuid",
  "is_active": true
}
```

**Response**: `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "findata-analysts-group@acme.org",
  "display_name": "Senior Financial Data Analysts",
  "updated_at": "2024-01-16T14:20:00Z"
}
```

**Error Responses**:
- `404 Not Found` - Group not found
- `403 Forbidden` - Insufficient permissions
- `400 Bad Request` - Validation errors

---

### 5. Delete Group

Delete a user group. This will remove all group memberships and role assignments.

**Endpoint**: `DELETE /api/v1/groups/:id`

**Required Permission**: `groups:delete:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Response**: `204 No Content`

**Error Responses**:
- `404 Not Found` - Group not found
- `403 Forbidden` - Insufficient permissions
- `409 Conflict` - Cannot delete system groups

---

## Group Membership Endpoints

### 6. List Group Members

Get all members of a specific group.

**Endpoint**: `GET /api/v1/groups/:id/members`

**Required Permission**: `groups:read:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Results per page (default: 50, max: 200) |
| role_in_group | string | No | Filter by role: `owner`, `admin`, `moderator`, `member` |
| include_expired | boolean | No | Include expired memberships (default: false) |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "member-uuid-1",
      "group_id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user-uuid-1",
      "user": {
        "id": "user-uuid-1",
        "email": "jane.smith@acme.org",
        "first_name": "Jane",
        "last_name": "Smith",
        "photo_url": "https://cdn.example.com/photos/jane.jpg"
      },
      "role_in_group": "admin",
      "joined_at": "2024-01-15T10:35:00Z",
      "expires_at": null,
      "joined_by": "admin-user-uuid"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "total_pages": 1
  }
}
```

---

### 7. Add Group Member

Add a user to a group.

**Endpoint**: `POST /api/v1/groups/:id/members`

**Required Permission**: `groups:members:add:all` or `groups:members:manage:owned` (if user is group owner)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Request Body**:
```json
{
  "user_id": "user-uuid-1",
  "role_in_group": "member",
  "expires_at": null
}
```

**Validation Rules**:
- `user_id`: Required, must reference existing user in same tenant
- `role_in_group`: Optional, default: `member`, must be one of: `owner`, `admin`, `moderator`, `member`
- `expires_at`: Optional, must be future date/time

**Response**: `201 Created`
```json
{
  "id": "member-uuid-1",
  "group_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid-1",
  "role_in_group": "member",
  "joined_at": "2024-01-15T10:35:00Z",
  "expires_at": null
}
```

**Error Responses**:
- `404 Not Found` - Group or user not found
- `409 Conflict` - User is already a member of this group
- `403 Forbidden` - Insufficient permissions

---

### 8. Update Group Member

Update a member's role or expiration.

**Endpoint**: `PATCH /api/v1/groups/:id/members/:user_id`

**Required Permission**: `groups:members:add:all` or `groups:members:manage:owned`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |
| user_id | UUID | Yes | User ID |

**Request Body** (all fields optional):
```json
{
  "role_in_group": "admin",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Response**: `200 OK`
```json
{
  "id": "member-uuid-1",
  "group_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid-1",
  "role_in_group": "admin",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

---

### 9. Remove Group Member

Remove a user from a group.

**Endpoint**: `DELETE /api/v1/groups/:id/members/:user_id`

**Required Permission**: `groups:members:remove:all` or `groups:members:manage:owned`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |
| user_id | UUID | Yes | User ID |

**Response**: `204 No Content`

**Error Responses**:
- `404 Not Found` - Group or membership not found
- `403 Forbidden` - Insufficient permissions

---

### 10. Get User's Groups

Get all groups that a specific user is a member of.

**Endpoint**: `GET /api/v1/users/:user_id/groups`

**Required Permission**: `groups:read:all` or `:self` (if requesting own groups)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| user_id | UUID | Yes | User ID (use `me` for current user) |

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| include_inactive | boolean | No | Include inactive groups (default: false) |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "findata-analysts-group@acme.org",
      "display_name": "Financial Data Analysts",
      "group_type": "functional",
      "role_in_group": "member",
      "joined_at": "2024-01-15T10:35:00Z",
      "expires_at": null
    }
  ],
  "total": 5
}
```

---

## Group Roles Endpoints

### 11. List Group Roles

Get all role assignments for a group.

**Endpoint**: `GET /api/v1/groups/:id/roles`

**Required Permission**: `groups:read:all` or `roles:read:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "group-role-uuid-1",
      "group_id": "550e8400-e29b-41d4-a716-446655440000",
      "role_id": "role-uuid-1",
      "role": {
        "id": "role-uuid-1",
        "name": "financial_analyst",
        "description": "Financial analyst role with report access",
        "permissions": [
          "finance:reports:read:all",
          "finance:dashboards:read:all"
        ]
      },
      "scope_type": "department",
      "scope_department_id": "finance-dept-uuid",
      "assigned_at": "2024-01-15T10:40:00Z",
      "assigned_by": "admin-user-uuid"
    }
  ],
  "total": 3
}
```

---

### 12. Assign Role to Group

Assign a role to a group, granting all group members the permissions from that role.

**Endpoint**: `POST /api/v1/groups/:id/roles`

**Required Permission**: `groups:roles:assign:all` or `roles:assign:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Request Body**:
```json
{
  "role_id": "role-uuid-1",
  "scope_type": "all",
  "scope_department_id": null,
  "scope_location_id": null
}
```

**Validation Rules**:
- `role_id`: Required, must reference existing role
- `scope_type`: Optional, one of: `all`, `department`, `location`, `custom`
- `scope_department_id`: Required if `scope_type` is `department`
- `scope_location_id`: Required if `scope_type` is `location`

**Response**: `201 Created`
```json
{
  "id": "group-role-uuid-1",
  "group_id": "550e8400-e29b-41d4-a716-446655440000",
  "role_id": "role-uuid-1",
  "scope_type": "all",
  "assigned_at": "2024-01-15T10:40:00Z"
}
```

---

### 13. Remove Role from Group

Remove a role assignment from a group.

**Endpoint**: `DELETE /api/v1/groups/:id/roles/:role_id`

**Required Permission**: `groups:roles:remove:all` or `roles:assign:all`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |
| role_id | UUID | Yes | Role ID |

**Response**: `204 No Content`

---

## Utility Endpoints

### 14. Resolve Group Members

Resolve a group name to a list of user IDs. Useful for permission checks and ACL resolution.

**Endpoint**: `POST /api/v1/groups/resolve`

**Required Permission**: `groups:read:all`

**Request Body**:
```json
{
  "group_name": "findata-analysts-group@acme.org",
  "include_nested": true
}
```

**Response**: `200 OK`
```json
{
  "group_name": "findata-analysts-group@acme.org",
  "group_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_ids": [
    "user-uuid-1",
    "user-uuid-2",
    "user-uuid-3"
  ],
  "total_members": 12,
  "resolved_at": "2024-01-15T10:45:00Z"
}
```

---

### 15. Bulk Add Members

Add multiple users to a group in a single request.

**Endpoint**: `POST /api/v1/groups/:id/members/bulk`

**Required Permission**: `groups:members:add:all` or `groups:members:manage:owned`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Group ID |

**Request Body**:
```json
{
  "members": [
    {
      "user_id": "user-uuid-1",
      "role_in_group": "member"
    },
    {
      "user_id": "user-uuid-2",
      "role_in_group": "admin"
    }
  ],
  "skip_existing": true
}
```

**Response**: `200 OK`
```json
{
  "added": 2,
  "skipped": 0,
  "failed": 0,
  "details": [
    {
      "user_id": "user-uuid-1",
      "status": "added",
      "membership_id": "member-uuid-1"
    },
    {
      "user_id": "user-uuid-2",
      "status": "added",
      "membership_id": "member-uuid-2"
    }
  ]
}
```

---

## Webhooks

The following webhook events are triggered for group-related actions:

### Event Types

1. **`group.created`**
   - Triggered when a new group is created
   - Payload includes full group object

2. **`group.updated`**
   - Triggered when group details are modified
   - Payload includes updated fields and previous values

3. **`group.deleted`**
   - Triggered when a group is deleted
   - Payload includes deleted group ID and name

4. **`group.member.added`**
   - Triggered when a user is added to a group
   - Payload includes group ID, user ID, and membership details

5. **`group.member.removed`**
   - Triggered when a user is removed from a group
   - Payload includes group ID and user ID

6. **`group.role.assigned`**
   - Triggered when a role is assigned to a group
   - Payload includes group ID, role ID, and scope details

7. **`group.role.removed`**
   - Triggered when a role is removed from a group
   - Payload includes group ID and role ID

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| `GROUP_NOT_FOUND` | Group not found | The specified group does not exist |
| `GROUP_NAME_EXISTS` | Group name already exists | A group with this name already exists in the tenant |
| `INVALID_GROUP_NAME` | Invalid group name format | Group name must follow email format |
| `INVALID_GROUP_TYPE` | Invalid group type | Group type must be one of the allowed values |
| `USER_NOT_FOUND` | User not found | The specified user does not exist |
| `USER_ALREADY_MEMBER` | User is already a member | The user is already a member of this group |
| `MEMBERSHIP_NOT_FOUND` | Membership not found | The specified group membership does not exist |
| `ROLE_NOT_FOUND` | Role not found | The specified role does not exist |
| `INSUFFICIENT_PERMISSIONS` | Insufficient permissions | User lacks required permissions for this action |
| `CANNOT_DELETE_SYSTEM_GROUP` | Cannot delete system group | System-managed groups cannot be deleted |
| `CIRCULAR_PARENT_REFERENCE` | Circular parent reference | Parent group would create a circular reference |

---

## Example Use Cases

### Use Case 1: Create a Financial Analysts Group

```bash
# Step 1: Create the group
curl -X POST https://api.example.com/api/v1/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "findata-analysts-group@acme.org",
    "display_name": "Financial Data Analysts",
    "group_type": "functional",
    "department_id": "finance-dept-uuid"
  }'

# Step 2: Add members
curl -X POST https://api.example.com/api/v1/groups/550e8400-e29b-41d4-a716-446655440000/members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-uuid-1",
    "role_in_group": "member"
  }'

# Step 3: Assign role to group
curl -X POST https://api.example.com/api/v1/groups/550e8400-e29b-41d4-a716-446655440000/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role_id": "financial-analyst-role-uuid",
    "scope_type": "department",
    "scope_department_id": "finance-dept-uuid"
  }'
```

### Use Case 2: Grant Document Access to a Group

```bash
# Create document access entry with group
curl -X POST https://api.example.com/api/v1/documents/doc-123/access \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "findata-analysts-group@acme.org",
    "access_level": "read"
  }'
```

### Use Case 3: Check User's Group Memberships

```bash
# Get all groups for current user
curl -X GET https://api.example.com/api/v1/users/me/groups \
  -H "Authorization: Bearer $TOKEN"

# Check if user has access based on group membership
curl -X POST https://api.example.com/api/v1/groups/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "findata-analysts-group@acme.org"
  }'
```

---

## Best Practices

1. **Naming Convention**: Use descriptive, email-like names that clearly indicate the group's purpose and organization (e.g., `team-name-group@company.org`)

2. **Group Types**: Choose appropriate group types to maintain organizational clarity:
   - Use `department` for organizational unit groups
   - Use `functional` for cross-departmental teams
   - Use `team` for project-based groups

3. **Permission Inheritance**: Remember that users inherit permissions from ALL groups they belong to. Avoid over-permissioning by carefully managing role assignments.

4. **Group Ownership**: Assign group owners who can manage membership for their groups, reducing administrative burden on IT.

5. **Temporary Membership**: Use `expires_at` for temporary access (contractors, interns, project-based access).

6. **Nested Groups**: Use parent groups sparingly to avoid complex permission inheritance chains.

7. **Audit Logging**: Monitor group membership changes and role assignments through audit logs for compliance.

8. **Bulk Operations**: Use bulk add endpoints when onboarding multiple users to reduce API calls.

9. **Caching**: Cache group membership checks for performance, but implement proper cache invalidation on membership changes.

10. **Documentation**: Document the purpose and access level of each group for security and compliance audits.
