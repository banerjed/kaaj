import { FormReader, checkFields, formString } from "$lib/server/forms"
import {
  sanitizeEmail,
  sanitizeName,
  sanitizePhoneNumber,
} from "@kaaj/validation"
import { allEnumerations } from "@kaaj/enums"
import type { EmployeeInput } from "./employees.repo"

/**
 * Reading and validating the employee form. Shared by create and edit so the
 * rules can't drift into disagreement. Enum values come from @kaaj/enums,
 * kept in step with Postgres by `./check`.
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

  // Caps are generous; the point is that there is one (L34). Read here, not
  // inline in the returned object, or a rejection arrives too late to report (L33).
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

  // @kaaj/validation, not a trim — handles apostrophes, hyphens, non-Latin scripts.
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

  // f.date, never a shape regex — a regex accepts 2026-02-31 (L67).
  const startDate = f.date("start_date", { required: true })
  const endDate = f.date("end_date")
  if (endDate && startDate && endDate < startDate) {
    // No CHECK across the pair — both are valid DATEs individually.
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
