<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { money, calendarDate, localeForCurrency } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const currency = $derived(data.openInvoices[0]?.currency ?? "USD")
  const locale = $derived(
    localeForCurrency(data.locations, currency, tenantLocale),
  )

  const today = new Date().toISOString().slice(0, 10)
</script>

<PageHead title="Receive Payment" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Receive Payment"
    items={[
      { label: "Finance & Accounting", path: "/accounting/receive-payment" },
      { label: "Receive Payment", active: true },
    ]}
  />

  {#if form?.paid}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {form.paid} recorded and allocated across {form.statuses.length}
        invoice{form.statuses.length === 1 ? "" : "s"}.
      </span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Customer</legend>
      <select name="customer_id" class="select">
        <option value="">Choose a customer…</option>
        {#each data.customers as c (c.id)}
          <option value={c.id} selected={data.filters.customerId === c.id}>
            {c.customer_name} ({c.currency})
          </option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Show open invoices</button>
  </form>

  {#if data.filters.customerId}
    {#if data.openInvoices.length === 0}
      <EmptyState
        icon="lucide--banknote"
        message="This customer has no open invoices."
      />
    {:else if data.mayWrite}
      <form
        method="POST"
        action="?/allocate"
        use:enhance={keepValues}
        class="mt-4 space-y-4"
      >
        <input
          type="hidden"
          name="customer_id"
          value={data.filters.customerId}
        />

        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title text-base">Payment received</h2>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <fieldset class="fieldset">
                <legend class="fieldset-legend"
                  >Total amount ({currency})</legend
                >
                <input
                  name="total_amount"
                  inputmode="decimal"
                  class={`input w-full ${err.input("total_amount")}`}
                  aria-invalid={err.aria("total_amount")}
                  required
                />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Received on</legend>
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
                <legend class="fieldset-legend">Into</legend>
                <select
                  name="bank_account_id"
                  class={`select w-full ${err.select("bank_account_id")}`}
                  aria-invalid={err.aria("bank_account_id")}
                >
                  <option value="">Not recorded</option>
                  {#each data.bankAccounts as b (b.id)}
                    <option value={b.id}>{b.account_name}</option>
                  {/each}
                </select>
              </fieldset>
              <fieldset class="fieldset md:col-span-2">
                <legend class="fieldset-legend">Reference</legend>
                <input
                  name="reference"
                  class={`input w-full ${err.input("reference")}`}
                  aria-invalid={err.aria("reference")}
                  maxlength="100"
                />
              </fieldset>
            </div>
          </div>
        </div>

        <div class="card bg-base-100 shadow">
          <div class="card-body">
            <h2 class="card-title text-base">Allocate across invoices</h2>
            {#if err.has("allocations")}
              <p class="text-error text-sm">
                Enter an amount against at least one invoice, matching the total
                above.
              </p>
            {/if}
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Due</th>
                    <th class="text-right">Outstanding</th>
                    <th class="w-40 text-right">Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.openInvoices as inv (inv.id)}
                    <tr>
                      <td class="font-mono text-xs">{inv.invoice_number}</td>
                      <td
                        >{inv.due_date
                          ? calendarDate(inv.due_date, locale)
                          : "—"}</td
                      >
                      <td class="text-right text-sm tabular-nums">
                        {money(inv.amount_due, inv.currency, locale)}
                      </td>
                      <td>
                        <input
                          name={`alloc_${inv.id}`}
                          inputmode="decimal"
                          class={`input input-sm w-full text-right ${err.input(`alloc_${inv.id}`)}`}
                          aria-invalid={err.aria(`alloc_${inv.id}`)}
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <p class="text-base-content/70 text-xs">
              The amounts allocated must add up to the total received above —
              checked on the server, not summed here.
            </p>
          </div>
        </div>

        <div class="flex gap-3">
          <button type="submit" class="btn btn-primary">Record payment</button>
          <a href="/accounting/receive-payment" class="btn btn-ghost">Cancel</a>
        </div>
      </form>
    {/if}
  {/if}
</div>
