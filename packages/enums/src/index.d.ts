/** Hand-written types for the enumeration source of truth (plain ESM, no build step — see @kaaj/validation's index.d.ts). */

export interface EnumerationNode {
  values?: string[]
  description?: string
  [key: string]: unknown
}

export interface Enumerations {
  $schema?: string
  title?: string
  version?: string
  lastUpdated?: string
  description?: string
  enumerations: Record<string, EnumerationNode>
  globalReferenceData?: Record<string, unknown>
  notes?: unknown
}

export declare const enumerations: Enumerations

/** camelCase key (employmentType) -> snake_case Postgres type name. */
export declare function toTypeName(key: string): string

/**
 * Flattens the nested document into Map<snake_case_name, string[]>. Only nodes
 * carrying a `values` array are enumerations; everything else is grouping.
 */
export declare function allEnumerations(
  node?: unknown,
  found?: Map<string, string[]>,
): Map<string, string[]>
