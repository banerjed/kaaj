/**
 * Type declarations for @kaaj/validation. Hand-written because the
 * implementation is plain ESM JS (framework-agnostic, ADR-004) — this
 * describes the public surface so consumers don't see implicit-any.
 */

/** Every sanitiser returns this shape — never a bare value. */
export interface ValidationResult<T = string> {
  /** Whether the input satisfied every rule. */
  valid: boolean
  /** The normalised value. Present even when `valid` is false, for redisplay. */
  value: T
  /** Human-readable failures. Empty when `valid` is true. */
  errors: string[]
}

export interface FieldValidationResult {
  valid: boolean
  values: Record<string, unknown>
  errors: Record<string, string[]>
}

export declare function sanitizeName(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeEmail(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizePhoneNumber(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeAddress(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizePostalCode(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeSSN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeEIN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizePAN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeAadhaar(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeCurrency(
  amount: unknown,
  options?: {
    min?: number
    max?: number
    allowNegative?: boolean
    precision?: number
  },
): ValidationResult<number | null>

export declare function sanitizeBankAccountNumber(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeRoutingNumber(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeIFSC(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeIBAN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeBIC(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeUKNIN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeCanadaSIN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeFranceINSEE(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeGermanyTaxID(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeItalyCodiceFiscale(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeNetherlandsBSN(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeSwedenPersonnummer(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeSwitzerlandAVS(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeVATNumber(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeDate(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeDateOfBirth(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeEmployeeNumber(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function sanitizeJobTitle(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function validateEmployeeProfile(
  profile: Record<string, unknown>,
): FieldValidationResult

export declare function validateAddress(
  address: Record<string, unknown>,
  country?: string,
): FieldValidationResult

export declare function sanitizeString(
  value: unknown,
  options?: Record<string, unknown>,
): ValidationResult

export declare function validateEnum(
  value: unknown,
  allowedValues: readonly string[],
  fieldName?: string,
): ValidationResult<string | null>

export declare function validateFields(
  data: Record<string, unknown>,
  rules: Record<string, unknown>,
): FieldValidationResult
