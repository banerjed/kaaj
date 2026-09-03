import { FormReader, checkFields, formString } from "$lib/server/forms"
import {
  sanitizeEmail,
  sanitizeName,
  sanitizePhoneNumber,
} from "@kaaj/validation"
import { allEnumerations } from "@kaaj/enums"
import type { EmployeeInput } from "./employees.repo"

/**
 * Reading and validating the employee form.
 *
 * Shared by the create and edit actions because the rules are identical, and
 * two copies would drift — one of them would end up accepting something the
 * other rejects, which is how a record becomes unsaveable in one place and
 * unreadable in another.
 *
 * Enum values come from @kaaj/enums, which ./check verifies against the
 * Postgres types. A hand-typed list here would pass review and then fail at the
 * INSERT with `invalid input value for enum`.
 */
const enums = allEnumerations()
const valuesOf = (name: string) => enums.get(name) ?? []

/** An optional enum: blank means "not recorded", not an invalid value. */
function optionalEnum(
  raw: string,
  enumName: string,
  field: string,
  errors: string[],
): string | null {
  const value = raw.trim()
  if (value === "") return null
  if (!valuesOf(enumName).includes(value)) {
    errors.push(field)
    return null
  }
  return value
}

export type ParsedEmployeeForm =
  | { ok: true; input: EmployeeInput }
  | { ok: false; errorFields: string[]; message: string }

export function parseEmployeeForm(data: FormData): ParsedEmployeeForm {
  const errorFields: string[] = []
  const f = new FormReader(data)

  // These columns are `text`, so Postgres will not stop a pasted megabyte.
  // The caps are generous; the point is that there is one (L34).
  //
  // Every one of these is read HERE, not inline in the returned object: the
  // object is built after the gate below, so a rejection raised there would
  // arrive too late to be reported and the field would save as NULL with a
  // 303. That is L33's failure mode, and it is easy to reintroduce by writing
  // `f.text(...)` at the point of use.
  const shortText = { max: 100 } as const
  const managerId = f.uuid("manager_id")
  const middleName = f.text("middle_name", shortText)
  const preferredName = f.text("preferred_name", shortText)
  const departmentCode = f.text("department_code", shortText)
  const jobTitle = f.text("job_title", { max: 255 })
  const jobLevel = f.text("job_level", shortText)
  const locationCode = f.text("location_code", shortText)
  const timezone = f.timezone("timezone")
  const introduction = f.text("introduction", { max: 5000 })

  // Names go through @kaaj/validation rather than a trim: it handles the
  // apostrophes, hyphens and non-Latin scripts that a naive check rejects.
  const firstResult = sanitizeName(formString(data, "first_name"))
  if (!firstResult.valid) errorFields.push("first_name")
  const lastResult = sanitizeName(formString(data, "last_name"))
  if (!lastResult.valid) errorFields.push("last_name")

  const emailResult = sanitizeEmail(formString(data, "email"))
  if (!emailResult.valid) errorFields.push("email")

  let phone: string | null = null
  const rawPhone = formString(data, "phone").trim()
  if (rawPhone !== "") {
    const r = sanitizePhoneNumber(rawPhone)
    if (r.valid) phone = r.value
    else errorFields.push("phone")
  }

  const employeeId = formString(data, "employee_id").trim().toUpperCase()
  if (!/^[A-Z0-9-]{1,50}$/.test(employeeId)) errorFields.push("employee_id")

  // Through the reader, never a regex. `/^\d{4}-\d{2}-\d{2}$/` is a SHAPE
  // check, and 2026-02-31 has the right shape — postgres.js then serialises it
  // through a JS Date, which rolls it forward and stores 2026-03-03 with no
  // error and a 303. Measured, not assumed (L67). `f.date` round-trips the
  // parse, so the day has to be a day that exists.
  const startDate = f.date("start_date", { required: true })
  const endDate = f.date("end_date")
  if (endDate && startDate && endDate < startDate) {
    // Leaving before starting is not a typo the database will catch: both are
    // valid DATEs and there is no CHECK across the pair.
    errorFields.push("end_date")
  }

  const status = formString(data, "employment_status") || "active"
  if (!valuesOf("employment_status").includes(status)) {
    errorFields.push("employment_status")
  }

  const type = formString(data, "employment_type") || "full_time"
  if (!valuesOf("employment_type").includes(type)) {
    errorFields.push("employment_type")
  }

  // A leaver needs a leaving date, or the directory shows someone inactive
  // with no record of when they went.
  const gone = status === "terminated" || status === "retired"
  if (gone && !endDate) errorFields.push("end_date")

  const gender = optionalEnum(
    formString(data, "gender"),
    "gender",
    "gender",
    errorFields,
  )
  const pronouns = optionalEnum(
    formString(data, "pronouns"),
    "pronouns",
    "pronouns",
    errorFields,
  )
  const maritalStatus = optionalEnum(
    formString(data, "marital_status"),
    "marital_status",
    "marital_status",
    errorFields,
  )
  const payFrequency = optionalEnum(
    formString(data, "pay_frequency"),
    "pay_frequency",
    "pay_frequency",
    errorFields,
  )

  const birthDate = f.date("birth_date")

  errorFields.push(...f.errorFields)

  if (errorFields.length > 0) {
    const unique = [...new Set(errorFields)]
    return {
      ok: false,
      errorFields: unique,
      message:
        gone && unique.includes("end_date")
          ? "Someone who has left needs a leaving date."
          : checkFields(unique),
    }
  }

  return {
    ok: true,
    input: {
      first_name: firstResult.value,
      last_name: lastResult.value,
      middle_name: middleName,
      preferred_name: preferredName,
      email: emailResult.value,
      phone,
      employee_id: employeeId,
      gender,
      pronouns,
      marital_status: maritalStatus,
      birth_date: birthDate,
      employment_status: status,
      employment_type: type,
      start_date: startDate,
      end_date: endDate,
      department_code: departmentCode,
      job_title: jobTitle,
      job_level: jobLevel,
      location_code: locationCode,
      timezone,
      // uuid: an arbitrary string here was `invalid input syntax for type
      // uuid`, i.e. an unhandled 500 rather than a field error.
      manager_id: managerId,
      pay_frequency: payFrequency,
      introduction,
    },
  }
}

/** The option lists the form needs, straight from the enum source of truth. */
export const employeeEnums = {
  employmentStatus: valuesOf("employment_status"),
  employmentType: valuesOf("employment_type"),
  gender: valuesOf("gender"),
  pronouns: valuesOf("pronouns"),
  maritalStatus: valuesOf("marital_status"),
  payFrequency: valuesOf("pay_frequency"),
}
