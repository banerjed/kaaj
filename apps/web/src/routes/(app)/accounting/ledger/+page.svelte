<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** The firm's books, in base currency — unlike an invoice, one locale throughout. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")

  const statusTone = (s: string | null): Tone =>
    s === "posted" ? "positive" : s === "reversed" ? "critical" : "neutral"

  let open = $state<string | null>(null)
</script>

<PageHead title="General Ledger" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="General Ledger"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ledger" },
      { label: "General Ledger", active: true },
    ]}
  />

  <!-- A ledger that doesn't balance belongs at the top, not buried in a log. -->
  {#if data.unbalanced.length > 0}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--triangle-alert size-5"></span>
      <div>
        <p class="font-medium">
          {data.unbalanced.length} entr{data.unbalanced.length === 1
            ? "y does"
            : "ies do"} not balance.
        </p>
        <p class="text-sm">
          {data.unbalanced.map((u) => u.entry_number).join(", ")}
        </p>
      </div>
    </div>
  {/if}

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">From</legend>
      <input type="date" name="from" class="input" value={data.filters.from} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">To</legend>
      <input type="date" name="to" class="input" value={data.filters.to} />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s}</option>
        {/each}
      </select>
    </fieldset>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.from || data.filters.to || data.filters.status}
      <a href="/accounting/ledger" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.entries.length === 0}
    <EmptyState icon="lucide--book-open" message="No entries in that range." />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Date</th>
              <th>Description</th>
              <th>Source</th>
              <th class="text-right">Debits</th>
              <th class="text-right">Credits</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.entries as e (e.id)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  <button
                    type="button"
                    class="link"
                    onclick={() => (open = open === e.id ? null : e.id)}
                    aria-expanded={open === e.id}
                  >
                    {e.entry_number}
                  </button>
                  {#if !e.balances}
                    <span class="badge badge-error badge-sm ms-1">
                      does not balance
                    </span>
                  {/if}
                  {#if e.is_adjusting}
                    <span class="badge badge-ghost badge-sm ms-1"
                      >adjusting</span
                    >
                  {/if}
                </td>
                <td class="text-sm tabular-nums">
                  {calendarDate(e.entry_date, tenantLocale)}
                </td>
                <td class="text-sm">{e.description ?? "—"}</td>
                <td class="text-base-content/70 text-xs">
                  {e.source_type ?? "manual"}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(e.debits, baseCurrency, tenantLocale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(e.credits, baseCurrency, tenantLocale)}
                </td>
                <td>
                  <StatusBadge tone={statusTone(e.status)}
                    >{e.status}</StatusBadge
                  >
                </td>
              </tr>
              {#if open === e.id}
                <tr>
                  <td colspan="7" class="bg-base-200/40">
                    <p class="text-base-content/70 mb-2 text-xs">
                      {e.line_count} lines
                      {#if e.reference}· {e.reference}{/if}
                    </p>
                    <!-- Loaded with the page, not on expand — avoids per-row N+1. -->
                    <table class="table table-sm">
                      <tbody>
                        {#each data.lines[e.id] ?? [] as l (l.id)}
                          <tr>
                            <td class="w-24 font-mono text-xs">
                              {l.account_code ?? ""}
                            </td>
                            <td>{l.account_name ?? "—"}</td>
                            <td class="text-base-content/70 text-xs">
                              {l.description ?? ""}
                            </td>
                            <td class="w-32 text-right tabular-nums">
                              {Number(l.debit_amount ?? 0) > 0
                                ? money(
                                    l.debit_amount,
                                    l.currency ?? baseCurrency,
                                    tenantLocale,
                                  )
                                : ""}
                            </td>
                            <td class="w-32 text-right tabular-nums">
                              {Number(l.credit_amount ?? 0) > 0
                                ? money(
                                    l.credit_amount,
                                    l.currency ?? baseCurrency,
                                    tenantLocale,
                                  )
                                : ""}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
