<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  type LineRow = {
    key: number
    description: string
    quantity: string
    unitPrice: string
    discountPercent: string
    taxAmount: string
    taxRateId: string
  }

  let nextKey = 0
  function blankLine(): LineRow {
    nextKey += 1
    return {
      key: nextKey,
      description: "",
      quantity: "1",
      unitPrice: "",
      discountPercent: "0",
      taxAmount: "0",
      taxRateId: "",
    }
  }

  let lines = $state<LineRow[]>([blankLine()])

  function addLine() {
    lines.push(blankLine())
  }

  function removeLine(key: number) {
    if (lines.length > 1) lines = lines.filter((l) => l.key !== key)
  }

  const today = new Date().toISOString().slice(0, 10)
</script>

<PageHead title="Recurring invoices" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Recurring invoices"
    items={[
      { label: "Finance & Accounting", path: "/accounting/invoices" },
      { label: "Invoices", path: "/accounting/invoices" },
      { label: "Recurring", active: true },
    ]}
  />

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Schedule created.</span>
    </div>
  {:else if form?.toggled}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Schedule updated.</span>
    </div>
  {:else if form?.generated}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {#if form.generated.length === 0}
          No schedule is due yet.
        {:else}
          Generated {form.generated.length} draft invoice{form.generated
            .length === 1
            ? ""
            : "s"}: {form.generated
            .map(
              (g: { invoiceNumber: string; customerName: string }) =>
                `${g.invoiceNumber} (${g.customerName})`,
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
        <h2 class="card-title text-base">Generate due invoices</h2>
        <p class="text-base-content/70 text-xs">
          Creates one draft invoice for every active schedule due today or
          earlier, then moves it on to its next date. There is no automatic
          schedule — run this whenever a billing period comes due. Each invoice
          is left as a draft for review, the same as a manually created one.
        </p>
        <form method="POST" action="?/generate" use:enhance class="mt-2">
          <button type="submit" class="btn btn-primary"
            >Generate due invoices</button
          >
        </form>
      </div>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      {#if data.schedules.length === 0}
        <EmptyState
          icon="lucide--repeat"
          message="No recurring schedules yet."
        />
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Frequency</th>
              <th>Next run</th>
              <th class="text-right">Due in</th>
              <th class="text-right">Lines</th>
              <th>Status</th>
              {#if data.mayWrite}
                <th></th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each data.schedules as s (s.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  {s.customer_name}
                  {#if s.notes}
                    <div class="text-base-content/70 text-xs font-normal">
                      {s.notes}
                    </div>
                  {/if}
                </td>
                <td class="text-sm capitalize">{s.frequency}</td>
                <td class="text-sm">{s.next_run_date}</td>
                <td class="text-right text-sm tabular-nums">{s.due_in_days}d</td
                >
                <td class="text-right text-sm tabular-nums">{s.line_count}</td>
                <td>
                  <span
                    class={`badge badge-sm ${s.is_active ? "badge-success" : "badge-neutral"}`}
                  >
                    {s.is_active ? "active" : "inactive"}
                  </span>
                </td>
                {#if data.mayWrite}
                  <td>
                    <form method="POST" action="?/toggle" use:enhance>
                      <input type="hidden" name="schedule_id" value={s.id} />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        {s.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                {/if}
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
        <h2 class="card-title text-base">New schedule</h2>
        <form
          method="POST"
          action="?/create"
          use:enhance={keepValues}
          class="space-y-6"
        >
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Customer</legend>
              <Combobox
                name="customer_id"
                placeholder="Search customers…"
                invalid={err.has("customer_id")}
                options={data.customers.map((c) => ({
                  id: c.id,
                  label: c.customer_name,
                  sublabel: c.currency,
                }))}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Frequency</legend>
              <select
                name="frequency"
                class={`select w-full ${err.select("frequency")}`}
                aria-invalid={err.aria("frequency")}
                required
              >
                <option value="">Choose one</option>
                {#each data.frequencies as f (f)}
                  <option value={f} class="capitalize">{f}</option>
                {/each}
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Next run date</legend>
              <input
                type="date"
                name="next_run_date"
                class={`input w-full ${err.input("next_run_date")}`}
                aria-invalid={err.aria("next_run_date")}
                value={today}
                required
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Due in (days)</legend>
              <input
                name="due_in_days"
                inputmode="numeric"
                class={`input w-full ${err.input("due_in_days")}`}
                aria-invalid={err.aria("due_in_days")}
                value="30"
                required
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Exchange rate</legend>
              <input
                name="exchange_rate"
                inputmode="decimal"
                class={`input w-full ${err.input("exchange_rate")}`}
                aria-invalid={err.aria("exchange_rate")}
                value="1.000000"
                required
              />
              <p class="text-base-content/70 mt-1 text-xs">
                Fixed at creation — not refreshed automatically before each run,
                same as the manual create-invoice form.
              </p>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Payment terms</legend>
              <input
                name="payment_terms"
                class={`input w-full ${err.input("payment_terms")}`}
                aria-invalid={err.aria("payment_terms")}
                maxlength="50"
                placeholder="Net 30"
              />
            </fieldset>
          </div>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Notes</legend>
            <textarea
              name="notes"
              class={`textarea w-full ${err.input("notes")}`}
              aria-invalid={err.aria("notes")}
              maxlength="2000"
              rows="2"
            ></textarea>
          </fieldset>

          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Discount %</th>
                  <th>Tax amount</th>
                  <th>Tax rate</th>
                  <th></th>
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
                        name={`lines.${i}.discount_percent`}
                        inputmode="decimal"
                        class={`input input-sm w-full ${err.input(`lines.${i}.discount_percent`)}`}
                        aria-invalid={err.aria(`lines.${i}.discount_percent`)}
                        bind:value={line.discountPercent}
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
                      <select
                        name={`lines.${i}.tax_rate_id`}
                        class="select select-sm w-full"
                        bind:value={line.taxRateId}
                      >
                        <option value="">None / unattributed</option>
                        {#each data.taxRates as rate (rate.id)}
                          <option value={rate.id}
                            >{rate.code} ({rate.rate_percent}%)</option
                          >
                        {/each}
                      </select>
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
            <input type="hidden" name="line_count" value={lines.length} />
            <button
              type="button"
              class="btn btn-ghost btn-sm mt-2"
              onclick={addLine}
            >
              <span class="iconify lucide--plus size-4"></span>
              Add line
            </button>
          </div>

          <button type="submit" class="btn btn-primary">Create schedule</button>
        </form>
      </div>
    </div>
  {/if}
</div>
