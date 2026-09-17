<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import Pagination from "$lib/components/Pagination.svelte"
  import { enhance } from "$app/forms"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /** The firm's books, in base currency — unlike an invoice, one locale throughout. */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")

  const statusTone = (s: string | null): Tone =>
    s === "posted" ? "positive" : s === "reversed" ? "critical" : "neutral"

  let open = $state<string | null>(null)

  // Run on demand, not loaded with the page — a full-ledger scan, not a
  // list — so `balanceCheck` starts unknown rather than reading `data`.
  let balanceCheck = $state<
    { entry_number: string; debits: string; credits: string }[] | null
  >(null)
  let checkingBalance = $state(false)

  // Built from `data.filters`, not `window.location` — this renders during
  // SSR too, where `window` doesn't exist.
  function pageUrl(page: number): string {
    const params = new URLSearchParams({
      from: data.filters.from,
      to: data.filters.to,
      status: data.filters.status,
    })
    for (const [k, v] of [...params]) if (v === "") params.delete(k)
    params.set("page", String(page))
    return `?${params.toString()}`
  }
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

  <!-- A full-ledger scan, run on demand rather than on every page view (see
       +page.server.ts's checkBalance) — a ledger that doesn't balance
       belongs at the top once checked, not buried in a log. -->
  {#if balanceCheck !== null}
    {#if balanceCheck.length > 0}
      <div role="alert" class="alert alert-error mt-4">
        <span class="iconify lucide--triangle-alert size-5"></span>
        <div>
          <p class="font-medium">
            {balanceCheck.length} entr{balanceCheck.length === 1
              ? "y does"
              : "ies do"} not balance.
          </p>
          <p class="text-sm">
            {balanceCheck.map((u) => u.entry_number).join(", ")}
          </p>
        </div>
      </div>
    {:else}
      <div role="status" class="alert alert-success mt-4">
        <span class="iconify lucide--circle-check size-5"></span>
        <span>Every entry balances.</span>
      </div>
    {/if}
  {/if}

  <div class="mt-4 flex items-center justify-between gap-2">
    <form
      method="POST"
      action="?/checkBalance"
      use:enhance={() => {
        checkingBalance = true
        return async ({ result, update }) => {
          checkingBalance = false
          if (result.type === "success" && result.data) {
            balanceCheck = result.data.unbalanced as typeof balanceCheck
          }
          await update({ reset: false })
        }
      }}
    >
      <button class="btn btn-sm" disabled={checkingBalance}>
        {checkingBalance ? "Checking…" : "Check for imbalances"}
      </button>
    </form>

    {#if data.mayWrite}
      <a href="/accounting/journal-entries/new" class="btn btn-primary btn-sm">
        <span class="iconify lucide--plus size-4"></span>
        New entry
      </a>
    {/if}
  </div>

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
                      {#if (data.lines[e.id]?.length ?? 0) < e.line_count}
                        · showing the first {data.lines[e.id]?.length ?? 0}
                      {/if}
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
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        hrefFor={pageUrl}
      />
    </div>
  {/if}
</div>
