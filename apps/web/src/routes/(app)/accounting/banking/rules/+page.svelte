<script lang="ts">
  import { enhance } from "$app/forms"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  /** A rule's own matching conditions, in one line — not currency-formatted:
   *  a rule with no bank_account_id can span accounts in different
   *  currencies, so there is no one market to format the amount for. */
  function conditions(r: (typeof data.rules)[number]): string {
    const parts: string[] = []
    if (r.description_contains)
      parts.push(`contains "${r.description_contains}"`)
    if (r.description_regex) parts.push(`matches /${r.description_regex}/`)
    if (r.amount_equals) {
      parts.push(
        r.amount_tolerance && r.amount_tolerance !== "0.00"
          ? `= ${r.amount_equals} ± ${r.amount_tolerance}`
          : `= ${r.amount_equals}`,
      )
    }
    if (r.amount_min) parts.push(`≥ ${r.amount_min}`)
    if (r.amount_max) parts.push(`≤ ${r.amount_max}`)
    if (r.transaction_type) parts.push(r.transaction_type)
    return parts.join(", ")
  }
</script>

<PageHead title="Bank reconciliation rules" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Bank reconciliation rules"
    items={[
      { label: "Finance & Accounting", path: "/accounting/banking" },
      { label: "Banking", path: "/accounting/banking" },
      { label: "Rules", active: true },
    ]}
  />

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Rule created.</span>
    </div>
  {:else if form?.toggled}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Rule updated.</span>
    </div>
  {:else if form?.applied}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        {#if form.applied.categorized === 0}
          No unmatched transactions matched an active rule.
        {:else}
          Categorized {form.applied.categorized} transaction{form.applied
            .categorized === 1
            ? ""
            : "s"}: {form.applied.byRule
            .map(
              (r: { ruleName: string; count: number }) =>
                `${r.ruleName} (${r.count})`,
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
        <h2 class="card-title text-base">Apply rules now</h2>
        <p class="text-base-content/70 text-xs">
          Runs every active rule against unmatched transactions, once. There is
          no automatic schedule — run this whenever new transactions come in.
        </p>
        <form
          method="POST"
          action="?/apply"
          use:enhance
          class="mt-2 flex flex-wrap items-end gap-3"
        >
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Account</legend>
            <select name="apply_bank_account_id" class="select">
              <option value="">All accounts</option>
              {#each data.bankAccounts as ba (ba.id)}
                <option value={ba.id}>{ba.account_name}</option>
              {/each}
            </select>
          </fieldset>
          <button type="submit" class="btn btn-primary">Apply rules</button>
        </form>
      </div>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="overflow-x-auto">
      {#if data.rules.length === 0}
        <EmptyState
          icon="lucide--wand-sparkles"
          message="No reconciliation rules yet."
        />
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Account</th>
              <th>Conditions</th>
              <th>Categorize to</th>
              <th class="text-right">Priority</th>
              <th class="text-right">Applied</th>
              <th>Status</th>
              {#if data.mayWrite}
                <th></th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each data.rules as r (r.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">{r.rule_name}</td>
                <td class="text-sm">{r.bank_account_name ?? "Any"}</td>
                <td class="text-sm">{conditions(r)}</td>
                <td class="text-sm">
                  {r.category_account_code} — {r.category_account_name}
                </td>
                <td class="text-right text-sm tabular-nums">{r.priority}</td>
                <td class="text-right text-sm tabular-nums">
                  {r.times_applied}
                </td>
                <td>
                  <span
                    class={`badge badge-sm ${r.is_active ? "badge-success" : "badge-neutral"}`}
                  >
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                {#if data.mayWrite}
                  <td>
                    <form method="POST" action="?/toggle" use:enhance>
                      <input type="hidden" name="rule_id" value={r.id} />
                      <button type="submit" class="btn btn-ghost btn-xs">
                        {r.is_active ? "Deactivate" : "Activate"}
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
        <h2 class="card-title text-base">New rule</h2>
        <form
          method="POST"
          action="?/create"
          use:enhance={keepValues}
          class="space-y-4"
        >
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Rule name</legend>
              <input
                name="rule_name"
                class={`input w-full ${err.input("rule_name")}`}
                aria-invalid={err.aria("rule_name")}
                maxlength="255"
                required
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Bank account</legend>
              <select
                name="bank_account_id"
                class={`select w-full ${err.select("bank_account_id")}`}
                aria-invalid={err.aria("bank_account_id")}
              >
                <option value="">Any account</option>
                {#each data.bankAccounts as ba (ba.id)}
                  <option value={ba.id}>{ba.account_name}</option>
                {/each}
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Direction</legend>
              <select name="transaction_type" class="select w-full">
                <option value="">Either</option>
                {#each data.transactionTypes as t (t)}
                  <option value={t} class="capitalize">{t}</option>
                {/each}
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Description contains</legend>
              <input
                name="description_contains"
                class={`input w-full ${err.input("description_contains")}`}
                aria-invalid={err.aria("description_contains")}
                maxlength="255"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend"
                >Description matches (regex)</legend
              >
              <input
                name="description_regex"
                class={`input w-full ${err.input("description_regex")}`}
                aria-invalid={err.aria("description_regex")}
                maxlength="500"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Category account</legend>
              <select
                name="category_account_id"
                class={`select w-full ${err.select("category_account_id")}`}
                aria-invalid={err.aria("category_account_id")}
                required
              >
                <option value="">Choose one</option>
                {#each data.categoryAccounts as c (c.id)}
                  <option value={c.id}
                    >{c.account_code} — {c.account_name}</option
                  >
                {/each}
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Amount equals</legend>
              <input
                name="amount_equals"
                inputmode="decimal"
                class={`input w-full ${err.input("amount_equals")}`}
                aria-invalid={err.aria("amount_equals")}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">± tolerance</legend>
              <input
                name="amount_tolerance"
                inputmode="decimal"
                class={`input w-full ${err.input("amount_tolerance")}`}
                aria-invalid={err.aria("amount_tolerance")}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Priority</legend>
              <input
                name="priority"
                inputmode="numeric"
                class={`input w-full ${err.input("priority")}`}
                aria-invalid={err.aria("priority")}
                value="0"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Amount at least</legend>
              <input
                name="amount_min"
                inputmode="decimal"
                class={`input w-full ${err.input("amount_min")}`}
                aria-invalid={err.aria("amount_min")}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Amount at most</legend>
              <input
                name="amount_max"
                inputmode="decimal"
                class={`input w-full ${err.input("amount_max")}`}
                aria-invalid={err.aria("amount_max")}
              />
            </fieldset>
          </div>
          <p class="text-base-content/70 text-xs">
            An amount condition compares against the transaction's size,
            regardless of direction — use Direction to tell a debit from a
            credit.
          </p>
          <button type="submit" class="btn btn-primary">Create rule</button>
        </form>
      </div>
    </div>
  {/if}
</div>
