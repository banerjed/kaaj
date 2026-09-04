<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { billStatusTone as statusTone } from "$lib/components/status-tone"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let paying = $state(false)

  /** What this bill may do next — mirrors the statuses the repo enforces. */
  const may = $derived({
    approve: data.mayWrite && data.bill.status === "draft",
    pay:
      data.mayWrite && ["approved", "partial"].includes(data.bill.status ?? ""),
  })

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    localeForCurrency(data.locations, data.bill.currency, tenantLocale),
  )
  const cur = $derived(data.bill.currency)
</script>

<PageHead title={data.bill.bill_number} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.bill.bill_number}
    items={[
      { label: "Finance & Accounting", path: "/accounting/bills" },
      { label: "Bills", path: "/accounting/bills" },
      { label: data.bill.bill_number, active: true },
    ]}
  />

  {#if form?.approved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        Approved. The liability posted to the ledger as {form.approved}.
      </span>
    </div>
  {:else if form?.paid}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.paid} recorded. The bill is now {form.status}.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-base-content/70 text-sm">
          {data.bill.vendor_name ?? "No vendor"} · dated {calendarDate(
            data.bill.bill_date,
            locale,
          )}
          {#if data.bill.due_date}
            · due {calendarDate(data.bill.due_date, locale)}
          {/if}
        </p>
        <div class="flex gap-1">
          {#if data.bill.is_overdue}
            <span class="badge badge-error badge-sm">overdue</span>
          {/if}
          <StatusBadge tone={statusTone(data.bill.status)}>
            {data.bill.status}
          </StatusBadge>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Description</th>
              <th>Account</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {#each data.lines as l (l.id)}
              <tr>
                <td>{l.description ?? "—"}</td>
                <td class="text-base-content/70 text-xs">
                  {l.account_name ?? "—"}
                </td>
                <td class="text-right tabular-nums">
                  {number(l.quantity ?? "0", locale)}
                </td>
                <td class="text-right tabular-nums">
                  {money(l.unit_price, cur, locale)}
                </td>
                <td class="text-right tabular-nums">
                  {money(l.tax_amount, cur, locale)}
                </td>
                <td class="text-right font-medium tabular-nums">
                  {money(l.amount, cur, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Exact figures only — checked against a bank statement. -->
      <dl
        class="border-base-200 ms-auto grid w-full max-w-sm gap-1 border-t pt-3 text-sm"
      >
        <div class="flex justify-between">
          <dt class="text-base-content/70">Subtotal</dt>
          <dd class="tabular-nums">
            {money(data.bill.subtotal, cur, locale)}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/70">Tax</dt>
          <dd class="tabular-nums">
            {money(data.bill.tax_total, cur, locale)}
          </dd>
        </div>
        <div
          class="border-base-200 flex justify-between border-t pt-1 font-medium"
        >
          <dt>Total</dt>
          <dd class="tabular-nums">{money(data.bill.total, cur, locale)}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/70">Paid</dt>
          <dd class="tabular-nums">
            −{money(data.bill.amount_paid, cur, locale)}
          </dd>
        </div>
        <div
          class="border-base-200 flex justify-between border-t pt-1 font-medium"
        >
          <dt>Outstanding</dt>
          <dd class="tabular-nums">
            {money(data.bill.amount_due, cur, locale)}
          </dd>
        </div>
      </dl>
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Payments made
    <span class="badge badge-sm ms-1">{data.payments.length}</span>
  </h2>

  {#if data.payments.length === 0}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body items-center py-8 text-center">
        <p class="text-base-content/70 text-sm">Nothing paid yet.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each data.payments as p (p.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{p.payment_number}</p>
              <p class="text-base-content/70 text-xs">
                {p.payment_date ? calendarDate(p.payment_date, locale) : "—"}
                {#if p.method}· {p.method.replace(/_/g, " ")}{/if}
              </p>
            </div>
            <p class="font-medium tabular-nums">
              {money(p.amount, p.currency ?? cur, locale)}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Each posts a balanced journal entry; POST only, never a link. -->
  {#if may.approve || may.pay}
    <div class="mt-4 flex flex-wrap items-center gap-2">
      {#if may.approve}
        <form method="POST" action="?/approve">
          <button class="btn btn-primary btn-sm">
            <span class="iconify lucide--check size-4"></span>
            Approve bill
          </button>
        </form>
        <p class="text-base-content/70 text-xs">
          Posts {money(data.bill.total, cur, locale)} to accounts payable and the
          expense behind it.
        </p>
      {/if}
      {#if may.pay}
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={() => (paying = true)}
        >
          <span class="iconify lucide--banknote size-4"></span>
          Pay vendor
        </button>
      {/if}
    </div>
  {/if}
</div>

<!-- Pay vendor --------------------------------------------------------- -->
{#if paying}
  <div class="modal modal-open" role="dialog" aria-label="Pay vendor">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Payment against {data.bill.bill_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        {money(data.bill.amount_due, cur, locale)} outstanding. More than that is
        refused — an over-allocation is not something a later reconciliation can undo.
      </p>
      <form
        method="POST"
        action="?/recordPayment"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (paying = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Amount ({cur})</legend>
          <!-- inputmode, never type="number" — that round-trips through a float. -->
          <input
            name="amount"
            aria-invalid={err.aria("amount")}
            class={`input w-full ${err.input("amount")}`}
            inputmode="decimal"
            required
            value={data.bill.amount_due ?? ""}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Paid on</legend>
          <input
            name="payment_date"
            aria-invalid={err.aria("payment_date")}
            type="date"
            class={`input w-full ${err.input("payment_date")}`}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Method</legend>
          <select
            name="payment_method"
            aria-invalid={err.aria("payment_method")}
            class={`select w-full ${err.select("payment_method")}`}
            required
          >
            {#each data.methods as m (m)}
              <option value={m} class="capitalize"
                >{m.replace(/_/g, " ")}</option
              >
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">From</legend>
          <select
            name="bank_account_id"
            aria-invalid={err.aria("bank_account_id")}
            class={`select w-full ${err.select("bank_account_id")}`}
          >
            <option value="">Not recorded</option>
            {#each data.bankAccounts as b (b.id)}
              <option value={b.id}>{b.account_name}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reference</legend>
          <input
            name="reference"
            aria-invalid={err.aria("reference")}
            class={`input w-full ${err.input("reference")}`}
            maxlength="100"
          />
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (paying = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Record payment</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (paying = false)}
    ></button>
  </div>
{/if}
