<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (c: string | null) =>
    c ? localeForCurrency(data.locations, c, tenantLocale) : tenantLocale

  // No write path changes this off its 'active' default; anything else is unrecognised, not a known bad state.
  const grantStatusTone = (s: string | null): Tone =>
    s === "active" ? "positive" : "neutral"

  /** The open record — no end date — is what the person is paid today. */
  const current = $derived(data.history.find((h) => h.effective_to === null))
  const past = $derived(data.history.filter((h) => h.effective_to !== null))

  let recording = $state(false)
</script>

<svelte:head>
  <title>{data.person.first_name} {data.person.last_name} · Compensation</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title={`${data.person.first_name} ${data.person.last_name}`}
    items={[
      { label: "Compensation", path: "/compensation" },
      { label: "Package", active: true },
    ]}
  />

  {#if form?.recorded}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Pay change recorded.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.history.length === 0}
    <!-- Empty because the row policy refused it, not a broken page (L21). -->
    <EmptyState
      icon="lucide--lock"
      message="You cannot see this person's compensation."
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p class="text-base-content/70 text-xs">Current base pay</p>
            {#if current}
              {@const locale = localeFor(current.currency)}
              <p class="text-3xl font-medium tabular-nums">
                {money(current.amount, current.currency, locale)}
              </p>
              <p class="text-base-content/70 text-sm capitalize">
                {current.compensation_type} ·
                {current.pay_frequency?.replace(/_/g, " ")} · since
                {calendarDate(current.effective_from, locale)}
                {#if current.overtime_eligible}· overtime eligible{/if}
              </p>
            {:else}
              <p class="text-base-content/70">No open pay record.</p>
            {/if}
          </div>
          {#if data.mayRecordChange}
            <button class="btn btn-primary" onclick={() => (recording = true)}>
              Record a change
            </button>
          {/if}
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <!-- Allowances -->
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2 p-4">
          <h2 class="text-base font-medium">Allowances</h2>
          {#if data.allowances.length === 0}
            <p class="text-base-content/70 text-sm">None in effect.</p>
          {:else}
            <ul class="list">
              {#each data.allowances as a (a.id)}
                <li class="list-row px-0">
                  <div class="list-col-grow">
                    <p class="text-sm font-medium">{a.allowance_name}</p>
                    <p class="text-base-content/70 text-xs">
                      {a.frequency?.replace(/_/g, " ") ?? ""}
                      {#if a.is_taxable}· taxable{/if}
                      {#if a.requires_receipts}· receipts required{/if}
                    </p>
                  </div>
                  <p class="font-medium tabular-nums">
                    {money(a.amount, a.currency, localeFor(a.currency))}
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <!-- Variable pay -->
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2 p-4">
          <h2 class="text-base font-medium">Variable pay</h2>
          {#if data.variable.length === 0}
            <p class="text-base-content/70 text-sm">None in effect.</p>
          {:else}
            <ul class="list">
              {#each data.variable as v (v.id)}
                <li class="list-row px-0">
                  <div class="list-col-grow">
                    <p class="text-sm font-medium">{v.component_name}</p>
                    <p class="text-base-content/70 text-xs">
                      {v.component_type?.replace(/_/g, " ")} ·
                      {v.payment_frequency?.replace(/_/g, " ") ?? ""}
                      {#if v.next_payment_date}
                        · next {calendarDate(v.next_payment_date, tenantLocale)}
                      {/if}
                    </p>
                  </div>
                  <p class="font-medium tabular-nums">
                    {money(v.target_amount, v.currency, localeFor(v.currency))}
                  </p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>

    <!-- Equity -->
    {#if data.equity.length > 0}
      <div class="card bg-base-100 mt-4 shadow">
        <div class="card-body gap-2 p-4">
          <h2 class="text-base font-medium">Equity</h2>
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Grant</th>
                  <th>Granted</th>
                  <th class="text-right">Shares</th>
                  <th class="text-right">Vested</th>
                  <th class="text-right">Strike</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {#each data.equity as g (g.id)}
                  <tr>
                    <td class="uppercase">{g.grant_type}</td>
                    <td class="tabular-nums">
                      {calendarDate(g.grant_date, tenantLocale)}
                    </td>
                    <td class="text-right tabular-nums">
                      {number(String(g.shares_granted), tenantLocale)}
                    </td>
                    <td class="text-right tabular-nums">
                      {number(String(g.shares_vested), tenantLocale)}
                      <span class="text-base-content/70 text-xs">
                        ({Math.round(
                          (g.shares_vested / g.shares_granted) * 100,
                        )}%)
                      </span>
                    </td>
                    <td class="text-right tabular-nums">
                      {g.exercise_price
                        ? money(
                            g.exercise_price,
                            g.currency ?? "USD",
                            tenantLocale,
                          )
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge tone={grantStatusTone(g.status)}
                        >{g.status}</StatusBadge
                      >
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}

    <!-- History -->
    {#if past.length > 0}
      <h2 class="mt-6 text-base font-medium">Pay history</h2>
      <div class="card bg-base-100 mt-2 shadow">
        <ul class="list">
          {#each past as h (h.id)}
            {@const locale = localeFor(h.currency)}
            <li class="list-row">
              <div class="list-col-grow">
                <p class="text-sm">
                  {calendarDate(h.effective_from, locale)} –
                  {h.effective_to ? calendarDate(h.effective_to, locale) : "—"}
                </p>
                <p class="text-base-content/70 text-xs">
                  {h.change_reason?.replace(/_/g, " ") ?? "no reason recorded"}
                </p>
              </div>
              <p class="tabular-nums">{money(h.amount, h.currency, locale)}</p>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>

{#if recording}
  <div class="modal modal-open" role="dialog" aria-label="Record a pay change">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Record a pay change for {data.person.first_name}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        This closes the current record and opens a new one. It is written to the
        audit log and cannot be deleted.
      </p>
      <form
        method="POST"
        action="?/raise"
        class="mt-4 grid gap-3"
        use:enhance={closeOnSuccess(() => (recording = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Effective from</legend>
          <input
            type="date"
            name="effective_from"
            aria-invalid={err.aria("effective_from")}
            class={`input w-full ${err.input("effective_from")}`}
            required
          />
        </fieldset>
        <div class="grid gap-3 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Amount</legend>
            <!-- inputmode, never type="number" — that round-trips through a float. -->
            <input
              name="amount"
              aria-invalid={err.aria("amount")}
              class={`input w-full ${err.input("amount")}`}
              inputmode="decimal"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              aria-invalid={err.aria("currency")}
              class={`input w-full ${err.input("currency")}`}
              maxlength="3"
              value={current?.currency ?? "USD"}
              required
            />
          </fieldset>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Basis</legend>
            <select
              name="compensation_type"
              aria-invalid={err.aria("compensation_type")}
              class={`select w-full ${err.select("compensation_type")}`}
              required
            >
              <option value="salary">Salary</option>
              <option value="hourly">Hourly</option>
              <option value="commission">Commission</option>
              <option value="retainer">Retainer</option>
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Frequency</legend>
            <select
              name="pay_frequency"
              aria-invalid={err.aria("pay_frequency")}
              class={`select w-full ${err.select("pay_frequency")}`}
              required
            >
              <option value="monthly">Monthly</option>
              <option value="semi_monthly">Semi-monthly</option>
              <option value="biweekly">Biweekly</option>
              <option value="weekly">Weekly</option>
              <option value="annual">Annual</option>
            </select>
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <input
            name="change_reason"
            aria-invalid={err.aria("change_reason")}
            class={`input w-full ${err.input("change_reason")}`}
            maxlength="500"
            placeholder="annual_review, promotion, market_adjustment"
          />
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (recording = false)}
          >
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">Record change</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (recording = false)}
    ></button>
  </div>
{/if}
