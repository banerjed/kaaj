<script lang="ts">
  import { timezoneOptions } from "$lib/firm-profile/regional"
  import { fieldErrors } from "$lib/form-errors"

  /** One form for creating and editing, so the two paths cannot drift apart field by field. */
  let {
    employee = null,
    departments,
    locations,
    jobTitles,
    managers,
    enums,
    form = null,
    submitLabel = "Save",
    cancelHref = "/employees",
  }: {
    employee: Record<string, unknown> | null
    departments: { id: string; department_code: string | null; name: string }[]
    locations: {
      id: string
      location_code: string | null
      name: string
      timezone: string
    }[]
    jobTitles: { id: string; title: string }[]
    managers: { id: string; name: string }[]
    enums: Record<string, string[]>
    form: { errorFields?: string[]; message?: string } | null
    submitLabel?: string
    cancelHref?: string
  } = $props()

  const zonesByRegion = timezoneOptions()
  const err = $derived(fieldErrors(form))

  const value = (key: string) => (employee?.[key] as string | null) ?? ""
  const label = (v: string) => v.replaceAll("_", " ")

  // Choosing an office proposes its timezone, so timestamps aren't read wrong.
  let locationCode = $state(value("location_code"))
  let timezone = $state(value("timezone"))
  const onLocationChange = (code: string) => {
    locationCode = code
    const office = locations.find((l) => l.location_code === code)
    if (office) timezone = office.timezone
  }

  let status = $state(value("employment_status") || "active")
  const isLeaver = $derived(status === "terminated" || status === "retired")
</script>

{#if form?.message}
  <div role="alert" class="alert alert-error mb-4">
    <span class="iconify lucide--circle-alert size-5"></span>
    <span>{form.message}</span>
  </div>
{/if}

<form method="POST" class="grid gap-4">
  <div class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <h2 class="card-title text-base">Identity</h2>

      <div class="grid gap-4 sm:grid-cols-3">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">First name</legend>
          <input
            name="first_name"
            aria-invalid={err.aria("first_name")}
            class={`input w-full ${err.input("first_name")}`}
            value={value("first_name")}
            autocomplete="given-name"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Middle name</legend>
          <input
            name="middle_name"
            aria-invalid={err.aria("middle_name")}
            class={`input w-full ${err.input("middle_name")}`}
            value={value("middle_name")}
            autocomplete="additional-name"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Last name</legend>
          <input
            name="last_name"
            aria-invalid={err.aria("last_name")}
            class={`input w-full ${err.input("last_name")}`}
            value={value("last_name")}
            autocomplete="family-name"
            required
          />
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Preferred name</legend>
          <input
            name="preferred_name"
            aria-invalid={err.aria("preferred_name")}
            class={`input w-full ${err.input("preferred_name")}`}
            value={value("preferred_name")}
            placeholder="What they go by"
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Employee ID</legend>
          <input
            name="employee_id"
            aria-invalid={err.aria("employee_id")}
            class={`input w-full font-mono uppercase ${err.input("employee_id")}`}
            value={value("employee_id")}
            placeholder="E013"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Date of birth</legend>
          <input
            name="birth_date"
            aria-invalid={err.aria("birth_date")}
            type="date"
            class={`input w-full ${err.input("birth_date")}`}
            value={value("birth_date")}
          />
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Email</legend>
          <input
            name="email"
            aria-invalid={err.aria("email")}
            type="email"
            inputmode="email"
            autocomplete="email"
            class={`input w-full ${err.input("email")}`}
            value={value("email")}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Phone</legend>
          <input
            name="phone"
            aria-invalid={err.aria("phone")}
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            class={`input w-full ${err.input("phone")}`}
            value={value("phone")}
          />
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        {#each [["gender", "Gender", enums.gender], ["pronouns", "Pronouns", enums.pronouns], ["marital_status", "Marital status", enums.maritalStatus]] as [name, legend, options] (name)}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">{legend}</legend>
            <select
              name={name as string}
              class="select w-full"
              value={value(name as string)}
            >
              <option value="">Not recorded</option>
              {#each options as o (o)}
                <option value={o}>{label(o)}</option>
              {/each}
            </select>
          </fieldset>
        {/each}
      </div>
    </div>
  </div>

  <div class="card bg-base-100 shadow">
    <div class="card-body gap-4">
      <h2 class="card-title text-base">Employment</h2>

      <div class="grid gap-4 sm:grid-cols-3">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Status</legend>
          <select
            name="employment_status"
            aria-invalid={err.aria("employment_status")}
            class={`select w-full ${err.select("employment_status")}`}
            bind:value={status}
          >
            {#each enums.employmentStatus as s (s)}
              <option value={s}>{label(s)}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Type</legend>
          <select
            name="employment_type"
            aria-invalid={err.aria("employment_type")}
            class={`select w-full ${err.select("employment_type")}`}
            value={value("employment_type") || "full_time"}
          >
            {#each enums.employmentType as t (t)}
              <option value={t}>{label(t)}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Pay frequency</legend>
          <select
            name="pay_frequency"
            aria-invalid={err.aria("pay_frequency")}
            class={`select w-full ${err.select("pay_frequency")}`}
            value={value("pay_frequency")}
          >
            <option value="">Not set</option>
            {#each enums.payFrequency as f (f)}
              <option value={f}>{label(f)}</option>
            {/each}
          </select>
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Start date</legend>
          <input
            name="start_date"
            aria-invalid={err.aria("start_date")}
            type="date"
            class={`input w-full ${err.input("start_date")}`}
            value={value("start_date")}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">
            Leaving date {isLeaver ? "(required)" : ""}
          </legend>
          <input
            name="end_date"
            aria-invalid={err.aria("end_date")}
            type="date"
            class={`input w-full ${err.input("end_date")}`}
            value={value("end_date")}
            required={isLeaver}
          />
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Department</legend>
          <select
            name="department_code"
            aria-invalid={err.aria("department_code")}
            class={`select w-full ${err.select("department_code")}`}
            value={value("department_code")}
          >
            <option value="">Not assigned</option>
            {#each departments as d (d.id)}
              <option value={d.department_code}>{d.name}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Manager</legend>
          <select
            name="manager_id"
            aria-invalid={err.aria("manager_id")}
            class={`select w-full ${err.select("manager_id")}`}
            value={value("manager_id")}
          >
            <option value="">None</option>
            {#each managers as m (m.id)}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Job title</legend>
          <input
            name="job_title"
            aria-invalid={err.aria("job_title")}
            class={`input w-full ${err.input("job_title")}`}
            value={value("job_title")}
            list="job-titles"
          />
          <datalist id="job-titles">
            {#each jobTitles as t (t.id)}
              <option value={t.title}></option>
            {/each}
          </datalist>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Level</legend>
          <input
            name="job_level"
            aria-invalid={err.aria("job_level")}
            class={`input w-full ${err.input("job_level")}`}
            value={value("job_level")}
            placeholder="L3"
          />
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Office</legend>
          <select
            name="location_code"
            aria-invalid={err.aria("location_code")}
            class={`select w-full ${err.select("location_code")}`}
            value={locationCode}
            onchange={(e) => onLocationChange(e.currentTarget.value)}
          >
            <option value="">Not assigned</option>
            {#each locations as l (l.id)}
              <option value={l.location_code}>{l.name}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Timezone</legend>
          <select
            name="timezone"
            aria-invalid={err.aria("timezone")}
            class={`select w-full ${err.select("timezone")}`}
            bind:value={timezone}
          >
            <option value="">Not set</option>
            {#each zonesByRegion as group (group.region)}
              <optgroup label={group.region}>
                {#each group.zones as zone (zone)}
                  <option value={zone}>{zone}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
          <p class="label">
            Proposed from the office; override if they differ.
          </p>
        </fieldset>
      </div>

      <fieldset class="fieldset">
        <legend class="fieldset-legend">Introduction</legend>
        <textarea
          name="introduction"
          aria-invalid={err.aria("introduction")}
          class={`textarea w-full ${err.textarea("introduction")}`}
          rows="3"
          value={value("introduction")}
        ></textarea>
      </fieldset>
    </div>
  </div>

  <div class="flex justify-end gap-2">
    <a class="btn btn-ghost" href={cancelHref}>Cancel</a>
    <button type="submit" class="btn btn-primary">{submitLabel}</button>
  </div>
</form>
