<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, instant, localeForCurrency, money } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { bankTransactionStatusTone as statusTone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  /** Which transaction's match modal is open, if any. */
  let matching = $state<string | null>(null)

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")

  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)

  /** Bank vs. imported balance; null means nothing imported yet, not a zero gap. */
  const gap = (a: {
    current_balance: string | null
    feed_balance: string | null
  }) =>
    a.feed_balance === null
      ? null
      : Number(a.current_balance ?? 0) - Number(a.feed_balance)
</script>

<PageHead title="Banking" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Banking"
    items={[
      { label: "Finance & Accounting", path: "/accounting/banking" },
      { label: "Banking", active: true },
    ]}
  />

  {#if form?.matched}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Matched.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <!-- No account number shown anywhere; identifier columns are ciphertext. -->
  <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {#each data.accounts as a (a.id)}
      {@const locale = localeFor(a.currency)}
      {@const g = gap(a)}
      <div class="card bg-base-100 shadow">
        <div class="card-body gap-2 p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-medium">{a.account_name}</p>
              <p class="text-base-content/70 truncate text-xs">
                {a.bank_name ?? "—"} · {a.currency}
              </p>
            </div>
            {#if a.unmatched_count > 0}
              <span class="badge badge-warning badge-sm shrink-0">
                {a.unmatched_count} to match
              </span>
            {/if}
          </div>

          <p class="text-2xl font-medium tabular-nums">
            {money(a.current_balance, a.currency, locale)}
          </p>

          {#if a.transaction_count === 0}
            <!-- Distinct from a zero balance: nothing imported yet. -->
            <p class="text-base-content/70 text-xs">
              No transactions imported yet.
            </p>
          {:else if g !== null && g !== 0}
            <!-- State what the gap means, not just which side is bigger. -->
            <p class="text-warning text-xs">
              {money(String(Math.abs(g)), a.currency, locale)}
              {g < 0
                ? "charged by the bank and not yet imported"
                : "received since the last import"} — the feed shows
              {money(a.feed_balance, a.currency, locale)}
            </p>
          {:else}
            <p class="text-success text-xs">
              Agrees with the feed · {a.transaction_count} transactions
            </p>
          {/if}

          {#if a.last_synced_at}
            <p
              class="text-base-content/70 border-base-200 border-t pt-2 text-xs"
            >
              Synced {instant(a.last_synced_at, {
                locale: tenantLocale,
                currency: a.currency,
                timezone: tenantZone,
                timeFormat: data.tenant?.time_format,
              })}
            </p>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <h2 class="mt-6 text-base font-medium">Transactions</h2>

  <form method="GET" class="mt-2 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Account</legend>
      <select name="account" class="select" value={data.filters.accountId}>
        <option value="">All accounts</option>
        {#each data.accounts as a (a.id)}
          <option value={a.id}>{a.account_name}</option>
        {/each}
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">State</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.accountId || data.filters.status}
      <a href="/accounting/banking" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.transactions.length === 0}
    <EmptyState
      icon="lucide--landmark"
      class="mt-2"
      message="Nothing matches that."
    />
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Account</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Balance</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each data.transactions as t (t.id)}
              {@const locale = localeFor(t.currency)}
              {@const candidates = data.candidates[t.id] ?? []}
              <tr class="hover:bg-base-200/40">
                <td class="text-sm tabular-nums">
                  {calendarDate(t.transaction_date, locale)}
                </td>
                <td class="text-sm">
                  {t.description ?? "—"}
                  {#if t.matched_to_type}
                    <span class="text-base-content/70 block text-xs">
                      matched to a {t.matched_to_type}
                    </span>
                  {/if}
                </td>
                <td class="text-base-content/70 text-xs">{t.account_name}</td>
                <td
                  class={`text-right text-sm font-medium tabular-nums ${Number(t.amount) < 0 ? "text-error" : "text-success"}`}
                >
                  {money(t.amount, t.currency, locale)}
                </td>
                <td
                  class="text-base-content/70 text-right text-sm tabular-nums"
                >
                  {money(t.balance, t.currency, locale)}
                </td>
                <td>
                  <StatusBadge tone={statusTone(t.status)}>
                    {t.status}
                  </StatusBadge>
                </td>
                <td class="text-right">
                  {#if data.mayWrite && t.status === "unmatched"}
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      disabled={candidates.length === 0}
                      title={candidates.length === 0
                        ? "No same-currency payment moving the same way is on the books yet."
                        : undefined}
                      onclick={() => (matching = t.id)}
                    >
                      Match
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<!-- Match a transaction ---------------------------------------------------- -->
{#if matching}
  {@const t = data.transactions.find((x) => x.id === matching)}
  {#if t}
    {@const locale = localeFor(t.currency)}
    <div class="modal modal-open" role="dialog" aria-label="Match transaction">
      <div class="modal-box">
        <h3 class="text-lg font-medium">Match transaction</h3>
        <p class="text-base-content/70 mt-1 text-sm">
          {t.description ?? "This transaction"} · {money(
            t.amount,
            t.currency,
            locale,
          )} on {calendarDate(t.transaction_date, locale)}
        </p>
        <form
          method="POST"
          action="?/match"
          class="mt-4 grid gap-4"
          use:enhance={closeOnSuccess(() => (matching = null))}
        >
          <input type="hidden" name="transaction_id" value={t.id} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Payment</legend>
            <select
              name="payment_id"
              aria-invalid={err.aria("payment_id")}
              class={`select w-full ${err.select("payment_id")}`}
              required
            >
              <option value="" disabled selected>Choose one</option>
              {#each data.candidates[t.id] ?? [] as c (c.id)}
                <option value={c.id}>
                  {c.payment_number} · {c.counterparty_name ?? "—"} · {money(
                    c.amount,
                    c.currency ?? t.currency,
                    locale,
                  )}
                </option>
              {/each}
            </select>
          </fieldset>
          <div class="modal-action">
            <button
              type="button"
              class="btn btn-ghost"
              onclick={() => (matching = null)}>Cancel</button
            >
            <button type="submit" class="btn btn-primary">Match</button>
          </div>
        </form>
      </div>
      <button
        class="modal-backdrop"
        aria-label="Close"
        onclick={() => (matching = null)}
      ></button>
    </div>
  {/if}
{/if}
