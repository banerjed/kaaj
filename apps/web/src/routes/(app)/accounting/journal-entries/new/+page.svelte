<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"
  import { compareDecimal } from "$lib/decimal"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  type LineRow = {
    key: number
    accountId: string
    description: string
    debit: string
    credit: string
  }

  let nextKey = 0
  function blankLine(): LineRow {
    nextKey += 1
    return {
      key: nextKey,
      accountId: "",
      description: "",
      debit: "",
      credit: "",
    }
  }

  let lines = $state<LineRow[]>([blankLine(), blankLine()])

  function addLine() {
    lines.push(blankLine())
  }

  function removeLine(key: number) {
    // Always at least two rows — a balanced entry needs two sides, and an
    // under-count is refused server-side anyway.
    if (lines.length > 2) lines = lines.filter((l) => l.key !== key)
  }

  const today = new Date().toISOString().slice(0, 10)

  const accountOptions = $derived(
    data.accounts.map((a) => ({
      id: a.id,
      label: a.account_name,
      sublabel: a.account_code,
    })),
  )

  const totalDebit = $derived(
    lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0),
  )
  const totalCredit = $derived(
    lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0),
  )
  /** A hint only — the server compares the real NUMERIC values, not this float. */
  const looksBalanced = $derived(
    lines.length > 0 &&
      compareDecimal(String(totalDebit), String(totalCredit)) === 0,
  )
</script>

<PageHead title="New journal entry" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="New journal entry"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ledger" },
      { label: "General Ledger", path: "/accounting/ledger" },
      { label: "New entry", active: true },
    ]}
  />

  {#if form?.message}
    <div class="alert alert-error mt-4" role="alert">{form.message}</div>
  {/if}

  <div role="alert" class="alert mt-4">
    <span class="iconify lucide--info size-5"></span>
    <span>
      A posted entry cannot be edited or deleted — correcting a mistake means
      posting a second, reversing entry, not changing this one.
    </span>
  </div>

  <form
    method="POST"
    action="?/create"
    use:enhance={keepValues}
    class="mt-4 space-y-6"
  >
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <h2 class="card-title text-base">Entry details</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Date</legend>
            <input
              type="date"
              name="entry_date"
              class={`input ${err.input("entry_date")}`}
              aria-invalid={err.aria("entry_date")}
              value={today}
              required
            />
          </fieldset>

          <fieldset class="fieldset md:col-span-2">
            <legend class="fieldset-legend">Description</legend>
            <input
              name="description"
              class={`input w-full ${err.input("description")}`}
              aria-invalid={err.aria("description")}
              placeholder="What this entry corrects or adjusts"
              maxlength="500"
              required
            />
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
            <legend class="fieldset-legend">Currency</legend>
            <input
              name="currency"
              class={`input uppercase ${err.input("currency")}`}
              aria-invalid={err.aria("currency")}
              value={data.tenant?.default_currency ?? "USD"}
              maxlength="3"
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
              Leave at 1.000000 when the entry is already in your base currency.
            </p>
          </fieldset>
        </div>
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

        <!-- No local hint here beyond the totals row: `err.has("lines")`
             covers both "fewer than two rows" and a per-row debit/credit
             rule the totals row can't see (both blank, or both filled). -->

        <input type="hidden" name="line_count" value={lines.length} />

        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Description</th>
                <th class="w-32">Debit</th>
                <th class="w-32">Credit</th>
                <th class="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {#each lines as line, i (line.key)}
                <tr>
                  <td class="w-56">
                    <Combobox
                      name={`lines.${i}.account_id`}
                      placeholder="Search accounts…"
                      invalid={err.has(`lines.${i}.account_id`)}
                      options={accountOptions}
                    />
                  </td>
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
                      name={`lines.${i}.debit`}
                      inputmode="decimal"
                      class={`input input-sm w-full ${err.input(`lines.${i}.debit`)}`}
                      aria-invalid={err.aria(`lines.${i}.debit`)}
                      bind:value={line.debit}
                    />
                  </td>
                  <td>
                    <input
                      name={`lines.${i}.credit`}
                      inputmode="decimal"
                      class={`input input-sm w-full ${err.input(`lines.${i}.credit`)}`}
                      aria-invalid={err.aria(`lines.${i}.credit`)}
                      bind:value={line.credit}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      aria-label="Remove line"
                      disabled={lines.length <= 2}
                      onclick={() => removeLine(line.key)}
                    >
                      <span class="iconify lucide--trash-2 size-4"></span>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr class="font-medium">
                <td colspan="2">Total</td>
                <td class="tabular-nums">{totalDebit.toFixed(2)}</td>
                <td class="tabular-nums">{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {#if !looksBalanced}
          <p class="text-warning text-xs">
            Debits and credits don't match yet — a mismatched entry is refused
            when submitted.
          </p>
        {/if}
        <p class="text-base-content/70 text-xs">
          Each line carries a debit OR a credit, never both. Amounts are exact
          figures, checked against each other on the server before anything is
          posted.
        </p>
      </div>
    </div>

    <div class="flex gap-3">
      <button type="submit" class="btn btn-primary">Post entry</button>
      <a href="/accounting/ledger" class="btn btn-ghost">Cancel</a>
    </div>
  </form>
</div>
