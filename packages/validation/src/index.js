/** Validation and sanitization functions shared across every module. */

// ============================================================================
// STRING SANITIZATION & VALIDATION
// ============================================================================

/** Sanitizes a person name: trims, collapses spaces, capitalizes, allows hyphens/apostrophes/Unicode. */
export const sanitizeName = (name, options = {}) => {
  const {
    maxLength = 100,
    allowHyphens = true,
    allowApostrophes = true,
    capitalizeWords = true,
    allowMultipleWords = true,
  } = options

  if (!name || typeof name !== "string") {
    return { valid: false, value: "", errors: ["Name is required"] }
  }

  // Trim and normalize whitespace
  let sanitized = name.trim().replace(/\s+/g, " ")

  // Remove invalid characters (allow letters, spaces, hyphens, apostrophes, accents)
  const allowedPattern = allowMultipleWords
    ? /[^a-zA-ZÀ-ÿ\s\-']/g
    : /[^a-zA-ZÀ-ÿ\-']/g

  sanitized = sanitized.replace(allowedPattern, "")

  // Handle hyphens
  if (!allowHyphens) {
    sanitized = sanitized.replace(/-/g, "")
  } else {
    // Remove multiple consecutive hyphens
    sanitized = sanitized.replace(/-+/g, "-")
    // Remove leading/trailing hyphens
    sanitized = sanitized.replace(/^-+|-+$/g, "")
  }

  // Handle apostrophes
  if (!allowApostrophes) {
    sanitized = sanitized.replace(/'/g, "")
  } else {
    // Normalize apostrophes (curly quotes to straight quotes)
    sanitized = sanitized.replace(/['']/g, "'")
    // Remove multiple consecutive apostrophes
    sanitized = sanitized.replace(/'+/g, "'")
  }

  // Capitalize words if requested
  if (capitalizeWords) {
    sanitized = sanitized
      .split(" ")
      .map((word) => {
        // Handle hyphenated names (e.g., Mary-Jane)
        return word
          .split("-")
          .map((part) => {
            // Handle names with apostrophes (e.g., O'Brien)
            return part
              .split("'")
              .map((segment) => {
                if (!segment) return segment
                return (
                  segment.charAt(0).toUpperCase() +
                  segment.slice(1).toLowerCase()
                )
              })
              .join("'")
          })
          .join("-")
      })
      .join(" ")
  }

  // Check length
  if (sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized.substring(0, maxLength),
      errors: [`Name exceeds maximum length of ${maxLength} characters`],
    }
  }

  // Check minimum length
  if (sanitized.length < 1) {
    return { valid: false, value: "", errors: ["Name cannot be empty"] }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates and sanitizes an email: lowercases, RFC 5322 regex, flags common domain typos. */
export const sanitizeEmail = (email, options = {}) => {
  const { maxLength = 254 } = options
  // No `checkDomain` option: DNS/MX validation belongs server-side, not here.

  if (!email || typeof email !== "string") {
    return { valid: false, value: "", errors: ["Email is required"] }
  }

  // Trim and lowercase
  let sanitized = email.trim().toLowerCase()

  // Remove spaces within email
  sanitized = sanitized.replace(/\s/g, "")

  // Check length
  if (sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized,
      errors: [`Email exceeds maximum length of ${maxLength} characters`],
    }
  }

  // RFC 5322 simplified regex
  const emailRegex =
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

  if (!emailRegex.test(sanitized)) {
    return { valid: false, value: sanitized, errors: ["Invalid email format"] }
  }

  // Check for common typos in domain
  const commonTypos = {
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "yahooo.com": "yahoo.com",
    "yaho.com": "yahoo.com",
    "hotmial.com": "hotmail.com",
  }

  const [localPart, domain] = sanitized.split("@")
  if (commonTypos[domain]) {
    return {
      valid: true,
      value: `${localPart}@${commonTypos[domain]}`,
      warnings: [`Did you mean ${commonTypos[domain]}?`],
      errors: [],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates and formats a phone number for the given country. */
export const sanitizePhoneNumber = (phone, options = {}) => {
  const { country = "US", format = true, allowExtensions = true } = options

  if (!phone || typeof phone !== "string") {
    return { valid: false, value: "", errors: ["Phone number is required"] }
  }

  // Remove all non-numeric characters except + (for country code) and x (for extension)
  let sanitized = phone.trim()

  // Extract extension if present
  let extension = ""
  if (allowExtensions) {
    const extMatch = sanitized.match(/(?:ext\.?|extension|x)\s*(\d+)/i)
    if (extMatch) {
      extension = extMatch[1]
      sanitized = sanitized.replace(/(?:ext\.?|extension|x)\s*\d+/i, "")
    }
  }

  // Remove all non-numeric characters except leading +
  const hasPlus = sanitized.startsWith("+")
  sanitized = sanitized.replace(/\D/g, "")
  if (hasPlus && sanitized.length > 10) {
    sanitized = "+" + sanitized
  }

  if (country === "US") {
    // US phone validation (10 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 11 && digits.startsWith("1")) {
      // Remove leading 1
      sanitized = digits.substring(1)
    } else if (digits.length === 10) {
      sanitized = digits
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["US phone number must be 10 digits"],
      }
    }

    // Validate area code (first digit can't be 0 or 1)
    if (sanitized[0] === "0" || sanitized[0] === "1") {
      return {
        valid: false,
        value: phone,
        errors: ["Invalid area code"],
      }
    }

    // Format as (XXX) XXX-XXXX
    if (format) {
      sanitized = `(${sanitized.substring(0, 3)}) ${sanitized.substring(3, 6)}-${sanitized.substring(6)}`
    }

    if (extension) {
      sanitized += ` x${extension}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "IN") {
    // India phone validation (10 digits, starts with 6-9)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10) {
      if (!["6", "7", "8", "9"].includes(digits[0])) {
        return {
          valid: false,
          value: phone,
          errors: ["Indian mobile numbers must start with 6, 7, 8, or 9"],
        }
      }
      sanitized = digits
    } else if (digits.length === 12 && digits.startsWith("91")) {
      // Remove country code
      sanitized = digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Indian phone number must be 10 digits"],
      }
    }

    // Format as +91 XXXXX XXXXX
    if (format) {
      sanitized = `+91 ${sanitized.substring(0, 5)} ${sanitized.substring(5)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "CA") {
    // Canada phone validation (10 digits, same format as US)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 11 && digits.startsWith("1")) {
      sanitized = digits.substring(1)
    } else if (digits.length === 10) {
      sanitized = digits
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Canadian phone number must be 10 digits"],
      }
    }

    // Format as (XXX) XXX-XXXX or +1 (XXX) XXX-XXXX
    if (format) {
      sanitized = `+1 (${sanitized.substring(0, 3)}) ${sanitized.substring(3, 6)}-${sanitized.substring(6)}`
    }

    if (extension) {
      sanitized += ` x${extension}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "GB") {
    // UK phone validation (10-11 digits including area code)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10 || digits.length === 11) {
      sanitized = digits
    } else if (digits.length === 12 && digits.startsWith("44")) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["UK phone number must be 10-11 digits"],
      }
    }

    // Format as +44 XXXX XXXXXX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+44 ${withoutZero.substring(0, 4)} ${withoutZero.substring(4)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "FR") {
    // France phone validation (9 digits after initial 0)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10 && digits.startsWith("0")) {
      sanitized = digits
    } else if (digits.length === 11 && digits.startsWith("33")) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["French phone number must be 10 digits starting with 0"],
      }
    }

    // Format as +33 X XX XX XX XX
    if (format) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+33 ${withoutZero[0]} ${withoutZero.substring(1, 3)} ${withoutZero.substring(3, 5)} ${withoutZero.substring(5, 7)} ${withoutZero.substring(7)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "DE") {
    // Germany phone validation (10-11 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length >= 10 && digits.length <= 11) {
      sanitized = digits
    } else if (
      digits.length >= 12 &&
      digits.length <= 13 &&
      digits.startsWith("49")
    ) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["German phone number must be 10-11 digits"],
      }
    }

    // Format as +49 XXX XXXXXXXX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+49 ${withoutZero.substring(0, 3)} ${withoutZero.substring(3)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "IT") {
    // Italy phone validation (10 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10) {
      sanitized = digits
    } else if (digits.length === 12 && digits.startsWith("39")) {
      sanitized = digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Italian phone number must be 10 digits"],
      }
    }

    // Format as +39 XXX XXX XXXX
    if (format) {
      sanitized = `+39 ${sanitized.substring(0, 3)} ${sanitized.substring(3, 6)} ${sanitized.substring(6)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "NL") {
    // Netherlands phone validation (10 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10) {
      sanitized = digits
    } else if (digits.length === 12 && digits.startsWith("31")) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Dutch phone number must be 10 digits"],
      }
    }

    // Format as +31 XX XXX XXXX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+31 ${withoutZero.substring(0, 2)} ${withoutZero.substring(2, 5)} ${withoutZero.substring(5)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "BE") {
    // Belgium phone validation (9-10 digits including area code)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 9 || digits.length === 10) {
      sanitized = digits
    } else if (
      digits.length >= 11 &&
      digits.length <= 12 &&
      digits.startsWith("32")
    ) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Belgian phone number must be 9-10 digits"],
      }
    }

    // Format as +32 XXX XX XX XX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+32 ${withoutZero.substring(0, 3)} ${withoutZero.substring(3, 5)} ${withoutZero.substring(5, 7)} ${withoutZero.substring(7)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "SE") {
    // Sweden phone validation (9-10 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10 && digits.startsWith("0")) {
      sanitized = digits
    } else if (
      digits.length >= 11 &&
      digits.length <= 12 &&
      digits.startsWith("46")
    ) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Swedish phone number must be 10 digits starting with 0"],
      }
    }

    // Format as +46 XX XXX XX XX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+46 ${withoutZero.substring(0, 2)} ${withoutZero.substring(2, 5)} ${withoutZero.substring(5, 7)} ${withoutZero.substring(7)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "CH") {
    // Switzerland phone validation (10 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 10 && digits.startsWith("0")) {
      sanitized = digits
    } else if (digits.length === 12 && digits.startsWith("41")) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Swiss phone number must be 10 digits starting with 0"],
      }
    }

    // Format as +41 XX XXX XX XX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      sanitized = `+41 ${withoutZero.substring(0, 2)} ${withoutZero.substring(2, 5)} ${withoutZero.substring(5, 7)} ${withoutZero.substring(7)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "JP") {
    // Japan phone validation (10-11 digits)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length >= 10 && digits.length <= 11) {
      sanitized = digits
    } else if (
      digits.length >= 12 &&
      digits.length <= 13 &&
      digits.startsWith("81")
    ) {
      sanitized = "0" + digits.substring(2)
    } else {
      return {
        valid: false,
        value: phone,
        errors: ["Japanese phone number must be 10-11 digits"],
      }
    }

    // Format as +81 XX XXXX XXXX
    if (format && sanitized.startsWith("0")) {
      const withoutZero = sanitized.substring(1)
      if (withoutZero.length === 9) {
        sanitized = `+81 ${withoutZero.substring(0, 1)} ${withoutZero.substring(1, 5)} ${withoutZero.substring(5)}`
      } else {
        sanitized = `+81 ${withoutZero.substring(0, 2)} ${withoutZero.substring(2, 6)} ${withoutZero.substring(6)}`
      }
    }

    return { valid: true, value: sanitized, errors: [] }
  } else {
    // International format - just validate it has digits
    if (sanitized.length < 7 || sanitized.length > 15) {
      return {
        valid: false,
        value: phone,
        errors: ["International phone number must be between 7 and 15 digits"],
      }
    }

    return { valid: true, value: sanitized, errors: [] }
  }
}

/** Sanitizes a street address: normalizes common abbreviations, capitalizes, collapses spaces. */
export const sanitizeAddress = (address, options = {}) => {
  const { maxLength = 255, capitalizeWords = true } = options

  if (!address || typeof address !== "string") {
    return { valid: false, value: "", errors: ["Address is required"] }
  }

  let sanitized = address.trim().replace(/\s+/g, " ")

  // Common street abbreviations
  const abbreviations = {
    street: "St",
    avenue: "Ave",
    boulevard: "Blvd",
    road: "Rd",
    lane: "Ln",
    drive: "Dr",
    court: "Ct",
    place: "Pl",
    terrace: "Ter",
    parkway: "Pkwy",
    circle: "Cir",
    north: "N",
    south: "S",
    east: "E",
    west: "W",
    northeast: "NE",
    northwest: "NW",
    southeast: "SE",
    southwest: "SW",
    apartment: "Apt",
    suite: "Ste",
    building: "Bldg",
    floor: "Fl",
  }

  if (capitalizeWords) {
    sanitized = sanitized
      .split(" ")
      .map((word, index) => {
        const lower = word.toLowerCase()
        if (abbreviations[lower]) {
          return abbreviations[lower]
        }
        // Don't capitalize unit numbers
        if (/^\d+[a-z]?$/.test(word)) {
          return word
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(" ")
  }

  if (sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized.substring(0, maxLength),
      errors: [`Address exceeds maximum length of ${maxLength} characters`],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/**
 * Validate and format postal codes
 */
export const sanitizePostalCode = (postalCode, options = {}) => {
  const { country = "US", format = true } = options

  if (!postalCode || typeof postalCode !== "string") {
    return { valid: false, value: "", errors: ["Postal code is required"] }
  }

  let sanitized = postalCode.trim().toUpperCase().replace(/\s+/g, "")

  if (country === "US") {
    // US ZIP code: 12345 or 12345-6789
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length === 5) {
      sanitized = digits
    } else if (digits.length === 9) {
      sanitized = format
        ? `${digits.substring(0, 5)}-${digits.substring(5)}`
        : digits
    } else {
      return {
        valid: false,
        value: postalCode,
        errors: ["US ZIP code must be 5 or 9 digits"],
      }
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "CA") {
    // Canadian postal code: A1A 1A1
    sanitized = sanitized.replace(/\s/g, "")

    const canadianRegex = /^[A-Z]\d[A-Z]\d[A-Z]\d$/
    if (!canadianRegex.test(sanitized)) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Invalid Canadian postal code format (should be A1A 1A1)"],
      }
    }

    if (format) {
      sanitized = `${sanitized.substring(0, 3)} ${sanitized.substring(3)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "IN") {
    // Indian PIN code: 6 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 6) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Indian PIN code must be 6 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "GB") {
    // UK postcode: Complex format (e.g., SW1A 1AA, M1 1AE, CR2 6XH)
    // Allow space or no space
    sanitized = sanitized.replace(/\s/g, "")

    const ukRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}$/
    if (!ukRegex.test(sanitized)) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Invalid UK postcode format"],
      }
    }

    // Format with space: outward code + inward code
    if (format) {
      const inwardStart = sanitized.length - 3
      sanitized = `${sanitized.substring(0, inwardStart)} ${sanitized.substring(inwardStart)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "FR") {
    // French postal code: 5 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 5) {
      return {
        valid: false,
        value: postalCode,
        errors: ["French postal code must be 5 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "DE") {
    // German postal code: 5 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 5) {
      return {
        valid: false,
        value: postalCode,
        errors: ["German postal code must be 5 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "IT") {
    // Italian postal code: 5 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 5) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Italian postal code must be 5 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "NL") {
    // Dutch postal code: 4 digits + 2 letters (e.g., 1234 AB)
    sanitized = sanitized.replace(/\s/g, "")

    const dutchRegex = /^\d{4}[A-Z]{2}$/
    if (!dutchRegex.test(sanitized)) {
      return {
        valid: false,
        value: postalCode,
        errors: [
          "Dutch postal code must be 4 digits followed by 2 letters (e.g., 1234 AB)",
        ],
      }
    }

    if (format) {
      sanitized = `${sanitized.substring(0, 4)} ${sanitized.substring(4)}`
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "BE") {
    // Belgian postal code: 4 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 4) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Belgian postal code must be 4 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "SE") {
    // Swedish postal code: 5 digits (with optional space after 3rd digit: XXX XX)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 5) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Swedish postal code must be 5 digits"],
      }
    }

    if (format) {
      sanitized = `${digits.substring(0, 3)} ${digits.substring(3)}`
    } else {
      sanitized = digits
    }

    return { valid: true, value: sanitized, errors: [] }
  } else if (country === "CH") {
    // Swiss postal code: 4 digits
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 4) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Swiss postal code must be 4 digits"],
      }
    }

    return { valid: true, value: digits, errors: [] }
  } else if (country === "JP") {
    // Japanese postal code: 7 digits (format: XXX-XXXX)
    const digits = sanitized.replace(/\D/g, "")

    if (digits.length !== 7) {
      return {
        valid: false,
        value: postalCode,
        errors: ["Japanese postal code must be 7 digits"],
      }
    }

    if (format) {
      sanitized = `${digits.substring(0, 3)}-${digits.substring(3)}`
    } else {
      sanitized = digits
    }

    return { valid: true, value: sanitized, errors: [] }
  }

  // Generic validation
  if (sanitized.length < 3 || sanitized.length > 10) {
    return {
      valid: false,
      value: postalCode,
      errors: ["Postal code must be between 3 and 10 characters"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

// ============================================================================
// IDENTIFIER VALIDATION
// ============================================================================

/** Validates a US SSN (XXX-XX-XXXX) and rejects known-invalid patterns. */
export const sanitizeSSN = (ssn, options = {}) => {
  const { format = true, maskForDisplay = false } = options

  if (!ssn || typeof ssn !== "string") {
    return { valid: false, value: "", errors: ["SSN is required"] }
  }

  // Remove all non-numeric characters
  const digits = ssn.replace(/\D/g, "")

  if (digits.length !== 9) {
    return { valid: false, value: "", errors: ["SSN must be 9 digits"] }
  }

  // Invalid SSN patterns
  const area = digits.substring(0, 3)
  const group = digits.substring(3, 5)
  const serial = digits.substring(5, 9)

  // Area number cannot be 000, 666, or 900-999
  if (area === "000" || area === "666" || parseInt(area) >= 900) {
    return { valid: false, value: "", errors: ["Invalid SSN area number"] }
  }

  // Group number cannot be 00
  if (group === "00") {
    return { valid: false, value: "", errors: ["Invalid SSN group number"] }
  }

  // Serial number cannot be 0000
  if (serial === "0000") {
    return { valid: false, value: "", errors: ["Invalid SSN serial number"] }
  }

  let sanitized = digits

  if (format) {
    sanitized = `${area}-${group}-${serial}`
  }

  if (maskForDisplay) {
    sanitized = `***-**-${serial}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a US EIN (XX-XXXXXXX). */
export const sanitizeEIN = (ein, options = {}) => {
  const { format = true } = options

  if (!ein || typeof ein !== "string") {
    return { valid: false, value: "", errors: ["EIN is required"] }
  }

  const digits = ein.replace(/\D/g, "")

  if (digits.length !== 9) {
    return { valid: false, value: "", errors: ["EIN must be 9 digits"] }
  }

  // First two digits must be between 01 and 99
  const prefix = digits.substring(0, 2)
  if (prefix === "00" || parseInt(prefix) > 99) {
    return { valid: false, value: "", errors: ["Invalid EIN prefix"] }
  }

  const sanitized = format
    ? `${digits.substring(0, 2)}-${digits.substring(2)}`
    : digits

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates an India PAN (AAAAA9999A: 5 letters, 4 digits, 1 letter). */
export const sanitizePAN = (pan, options = {}) => {
  if (!pan || typeof pan !== "string") {
    return { valid: false, value: "", errors: ["PAN is required"] }
  }

  let sanitized = pan.trim().toUpperCase().replace(/\s/g, "")

  // PAN format: AAAAA9999A
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/

  if (!panRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid PAN format (should be AAAAA9999A)"],
    }
  }

  // 4th character should be P for individual
  const panType = sanitized[3]
  const validTypes = ["P", "C", "H", "F", "A", "T", "B", "L", "J", "G"]

  if (!validTypes.includes(panType)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid PAN type identifier"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates an India Aadhaar number: 12 digits, Verhoeff checksum. */
export const sanitizeAadhaar = (aadhaar, options = {}) => {
  const { format = true, maskForDisplay = false } = options

  if (!aadhaar || typeof aadhaar !== "string") {
    return { valid: false, value: "", errors: ["Aadhaar number is required"] }
  }

  const digits = aadhaar.replace(/\D/g, "")

  if (digits.length !== 12) {
    return { valid: false, value: "", errors: ["Aadhaar must be 12 digits"] }
  }

  // Verify using Verhoeff algorithm
  if (!verifyVerhoeff(digits)) {
    return { valid: false, value: "", errors: ["Invalid Aadhaar checksum"] }
  }

  let sanitized = digits

  if (format) {
    sanitized = `${digits.substring(0, 4)} ${digits.substring(4, 8)} ${digits.substring(8)}`
  }

  if (maskForDisplay) {
    sanitized = `XXXX XXXX ${digits.substring(8)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

// Verhoeff algorithm helper
const verifyVerhoeff = (num) => {
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ]

  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ]

  let c = 0
  const invertedArray = num.split("").map(Number).reverse()

  invertedArray.forEach((val, i) => {
    c = d[c][p[i % 8][val]]
  })

  return c === 0
}

// ============================================================================
// FINANCIAL VALIDATION
// ============================================================================

/** Returns a JS number — never use for stored money (money is a string end to end). Only for a non-persisted range check. */
export const sanitizeCurrency = (amount, options = {}) => {
  const {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    allowNegative = false,
    precision = 2,
    // No `currency` option: sanitisation is currency-independent; formatting is the caller's job.
  } = options

  if (amount === null || amount === undefined || amount === "") {
    return { valid: false, value: null, errors: ["Amount is required"] }
  }

  // Convert to number if string
  let numericValue
  if (typeof amount === "string") {
    // Remove currency symbols and commas
    const cleaned = amount.replace(/[$,₹€£¥]/g, "").trim()
    numericValue = parseFloat(cleaned)
  } else if (typeof amount === "number") {
    numericValue = amount
  } else {
    return { valid: false, value: null, errors: ["Invalid amount format"] }
  }

  if (isNaN(numericValue)) {
    return {
      valid: false,
      value: null,
      errors: ["Amount must be a valid number"],
    }
  }

  // Check negative
  if (!allowNegative && numericValue < 0) {
    return {
      valid: false,
      value: numericValue,
      errors: ["Amount cannot be negative"],
    }
  }

  // Check range
  if (numericValue < min) {
    return {
      valid: false,
      value: numericValue,
      errors: [`Amount must be at least ${min}`],
    }
  }

  if (numericValue > max) {
    return {
      valid: false,
      value: numericValue,
      errors: [`Amount cannot exceed ${max}`],
    }
  }

  // Round to precision
  const sanitized =
    Math.round(numericValue * Math.pow(10, precision)) / Math.pow(10, precision)

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a bank account number. */
export const sanitizeBankAccountNumber = (accountNumber, options = {}) => {
  const { country = "US", maskForDisplay = false } = options

  if (!accountNumber || typeof accountNumber !== "string") {
    return { valid: false, value: "", errors: ["Account number is required"] }
  }

  const digits = accountNumber.replace(/\D/g, "")

  if (country === "US") {
    // US account numbers are typically 8-17 digits
    if (digits.length < 8 || digits.length > 17) {
      return {
        valid: false,
        value: "",
        errors: ["US bank account number must be 8-17 digits"],
      }
    }
  } else if (country === "IN") {
    // Indian account numbers are typically 9-18 digits
    if (digits.length < 9 || digits.length > 18) {
      return {
        valid: false,
        value: "",
        errors: ["Indian bank account number must be 9-18 digits"],
      }
    }
  }

  let sanitized = digits

  if (maskForDisplay && digits.length >= 4) {
    sanitized =
      "X".repeat(digits.length - 4) + digits.substring(digits.length - 4)
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a US routing number: 9 digits, with checksum. */
export const sanitizeRoutingNumber = (routingNumber, options = {}) => {
  if (!routingNumber || typeof routingNumber !== "string") {
    return { valid: false, value: "", errors: ["Routing number is required"] }
  }

  const digits = routingNumber.replace(/\D/g, "")

  if (digits.length !== 9) {
    return {
      valid: false,
      value: "",
      errors: ["Routing number must be 9 digits"],
    }
  }

  // Verify checksum using ABA algorithm
  const d = digits.split("").map(Number)
  const checksum =
    (3 * (d[0] + d[3] + d[6]) +
      7 * (d[1] + d[4] + d[7]) +
      (d[2] + d[5] + d[8])) %
    10

  if (checksum !== 0) {
    return {
      valid: false,
      value: digits,
      errors: ["Invalid routing number checksum"],
    }
  }

  return { valid: true, value: digits, errors: [] }
}

/** Validates an India IFSC code: AAAA0BBBBBB — 4-letter bank code, literal 0, 6-char branch code. */
export const sanitizeIFSC = (ifsc, options = {}) => {
  if (!ifsc || typeof ifsc !== "string") {
    return { valid: false, value: "", errors: ["IFSC code is required"] }
  }

  let sanitized = ifsc.trim().toUpperCase().replace(/\s/g, "")

  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/

  if (!ifscRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid IFSC format (should be AAAA0BBBBBB)"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates an IBAN: per-country length/format plus the MOD-97 checksum. */
export const sanitizeIBAN = (iban, options = {}) => {
  const { country = null } = options

  if (!iban || typeof iban !== "string") {
    return { valid: false, value: "", errors: ["IBAN is required"] }
  }

  let sanitized = iban.trim().toUpperCase().replace(/\s/g, "")

  // IBAN lengths by country
  const ibanLengths = {
    BE: 16,
    FR: 27,
    DE: 22,
    IT: 27,
    NL: 18,
    SE: 24,
    CH: 21,
    GB: 22,
    ES: 24,
    AT: 20,
    DK: 18,
    FI: 18,
    NO: 15,
    PL: 28,
    PT: 25,
  }

  // Extract country code
  const countryCode = sanitized.substring(0, 2)

  if (country && countryCode !== country) {
    return {
      valid: false,
      value: sanitized,
      errors: [
        `IBAN country code ${countryCode} does not match expected ${country}`,
      ],
    }
  }

  // Validate length
  const expectedLength = ibanLengths[countryCode]
  if (!expectedLength) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Unsupported IBAN country code"],
    }
  }

  if (sanitized.length !== expectedLength) {
    return {
      valid: false,
      value: sanitized,
      errors: [`IBAN for ${countryCode} must be ${expectedLength} characters`],
    }
  }

  // Validate format (2 letters + 2 digits + alphanumeric)
  const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]+$/
  if (!ibanRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid IBAN format"],
    }
  }

  // MOD-97 checksum: move first 4 chars to end, letters -> numbers (A=10, B=11, ...).
  const rearranged = sanitized.substring(4) + sanitized.substring(0, 4)
  const numericString = rearranged
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0)
      return code >= 65 && code <= 90 ? (code - 55).toString() : char
    })
    .join("")

  // Calculate MOD-97
  let remainder = numericString
  while (remainder.length > 2) {
    const block = remainder.substring(0, 9)
    remainder =
      (parseInt(block, 10) % 97).toString() + remainder.substring(block.length)
  }

  if (parseInt(remainder, 10) % 97 !== 1) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid IBAN checksum"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a BIC/SWIFT code: bank(4) + country(2) + location(2) + optional branch(3), 8 or 11 chars. */
export const sanitizeBIC = (bic, options = {}) => {
  if (!bic || typeof bic !== "string") {
    return { valid: false, value: "", errors: ["BIC/SWIFT code is required"] }
  }

  let sanitized = bic.trim().toUpperCase().replace(/\s/g, "")

  // BIC format: AAAABBCCXXX or AAAABBCC
  const bicRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

  if (!bicRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid BIC/SWIFT format (should be 8 or 11 characters)"],
    }
  }

  if (sanitized.length !== 8 && sanitized.length !== 11) {
    return {
      valid: false,
      value: sanitized,
      errors: ["BIC/SWIFT must be 8 or 11 characters"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

// ============================================================================
// TAX ID VALIDATION (INTERNATIONAL)
// ============================================================================

/** Validates a UK NIN (AB123456C): letter pairs exclude D/F/I/Q/U/V (2nd also excludes O); final letter is A-D. */
export const sanitizeUKNIN = (nin, options = {}) => {
  const { format = true } = options

  if (!nin || typeof nin !== "string") {
    return {
      valid: false,
      value: "",
      errors: ["National Insurance Number is required"],
    }
  }

  let sanitized = nin.trim().toUpperCase().replace(/\s/g, "")

  const ninRegex = /^[ABCEGHJKLMNPRSTWXYZ][ABCEGHJKLMNPRSTWXYZ]\d{6}[ABCD]$/

  if (!ninRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid UK National Insurance Number format"],
    }
  }

  // Check invalid first letter
  const invalidFirst = ["D", "F", "I", "Q", "U", "V"]
  if (invalidFirst.includes(sanitized[0])) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid first letter in NIN"],
    }
  }

  // Check invalid second letter
  const invalidSecond = ["D", "F", "I", "O", "Q", "U", "V"]
  if (invalidSecond.includes(sanitized[1])) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid second letter in NIN"],
    }
  }

  // HMRC never allocates these two-letter prefixes, even though each letter is valid alone.
  const invalidPrefixes = ["BG", "GB", "KN", "NK", "NT", "TN", "ZZ"]
  if (invalidPrefixes.includes(sanitized.substring(0, 2))) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid NIN prefix"],
    }
  }

  if (format) {
    sanitized = `${sanitized.substring(0, 2)} ${sanitized.substring(2, 8)} ${sanitized.substring(8)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a Canadian SIN: 9 digits, Luhn checksum. */
export const sanitizeCanadaSIN = (sin, options = {}) => {
  const { format = true, maskForDisplay = false } = options

  if (!sin || typeof sin !== "string") {
    return {
      valid: false,
      value: "",
      errors: ["Social Insurance Number is required"],
    }
  }

  const digits = sin.replace(/\D/g, "")

  if (digits.length !== 9) {
    return { valid: false, value: "", errors: ["SIN must be 9 digits"] }
  }

  // Validate using Luhn algorithm
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(digits[i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }

  if (sum % 10 !== 0) {
    return { valid: false, value: "", errors: ["Invalid SIN checksum"] }
  }

  let sanitized = digits

  if (format) {
    sanitized = `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`
  }

  if (maskForDisplay) {
    sanitized = `XXX-XXX-${digits.substring(6)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a French INSEE number: sex(1) + year(2) + month(2) + department(2) + commune(3) + order(3) + key(2), 15 digits. */
export const sanitizeFranceINSEE = (insee, options = {}) => {
  const { format = true } = options

  if (!insee || typeof insee !== "string") {
    return { valid: false, value: "", errors: ["INSEE number is required"] }
  }

  const digits = insee.replace(/\D/g, "")

  if (digits.length !== 15) {
    return {
      valid: false,
      value: "",
      errors: ["INSEE number must be 15 digits"],
    }
  }

  // First digit must be 1, 2, 3, 4, 7, or 8
  const sex = digits[0]
  if (!["1", "2", "3", "4", "7", "8"].includes(sex)) {
    return { valid: false, value: "", errors: ["Invalid INSEE sex code"] }
  }

  // Validate key (last 2 digits)
  const mainPart = digits.substring(0, 13)
  const key = parseInt(digits.substring(13, 15))
  const calculatedKey = 97 - (parseInt(mainPart) % 97)

  if (key !== calculatedKey) {
    return { valid: false, value: "", errors: ["Invalid INSEE checksum"] }
  }

  let sanitized = digits

  if (format) {
    sanitized = `${digits.substring(0, 1)} ${digits.substring(1, 3)} ${digits.substring(3, 5)} ${digits.substring(5, 7)} ${digits.substring(7, 10)} ${digits.substring(10, 13)} ${digits.substring(13)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a German tax ID (Steueridentifikationsnummer): 11 digits. */
export const sanitizeGermanyTaxID = (taxId, options = {}) => {
  if (!taxId || typeof taxId !== "string") {
    return { valid: false, value: "", errors: ["Tax ID is required"] }
  }

  const digits = taxId.replace(/\D/g, "")

  if (digits.length !== 11) {
    return {
      valid: false,
      value: "",
      errors: ["German Tax ID must be 11 digits"],
    }
  }

  // First digit cannot be 0
  if (digits[0] === "0") {
    return { valid: false, value: "", errors: ["Tax ID cannot start with 0"] }
  }

  // At least one digit must appear exactly twice or three times
  const digitCounts = {}
  for (let i = 0; i < 10; i++) {
    digitCounts[digits[i]] = (digitCounts[digits[i]] || 0) + 1
  }

  const hasTwoOrThree = Object.values(digitCounts).some(
    (count) => count === 2 || count === 3,
  )
  const hasMoreThanThree = Object.values(digitCounts).some((count) => count > 3)

  if (!hasTwoOrThree || hasMoreThanThree) {
    return { valid: false, value: "", errors: ["Invalid Tax ID digit pattern"] }
  }

  return { valid: true, value: digits, errors: [] }
}

/** Validates an Italian Codice Fiscale: 16 chars, derived from name/birthdate/birthplace. */
export const sanitizeItalyCodiceFiscale = (cf, options = {}) => {
  if (!cf || typeof cf !== "string") {
    return { valid: false, value: "", errors: ["Codice Fiscale is required"] }
  }

  let sanitized = cf.trim().toUpperCase().replace(/\s/g, "")

  if (sanitized.length !== 16) {
    return {
      valid: false,
      value: "",
      errors: ["Codice Fiscale must be 16 characters"],
    }
  }

  // Format: 6 letters + 2 digits + 1 letter + 2 digits + 4 alphanumeric + 1 letter
  const cfRegex = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/

  if (!cfRegex.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid Codice Fiscale format"],
    }
  }

  // Validate checksum (last character)
  const oddMap = {
    0: 1,
    1: 0,
    2: 5,
    3: 7,
    4: 9,
    5: 13,
    6: 15,
    7: 17,
    8: 19,
    9: 21,
    A: 1,
    B: 0,
    C: 5,
    D: 7,
    E: 9,
    F: 13,
    G: 15,
    H: 17,
    I: 19,
    J: 21,
    K: 2,
    L: 4,
    M: 18,
    N: 20,
    O: 11,
    P: 3,
    Q: 6,
    R: 8,
    S: 12,
    T: 14,
    U: 16,
    V: 10,
    W: 22,
    X: 25,
    Y: 24,
    Z: 23,
  }

  const evenMap = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
  }

  let sum = 0
  for (let i = 0; i < 15; i++) {
    const char = sanitized[i]
    sum += i % 2 === 0 ? oddMap[char] : evenMap[char]
  }

  const checkChar = String.fromCharCode(65 + (sum % 26))
  if (sanitized[15] !== checkChar) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Invalid Codice Fiscale checksum"],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a Dutch BSN: 8 or 9 digits, 11-proof checksum. */
export const sanitizeNetherlandsBSN = (bsn, options = {}) => {
  if (!bsn || typeof bsn !== "string") {
    return { valid: false, value: "", errors: ["BSN is required"] }
  }

  const digits = bsn.replace(/\D/g, "")

  if (digits.length !== 8 && digits.length !== 9) {
    return { valid: false, value: "", errors: ["BSN must be 8 or 9 digits"] }
  }

  // 11-proof validation
  const multipliers =
    digits.length === 9
      ? [9, 8, 7, 6, 5, 4, 3, 2, -1]
      : [8, 7, 6, 5, 4, 3, 2, -1]

  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i]) * multipliers[i]
  }

  if (sum % 11 !== 0) {
    return { valid: false, value: "", errors: ["Invalid BSN checksum"] }
  }

  return { valid: true, value: digits, errors: [] }
}

/** Validates a Swedish Personnummer (YYMMDD-XXXX or YYYYMMDD-XXXX): Luhn checksum. */
export const sanitizeSwedenPersonnummer = (personnummer, options = {}) => {
  const { format = true } = options

  if (!personnummer || typeof personnummer !== "string") {
    return { valid: false, value: "", errors: ["Personnummer is required"] }
  }

  let sanitized = personnummer.replace(/\D/g, "")

  // Accept 10 or 12 digits
  if (sanitized.length === 12) {
    sanitized = sanitized.substring(2) // Convert YYYYMMDD to YYMMDD
  }

  if (sanitized.length !== 10) {
    return {
      valid: false,
      value: "",
      errors: ["Personnummer must be 10 or 12 digits"],
    }
  }

  // Validate using Luhn algorithm
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let digit = parseInt(sanitized[i])
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }

  if (sum % 10 !== 0) {
    return {
      valid: false,
      value: "",
      errors: ["Invalid Personnummer checksum"],
    }
  }

  if (format) {
    sanitized = `${sanitized.substring(0, 6)}-${sanitized.substring(6)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/** Validates a Swiss AVS number (756.XXXX.XXXX.XX): 13 digits, EAN-13 checksum, starts with 756. */
export const sanitizeSwitzerlandAVS = (avs, options = {}) => {
  const { format = true } = options

  if (!avs || typeof avs !== "string") {
    return { valid: false, value: "", errors: ["AVS number is required"] }
  }

  const digits = avs.replace(/\D/g, "")

  if (digits.length !== 13) {
    return { valid: false, value: "", errors: ["AVS number must be 13 digits"] }
  }

  if (!digits.startsWith("756")) {
    return {
      valid: false,
      value: "",
      errors: ["AVS number must start with 756"],
    }
  }

  // Validate EAN-13 checksum
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits[i])
    sum += i % 2 === 0 ? digit : digit * 3
  }

  const checkDigit = (10 - (sum % 10)) % 10
  if (parseInt(digits[12]) !== checkDigit) {
    return { valid: false, value: "", errors: ["Invalid AVS checksum"] }
  }

  let sanitized = digits

  if (format) {
    sanitized = `${digits.substring(0, 3)}.${digits.substring(3, 7)}.${digits.substring(7, 11)}.${digits.substring(11)}`
  }

  return { valid: true, value: sanitized, errors: [] }
}

/**
 * Validate VAT Number (European Union)
 * - Country-specific formats
 */
export const sanitizeVATNumber = (vat, options = {}) => {
  const { country = null } = options

  if (!vat || typeof vat !== "string") {
    return { valid: false, value: "", errors: ["VAT number is required"] }
  }

  let sanitized = vat.trim().toUpperCase().replace(/\s/g, "")

  // VAT formats by country
  const vatPatterns = {
    BE: /^BE0\d{9}$/, // Belgium: BE0999999999
    FR: /^FR[A-Z0-9]{2}\d{9}$/, // France: FRXX999999999
    DE: /^DE\d{9}$/, // Germany: DE999999999
    IT: /^IT\d{11}$/, // Italy: IT99999999999
    NL: /^NL\d{9}B\d{2}$/, // Netherlands: NL999999999B99
    SE: /^SE\d{12}$/, // Sweden: SE999999999999
    CH: /^CHE\d{9}$/, // Switzerland: CHE999999999
    GB: /^GB\d{9}$|^GB\d{12}$|^GBGD\d{3}$|^GBHA\d{3}$/, // UK: Various formats
    ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/, // Spain: ESX9999999X
  }

  const countryCode = sanitized.substring(0, 2)

  if (country && !sanitized.startsWith(country)) {
    return {
      valid: false,
      value: sanitized,
      errors: [`VAT number must start with ${country}`],
    }
  }

  const pattern = vatPatterns[countryCode]
  if (!pattern) {
    return {
      valid: false,
      value: sanitized,
      errors: ["Unsupported VAT country code"],
    }
  }

  if (!pattern.test(sanitized)) {
    return {
      valid: false,
      value: sanitized,
      errors: [`Invalid VAT number format for ${countryCode}`],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

/**
 * Validate and sanitize dates
 */
export const sanitizeDate = (date, options = {}) => {
  const {
    minDate = null,
    maxDate = null,
    format = "ISO", // ISO, US, EU
    allowFuture = true,
    allowPast = true,
  } = options

  if (!date) {
    return { valid: false, value: null, errors: ["Date is required"] }
  }

  let dateObj

  // Parse date
  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === "string") {
    dateObj = new Date(date)
  } else {
    return { valid: false, value: null, errors: ["Invalid date format"] }
  }

  if (isNaN(dateObj.getTime())) {
    return { valid: false, value: null, errors: ["Invalid date"] }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  // Check future/past
  if (!allowFuture && dateObj > now) {
    return {
      valid: false,
      value: dateObj,
      errors: ["Future dates are not allowed"],
    }
  }

  if (!allowPast && dateObj < now) {
    return {
      valid: false,
      value: dateObj,
      errors: ["Past dates are not allowed"],
    }
  }

  // Check min/max
  if (minDate && dateObj < new Date(minDate)) {
    return {
      valid: false,
      value: dateObj,
      errors: [`Date must be on or after ${minDate}`],
    }
  }

  if (maxDate && dateObj > new Date(maxDate)) {
    return {
      valid: false,
      value: dateObj,
      errors: [`Date must be on or before ${maxDate}`],
    }
  }

  // Format output
  let formatted
  if (format === "ISO") {
    formatted = dateObj.toISOString().split("T")[0] // YYYY-MM-DD
  } else if (format === "US") {
    formatted = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}` // MM/DD/YYYY
  } else if (format === "EU") {
    formatted = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}` // DD/MM/YYYY
  } else {
    formatted = dateObj
  }

  return { valid: true, value: formatted, errors: [] }
}

/** Validates a date of birth: must be in the past, age 0-120. */
export const sanitizeDateOfBirth = (dob, options = {}) => {
  const { minAge = 0, maxAge = 120 } = options

  const result = sanitizeDate(dob, { allowFuture: false, format: "ISO" })

  if (!result.valid) {
    return result
  }

  const birthDate = new Date(result.value)
  const today = new Date()

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--
  }

  if (age < minAge) {
    return {
      valid: false,
      value: result.value,
      errors: [`Age must be at least ${minAge} years`],
    }
  }

  if (age > maxAge) {
    return {
      valid: false,
      value: result.value,
      errors: [`Age cannot exceed ${maxAge} years`],
    }
  }

  return { valid: true, value: result.value, age, errors: [] }
}

// ============================================================================
// EMPLOYMENT VALIDATION
// ============================================================================

/** Validates an employee ID/number. */
export const sanitizeEmployeeNumber = (empNumber, options = {}) => {
  const {
    minLength = 1,
    maxLength = 20,
    allowLetters = true,
    allowNumbers = true,
    format = null, // Optional format pattern, e.g. "EMP-####"
  } = options
  // No `prefix` option: use `format` instead.

  if (!empNumber || typeof empNumber !== "string") {
    return { valid: false, value: "", errors: ["Employee number is required"] }
  }

  let sanitized = empNumber.trim().toUpperCase()

  // Apply format if specified (e.g., "EMP-####")
  if (format) {
    const formatRegex = new RegExp(
      format.replace(/#/g, "[0-9]").replace(/A/g, "[A-Z]"),
    )
    if (!formatRegex.test(sanitized)) {
      return {
        valid: false,
        value: sanitized,
        errors: [`Employee number must match format: ${format}`],
      }
    }
  } else {
    // Standard validation
    const allowedChars = []
    if (allowLetters) allowedChars.push("A-Z")
    if (allowNumbers) allowedChars.push("0-9")
    allowedChars.push("-")

    const regex = new RegExp(`^[${allowedChars.join("")}]+$`)
    if (!regex.test(sanitized)) {
      return {
        valid: false,
        value: sanitized,
        errors: ["Employee number contains invalid characters"],
      }
    }
  }

  if (sanitized.length < minLength || sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized,
      errors: [`Employee number must be ${minLength}-${maxLength} characters`],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/**
 * Validate job title
 */
export const sanitizeJobTitle = (title, options = {}) => {
  const { maxLength = 100 } = options

  if (!title || typeof title !== "string") {
    return { valid: false, value: "", errors: ["Job title is required"] }
  }

  let sanitized = title.trim().replace(/\s+/g, " ")

  // Capitalize each word
  sanitized = sanitized
    .split(" ")
    .map((word) => {
      // Don't capitalize articles and prepositions unless first word
      const lowerWord = word.toLowerCase()
      if (["of", "and", "the", "for", "in", "on", "at"].includes(lowerWord)) {
        return lowerWord
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")

  // Capitalize first word
  if (sanitized.length > 0) {
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1)
  }

  if (sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized.substring(0, maxLength),
      errors: [`Job title exceeds maximum length of ${maxLength} characters`],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

// ============================================================================
// COMPOSITE VALIDATORS
// ============================================================================

/** Validates a full employee profile. */
export const validateEmployeeProfile = (profile) => {
  const errors = {}
  const sanitized = {}

  // First name
  const firstName = sanitizeName(profile.firstName, { maxLength: 50 })
  if (!firstName.valid) {
    errors.firstName = firstName.errors
  } else {
    sanitized.firstName = firstName.value
  }

  // Last name
  const lastName = sanitizeName(profile.lastName, { maxLength: 50 })
  if (!lastName.valid) {
    errors.lastName = lastName.errors
  } else {
    sanitized.lastName = lastName.value
  }

  // Email
  const email = sanitizeEmail(profile.email)
  if (!email.valid) {
    errors.email = email.errors
  } else {
    sanitized.email = email.value
  }

  // Phone (optional)
  if (profile.phone) {
    const phone = sanitizePhoneNumber(profile.phone, {
      country: profile.country || "US",
    })
    if (!phone.valid) {
      errors.phone = phone.errors
    } else {
      sanitized.phone = phone.value
    }
  }

  // Date of birth (optional but validate if provided)
  if (profile.dateOfBirth) {
    const dob = sanitizeDateOfBirth(profile.dateOfBirth, {
      minAge: 16,
      maxAge: 100,
    })
    if (!dob.valid) {
      errors.dateOfBirth = dob.errors
    } else {
      sanitized.dateOfBirth = dob.value
    }
  }

  // SSN (US) or PAN (India)
  if (profile.ssn && profile.country === "US") {
    const ssn = sanitizeSSN(profile.ssn)
    if (!ssn.valid) {
      errors.ssn = ssn.errors
    } else {
      sanitized.ssn = ssn.value
    }
  } else if (profile.pan && profile.country === "IN") {
    const pan = sanitizePAN(profile.pan)
    if (!pan.valid) {
      errors.pan = pan.errors
    } else {
      sanitized.pan = pan.value
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    sanitized,
    errors,
  }
}

/**
 * Validate address object
 */
export const validateAddress = (address) => {
  const errors = {}
  const sanitized = {}

  // Address line 1
  if (address.line1) {
    const line1 = sanitizeAddress(address.line1)
    if (!line1.valid) {
      errors.line1 = line1.errors
    } else {
      sanitized.line1 = line1.value
    }
  } else {
    errors.line1 = ["Address line 1 is required"]
  }

  // Address line 2 (optional)
  if (address.line2) {
    const line2 = sanitizeAddress(address.line2)
    if (!line2.valid) {
      errors.line2 = line2.errors
    } else {
      sanitized.line2 = line2.value
    }
  }

  // City
  if (address.city) {
    const city = sanitizeName(address.city, { allowMultipleWords: true })
    if (!city.valid) {
      errors.city = city.errors
    } else {
      sanitized.city = city.value
    }
  } else {
    errors.city = ["City is required"]
  }

  // Postal code
  if (address.postalCode) {
    const postal = sanitizePostalCode(address.postalCode, {
      country: address.country || "US",
    })
    if (!postal.valid) {
      errors.postalCode = postal.errors
    } else {
      sanitized.postalCode = postal.value
    }
  } else {
    errors.postalCode = ["Postal code is required"]
  }

  return {
    valid: Object.keys(errors).length === 0,
    sanitized,
    errors,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Generic string sanitizer: trims, strips control chars, normalizes Unicode, escapes XSS-relevant chars. */
export const sanitizeString = (str, options = {}) => {
  const {
    maxLength = 1000,
    allowNewlines = false,
    allowHtml = false,
    trim = true,
  } = options

  if (!str || typeof str !== "string") {
    return { valid: true, value: "", errors: [] }
  }

  let sanitized = str

  // Trim if requested
  if (trim) {
    sanitized = sanitized.trim()
  }

  // Strip control chars. allowNewlines keeps \n, \r, \t; the regex differs between branches on purpose.
  if (allowNewlines) {
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  } else {
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "")
  }

  // Remove/escape HTML if not allowed
  if (!allowHtml) {
    sanitized = sanitized
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
  }

  // Check length
  if (sanitized.length > maxLength) {
    return {
      valid: false,
      value: sanitized.substring(0, maxLength),
      errors: [`Text exceeds maximum length of ${maxLength} characters`],
    }
  }

  return { valid: true, value: sanitized, errors: [] }
}

/**
 * Validate enum value
 */
export const validateEnum = (value, allowedValues, fieldName = "field") => {
  if (!value) {
    return { valid: false, value: null, errors: [`${fieldName} is required`] }
  }

  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      value,
      errors: [
        `Invalid ${fieldName}. Must be one of: ${allowedValues.join(", ")}`,
      ],
    }
  }

  return { valid: true, value, errors: [] }
}

/** Validates multiple fields against a schema and returns combined results. */
export const validateFields = (data, schema) => {
  const errors = {}
  const sanitized = {}
  const warnings = {}

  for (const [field, validator] of Object.entries(schema)) {
    const result = validator(data[field])

    if (!result.valid) {
      errors[field] = result.errors
    } else {
      sanitized[field] = result.value
    }

    if (result.warnings) {
      warnings[field] = result.warnings
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    sanitized,
    errors,
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
  }
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  // String sanitization
  sanitizeName,
  sanitizeEmail,
  sanitizePhoneNumber,
  sanitizeAddress,
  sanitizePostalCode,
  sanitizeString,

  // Identifiers
  sanitizeSSN,
  sanitizeEIN,
  sanitizePAN,
  sanitizeAadhaar,

  // Financial
  sanitizeCurrency,
  sanitizeBankAccountNumber,
  sanitizeRoutingNumber,
  sanitizeIFSC,

  // Dates
  sanitizeDate,
  sanitizeDateOfBirth,

  // Employment
  sanitizeEmployeeNumber,
  sanitizeJobTitle,

  // Composite validators
  validateEmployeeProfile,
  validateAddress,

  // Utilities
  validateEnum,
  validateFields,
}
