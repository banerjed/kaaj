<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  function kindLabel(kind: string): string {
    return kind === "deferred_revenue" ? "Deferred revenue" : "Prepaid expense"
  }
</script>

<PageHead title="Accruals & Deferrals" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Accruals & Deferrals"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ledger" },
      { label: "General Ledger", path: "/accounting/ledger" },
      { label: "Accruals & Deferrals", active: true },
    ]}
  />

  {#if form?.accrual}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        Posted {form.accrual.accrualEntryNumber}, reversing as
        {form.accrual.reversalEntryNumber} on {form.accrual.reversalDate}.
      </span>
    </div>
  {:else if form?.scheduleCreated}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Schedule created.</span>
    </div>
  {:else if form?.posted}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {#if form.posted.length === 0}
          No schedule is due yet.
        {:else}
          Posted {form.posted.length} recognition entr{form.posted.length === 1
            ? "y"
            : "ies"}: {form.posted
            .map(
              (p: { entryNumber: string; description: string }) =>
                `${p.entryNumber} (${p.description})`,
            )
            .join(", ")}.
        {/if}
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.mayWrite}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">Record an accrual</h2>
        <p class="text-base-content/70 text-xs">
          Posts an accrued expense against the picked period, and its reversal
          into the very next period, immediately — both journal entries exist as
          soon as you submit. There is nothing left to run later.
        </p>
        <form
          method="POST"
          action="?/recordAccrual"
          use:enhance={keepValues}
          class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Period</legend>
            <select
              name="period_id"
              class={`select w-full ${err.select("period_id")}`}
              aria-invalid={err.aria("period_id")}
              required
            >
              <option value="">Choose one</option>
              {#each data.periods as p (p.id)}
                <option value={p.id}>{p.period_name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Expense account</legend>
            <select
              name="expense_account_id"
              class={`select w-full ${err.select("expense_account_id")}`}
              aria-invalid={err.aria("expense_account_id")}
              required
            >
              <option value="">Choose one</option>
              {#each data.accounts as a (a.id)}
                <option value={a.id}>{a.account_code} — {a.account_name}</option
                >
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Amount</legend>
            <input
              name="amount"
              inputmode="decimal"
              class={`input w-full ${err.input("amount")}`}
              aria-invalid={err.aria("amount")}
              required
            />
          </fieldset>
          <fieldset class="fieldset lg:col-span-2">
            <legend class="fieldset-legend">Description</legend>
            <input
              name="description"
              class={`input w-full ${err.input("description")}`}
              aria-invalid={err.aria("description")}
              maxlength="500"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Reference</legend>
            <input
              name="reference"
              class={`input w-full ${err.input("reference")}`}
              aria-invalid={err.aria("reference")}
              maxlength="100"
            />
          </fieldset>
          <div class="lg:col-span-3">
            <button type="submit" class="btn btn-primary">Record accrual</button
            >
          </div>
        </form>
      </div>
    </div>

    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">Post due amortizations</h2>
        <p class="text-base-content/70 text-xs">
          Posts one recognition entry for every deferred-revenue/prepaid
          schedule due today or earlier, then moves it on to its next date.
          There is no automatic schedule — run this whenever a period closes.
        </p>
        <form method="POST" action="?/postDue" use:enhance class="mt-2">
          <button type="submit" class="btn btn-primary"
            >Post due amortizations</button
          >
        </form>
      </div>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      {#if data.schedules.length === 0}
        <EmptyState
          icon="lucide--calendar-clock"
          message="No amortization schedules yet."
        />
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Kind</th>
              <th>Balance sheet account</th>
              <th>Income statement account</th>
              <th class="text-right">Total</th>
              <th class="text-right">Periods</th>
              <th>Next run</th>
            </tr>
          </thead>
          <tbody>
            {#each data.schedules as s (s.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{s.description}</td>
                <td class="text-sm">{kindLabel(s.kind)}</td>
                <td class="text-sm">{s.balance_sheet_account_name}</td>
                <td class="text-sm">{s.income_statement_account_name}</td>
                <td class="text-right text-sm tabular-nums">{s.total_amount}</td
                >
                <td class="text-right text-sm tabular-nums">
                  {s.periods_posted} / {s.periods_total}
                </td>
                <td class="text-sm">{s.next_run_date}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  {#if data.mayWrite}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">New amortization schedule</h2>
        <form
          method="POST"
          action="?/createSchedule"
          use:enhance={keepValues}
          class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Kind</legend>
            <select
              name="kind"
              class={`select w-full ${err.select("kind")}`}
              aria-invalid={err.aria("kind")}
              required
            >
              <option value="">Choose one</option>
              {#each data.kinds as k (k)}
                <option value={k}>{kindLabel(k)}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Balance sheet account</legend>
            <select
              name="balance_sheet_account_id"
              class={`select w-full ${err.select("balance_sheet_account_id")}`}
              aria-invalid={err.aria("balance_sheet_account_id")}
              required
            >
              <option value="">Choose one</option>
              {#each data.accounts as a (a.id)}
                <option value={a.id}>{a.account_code} — {a.account_name}</option
                >
              {/each}
            </select>
            <p class="text-base-content/70 mt-1 text-xs">
              The liability (deferred revenue) or asset (prepaid) account
              draining down.
            </p>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Income statement account</legend>
            <select
              name="income_statement_account_id"
              class={`select w-full ${err.select("income_statement_account_id")}`}
              aria-invalid={err.aria("income_statement_account_id")}
              required
            >
              <option value="">Choose one</option>
              {#each data.accounts as a (a.id)}
                <option value={a.id}>{a.account_code} — {a.account_name}</option
                >
              {/each}
            </select>
            <p class="text-base-content/70 mt-1 text-xs">
              The revenue or expense account recognized into over time.
            </p>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Total amount</legend>
            <input
              name="total_amount"
              inputmode="decimal"
              class={`input w-full ${err.input("total_amount")}`}
              aria-invalid={err.aria("total_amount")}
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Periods</legend>
            <input
              name="periods_total"
              inputmode="numeric"
              class={`input w-full ${err.input("periods_total")}`}
              aria-invalid={err.aria("periods_total")}
              value="12"
              required
            />
            <p class="text-base-content/70 mt-1 text-xs">
              Always monthly — one recognition entry per period.
            </p>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">First run date</legend>
            <input
              type="date"
              name="next_run_date"
              class={`input w-full ${err.input("next_run_date")}`}
              aria-invalid={err.aria("next_run_date")}
              required
            />
          </fieldset>
          <fieldset class="fieldset lg:col-span-2">
            <legend class="fieldset-legend">Description</legend>
            <input
              name="description"
              class={`input w-full ${err.input("description")}`}
              aria-invalid={err.aria("description")}
              maxlength="500"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Reference</legend>
            <input
              name="reference"
              class={`input w-full ${err.input("reference")}`}
              aria-invalid={err.aria("reference")}
              maxlength="100"
            />
          </fieldset>
          <div class="lg:col-span-3">
            <button type="submit" class="btn btn-primary"
              >Create schedule</button
            >
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>
