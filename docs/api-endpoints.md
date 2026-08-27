# Centralized API Endpoints Specification

**Version:** 1.0
**Last Updated:** December 4, 2025
**Status:** Consolidated from individual module specifications

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Firm Profile Module](#firm-profile-module)
3. [Employee Profile Module](#employee-profile-module)
4. [Compensation Module](#compensation-module)
5. [Payroll Module](#payroll-module)
6. [Change Request Module](#change-request-module)
7. [Ticketing Module](#ticketing-module)
8. [HR Module](#hr-module)
9. [Accounting Module](#accounting-module)
10. [Marketing Module](#marketing-module)
11. [AI Assistant Module](#ai-assistant-module)

---

## Authentication & Authorization

### Base URL
```
https://api.jhiri.com/v1
```

### Authentication
All API requests require authentication using JWT tokens:

```http
Authorization: Bearer {jwt_token}
```

### Common Headers
```http
Content-Type: application/json
X-Organization-ID: {organization_uuid}
X-Tenant-ID: {tenant_uuid}
Accept-Language: en-US
```

---

## Firm Profile Module

_To be extracted from module-firm-profile.md_

---

## Employee Profile Module

### Employee Management

#### Create Employee
```http
POST /api/v1/employees
```

**Request Body:**
```json
{
  "employeeId": "ACME-2024-001",
  "coreIdentity": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@acme.com"
  },
  "employment": {
    "status": "active",
    "startDate": "2024-01-15"
  }
}
```

**Response:** `201 Created`
```json
{
  "employeeId": "ACME-2024-001",
  "status": "active",
  "createdAt": "2024-12-04T10:00:00Z"
}
```

#### Get Employee
```http
GET /api/v1/employees/{employeeId}
```

**Response:** `200 OK`
```json
{
  "employeeId": "ACME-2024-001",
  "coreIdentity": {...},
  "employment": {...},
  "extendedProfile": {...}
}
```

#### Update Employee
```http
PATCH /api/v1/employees/{employeeId}
```

**Request Body:**
```json
{
  "coreIdentity": {
    "phoneNumber": "+1-555-0123"
  }
}
```

**Response:** `200 OK`

#### Delete Employee
```http
DELETE /api/v1/employees/{employeeId}
```

**Response:** `204 No Content`

#### List Employees
```http
GET /api/v1/employees?status=active&department=engineering&limit=50&offset=0
```

**Response:** `200 OK`
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

### Profile Picture Management

#### Upload Profile Picture
```http
POST /api/v1/employees/{employeeId}/profile-picture
Content-Type: multipart/form-data
```

#### Get Profile Picture
```http
GET /api/v1/employees/{employeeId}/profile-picture
```

### Organization Structure

#### Get Department Employees
```http
GET /api/v1/departments/{departmentId}/employees
```

#### Get Manager's Direct Reports
```http
GET /api/v1/employees/{managerId}/direct-reports
```

### Search & Directory

#### Search Employees
```http
GET /api/v1/employees/search?q=john&fields=name,email,department
```

#### Get Organization Chart
```http
GET /api/v1/organization/chart?rootEmployeeId={employeeId}
```

### History & Audit

#### Get Employee History
```http
GET /api/v1/employees/{employeeId}/history
```

#### Get Audit Trail
```http
GET /api/v1/employees/{employeeId}/audit
```

### GDPR & Data Export

#### Export Employee Data
```http
GET /api/v1/employees/{employeeId}/export
```

**Response:** `200 OK`
```json
{
  "exportId": "export_uuid",
  "downloadUrl": "https://...",
  "expiresAt": "2024-12-11T10:00:00Z"
}
```

### Bulk Operations

#### Bulk Import Employees
```http
POST /api/v1/employees/bulk-import
```

#### Bulk Update Employees
```http
PATCH /api/v1/employees/bulk-update
```

---

## Compensation Module

_To be extracted from module-compensation.md_

---

## Payroll Module

_To be extracted from module-payroll.md_

---

## Change Request Module

_To be extracted from module-change-requests.md_

---

## Ticketing Module

_To be extracted from module-ticketing.md_

---

## HR Module

_To be extracted from module-hr.md_

---

## Accounting Module

### Base URL
```
https://api.jhiri.com/v1/accounting
```

### Chart of Accounts

#### List Accounts
```http
GET /api/v1/accounting/accounts
```

**Query Parameters:**
- `account_type`: asset, liability, equity, revenue, expense
- `is_active`: true, false
- `currency`: USD, EUR, etc.

**Permissions:** `accounting:accounts:read`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "account_code": "1000",
      "account_name": "Cash - Operating Account",
      "account_type": "asset",
      "account_subtype": "current_asset",
      "currency": "USD",
      "current_balance": 125450.75,
      "is_active": true
    }
  ]
}
```

#### Create Account
```http
POST /api/v1/accounting/accounts
```

**Permissions:** `accounting:accounts:create`

**Request Body:**
```json
{
  "account_code": "1050",
  "account_name": "Cash - EUR Account",
  "account_type": "asset",
  "account_subtype": "current_asset",
  "currency": "EUR",
  "parent_account_id": "uuid",
  "description": "European operations cash account"
}
```

**Response:** `201 Created`

### Invoices

#### List Invoices
```http
GET /api/v1/accounting/invoices
```

**Query Parameters:**
- `customer_id`: UUID
- `status`: draft, sent, paid, overdue
- `from_date`, `to_date`: Date range
- `currency`: USD, EUR, etc.

**Permissions:** `accounting:invoices:read`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "invoice_number": "INV-2025-001",
      "customer": {
        "id": "uuid",
        "name": "Acme Corp"
      },
      "invoice_date": "2025-12-01",
      "due_date": "2025-12-15",
      "currency": "USD",
      "total": 5000.00,
      "amount_due": 5000.00,
      "status": "sent"
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

#### Create Invoice
```http
POST /api/v1/accounting/invoices
```

**Permissions:** `accounting:invoices:create`

**Request Body:**
```json
{
  "customer_id": "uuid",
  "invoice_date": "2025-12-03",
  "due_date": "2025-12-18",
  "currency": "USD",
  "payment_terms": "Net 15",
  "line_items": [
    {
      "description": "Consulting Services - December",
      "quantity": 40,
      "unit_price": 150.00,
      "revenue_account_id": "uuid",
      "tax_rate_id": "uuid"
    }
  ],
  "notes": "Thank you for your business!",
  "tracking_categories": {
    "region": "North America",
    "project": "Implementation"
  }
}
```

**Response:** `201 Created`

#### Send Invoice
```http
PUT /api/v1/accounting/invoices/{id}/send
```

**Permissions:** `accounting:invoices:send`

**Request Body:**
```json
{
  "send_email": true,
  "email_to": "customer@example.com",
  "email_cc": ["accounting@mycompany.com"],
  "email_subject": "Invoice INV-2025-001",
  "email_body": "Please find attached invoice for services rendered."
}
```

**Response:** `200 OK`

#### Download Invoice PDF
```http
GET /api/v1/accounting/invoices/{id}/pdf
```

**Permissions:** `accounting:invoices:read`

**Response:** `200 OK` (PDF file download)

### Payments

#### Record Payment
```http
POST /api/v1/accounting/payments
```

**Permissions:** `accounting:payments:create`

**Request Body:**
```json
{
  "customer_id": "uuid",
  "payment_date": "2025-12-03",
  "amount": 5000.00,
  "currency": "USD",
  "payment_method": "bank_transfer",
  "bank_account_id": "uuid",
  "reference": "Wire transfer confirmation #12345",
  "allocations": [
    {
      "invoice_id": "uuid",
      "amount": 3000.00
    },
    {
      "invoice_id": "uuid",
      "amount": 2000.00
    }
  ]
}
```

**Response:** `201 Created`

### Bills

#### Upload Bill
```http
POST /api/v1/accounting/bills/upload
```

**Permissions:** `accounting:bills:create`

**Request:** Multipart form data with file

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "bill_id": "uuid",
    "file_url": "https://storage.../bill.pdf",
    "ocr_data": {
      "vendor_name": "Office Supplies Inc",
      "bill_date": "2025-11-30",
      "due_date": "2025-12-30",
      "total": 1250.00,
      "confidence": 0.92,
      "line_items": [
        {
          "description": "Office chairs (10x)",
          "amount": 1000.00,
          "confidence": 0.95
        }
      ]
    }
  }
}
```

#### Approve Bill
```http
PUT /api/v1/accounting/bills/{id}/approve
```

**Permissions:** `accounting:bills:approve`

**Response:** `200 OK`

### Bank Reconciliation

#### Get Bank Transactions
```http
GET /api/v1/accounting/bank-accounts/{id}/transactions
```

**Query Parameters:**
- `status`: unmatched, matched, reconciled
- `from_date`, `to_date`: Date range

**Permissions:** `accounting:bank:read`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transaction_date": "2025-12-01",
      "description": "WIRE TRANSFER FROM ACME CORP",
      "amount": 5000.00,
      "balance": 130450.75,
      "status": "unmatched",
      "suggested_matches": [
        {
          "type": "invoice",
          "id": "uuid",
          "reference": "INV-2025-001",
          "amount": 5000.00,
          "confidence": 0.95
        }
      ]
    }
  ]
}
```

#### Match Transaction
```http
PUT /api/v1/accounting/bank-transactions/{id}/match
```

**Permissions:** `accounting:bank:reconcile`

**Request Body:**
```json
{
  "matched_to_type": "invoice",
  "matched_to_id": "uuid",
  "notes": "Payment for INV-2025-001"
}
```

**Response:** `200 OK`

### Expenses

#### Create Expense
```http
POST /api/v1/accounting/expenses
```

**Permissions:** `accounting:expenses:create`

**Request:** Multipart form data with receipt

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "expense_date": "2025-12-02",
    "vendor_name": "Coffee Shop",
    "amount": 45.50,
    "currency": "USD",
    "category_account_id": "uuid",
    "receipt_url": "https://storage.../receipt.jpg",
    "ocr_data": {
      "vendor": "Star Coffee",
      "date": "2025-12-02",
      "amount": 45.50,
      "confidence": 0.91
    },
    "reimbursement_status": "pending"
  }
}
```

#### Approve Expense
```http
PUT /api/v1/accounting/expenses/{id}/approve
```

**Permissions:** `accounting:expenses:approve` or manager

**Response:** `200 OK`

### Reports

#### Profit & Loss Statement
```http
GET /api/v1/accounting/reports/profit-loss
```

**Query Parameters:**
- `from_date`, `to_date`: Date range
- `comparison_period`: prior_period, prior_year
- `currency`: USD, EUR, or base
- `department_id`: Filter by department

**Permissions:** `accounting:reports:read`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "report_name": "Profit & Loss",
    "period": {
      "from": "2025-01-01",
      "to": "2025-12-31"
    },
    "currency": "USD",
    "sections": [
      {
        "section": "Revenue",
        "accounts": [
          {
            "account_code": "4000",
            "account_name": "Sales Revenue",
            "amount": 1250000.00,
            "comparison_amount": 1100000.00,
            "variance": 150000.00,
            "variance_percent": 13.6
          }
        ],
        "total": 2100000.00
      }
    ],
    "gross_profit": 1550000.00,
    "operating_expenses_total": 980000.00,
    "operating_income": 570000.00,
    "net_income": 562500.00,
    "net_margin": 0.268
  }
}
```

#### Balance Sheet
```http
GET /api/v1/accounting/reports/balance-sheet
```

**Query Parameters:**
- `as_of_date`: Balance sheet date
- `comparison_date`: Prior period date
- `currency`: USD, EUR, or base

**Permissions:** `accounting:reports:read`

**Response:** `200 OK` (Similar structure with Assets, Liabilities, Equity sections)

#### Cash Flow Statement
```http
GET /api/v1/accounting/reports/cash-flow
```

**Query Parameters:** Similar to P&L

**Permissions:** `accounting:reports:read`

**Response:** `200 OK` (Operating, Investing, Financing activities)

#### AR Aging Report
```http
GET /api/v1/accounting/reports/ar-aging
```

**Query Parameters:**
- `as_of_date`: Aging calculation date
- `customer_id`: Filter by customer

**Permissions:** `accounting:reports:read`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "as_of_date": "2025-12-03",
    "currency": "USD",
    "summary": {
      "total_outstanding": 125000.00,
      "current": 85000.00,
      "1_30_days": 25000.00,
      "31_60_days": 10000.00,
      "61_90_days": 3000.00,
      "over_90_days": 2000.00
    },
    "by_customer": [
      {
        "customer_id": "uuid",
        "customer_name": "Acme Corp",
        "total": 15000.00,
        "current": 10000.00,
        "1_30_days": 5000.00,
        "31_60_days": 0,
        "61_90_days": 0,
        "over_90_days": 0
      }
    ]
  }
}
```

---

## Marketing Module

_To be extracted from module-marketing.md_

---

## AI Assistant Module

_To be extracted from module-ai-assistant.md_

---

## Common API Patterns

### Pagination
```
GET /api/v1/resource?limit=50&offset=0
```

### Filtering
```
GET /api/v1/resource?field=value&status=active
```

### Sorting
```
GET /api/v1/resource?sort=createdAt&order=desc
```

### Field Selection
```
GET /api/v1/resource?fields=id,name,email
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

#### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 403 Forbidden
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

#### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

#### 429 Too Many Requests
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 60
  }
}
```

#### 500 Internal Server Error
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## Rate Limiting

- Standard tier: 1000 requests per hour
- Premium tier: 5000 requests per hour
- Enterprise tier: Custom limits

Rate limit headers:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1638360000
```

---

## Versioning

API versioning is done through the URL path:
- Current version: `/api/v1/`
- Future versions: `/api/v2/`, `/api/v3/`, etc.

---

## Webhooks

### Webhook Events
- `employee.created`
- `employee.updated`
- `employee.deleted`
- `payroll.run.completed`
- `invoice.paid`
- `ticket.created`
- etc.

### Webhook Payload Format
```json
{
  "eventId": "evt_uuid",
  "eventType": "employee.created",
  "timestamp": "2024-12-04T10:00:00Z",
  "organizationId": "org_uuid",
  "data": {
    "employeeId": "ACME-2024-001",
    ...
  }
}
```

---

_Note: This specification is continually updated as new modules and endpoints are added._
