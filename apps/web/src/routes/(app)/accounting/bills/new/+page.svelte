<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  type LineRow = {
    key: number
    description: string
    quantity: string
    unitPrice: string
    taxAmount: string
  }

  let nextKey = 0
  function blankLine(): LineRow {
    nextKey += 1
    return {
      key: nextKey,
      description: "",
      quantity: "1",
      unitPrice: "",
      taxAmount: "0",
    }
  }

  let lines = $state<LineRow[]>([blankLine()])

  function addLine() {
    lines.push(blankLine())
  }

  function removeLine(key: number) {
    // Always at least one row — an empty bill is refused server-side
    // anyway, but there is no reason to let the UI reach that state.
    if (lines.length > 1) lines = lines.filter((l) => l.key !== key)
  }

  const today = new Date().toISOString().slice(0, 10)

  const accountOptions = $derived(
    data.accounts.map((a) => ({
      id: a.id,
      label: a.account_name,
      sublabel: a.account_code,
    })),
  )
</script>

<PageHead title="New bill" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="New bill"
    items={[
      { label: "Finance & Accounting", path: "/accounting/bills" },
      { label: "Bills", path: "/accounting/bills" },
      { label: "New", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}

  <form
    method="POST"
    action="?/create"
    use:enhance={keepValues}
    class="mt-4 space-y-6"
  >
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">Bill details</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Vendor</legend>
            <Combobox
              name="vendor_id"
              placeholder="Search vendors…"
              invalid={err.has("vendor_id")}
              options={data.vendors.map((v) => ({
                id: v.id,
                label: v.vendor_name,
                sublabel: v.currency,
              }))}
            />
            <p class="text-base-content/70 mt-1 text-xs">
              The bill is entered in this vendor's own currency.
            </p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Bill number</legend>
            <input
              name="bill_number"
              class={`input ${err.input("bill_number")}`}
              aria-invalid={err.aria("bill_number")}
              placeholder="Whatever the vendor printed on it"
              maxlength="50"
              required
            />
            <p class="text-base-content/70 mt-1 text-xs">
              Not generated — this is the vendor's own number, unique per
              vendor.
            </p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Reference</legend>
            <input
              name="reference"
              class={`input ${err.input("reference")}`}
              aria-invalid={err.aria("reference")}
              maxlength="100"
            />
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Bill date</legend>
            <input
              type="date"
              name="bill_date"
              class={`input ${err.input("bill_date")}`}
              aria-invalid={err.aria("bill_date")}
              value={today}
              required
            />
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Due date</legend>
            <input
              type="date"
              name="due_date"
              class={`input ${err.input("due_date")}`}
              aria-invalid={err.aria("due_date")}
              value={today}
              required
            />
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend"
              >Exchange rate (to base currency)</legend
            >
            <input
              name="exchange_rate"
              inputmode="decimal"
              class={`input ${err.input("exchange_rate")}`}
              aria-invalid={err.aria("exchange_rate")}
              value="1.000000"
              required
            />
            <p class="text-base-content/70 mt-1 text-xs">
              Leave at 1.000000 when the vendor's currency is already your base
              currency.
            </p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Payment terms</legend>
            <input
              name="payment_terms"
              class={`input ${err.input("payment_terms")}`}
              aria-invalid={err.aria("payment_terms")}
              placeholder="Net 30"
              maxlength="50"
            />
          </fieldset>
        </div>

        <fieldset class="fieldset mt-2">
          <legend class="fieldset-legend">Notes</legend>
          <textarea
            name="notes"
            class={`textarea w-full ${err.textarea("notes")}`}
            aria-invalid={err.aria("notes")}
            maxlength="2000"
            rows="2"
          ></textarea>
        </fieldset>
      </div>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between">
          <h2 class="card-title text-base">Lines</h2>
          <button type="button" class="btn btn-sm" onclick={addLine}>
            <span class="iconify lucide--plus size-4"></span>
            Add line
          </button>
        </div>

        <!-- No local hint text here: `err.has("lines")` fires both for "no
             rows submitted" and for a stale expense-account id caught by
             fk_bill_lines_expense_account_id, and those need different
             sentences — the top-of-page alert already carries whichever one
             actually applies. -->

        <input type="hidden" name="line_count" value={lines.length} />

        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="w-24">Qty</th>
                <th class="w-32">Unit price</th>
                <th class="w-32">Tax amount</th>
                <th class="w-56">Expense account</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {#each lines as line, i (line.key)}
                <tr>
                  <td>
                    <input
                      name={`lines.${i}.description`}
                      class={`input input-sm w-full ${err.input(`lines.${i}.description`)}`}
                      aria-invalid={err.aria(`lines.${i}.description`)}
                      bind:value={line.description}
                      required
                    />
                  </td>
                  <td>
                    <input
                      name={`lines.${i}.quantity`}
                      inputmode="decimal"
                      class={`input input-sm w-full ${err.input(`lines.${i}.quantity`)}`}
                      aria-invalid={err.aria(`lines.${i}.quantity`)}
                      bind:value={line.quantity}
                      required
                    />
                  </td>
                  <td>
                    <input
                      name={`lines.${i}.unit_price`}
                      inputmode="decimal"
                      class={`input input-sm w-full ${err.input(`lines.${i}.unit_price`)}`}
                      aria-invalid={err.aria(`lines.${i}.unit_price`)}
                      bind:value={line.unitPrice}
                      required
                    />
                  </td>
                  <td>
                    <input
                      name={`lines.${i}.tax_amount`}
                      inputmode="decimal"
                      class={`input input-sm w-full ${err.input(`lines.${i}.tax_amount`)}`}
                      aria-invalid={err.aria(`lines.${i}.tax_amount`)}
                      bind:value={line.taxAmount}
                    />
                  </td>
                  <td>
                    <Combobox
                      name={`lines.${i}.expense_account_id`}
                      placeholder="Search accounts…"
                      invalid={err.has(`lines.${i}.expense_account_id`)}
                      options={accountOptions}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      aria-label="Remove line"
                      disabled={lines.length <= 1}
                      onclick={() => removeLine(line.key)}
                    >
                      <span class="iconify lucide--trash-2 size-4"></span>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="text-base-content/70 text-xs">
          Amounts and quantities are exact figures, computed on the server —
          this form does not total them for you. Each line posts to its own
          expense account when the bill is approved.
        </p>
      </div>
    </div>

    <div class="flex gap-3">
      <button type="submit" class="btn btn-primary">Create draft</button>
      <a href="/accounting/bills" class="btn btn-ghost">Cancel</a>
    </div>
  </form>
</div>
