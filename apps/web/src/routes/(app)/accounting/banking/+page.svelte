<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, instant, localeForCurrency, money } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")

  const localeFor = (c: string) =>
    localeForCurrency(data.locations, c, tenantLocale)

  const statusTone = (s: string | null): Tone =>
    s === "reconciled"
      ? "positive"
      : s === "unmatched"
        ? "caution"
        : s === "ignored"
          ? "neutral"
          : "progress"

  /**
   * The gap between what the bank says and what has been imported. Null when
   * nothing has been imported at all, which is a different statement from a
   * gap of zero.
   */
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

  <!-- Accounts. No account number appears anywhere: the four identifier
       columns are ciphertext with no plaintext last-four beside them, and a
       reconciliation screen does not need one. -->
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
            <!-- Not the same claim as a zero balance, and must not read like
                 one: nothing has been imported for this account yet. -->
            <p class="text-base-content/70 text-xs">
              No transactions imported yet.
            </p>
          {:else if g !== null && g !== 0}
            <!-- Say what the difference MEANS rather than which number is
                 larger. The bank reporting LESS than the imports means it has
                 applied something the feed has not caught up with — a charge,
                 typically. The reverse means money arrived after the last
                 import. Both are ordinary; neither is an error. -->
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
            </tr>
          </thead>
          <tbody>
            {#each data.transactions as t (t.id)}
              {@const locale = localeFor(t.currency)}
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
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
