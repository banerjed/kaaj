<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { closeOnSuccess } from "$lib/form-enhance"
  import { calendarDate, instant } from "$lib/format"
  import type { Tone } from "$lib/components/status-tone"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")
  const tenantCurrency = $derived(data.tenant?.default_currency ?? "USD")
  const fmtCtx = $derived({
    locale: tenantLocale,
    currency: tenantCurrency,
    timezone: tenantZone,
    timeFormat: data.tenant?.time_format,
  })

  const statusTone = (s: string): Tone =>
    s === "open" ? "positive" : s === "closed" ? "caution" : "critical"

  /** The period currently showing its reopen-reason modal, or none. */
  let reopeningId = $state<string | null>(null)
</script>

<PageHead title="Accounting Periods" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Accounting Periods"
    items={[
      { label: "Finance & Accounting", path: "/accounting/periods" },
      { label: "Accounting Periods", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}
  {#if form?.closed}
    <div class="alert alert-success mt-4" role="alert">Period closed.</div>
  {/if}
  {#if form?.reopened}
    <div class="alert alert-success mt-4" role="alert">Period reopened.</div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Type</th>
            <th>Dates</th>
            <th>Status</th>
            <th>Closed</th>
            {#if data.mayWrite}
              <th></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each data.periods as p (p.id)}
            <tr class="hover:bg-base-200/40">
              <td>{p.period_name}</td>
              <td class="capitalize">{p.period_type}</td>
              <td class="text-sm">
                {calendarDate(p.start_date, tenantLocale)} – {calendarDate(
                  p.end_date,
                  tenantLocale,
                )}
              </td>
              <td>
                <StatusBadge tone={statusTone(p.status)}>{p.status}</StatusBadge
                >
              </td>
              <td class="text-base-content/70 text-xs">
                {#if p.closed_at}
                  {instant(p.closed_at, fmtCtx)}
                  {#if p.closed_by_name}
                    by {p.closed_by_name}
                  {/if}
                {/if}
              </td>
              {#if data.mayWrite}
                <td class="text-right">
                  {#if p.status === "open"}
                    <form method="POST" action="?/close" use:enhance>
                      <input type="hidden" name="period_id" value={p.id} />
                      <button type="submit" class="btn btn-ghost btn-sm">
                        Close
                      </button>
                    </form>
                  {:else if p.status === "closed"}
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      onclick={() => (reopeningId = p.id)}
                    >
                      Reopen
                    </button>
                  {:else}
                    <span
                      class="text-base-content/50 text-xs"
                      title="A locked period requires a separate process, not built here, to reopen."
                    >
                      Locked
                    </span>
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Reopen ------------------------------------------------------------------ -->
{#if reopeningId}
  {@const period = data.periods.find((p) => p.id === reopeningId)}
  <div class="modal modal-open" role="dialog" aria-label="Reopen period">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Reopen {period?.period_name}</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        A closed period accepts no new postings — reopening it is a deliberate
        act with its own record, not a routine one.
      </p>
      <form
        method="POST"
        action="?/reopen"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (reopeningId = null))}
      >
        <input type="hidden" name="period_id" value={reopeningId} />
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <textarea
            name="reason"
            aria-invalid={err.aria("reason")}
            class={`textarea w-full ${err.textarea("reason")}`}
            rows="2"
            maxlength="500"
            required
            placeholder="Recorded in the audit trail"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (reopeningId = null)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Reopen</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (reopeningId = null)}
    ></button>
  </div>
{/if}
