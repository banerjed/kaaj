import { allEnumerations } from "@kaaj/enums"
import { compareDecimal } from "$lib/decimal"

/**
 * Reading and validating form fields. Every action writes through this — the
 * column type is not a validator; a crafted POST bypassing `required`/`type`
 * hits it as an unhandled 500 instead (L34). Accumulates failed fields so a
 * call site is a list of declarations and one `if (!f.ok)`:
 *
 * ```ts
 * const f = new FormReader(data)
 * const name = f.text("name", { required: true, max: 255 })
 * if (!f.ok) return fail(400, f.problem())
 * ```
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Still used directly for the `name_i18n.<locale>` loops, which are dynamic. */
export const formString = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

export const formList = (formData: FormData, name: string) =>
  formData.getAll(name).filter((v): v is string => typeof v === "string")

type Base = { required?: boolean }
type TextOpts = Base & {
  /** MUST match the column's `varchar(n)`. Postgres is the last line, not the first. */
  max: number
  min?: number
  pattern?: RegExp
  upper?: boolean
}
type NumberOpts = Base & { min?: number; max?: number }
/** `scale` is the column's, so a value the column would silently round is refused. */
type DecimalOpts = NumberOpts & { scale: number; integerDigits?: number }

/** A field name as a person would read it — dotted names keep their qualifier, e.g. `range.USD.max` -> "Maximum (USD)". */
function labelFor(field: string): string {
  const parts = field.split(".")
  const last = parts[parts.length - 1].replace(/_/g, " ")
  const label = last.charAt(0).toUpperCase() + last.slice(1)
  return parts.length > 2 ? `${label} (${parts[1]})` : label
}

/** "Check Location code and Timezone." — never a bare "something is wrong". */
export function checkFields(fields: string[]): string {
  if (fields.length === 0) return "Some fields need attention."
  const labels = fields.map(labelFor)
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
  return `Check ${list}.`
}

export class FormReader {
  private readonly failures = new Set<string>()

  constructor(private readonly data: FormData) {}

  get ok(): boolean {
    return this.failures.size === 0
  }

  get errorFields(): string[] {
    return [...this.failures]
  }

  /** Ready to spread into `fail(400, …)`. Default message names the fields, never a bare "something is wrong". */
  problem(message?: string) {
    return {
      errorFields: this.errorFields,
      message: message ?? checkFields(this.errorFields),
    }
  }

  /** For a rule this reader cannot express — a cycle, a clash, an overlap. */
  reject(field: string): void {
    this.failures.add(field)
  }

  private raw(name: string): string {
    return formString(this.data, name).trim()
  }

  /**
   * Blank, valid, or rejected — three outcomes, never two (L33). Collapsing
   * "invalid" into the same return as "blank" deletes the field and reports
   * success.
   */
  private read<T>(
    name: string,
    required: boolean,
    parse: (raw: string) => T | undefined,
  ): T | null {
    const raw = this.raw(name)
    if (raw === "") {
      if (required) this.failures.add(name)
      return null
    }
    const parsed = parse(raw)
    if (parsed === undefined) {
      this.failures.add(name)
      return null
    }
    return parsed
  }

  text(name: string, opts: TextOpts & { required: true }): string
  text(name: string, opts: TextOpts): string | null
  text(name: string, opts: TextOpts): string | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      const v = opts.upper ? raw.toUpperCase() : raw
      // Length in code points, not UTF-16 units: Postgres counts characters,
      // so an emoji or an astral-plane script would otherwise pass a check the
      // column then fails.
      if ([...v].length > opts.max) return undefined
      if (opts.min !== undefined && [...v].length < opts.min) return undefined
      if (opts.pattern && !opts.pattern.test(v)) return undefined
      return v
    })
    return opts.required ? (value ?? "") : value
  }

  uuid(name: string, opts: Base & { required: true }): string
  uuid(name: string, opts?: Base): string | null
  uuid(name: string, opts: Base = {}): string | null {
    const value = this.read(name, opts.required ?? false, (raw) =>
      UUID.test(raw) ? raw : undefined,
    )
    return opts.required ? (value ?? "") : value
  }

  /** Membership checked against @kaaj/enums, which ./check keeps in step with Postgres. */
  enumValue(
    name: string,
    typeName: string,
    opts: Base & { fallback: string },
  ): string
  enumValue(
    name: string,
    typeName: string,
    opts: Base & { required: true },
  ): string
  enumValue(name: string, typeName: string, opts?: Base): string | null
  enumValue(
    name: string,
    typeName: string,
    opts: Base & { fallback?: string } = {},
  ): string | null {
    const allowed = allEnumerations().get(typeName) ?? []
    const value = this.read(name, opts.required ?? false, (raw) =>
      allowed.includes(raw) ? raw : undefined,
    )
    // `required` yields "" rather than null so the overload is honest: the
    // caller has already returned on `!f.ok` before it reads this.
    if (value === null && opts.required && opts.fallback === undefined)
      return ""
    return value ?? opts.fallback ?? null
  }

  /**
   * A fixed set on a plain `varchar` column with no Postgres enum. Generic
   * over the allowed values, so `["todo", "done"]` returns that union rather
   * than widening to `string`.
   */
  choice<T extends string>(
    name: string,
    allowed: readonly T[],
    opts: Base & { fallback: T },
  ): T
  choice<T extends string>(
    name: string,
    allowed: readonly T[],
    opts: Base & { required: true },
  ): T
  choice<T extends string>(
    name: string,
    allowed: readonly T[],
    opts?: Base,
  ): T | null
  choice<T extends string>(
    name: string,
    allowed: readonly T[],
    opts: Base & { fallback?: T } = {},
  ): T | null {
    const value = this.read(name, opts.required ?? false, (raw) =>
      allowed.includes(raw as T) ? raw : undefined,
    ) as T | null
    // `required` yields "" rather than null so the overload is honest: the
    // caller has already returned on `!f.ok` before it reads this.
    if (value === null && opts.required && opts.fallback === undefined)
      return "" as T
    return value ?? opts.fallback ?? null
  }

  /** Money and rates, kept as a STRING end to end — parsing here is where precision would be lost. See CLAUDE.md § Money. */
  decimal(name: string, opts: DecimalOpts & { required: true }): string
  decimal(name: string, opts: DecimalOpts): string | null
  decimal(name: string, opts: DecimalOpts): string | null {
    const digits = opts.integerDigits ?? 15
    const shape = new RegExp(`^-?\\d{1,${digits}}(\\.\\d{1,${opts.scale}})?$`)
    const value = this.read(name, opts.required ?? false, (raw) => {
      // Refused, not rounded — the column would round silently instead (L25).
      if (!shape.test(raw)) return undefined
      // Compared as decimals, not via Number() — see the class-level note.
      if (opts.min !== undefined && compareDecimal(raw, String(opts.min)) < 0) {
        return undefined
      }
      if (opts.max !== undefined && compareDecimal(raw, String(opts.max)) > 0) {
        return undefined
      }
      return raw
    })
    return opts.required ? (value ?? "") : value
  }

  integer(name: string, opts: NumberOpts & { required: true }): number
  integer(name: string, opts?: NumberOpts): number | null
  integer(name: string, opts: NumberOpts = {}): number | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      if (!/^-?\d{1,15}$/.test(raw)) return undefined
      const n = Number(raw)
      if (opts.min !== undefined && n < opts.min) return undefined
      if (opts.max !== undefined && n > opts.max) return undefined
      return n
    })
    return opts.required ? (value ?? 0) : value
  }

  date(name: string, opts: Base & { required: true }): string
  date(name: string, opts?: Base): string | null
  date(name: string, opts: Base = {}): string | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      // The shape check alone passes 2026-13-45; only a parse catches it, and
      // without it the ::date cast is an unhandled 500 on a crafted POST.
      if (!ISO_DATE.test(raw)) return undefined
      const t = Date.parse(`${raw}T00:00:00Z`)
      if (Number.isNaN(t)) return undefined
      return new Date(t).toISOString().slice(0, 10) === raw ? raw : undefined
    })
    return opts.required ? (value ?? "") : value
  }

  /** An unchecked box submits nothing at all, so absence is `false`. */
  bool(name: string): boolean {
    return formString(this.data, name) === "on"
  }

  /** A BCP-47 tag Intl accepts — `en_US` (POSIX spelling) throws RangeError on every figure formatted for that office (L24). */
  locale(name: string, opts: Base & { required: true }): string
  locale(name: string, opts?: Base): string | null
  locale(name: string, opts: Base = {}): string | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      if ([...raw].length > 10) return undefined // firm_locations.locale
      try {
        new Intl.NumberFormat(raw)
        new Intl.DateTimeFormat(raw)
        return raw
      } catch {
        return undefined
      }
    })
    return opts.required ? (value ?? "") : value
  }

  /** An unreal zone silently shifts which calendar day a pay date falls on. */
  timezone(name: string, opts: Base & { required: true }): string
  timezone(name: string, opts?: Base): string | null
  timezone(name: string, opts: Base = {}): string | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: raw })
        return raw
      } catch {
        return undefined
      }
    })
    return opts.required ? (value ?? "") : value
  }

  currency(name: string, opts: Base & { required: true }): string
  currency(name: string, opts?: Base): string | null
  currency(name: string, opts: Base = {}): string | null {
    const value = this.read(name, opts.required ?? false, (raw) => {
      const code = raw.toUpperCase()
      if (!/^[A-Z]{3}$/.test(code)) return undefined
      try {
        new Intl.NumberFormat("en", { style: "currency", currency: code })
        return code
      } catch {
        return undefined
      }
    })
    return opts.required ? (value ?? "") : value
  }

  /** Per-locale translations, kept only for locales the tenant supports. */
  i18n(
    prefix: string,
    locales: string[],
    max: number,
  ): Record<string, string> | null {
    const out: Record<string, string> = {}
    for (const l of locales) {
      const v = this.raw(`${prefix}.${l}`)
      if (v === "") continue
      if ([...v].length > max) {
        this.failures.add(`${prefix}.${l}`)
        continue
      }
      out[l] = v
    }
    return Object.keys(out).length ? out : null
  }
}
