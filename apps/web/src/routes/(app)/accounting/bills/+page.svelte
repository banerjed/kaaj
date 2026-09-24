<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { billStatusTone as statusTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)
  const today = new Date().toISOString().slice(0, 10)

  /** Only a bill still owing something can go in a payment batch — same
   *  statuses `payBillsInBatch` itself accepts. */
  const payable = (status: string | null) =>
    status === "approved" || status === "partial"

  // Built from `data.filters`, not `window.location` — this renders during
  // SSR too, where `window` doesn't exist.
  function pageUrl(page: number): string {
    const params = new URLSearchParams({
      status: data.filters.status,
      unapproved: data.filters.unapprovedOnly ? "1" : "",
    })
    for (const [k, v] of [...params]) if (v === "") params.delete(k)
    params.set("page", String(page))
    return `?${params.toString()}`
  }
</script>

<PageHead title="Bills" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Bills"
    items={[
      { label: "Finance & Accounting", path: "/accounting/bills" },
      { label: "Bills", active: true },
    ]}
  />

  {#if form?.paid}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        Paid {form.paid.length} vendor{form.paid.length === 1 ? "" : "s"} in
        {form.paid.reduce((n, p) => n + p.billNumbers.length, 0)} bill{form.paid.reduce(
          (n, p) => n + p.billNumbers.length,
          0,
        ) === 1
          ? ""
          : "s"}: {form.paid.map((p) => p.paymentNumber).join(", ")}.
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  {#if data.mayWrite}
    <div class="mt-4 flex justify-end">
      <a href="/accounting/bills/new" class="btn btn-primary btn-sm">
        <span class="iconify lucide--plus size-4"></span>
        New bill
      </a>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <label class="label cursor-pointer gap-2">
      <input
        type="checkbox"
        name="unapproved"
        value="1"
        class="checkbox checkbox-sm"
        checked={data.filters.unapprovedOnly}
      />
      <span class="label-text">Awaiting approval</span>
    </label>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.status || data.filters.unapprovedOnly}
      <a href="/accounting/bills" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.bills.length === 0}
    <EmptyState icon="lucide--receipt-text" message="No bills match that." />
  {:else}
    <form
      method="POST"
      action="?/payBatch"
      use:enhance={keepValues}
      class="mt-4 space-y-4"
    >
      <div class="card bg-base-100 shadow">
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                {#if data.mayWrite}
                  <th></th>
                {/if}
                <th>Bill</th>
                <th>Vendor</th>
                <th>Dated</th>
                <th>Due</th>
                <th class="text-right">Total</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Outstanding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.bills as b (b.id)}
                {@const locale = localeFor(b.currency)}
                <tr class="hover:bg-base-200/40">
                  {#if data.mayWrite}
                    <td>
                      {#if payable(b.status)}
                        <input
                          type="checkbox"
                          name={`bill_${b.id}`}
                          class="checkbox checkbox-sm"
                        />
                      {/if}
                    </td>
                  {/if}
                  <td class="font-medium">
                    <a class="link" href={`/accounting/bills/${b.id}`}>
                      {b.bill_number}
                    </a>
                    {#if b.line_subtotal !== null && Number(b.line_subtotal) !== Number(b.subtotal)}
                      <span
                        class="badge badge-error badge-sm ms-1"
                        title={`Lines sum to ${b.line_subtotal}`}
                      >
                        ≠ lines
                      </span>
                    {/if}
                    <span class="text-base-content/70 block text-xs">
                      {b.line_count} line{b.line_count === 1 ? "" : "s"}
                      {#if b.approved_by_name}· approved by {b.approved_by_name}{/if}
                    </span>
                  </td>
                  <td class="text-sm">{b.vendor_name ?? "—"}</td>
                  <td class="text-sm tabular-nums">
                    {calendarDate(b.bill_date, locale)}
                  </td>
                  <td class="text-sm tabular-nums">
                    {b.due_date ? calendarDate(b.due_date, locale) : "—"}
                    {#if b.is_overdue}
                      <span class="badge badge-error badge-sm ms-1"
                        >overdue</span
                      >
                    {/if}
                  </td>
                  <td class="text-right text-sm tabular-nums">
                    {money(b.total, b.currency, locale)}
                  </td>
                  <td class="text-right text-sm tabular-nums">
                    {money(b.amount_paid, b.currency, locale)}
                  </td>
                  <td class="text-right text-sm font-medium tabular-nums">
                    {money(b.amount_due, b.currency, locale)}
                  </td>
                  <td>
                    <StatusBadge tone={statusTone(b.status)}>
                      {b.status?.replace(/_/g, " ")}
                    </StatusBadge>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          hrefFor={pageUrl}
        />
      </div>

      {#if data.mayWrite}
        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title text-base">Pay selected bills</h2>
            <p class="text-base-content/70 text-xs">
              Each selected bill is paid in full. Selection only reaches across
              this page — batch a later page separately. Bills in different
              currencies are paid as separate payments automatically; bills for
              the same vendor are combined into one.
            </p>
            {#if err.has("bill_ids")}
              <p class="text-error text-sm">Select at least one bill above.</p>
            {/if}
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Paid on</legend>
                <input
                  type="date"
                  name="payment_date"
                  class={`input w-full ${err.input("payment_date")}`}
                  aria-invalid={err.aria("payment_date")}
                  value={today}
                  required
                />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Method</legend>
                <select
                  name="payment_method"
                  class={`select w-full ${err.select("payment_method")}`}
                  aria-invalid={err.aria("payment_method")}
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
                  class={`select w-full ${err.select("bank_account_id")}`}
                  aria-invalid={err.aria("bank_account_id")}
                >
                  <option value="">Not recorded</option>
                  {#each data.bankAccounts as ba (ba.id)}
                    <option value={ba.id}>{ba.account_name}</option>
                  {/each}
                </select>
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
            </div>
            <div class="mt-2">
              <button type="submit" class="btn btn-primary">
                Pay selected
              </button>
            </div>
          </div>
        </div>
      {/if}
    </form>
  {/if}
</div>
