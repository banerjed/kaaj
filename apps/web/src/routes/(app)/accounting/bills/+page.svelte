<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, money } from "$lib/format"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"

  let { data } = $props()

  const localeFor = (c: string) =>
    c === "GBP" ? "en-GB" : c === "INR" ? "en-IN" : "en-US"

  const statusTone = (s: string | null): Tone =>
    s === "paid"
      ? "positive"
      : s === "void" || s === "cancelled"
        ? "critical"
        : s === "partial"
          ? "caution"
          : s === "approved"
            ? "progress"
            : "neutral"
</script>

<svelte:head><title>Bills · Kaaj</title></svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Bills"
    items={[
      { label: "Finance & Accounting", path: "/accounting/bills" },
      { label: "Bills", active: true },
    ]}
  />

  <form method="GET" class="mt-4 flex flex-wrap items-end gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">Status</legend>
      <select name="status" class="select" value={data.filters.status}>
        <option value="">Any</option>
        {#each data.statuses as s (s)}
          <option value={s} class="capitalize">{s.replace(/_/g, " ")}</option>
        {/each}
      </select>
    </fieldset>
    <label class="label cursor-pointer gap-2">
      <input
        type="checkbox"
        name="unapproved"
        value="1"
        class="checkbox checkbox-sm"
        checked={data.filters.unapprovedOnly}
      />
      <span class="label-text">Awaiting approval</span>
    </label>
    <button class="btn btn-primary">Apply</button>
    {#if data.filters.status || data.filters.unapprovedOnly}
      <a href="/accounting/bills" class="btn btn-ghost">Clear</a>
    {/if}
  </form>

  {#if data.bills.length === 0}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-10 text-center">
        <span class="iconify lucide--receipt-text text-base-content/30 size-8"
        ></span>
        <p class="text-base-content/70 text-sm">No bills match that.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Vendor</th>
              <th>Dated</th>
              <th>Due</th>
              <th class="text-right">Total</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.bills as b (b.id)}
              {@const locale = localeFor(b.currency)}
              <tr class="hover:bg-base-200/40">
                <td class="font-medium">
                  <a class="link" href={`/accounting/bills/${b.id}`}>
                    {b.bill_number}
                  </a>
                  {#if b.line_subtotal !== null && Number(b.line_subtotal) !== Number(b.subtotal)}
                    <span
                      class="badge badge-soft badge-error badge-sm ms-1"
                      title={`Lines sum to ${b.line_subtotal}`}
                    >
                      ≠ lines
                    </span>
                  {/if}
                  <span class="text-base-content/70 block text-xs">
                    {b.line_count} line{b.line_count === 1 ? "" : "s"}
                    {#if b.approved_by_name}· approved by {b.approved_by_name}{/if}
                  </span>
                </td>
                <td class="text-sm">{b.vendor_name ?? "—"}</td>
                <td class="text-sm tabular-nums">
                  {calendarDate(b.bill_date, locale)}
                </td>
                <td class="text-sm tabular-nums">
                  {b.due_date ? calendarDate(b.due_date, locale) : "—"}
                  {#if b.is_overdue}
                    <span class="badge badge-soft badge-error badge-sm ms-1"
                      >overdue</span
                    >
                  {/if}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(b.total, b.currency, locale)}
                </td>
                <td class="text-right text-sm tabular-nums">
                  {money(b.amount_paid, b.currency, locale)}
                </td>
                <td class="text-right text-sm font-medium tabular-nums">
                  {money(b.amount_due, b.currency, locale)}
                </td>
                <td>
                  <StatusBadge tone={statusTone(b.status)}>
                    {b.status?.replace(/_/g, " ")}
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
