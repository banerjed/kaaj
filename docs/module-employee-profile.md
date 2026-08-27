# Employee Profile Specification

## Overview
This specification defines an extendable employee profile system that allows individual organizations to capture custom information while maintaining core fields and ensuring personally identifiable information (PII) is properly encrypted.

## Core Profile Fields

### Core Identity Fields
The following fields uniquely identify an employee:

1. **Employee ID** (string)
   - Format: `{ORG_PREFIX}-{YEAR}-{SEQUENCE}`
   - Example: "ACME-2024-001"
   - Must be unique globally across all organizations
   - Classification: Non-PII (used for references)

2. **First Name** (string)
   - Employee's legal first name
   - Required field
   - Classification: PII

3. **Last Name** (string)
   - Employee's legal last name
   - Required field
   - Classification: PII

4. **Middle Name** (string, optional)
   - Employee's middle name or initial
   - Classification: PII

5. **Preferred Name** (string, optional)
   - Name employee prefers to be called
   - Example: "Mike" instead of "Michael"
   - Classification: PII

6. **Email Address** (string)
   - Primary work email address
   - Must be valid email format
   - Required field
   - Classification: PII

7. **Phone Number** (string, optional)
   - Primary contact phone number
   - Format: E.164 international format recommended
   - Classification: PII

8. **Employee Number** (string, optional)
   - Alternative identifier (payroll number, badge number)
   - May differ from employeeId
   - Classification: Non-PII

9. **Date of Birth** (date, optional)
   - Employee's birth date
   - Format: ISO 8601 (YYYY-MM-DD)
   - Used for benefits, celebrations, age calculations
   - Classification: PII

10. **Gender** (enum, optional)
   - Values: male, female, non_binary, prefer_not_to_say, other
   - Used for demographic reporting and compliance
   - Classification: PII

11. **Marital Status** (enum, optional)
   - Values: single, married, domestic_partnership, divorced, widowed, prefer_not_to_say
   - Used for benefits and tax purposes
   - Classification: PII

12. **Social Security Number / Tax ID** (string, optional)
   - Government-issued tax identification number
   - Format varies by country (SSN in US, NI in UK, etc.)
   - Used for payroll and tax reporting
   - Classification: PII (HIGHLY SENSITIVE)

13. **Social Media Links** (object, optional)
   - Professional and personal social media profiles
   - Properties: linkedin, twitter, github, etc.
   - Example: {"linkedin": "https://linkedin.com/in/johndoe"}
   - Classification: PII

14. **Time Zone** (string, optional)
   - Employee's primary working time zone
   - Format: IANA time zone database (e.g., "America/New_York")
   - Used for scheduling and "current local time" display
   - Classification: Non-PII

### Core Employment Fields
These fields define the employee's current employment status and position:

1. **Employment Status** (enum)
   - Values: active, on_leave, terminated, suspended
   - Required field
   - Classification: Non-PII

2. **Employment Type** (enum)
   - Values: full_time, part_time, contractor, intern, temporary
   - Required field
   - Classification: Non-PII

3. **Start Date** (date)
   - Date when employee started with the organization
   - Format: ISO 8601 (YYYY-MM-DD)
   - Also known as "join date" or "hire date"
   - Required field
   - Classification: PII

4. **End Date** (date, optional)
   - Date when employment ended (for terminated employees)
   - Format: ISO 8601 (YYYY-MM-DD)
   - Classification: PII

5. **Current Department** (reference)
   - Reference to department ID
   - Example: "DEPT-ENG", "DEPT-SALES"
   - Required field
   - Classification: Non-PII

6. **Current Job Title** (string)
   - Employee's current position title
   - Example: "Senior Software Engineer", "Product Manager"
   - Required field
   - Classification: Non-PII (generally)

7. **Current Manager** (reference)
   - Reference to manager's employee ID
   - Example: "ACME-2020-045"
   - Optional (CEO has no manager)
   - Classification: Non-PII

8. **Current Location** (reference)
   - Reference to office/location ID
   - Example: "LOC-SF-HQ", "LOC-REMOTE"
   - Required field
   - Classification: Non-PII

9. **Compensation Band** (string, optional)
   - Salary band or level (not actual salary)
   - Example: "Band-5", "Level-Senior"
   - Classification: PII (sensitive)

### Extended Profile Fields
The following fields provide additional employee information:

1. **Pronouns** (string, optional)
   - Employee's preferred pronouns
   - Example: "she/her", "he/him", "they/them"
   - Classification: PII

2. **Profile Picture** (binary/URL)
   - Employee profile picture
   - Format: Image file or URL reference
   - Classification: PII

3. **Prior Employers** (array of objects)
   - List of previous employment history
   - Each entry contains:
     - Company name (string)
     - Position/title (string)
     - Start date (date, optional)
     - End date (date, optional)
     - Description (string, optional)
   - Classification: PII

4. **Prior Educational Institutes** (array of objects)
   - List of educational background
   - Each entry contains:
     - Institution name (string)
     - Degree/certification (string)
     - Field of study (string, optional)
     - Start date (date, optional)
     - End date (date, optional)
   - Classification: PII

5. **Hobbies** (array of strings)
   - List of personal interests and hobbies
   - Example: ["photography", "hiking", "reading"]
   - Classification: PII

6. **Affinity Groups** (array of strings)
   - List of affinity groups the employee belongs to
   - Example: ["Women in Tech", "LGBTQ+ Alliance", "Parents Network"]
   - Classification: PII

7. **Introduction** (text)
   - Brief self-introduction or bio
   - Free-form text field
   - Classification: PII

### Asset Management Fields
Employees may be assigned company assets that need to be tracked:

1. **Assigned Assets** (array of objects)
   - List of company assets assigned to the employee
   - Each entry contains:
     - Asset ID (string): Unique identifier
     - Asset Type (enum): computer, monitor, phone, tablet, keyboard, mouse, headset, other
     - Make/Model (string): e.g., "MacBook Pro 16-inch 2023"
     - Serial Number (string): Device serial number
     - Asset Tag (string): Company asset tag number
     - Assigned Date (date): When asset was issued
     - Return Date (date, optional): When asset was returned
     - Condition (enum): new, good, fair, poor
     - Notes (string, optional): Additional information
   - Classification: Non-PII (but tracked per employee)

   Example:
   ```json
   {
     "assetId": "ASSET-12345",
     "assetType": "computer",
     "makeModel": "MacBook Pro 16-inch 2023",
     "serialNumber": "C02XJ0PHJG5H",
     "assetTag": "ACME-IT-1234",
     "assignedDate": "2024-03-15",
     "returnDate": null,
     "condition": "new",
     "notes": "Includes USB-C adapter"
   }
   ```

### Training & Certification Fields
Track employee training, certifications, and compliance requirements:

1. **Training Records** (array of objects)
   - List of training courses and completion status
   - Each entry contains:
     - Training ID (string): Unique identifier
     - Training Name (string): e.g., "Information Security Awareness"
     - Training Type (enum): compliance, professional_development, onboarding, safety, technical
     - Provider (string): Training provider or platform
     - Assigned Date (date): When training was assigned
     - Due Date (date): When training must be completed
     - Completion Date (date, optional): When training was completed
     - Status (enum): not_started, in_progress, completed, overdue, expired
     - Certificate URL (string, optional): Link to certificate
     - Expiration Date (date, optional): For certifications that expire
     - Credits/Hours (number, optional): CPE/CE credits earned
     - Notes (string, optional): Additional information
   - Classification: PII

   Example:
   ```json
   {
     "trainingId": "TRN-9876",
     "trainingName": "Annual Security Awareness Training",
     "trainingType": "compliance",
     "provider": "Internal Security Team",
     "assignedDate": "2025-01-01",
     "dueDate": "2025-03-31",
     "completionDate": "2025-02-15",
     "status": "completed",
     "certificateUrl": "https://training.acme.com/cert/9876",
     "expirationDate": "2026-02-15",
     "credits": 2.5,
     "notes": "Passed with 95%"
   }
   ```

2. **Professional Certifications** (array of objects)
   - Industry certifications and licenses held by employee
   - Each entry contains:
     - Certification Name (string): e.g., "AWS Certified Solutions Architect"
     - Issuing Organization (string): e.g., "Amazon Web Services"
     - Certification Number (string): Credential ID
     - Issue Date (date): When certification was obtained
     - Expiration Date (date, optional): When certification expires
     - Status (enum): active, expired, revoked, pending_renewal
     - Verification URL (string, optional): Link to verify credential
     - Notes (string, optional): Additional information
   - Classification: PII

### Status & Availability Fields
Track employee availability and current status:

1. **Current Status** (object, optional)
   - Real-time availability status
   - Properties:
     - Status Type (enum): in_office, remote, out_of_office, on_leave, business_travel
     - Status Message (string, optional): Custom message (e.g., "Back on Monday")
     - Start Date/Time (datetime): When status began
     - End Date/Time (datetime, optional): When status will end
     - Auto-expire (boolean): Whether to automatically reset status
   - Classification: Non-PII

2. **Work Schedule** (object, optional)
   - Regular working hours and schedule
   - Properties:
     - Schedule Type (enum): full_time, part_time, flex, shift
     - Working Days (array): e.g., ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
     - Start Time (time): Regular start time
     - End Time (time): Regular end time
     - Time Zone (string): Reference to employee time zone
   - Classification: Non-PII

### Region & Division Fields

1. **Region** (string, optional)
   - Geographic region or business unit
   - Example: "EMEA", "APAC", "Americas", "North America - West"
   - Used for regional reporting and management
   - Classification: Non-PII

2. **Division** (string, optional)
   - Business division or group
   - Example: "Enterprise Sales", "Consumer Products", "Cloud Services"
   - Used for organizational structure
   - Classification: Non-PII

3. **Cost Center** (string, optional)
   - Accounting cost center for budgeting
   - Example: "CC-1234"
   - Used for financial allocation
   - Classification: Non-PII

### Celebrations & Recognition Fields

1. **Birth Date** (date, optional)
   - Already covered in Core Identity Fields (line 52-57)
   - Used for birthday celebrations and age calculations
   - Classification: PII

2. **Work Anniversary** (calculated field)
   - Automatically calculated from start date
   - Displayed as: "3 years, 2 months"
   - Used for anniversary celebrations and recognition
   - Classification: Non-PII

3. **Tenure** (calculated field)
   - Precise tenure calculation: "2y - 10m - 6d"
   - Calculated from start date to current date
   - Used for benefits eligibility and recognition
   - Classification: Non-PII

4. **Celebration Preferences** (object, optional)
   - Employee preferences for celebrations
   - Properties:
     - Display Birthday (boolean): Whether to show birthday in company calendar
     - Display Age (boolean): Whether to show age or just birthdate
     - Birthday Notification (boolean): Allow colleagues to see upcoming birthday
     - Anniversary Notification (boolean): Show work anniversary
   - Classification: PII

### Change Request Fields

Track employee-initiated requests for profile or employment changes:

1. **Change Requests** (array of objects)
   - History of all change requests initiated by or for the employee
   - Each entry contains:
     - Request ID (string): Unique identifier
     - Request Type (enum): personal_info, compensation, employment_status, job_info, benefits, asset, time_off, other
     - Requested By (employee reference): Who initiated the request
     - Requested For (employee reference): Subject of the request
     - Request Date (datetime): When request was submitted
     - Status (enum): pending, approved, rejected, more_info_needed, cancelled, completed
     - Urgency (enum): urgent, normal, low
     - Effective Date (date, optional): When change should take effect
     - Approval Chain (array): List of approvers and their decisions
     - Request Details (object): Specific fields being changed
     - Attached Documents (array): Supporting documents
     - Comments/Notes (array): Communication thread
     - Completed Date (datetime, optional): When request was finalized
   - Classification: PII (contains change details)

   Example:
   ```json
   {
     "requestId": "CHG-2025-001234",
     "requestType": "personal_info",
     "requestedBy": "ACME-2024-001",
     "requestedFor": "ACME-2024-001",
     "requestDate": "2025-11-15T10:30:00Z",
     "status": "approved",
     "urgency": "normal",
     "effectiveDate": "2025-11-15",
     "approvalChain": [
       {
         "approverId": "ACME-2020-045",
         "approverRole": "manager",
         "approverName": "John Manager",
         "status": "approved",
         "approvedAt": "2025-11-15T14:20:00Z",
         "comments": "Address update approved"
       }
     ],
     "requestDetails": {
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
     "attachedDocuments": [],
     "comments": [
       {
         "commentId": "uuid",
         "commentBy": "ACME-2024-001",
         "commentAt": "2025-11-15T10:30:00Z",
         "comment": "Updated my address due to recent move"
       }
     ],
     "completedDate": "2025-11-15T14:25:00Z"
   }
   ```

## Extensibility

### Organization-Specific Fields
Organizations can extend the employee profile with custom fields through an extensible metadata system:

```json
{
  "customFields": {
    "fieldName": {
      "value": "any type",
      "type": "string|number|boolean|array|object",
      "encrypted": true|false,
      "label": "Display Name",
      "category": "optional category"
    }
  }
}
```

### Extension Guidelines
- Custom fields should follow a namespace pattern: `org_prefix.field_name`
- Organizations should document their custom fields in a schema registry
- Custom fields can be marked as PII/encrypted independently
- Validation rules can be defined per organization

### Custom Tables
In addition to custom fields, organizations can create custom tables to track complex, multi-field data that doesn't fit the standard profile structure:

#### Custom Table Definition
```json
{
  "tableId": "custom_table_uuid",
  "tableName": "Company Vehicles",
  "organizationId": "org_uuid_v4",
  "description": "Track company vehicles assigned to employees",
  "columns": [
    {
      "columnId": "col_1",
      "columnName": "Vehicle Type",
      "dataType": "enum",
      "options": ["sedan", "suv", "truck", "van"],
      "required": true,
      "encrypted": false
    },
    {
      "columnId": "col_2",
      "columnName": "License Plate",
      "dataType": "string",
      "required": true,
      "encrypted": true
    },
    {
      "columnId": "col_3",
      "columnName": "VIN",
      "dataType": "string",
      "required": true,
      "encrypted": true
    },
    {
      "columnId": "col_4",
      "columnName": "Assigned Date",
      "dataType": "date",
      "required": true,
      "encrypted": false
    },
    {
      "columnId": "col_5",
      "columnName": "Monthly Allowance",
      "dataType": "currency",
      "required": false,
      "encrypted": true
    }
  ],
  "metadata": {
    "createdAt": "2024-06-01T10:00:00Z",
    "createdBy": "admin@acme.com",
    "version": "1.0"
  }
}
```

#### Custom Table Data Storage
Custom table data is linked to employee profiles:

```json
{
  "employeeId": "ACME-2024-001",
  "customTables": {
    "company_vehicles": [
      {
        "rowId": "row_uuid_1",
        "tableId": "custom_table_uuid",
        "data": {
          "col_1": "sedan",
          "col_2": {
            "encrypted": true,
            "ciphertext": "...",
            "iv": "...",
            "tag": "...",
            "keyVersion": "v1"
          },
          "col_3": {
            "encrypted": true,
            "ciphertext": "...",
            "iv": "...",
            "tag": "...",
            "keyVersion": "v1"
          },
          "col_4": "2024-03-15",
          "col_5": {
            "encrypted": true,
            "ciphertext": "...",
            "iv": "...",
            "tag": "...",
            "keyVersion": "v1"
          }
        },
        "metadata": {
          "createdAt": "2024-03-15T09:00:00Z",
          "updatedAt": "2024-03-15T09:00:00Z"
        }
      }
    ]
  }
}
```

#### Supported Column Data Types
- **string**: Text field
- **number**: Numeric value
- **currency**: Monetary amount (stored with currency code)
- **date**: ISO 8601 date
- **datetime**: ISO 8601 datetime with timezone
- **boolean**: True/false
- **enum**: Single selection from predefined options
- **multi_enum**: Multiple selections from predefined options
- **email**: Email address (validated)
- **phone**: Phone number (validated)
- **url**: Web URL (validated)
- **file**: File attachment reference
- **employee_reference**: Reference to another employee ID

#### Custom Table Features
- **Per-employee rows**: Each employee can have zero or more rows in a custom table
- **Field-level encryption**: Columns can be marked as encrypted independently
- **Validation rules**: Data type validation, required fields, min/max values
- **Relationships**: Tables can reference other tables or employee profiles
- **Import/Export**: Support for bulk data import and export
- **Versioning**: Track changes to table schema over time
- **Access Control**: Permissions can be set per table (who can view/edit)

#### Use Cases for Custom Tables
1. **Company Vehicle Assignments**: Track vehicles, license plates, insurance info
2. **Equipment Loans**: Beyond standard assets (e.g., specialized tools, cameras)
3. **Travel Preferences**: Seating preferences, TSA numbers, hotel loyalty programs
4. **Emergency Preparedness**: Medical conditions, emergency procedures, evacuation roles
5. **Compensation History**: Detailed salary history, bonus records, equity grants
6. **Performance Reviews**: Historical review data with custom fields per review cycle
7. **Skills Matrix**: Detailed skills with proficiency levels and certifications
8. **Project Assignments**: Track project allocations, roles, and time commitments

## Encryption Specification

### PII Protection
All personally identifiable information (PII) must be encrypted at rest. This includes all core profile fields listed above.

### Encryption Key Generation
The encryption key for each organization is generated using the following formula:

```
encryption_key = DERIVE_KEY(org_prefix + org_4digit_code)
```

Where:
- **org_prefix**: Organization identifier prefix (string)
  - Example: "ACME", "TECH", "CORP"
- **org_4digit_code**: Unique 4-digit numeric code for the organization
  - Example: "1234", "5678", "9012"
- **DERIVE_KEY**: Key derivation function (recommended: PBKDF2, Argon2, or similar)

### Key Storage
- Encryption keys must be stored separately from employee data
- Keys should be stored in a secure key management system (KMS) or vault
- Key rotation should be supported with versioning
- Format: `{org_prefix}-{4digit_code}` → `encryption_key`

### Encryption Algorithm
- **Recommended**: AES-256-GCM (Galois/Counter Mode)
- **Alternative**: ChaCha20-Poly1305
- Each encrypted field should include:
  - Initialization Vector (IV) / Nonce
  - Authentication tag
  - Encrypted ciphertext
  - Key version identifier

### Field-Level Encryption
Each PII field is encrypted independently:

```json
{
  "pronouns": {
    "encrypted": true,
    "ciphertext": "base64_encoded_encrypted_data",
    "iv": "base64_encoded_iv",
    "tag": "base64_encoded_auth_tag",
    "keyVersion": "v1"
  }
}
```

## Organization Schema

### Organization Structure

To ensure consistency across modules, organizations are identified using a unified structure:

```json
{
  "organizationId": "org_uuid_v4",
  "organizationCode": "ACME-1234",
  "prefix": "ACME",
  "numericCode": "1234",
  "name": "Acme Corporation",
  "metadata": {
    "createdAt": "2020-01-15T10:00:00Z",
    "active": true
  }
}
```

**Field Definitions**:
- **organizationId**: UUID primary key for all database lookups and references
- **organizationCode**: Combined `{prefix}-{numericCode}` used for encryption key derivation
- **prefix**: 2-6 uppercase letter code used in employee IDs and encryption
- **numericCode**: 4-digit code (0000-9999) for encryption key security
- **name**: Human-readable organization name

## Data Model

**Note:** Data model specifications have been moved to the centralized data models specification.

See [schema.sql](./data-models/schema.sql) for the complete employee profile JSON structure including:
- Core Identity (with AES-256-GCM field-level encryption)
- Employment details
- Extended Profile
- Assets and Equipment
- Training Records
- Certifications
- Custom Fields and Custom Tables
- Multi-currency and i18n support

---

## Access Control and Permissions

### Permission Model

Employee profile access is controlled through role-based access control (RBAC):

#### Roles and Permissions

| Role | View Own | Edit Own (Social) | View Team | Edit Team | View All | Edit All | Decrypt PII | Export Data |
|------|----------|-------------------|-----------|-----------|----------|----------|-------------|-------------|
| **Employee** | ✓ | ✓ | - | - | - | - | - | - |
| **Manager** | ✓ | ✓ | ✓ | Limited | - | - | - | - |
| **HR Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Org Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Compliance Officer** | - | - | - | - | ✓ | - | ✓ | ✓ |

#### Permission Definitions

**View Own**: Can view their own complete profile (decrypted)
**Edit Own (Social)**: Can edit: pronouns, picture, hobbies, introduction, affinity groups
**View Team**: Manager can view profiles of direct reports
**Edit Team**: Manager can edit limited fields (current location, current department with approval)
**View All**: Can view all employee profiles in organization
**Edit All**: Can edit all fields except salary/compensation
**Decrypt PII**: Can access encrypted PII fields
**Export Data**: Can export employee data for GDPR/compliance

#### API-Level Access Control

```json
{
  "endpoints": {
    "GET /api/v1/employees/{id}/profile": {
      "allowed": ["self", "manager_of_employee", "hr_admin", "org_admin", "compliance_officer"],
      "data_filtering": {
        "employee": "full_own_profile",
        "manager": "team_profile_limited",
        "hr_admin": "full_decrypted",
        "org_admin": "full_decrypted",
        "compliance_officer": "full_decrypted_read_only"
      }
    },
    "PATCH /api/v1/employees/{id}/profile": {
      "allowed": ["self_limited", "hr_admin", "org_admin"],
      "field_restrictions": {
        "employee": ["pronouns", "picture", "hobbies", "introduction", "affinityGroups"],
        "hr_admin": "all_except_compensation",
        "org_admin": "all_fields"
      }
    }
  }
}
```

## Security Considerations

### Access Control
- Implement role-based access control (RBAC) as defined above
- Audit logging for all access to encrypted PII
- Principle of least privilege for decryption operations
- Session-based access tokens with short expiration (recommended: 1 hour)
- Multi-factor authentication required for HR Admin and Org Admin roles

### Key Management
- Encryption keys must never be logged or exposed in APIs
- Keys should be rotated periodically (recommended: annually)
- Support for emergency key revocation
- Secure key backup and disaster recovery procedures

### Data in Transit
- All API communications must use TLS 1.3 or higher
- End-to-end encryption for sensitive operations

### Compliance
This specification supports compliance with:
- GDPR (General Data Protection Regulation)
- CCPA (California Consumer Privacy Act)
- SOC 2 Type II requirements
- Industry-specific regulations (HIPAA, etc.)

## Implementation Guidelines

### Decryption Flow
1. Retrieve organization identifier from employee record
2. Construct key lookup: `{org_prefix}-{4digit_code}`
3. Retrieve encryption key from secure key store
4. Decrypt each PII field using the key and stored IV/tag
5. Return decrypted profile data

### Encryption Flow
1. Identify organization from context
2. Retrieve encryption key for organization
3. Generate unique IV for each field
4. Encrypt each PII field independently
5. Store ciphertext, IV, and authentication tag
6. Store key version for future key rotation support

### Search and Indexing
Since PII is encrypted, consider:
- Maintaining searchable hashes for specific fields (if needed)
- Using tokenization for partial search capabilities
- Implementing search on non-PII fields only
- Client-side decryption for search in sensitive fields

## Versioning and Migration

### Schema Versioning
- Maintain version number in profile metadata
- Support backward compatibility for older schema versions
- Define migration paths for schema updates

### Key Rotation
- Support multiple active key versions simultaneously
- Background re-encryption process for key rotation
- Gradual migration to new keys without downtime

## Use Cases

This section defines common employee lifecycle events and how the profile system handles each scenario.

### Use Case 1: Employee Onboarding

**Scenario**: A new employee joins the organization and needs their profile created.

**Actors**: HR Administrator, New Employee, System

**Preconditions**:
- Employee has been hired and has a valid employee ID
- Organization encryption key exists in the key management system
- HR administrator has appropriate permissions

**Flow**:
1. HR administrator initiates new employee profile creation
2. System prompts for core profile information:
   - Pronouns
   - Profile picture
   - Join date (typically the start date)
   - Prior employers (gathered from resume/application)
   - Prior educational institutes (from background verification)
   - Hobbies (from onboarding questionnaire)
   - Affinity groups (employee opt-in)
   - Introduction/bio
3. Employee may self-update certain fields during onboarding portal access
4. System retrieves organization encryption key using `{org_prefix}-{4digit_code}`
5. System encrypts all PII fields independently
6. System stores encrypted profile data with metadata
7. System generates audit log entry for profile creation
8. System triggers welcome email and directory publication (if configured)

**Postconditions**:
- Employee profile exists with all core fields encrypted
- Profile is accessible to authorized personnel
- Employee appears in organization directory
- Audit trail records profile creation

**Data Requirements**:
```json
{
  "employeeId": "EMP-2024-001",
  "organizationId": "ACME-1234",
  "profile": {
    "pronouns": "[encrypted]",
    "picture": "[encrypted]",
    "joinDate": "[encrypted: 2024-03-15]",
    "priorEmployers": "[encrypted: array]",
    "priorEducation": "[encrypted: array]",
    "hobbies": "[encrypted: array]",
    "affinityGroups": "[encrypted: array]",
    "introduction": "[encrypted]"
  },
  "customFields": {
    "ACME.badgeNumber": "12345",
    "ACME.parkingSpot": "A-42"
  },
  "metadata": {
    "createdAt": "2024-03-15T09:00:00Z",
    "createdBy": "hr.admin@acme.com",
    "status": "active"
  }
}
```

**Security Considerations**:
- Verify HR administrator authorization before allowing profile creation
- Validate all input data before encryption
- Ensure join date is not in the future (business rule)
- Generate unique IV for each encrypted field

---

### Use Case 2: Employee Offboarding (Leaving the Firm)

**Scenario**: An employee leaves the organization and their profile needs to be handled according to data retention policies.

**Actors**: HR Administrator, IT Administrator, System

**Preconditions**:
- Employee profile exists and is active
- Termination/resignation has been processed
- Data retention policy is defined

**Flow**:
1. HR administrator initiates offboarding process with exit date
2. System updates employee status to "offboarding" or "terminated"
3. System adds exit date to profile metadata
4. System updates prior employers list (adds current organization as prior employer)
5. System evaluates data retention policy:
   - **Option A - Soft Delete**: Mark profile as inactive but retain encrypted data
   - **Option B - Archive**: Move to long-term storage with restricted access
   - **Option C - Anonymize**: Remove PII while retaining aggregated data
   - **Option D - Hard Delete**: Permanently delete after retention period
6. System revokes access permissions for the departed employee
7. System generates compliance report for offboarding
8. System creates audit log for all offboarding actions

**Postconditions**:
- Employee profile status is updated to reflect departure
- Access to active systems is revoked
- Data is retained or deleted per policy
- Audit trail documents all actions

**Data Transformations**:
```json
// Before Offboarding
{
  "employeeId": "EMP-2024-001",
  "status": "active",
  "metadata": {
    "joinDate": "[encrypted]"
  }
}

// After Offboarding (Soft Delete)
{
  "employeeId": "EMP-2024-001",
  "status": "terminated",
  "metadata": {
    "joinDate": "[encrypted]",
    "exitDate": "[encrypted: 2025-06-30]",
    "terminationType": "voluntary",
    "dataRetentionUntil": "2032-06-30"
  }
}

// After Retention Period (Anonymized)
{
  "employeeId": "ANON-xxxxxxxx",
  "status": "anonymized",
  "profile": {
    "joinDate": "[encrypted: 2024-Q1]", // Reduced precision
    "exitDate": "[encrypted: 2025-Q2]",
    // All other PII removed
  }
}
```

**Security Considerations**:
- Implement multi-step approval for data deletion
- Ensure compliance with legal hold requirements
- Maintain audit logs even after data deletion
- Support right to be forgotten (GDPR) requests
- Backup encrypted data before deletion

**Compliance Notes**:
- GDPR: Support data portability before deletion
- SOX: Retain data for required periods for audited companies
- Industry-specific: Adjust retention based on regulatory requirements

---

### Use Case 3: Employee Promotion

**Scenario**: An employee receives a promotion to a new role or level.

**Actors**: Manager, HR Administrator, Employee, System

**Preconditions**:
- Employee profile exists and is active
- Promotion has been approved
- New role/level information is available

**Flow**:
1. Manager or HR administrator initiates promotion workflow
2. System retrieves current employee profile (decrypts as needed)
3. System updates employment-related custom fields:
   - Job title
   - Level/grade
   - Salary band (if stored)
   - Reporting manager
   - Effective date of promotion
4. System maintains history of previous roles in custom fields
5. System may update affinity groups (e.g., add "Leadership" group)
6. System may prompt employee to update introduction to reflect new role
7. System re-encrypts any modified PII fields
8. System generates notification to employee and relevant stakeholders
9. System creates audit log entry for promotion

**Postconditions**:
- Employee profile reflects new role and level
- Historical role information is preserved
- Notifications sent to relevant parties
- Audit trail records promotion details

**Data Updates**:
```json
{
  "employeeId": "EMP-2024-001",
  "customFields": {
    // Updated fields
    "currentRole": {
      "encrypted": false,
      "value": {
        "title": "Senior Software Engineer",
        "level": "L5",
        "effectiveDate": "2025-07-01",
        "department": "Engineering",
        "manager": "EMP-2020-045"
      }
    },
    // Historical tracking
    "roleHistory": {
      "encrypted": false,
      "value": [
        {
          "title": "Software Engineer",
          "level": "L4",
          "startDate": "2024-03-15",
          "endDate": "2025-06-30",
          "department": "Engineering"
        }
      ]
    }
  },
  "profile": {
    "affinityGroups": {
      "encrypted": true,
      "ciphertext": "[updated to include new groups]"
    },
    "introduction": {
      "encrypted": true,
      "ciphertext": "[may be updated by employee]"
    }
  },
  "metadata": {
    "updatedAt": "2025-07-01T00:00:00Z",
    "updatedBy": "hr.admin@acme.com",
    "changeReason": "promotion"
  }
}
```

**Business Rules**:
- Effective date cannot be in the past (except for retroactive promotions)
- Role history must be immutable once created
- Salary/compensation changes follow separate approval workflow
- Manager change may trigger access control updates

---

### Use Case 4: Changing Departments

**Scenario**: An employee transfers to a different department within the organization.

**Actors**: Current Manager, New Manager, HR Administrator, Employee, System

**Preconditions**:
- Employee profile exists and is active
- Department transfer has been approved
- New department exists in the system

**Flow**:
1. HR administrator initiates department transfer
2. System retrieves current employee profile
3. System updates department-related fields:
   - Department name/ID
   - Reporting manager
   - Team assignment
   - Effective transfer date
4. System maintains transfer history in custom fields
5. System updates access controls based on new department:
   - Revoke old department-specific permissions
   - Grant new department-specific permissions
6. System may update affinity groups based on department
7. Employee may update hobbies/introduction to reflect new focus area
8. System re-encrypts modified PII fields
9. System notifies both old and new managers
10. System generates audit log for department change

**Postconditions**:
- Employee profile reflects new department
- Transfer history is preserved
- Access controls are updated appropriately
- Relevant stakeholders are notified

**Data Updates**:
```json
{
  "employeeId": "EMP-2024-001",
  "customFields": {
    "currentDepartment": {
      "encrypted": false,
      "value": {
        "departmentId": "DEPT-SALES",
        "departmentName": "Sales & Marketing",
        "effectiveDate": "2025-09-01",
        "manager": "EMP-2019-087",
        "team": "Enterprise Sales"
      }
    },
    "departmentHistory": {
      "encrypted": false,
      "value": [
        {
          "departmentId": "DEPT-ENG",
          "departmentName": "Engineering",
          "startDate": "2024-03-15",
          "endDate": "2025-08-31",
          "manager": "EMP-2020-045"
        }
      ]
    },
    "transferReason": {
      "encrypted": true,
      "ciphertext": "[lateral move for career development]"
    }
  },
  "profile": {
    "affinityGroups": {
      "encrypted": true,
      "ciphertext": "[may include department-specific groups]"
    }
  },
  "metadata": {
    "updatedAt": "2025-09-01T00:00:00Z",
    "updatedBy": "hr.admin@acme.com",
    "changeReason": "department_transfer"
  }
}
```

**Integration Requirements**:
- Update organization chart/hierarchy
- Sync with access control systems (LDAP/Active Directory)
- Update email distribution lists
- Transfer pending tasks/projects to new manager
- Update cost center allocations

**Security Considerations**:
- Verify authorization for department transfer
- Ensure smooth access control transition (avoid gaps)
- Maintain audit trail of permission changes
- Notify security team for sensitive department transfers

---

### Use Case 5: Changing Office Locations

**Scenario**: An employee relocates to a different office location (e.g., remote to office, office to office, office to remote).

**Actors**: HR Administrator, Employee, Facilities Manager, System

**Preconditions**:
- Employee profile exists and is active
- Location change has been approved
- New location exists in the system

**Flow**:
1. Employee or HR administrator initiates location change request
2. System retrieves current employee profile
3. System captures new location information:
   - Office location/site
   - Remote work status
   - Time zone
   - Work address
   - Effective date of change
4. System maintains location history in custom fields
5. System updates location-dependent configurations:
   - Office-specific access badges
   - Parking assignments
   - Desk/seating assignments
   - Regional affinity groups
6. System may update emergency contact procedures based on location
7. System re-encrypts any modified PII fields
8. System notifies facilities, IT, and relevant managers
9. System generates audit log for location change

**Postconditions**:
- Employee profile reflects new work location
- Location history is preserved
- Facilities and IT systems are updated
- Employee has appropriate access to new location

**Data Updates**:
```json
{
  "employeeId": "EMP-2024-001",
  "customFields": {
    "currentLocation": {
      "encrypted": false,
      "value": {
        "officeId": "SF-HQ",
        "officeName": "San Francisco Headquarters",
        "address": "123 Market St, San Francisco, CA 94105",
        "workMode": "hybrid",
        "timeZone": "America/Los_Angeles",
        "effectiveDate": "2025-10-01",
        "deskNumber": "3-A-42",
        "floor": 3
      }
    },
    "locationHistory": {
      "encrypted": false,
      "value": [
        {
          "officeId": "REMOTE",
          "officeName": "Remote - East Coast",
          "workMode": "fully_remote",
          "timeZone": "America/New_York",
          "startDate": "2024-03-15",
          "endDate": "2025-09-30"
        }
      ]
    },
    "badgeAccess": {
      "encrypted": false,
      "value": {
        "badgeNumber": "SF-12345",
        "accessLevel": "standard",
        "issuedDate": "2025-10-01",
        "buildings": ["SF-HQ"]
      }
    },
    "parkingAssignment": {
      "encrypted": false,
      "value": {
        "spotNumber": "P2-156",
        "level": "P2",
        "validFrom": "2025-10-01"
      }
    }
  },
  "profile": {
    "affinityGroups": {
      "encrypted": true,
      "ciphertext": "[updated to include SF office groups]"
    }
  },
  "metadata": {
    "updatedAt": "2025-10-01T00:00:00Z",
    "updatedBy": "hr.admin@acme.com",
    "changeReason": "office_relocation"
  }
}
```

**Integration Requirements**:
- Update badge access systems with new location permissions
- Notify facilities team for desk/parking assignments
- Update IT systems for hardware provisioning (monitors, docking stations)
- Sync with calendar systems for time zone changes
- Update emergency evacuation lists
- Modify expense policies based on location

**Special Scenarios**:

**Remote to Office**:
- Provision office equipment and amenities
- Grant building access
- Assign desk/parking
- Update commute benefits

**Office to Remote**:
- Ship home office equipment
- Revoke building access
- Release desk/parking assignments
- Update remote work agreements

**Office to Office (International)**:
- Handle immigration/visa requirements
- Update payroll tax jurisdiction
- Adjust benefits based on local regulations
- Cultural onboarding for new location

**Security Considerations**:
- Revoke old location access immediately upon effective date
- Ensure new location access is provisioned before arrival
- Update emergency contact protocols
- Maintain location history for audit purposes
- Encrypt sensitive location data (home addresses for remote workers)

---

## API Specifications

**Note:** API specifications have been moved to the centralized API endpoints specification.

See [api-endpoints.md](./api-endpoints.md#employee-profile-module) for complete API documentation including:
- Employee CRUD operations
- Profile picture management
- Organization structure queries
- Search and directory endpoints
- History and audit trail
- GDPR data export
- Bulk operations

---

## Testing Requirements

### Unit Tests
- Encryption/decryption correctness
- Key derivation consistency
- Schema validation

### Integration Tests
- End-to-end profile lifecycle
- Key rotation scenarios
- Multi-organization isolation

### Security Tests
- Penetration testing for key exposure
- Encryption strength validation
- Access control verification

## Documentation Requirements

Each organization implementing this specification should document:
1. Custom field definitions and schemas
2. Encryption key management procedures
3. Access control policies
4. Data retention and deletion policies
5. Incident response procedures for data breaches
