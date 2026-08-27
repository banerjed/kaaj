# Data Validation Utilities - Usage Guide

**Version:** 1.0
**Last Updated:** December 5, 2025
**Related Files:** [validation-utils.js](./validation-utils.js), [enumerations.json](./enumerations.json)

---

## Overview

The validation utilities module provides comprehensive data sanitization and validation functions for maintaining data integrity across the business management platform. It ensures data correctness, uniformity, and security while preventing common data quality issues.

## Key Features

✅ **Name Sanitization** - Handles international names, hyphens, apostrophes
✅ **Email Validation** - RFC 5322 compliant with typo detection
✅ **Phone Number Formatting** - Support for 10+ countries with extensions
✅ **Address Normalization** - Street abbreviations, capitalization
✅ **SSN/PAN/Aadhaar Validation** - Government ID verification with checksums
✅ **Financial Validation** - Currency, bank accounts, routing numbers
✅ **Date Validation** - Business rules for DOB, hire dates, etc.
✅ **XSS Prevention** - HTML escaping and input sanitization
✅ **Composite Validators** - Full profile and address validation

---

## Installation

```javascript
// ES6 Import
import {
  sanitizeName,
  sanitizeEmail,
  validateEmployeeProfile
} from './validation-utils.js';

// CommonJS
const {
  sanitizeName,
  sanitizeEmail,
  validateEmployeeProfile
} = require('./validation-utils.js');
```

---

## Response Format

All validation functions return a consistent response object:

```javascript
{
  valid: boolean,        // Whether validation passed
  value: any,           // Sanitized value (or original if invalid)
  errors: string[],     // Array of error messages (empty if valid)
  warnings?: string[]   // Optional warnings (e.g., typo suggestions)
}
```

---

## Quick Reference

### String Validators
- `sanitizeName()` - Person names with international support
- `sanitizeEmail()` - Email addresses with typo detection
- `sanitizePhoneNumber()` - Phone numbers (US, CA, GB, FR, DE, IT, NL, BE, SE, CH, JP, IN)
- `sanitizeAddress()` - Street addresses with abbreviations
- `sanitizePostalCode()` - Postal/ZIP codes (US, CA, GB, FR, DE, IT, NL, BE, SE, CH, JP, IN)
- `sanitizeString()` - Generic string sanitization

### Identifier Validators (US/India)
- `sanitizeSSN()` - US Social Security Number
- `sanitizeEIN()` - US Employer ID Number
- `sanitizePAN()` - India Permanent Account Number
- `sanitizeAadhaar()` - India Aadhaar Number

### International Tax ID Validators
- `sanitizeUKNIN()` - UK National Insurance Number
- `sanitizeCanadaSIN()` - Canada Social Insurance Number
- `sanitizeFranceINSEE()` - France INSEE Number (Numéro de sécurité sociale)
- `sanitizeGermanyTaxID()` - Germany Tax ID (Steueridentifikationsnummer)
- `sanitizeItalyCodiceFiscale()` - Italy Codice Fiscale
- `sanitizeNetherlandsBSN()` - Netherlands BSN (Burgerservicenummer)
- `sanitizeSwedenPersonnummer()` - Sweden Personnummer
- `sanitizeSwitzerlandAVS()` - Switzerland AVS Number
- `sanitizeVATNumber()` - EU VAT Number (all countries)

### Financial Validators
- `sanitizeCurrency()` - Monetary amounts
- `sanitizeBankAccountNumber()` - Bank account numbers (US/India)
- `sanitizeRoutingNumber()` - US routing numbers
- `sanitizeIFSC()` - India IFSC codes
- `sanitizeIBAN()` - International Bank Account Number (European countries)
- `sanitizeBIC()` - BIC/SWIFT codes (international)

### Date Validators
- `sanitizeDate()` - General date validation
- `sanitizeDateOfBirth()` - DOB with age constraints

### Employment Validators
- `sanitizeEmployeeNumber()` - Employee ID numbers
- `sanitizeJobTitle()` - Job titles with proper capitalization

### Composite Validators
- `validateEmployeeProfile()` - Complete employee validation
- `validateAddress()` - Complete address validation

### Utilities
- `validateEnum()` - Enum value validation
- `validateFields()` - Batch field validation

---

## Usage Examples

### Basic Name Validation

```javascript
import { sanitizeName } from './validation-utils.js';

const result = sanitizeName('john doe');
console.log(result);
// { valid: true, value: 'John Doe', errors: [] }

// Hyphenated names
sanitizeName('mary-jane watson');
// { valid: true, value: 'Mary-Jane Watson', errors: [] }

// International names
sanitizeName('josé garcía');
// { valid: true, value: 'José García', errors: [] }
```

### Email with Typo Detection

```javascript
import { sanitizeEmail } from './validation-utils.js';

const result = sanitizeEmail('user@gmial.com');
console.log(result);
// {
//   valid: true,
//   value: 'user@gmail.com',
//   warnings: ['Did you mean gmail.com?'],
//   errors: []
// }
```

### Complete Employee Validation

```javascript
import { validateEmployeeProfile } from './validation-utils.js';

const profile = {
  firstName: 'john',
  lastName: 'doe',
  email: 'john.doe@example.com',
  phone: '4155551234',
  dateOfBirth: '1990-01-01',
  ssn: '123456789',
  country: 'US'
};

const result = validateEmployeeProfile(profile);
if (result.valid) {
  // Use sanitized data
  await createEmployee(result.sanitized);
} else {
  // Display errors
  console.error(result.errors);
}
```

---

## Integration Examples

### Express.js API

```javascript
import { validateEmployeeProfile } from './validation-utils.js';

app.post('/api/employees', async (req, res) => {
  const validation = validateEmployeeProfile(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  const employee = await db.employee.create({
    data: validation.sanitized
  });

  res.json(employee);
});
```

### React Form

```javascript
import { sanitizeName, sanitizeEmail } from './validation-utils';

function EmployeeForm() {
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    const validation = validateEmployeeProfile(data);

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    submitEmployee(validation.sanitized);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="firstName" />
      {errors.firstName && <span>{errors.firstName}</span>}
      {/* ... more fields */}
    </form>
  );
}
```

---

## International Validation

### Phone Number Validation

The `sanitizePhoneNumber()` function supports 12 countries with proper formatting:

```javascript
import { sanitizePhoneNumber } from './validation-utils.js';

// United States
sanitizePhoneNumber('4155551234', { country: 'US' });
// { valid: true, value: '(415) 555-1234', errors: [] }

// Canada
sanitizePhoneNumber('4165551234', { country: 'CA' });
// { valid: true, value: '+1 (416) 555-1234', errors: [] }

// United Kingdom
sanitizePhoneNumber('02079460958', { country: 'GB' });
// { valid: true, value: '+44 2079 460958', errors: [] }

// France
sanitizePhoneNumber('0612345678', { country: 'FR' });
// { valid: true, value: '+33 6 12 34 56 78', errors: [] }

// Germany
sanitizePhoneNumber('03012345678', { country: 'DE' });
// { valid: true, value: '+49 301 2345678', errors: [] }

// Supported countries: US, CA, GB, FR, DE, IT, NL, BE, SE, CH, JP, IN
```

### Postal Code Validation

Country-specific postal code formats:

```javascript
import { sanitizePostalCode } from './validation-utils.js';

// UK Postcode
sanitizePostalCode('SW1A1AA', { country: 'GB', format: true });
// { valid: true, value: 'SW1A 1AA', errors: [] }

// Netherlands
sanitizePostalCode('1012AB', { country: 'NL', format: true });
// { valid: true, value: '1012 AB', errors: [] }

// Sweden
sanitizePostalCode('11455', { country: 'SE', format: true });
// { valid: true, value: '114 55', errors: [] }

// Switzerland
sanitizePostalCode('8001', { country: 'CH' });
// { valid: true, value: '8001', errors: [] }
```

### IBAN Validation

Validates International Bank Account Numbers for European countries:

```javascript
import { sanitizeIBAN } from './validation-utils.js';

// Belgium
sanitizeIBAN('BE68539007547034');
// { valid: true, value: 'BE68539007547034', errors: [] }

// France
sanitizeIBAN('FR1420041010050500013M02606');
// { valid: true, value: 'FR1420041010050500013M02606', errors: [] }

// Germany
sanitizeIBAN('DE89370400440532013000');
// { valid: true, value: 'DE89370400440532013000', errors: [] }

// Features:
// - Country-specific length validation
// - MOD-97 checksum verification
// - Supports: BE, FR, DE, IT, NL, SE, CH, GB, and more
```

### BIC/SWIFT Validation

```javascript
import { sanitizeBIC } from './validation-utils.js';

sanitizeBIC('DEUTDEFF');
// { valid: true, value: 'DEUTDEFF', errors: [] }

sanitizeBIC('CHASUS33XXX');
// { valid: true, value: 'CHASUS33XXX', errors: [] }

// Validates 8 or 11 character BIC/SWIFT codes
```

### Tax ID Validators by Country

#### UK National Insurance Number

```javascript
import { sanitizeUKNIN } from './validation-utils.js';

sanitizeUKNIN('AB123456C', { format: true });
// { valid: true, value: 'AB 123456 C', errors: [] }

// Format: 2 letters + 6 digits + 1 letter
// Validates invalid letter combinations
```

#### Canada Social Insurance Number

```javascript
import { sanitizeCanadaSIN } from './validation-utils.js';

sanitizeCanadasIN('046454286', { format: true });
// { valid: true, value: '046-454-286', errors: [] }

// 9 digits with Luhn algorithm checksum
// Optional masking: maskForDisplay: true
```

#### France INSEE Number

```javascript
import { sanitizeFranceINSEE } from './validation-utils.js';

sanitizeFranceINSEE('197054204501355', { format: true });
// { valid: true, value: '1 97 05 42 045 013 55', errors: [] }

// 15 digits with checksum validation
// Format: sex + year + month + department + commune + order + key
```

#### Germany Tax ID

```javascript
import { sanitizeGermanyTaxID } from './validation-utils.js';

sanitizeGermanyTaxID('12345678901');
// { valid: true, value: '12345678901', errors: [] }

// 11 digits with specific pattern rules
// Validates digit occurrence constraints
```

#### Italy Codice Fiscale

```javascript
import { sanitizeItalyCodiceFiscale } from './validation-utils.js';

sanitizeItalyCodiceFiscale('RSSMRA80A01H501U');
// { valid: true, value: 'RSSMRA80A01H501U', errors: [] }

// 16 characters (letters + numbers)
// Complex checksum validation based on position-dependent character maps
```

#### Netherlands BSN

```javascript
import { sanitizeNetherlandsBSN } from './validation-utils.js';

sanitizeBSN('111222333');
// { valid: true, value: '111222333', errors: [] }

// 8 or 9 digits with 11-proof checksum
```

#### Sweden Personnummer

```javascript
import { sanitizeSwedenPersonnummer } from './validation-utils.js';

sanitizeSwedenPersonnummer('8001011234', { format: true });
// { valid: true, value: '800101-1234', errors: [] }

// 10 or 12 digits with Luhn checksum
// Format: YYMMDD-XXXX or YYYYMMDD-XXXX
```

#### Switzerland AVS Number

```javascript
import { sanitizeSwitzerlandAVS } from './validation-utils.js';

sanitizeSwitzerlandAVS('7561234567897', { format: true });
// { valid: true, value: '756.1234.5678.97', errors: [] }

// 13 digits starting with 756
// EAN-13 checksum validation
```

### VAT Number Validation

Validates European Union VAT numbers:

```javascript
import { sanitizeVATNumber } from './validation-utils.js';

// Belgium
sanitizeVATNumber('BE0123456789');
// { valid: true, value: 'BE0123456789', errors: [] }

// France
sanitizeVATNumber('FRXX123456789');
// { valid: true, value: 'FRXX123456789', errors: [] }

// Germany
sanitizeVATNumber('DE123456789');
// { valid: true, value: 'DE123456789', errors: [] }

// Supported: BE, FR, DE, IT, NL, SE, CH, GB, ES
// Country-specific format validation
```

---

## Best Practices

1. **Always validate at multiple layers** - Client, API, and database
2. **Use sanitized values** - Never use raw user input
3. **Display specific errors** - Help users correct mistakes
4. **Handle warnings** - Show suggestions for common typos
5. **Mask sensitive data** - Use `maskForDisplay` for SSN, account numbers
6. **Validate before database operations** - Prevent invalid data storage

---

## Security Features

- **XSS Prevention** - Automatic HTML escaping
- **Input Sanitization** - Remove malicious characters
- **Format Validation** - Prevent injection attacks
- **PII Masking** - Protect sensitive information
- **Checksum Verification** - Validate government IDs

---

## Performance Tips

- **Cache validation results** - For repeated validations
- **Debounce real-time validation** - Reduce CPU usage
- **Batch validations** - Use composite validators
- **Lazy validation** - Validate on blur, not on keypress

---

## Related Resources

- [Validation Utilities Source](./validation-utils.js)
- [Enumerations Schema](./enumerations.json)
- [Data Models](./data-models/schema.sql)
- [API Specification](./api-endpoints.md)

---

**Maintainer:** Engineering Team
**Last Review:** December 5, 2025
