<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"

  let { data } = $props()

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  /**
   * The ledger is the FIRM's books, kept in its base currency, so one locale
   * throughout — unlike an invoice, which is read in the market that raised it.
   */
  const baseCurrency = $derived(data.tenant?.default_currency ?? "USD")

  let open = $state<string | null>(null)
</script>

<svelte:head><title>General Ledger · Kaaj</title></svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="General Ledger"
    items={[
      { label: "Finance & Accounting", path: "/accounting/ledger" },
      { label: "General Ledger", active: true },
    ]}
  />

  <!-- The one thing a ledger must never hide. If any entry's debits and
       credits disagree, the books do not add up, and that belongs at the top
       of the page rather than in a log. -->
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
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--book-open text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No entries in that range.</p>
      </div>
    </div>
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
                  <span class="badge badge-sm capitalize">{e.status}</span>
                </td>
              </tr>
              {#if open === e.id}
                <tr>
                  <td colspan="7" class="bg-base-200/40">
                    <p class="text-base-content/70 mb-2 text-xs">
                      {e.line_count} lines
                      {#if e.reference}· {e.reference}{/if}
                    </p>
                    <!-- Lines are loaded with the page rather than fetched on
                         expand: eight entries is one query, and a per-row
                         fetch would be the N+1 doc 03 forbids. -->
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
