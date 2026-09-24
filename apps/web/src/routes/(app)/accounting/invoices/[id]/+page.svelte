<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { calendarDate, localeForCurrency, money, number } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { invoiceStatusTone as statusTone } from "$lib/components/status-tone"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  let paying = $state(false)
  let voiding = $state(false)
  let crediting = $state(false)
  let writingOff = $state(false)

  /** What this invoice may do next — mirrors the statuses the repo enforces. */
  const may = $derived({
    issue: data.mayWrite && data.invoice.status === "draft",
    void: data.mayWrite && data.invoice.status === "draft",
    pay:
      data.mayWrite &&
      ["sent", "partial", "overdue"].includes(data.invoice.status ?? ""),
    credit:
      data.mayWrite &&
      ["sent", "partial", "overdue"].includes(data.invoice.status ?? ""),
    writeOff:
      data.mayWrite &&
      ["sent", "partial", "overdue"].includes(data.invoice.status ?? ""),
    // A draft has nothing worth handing to a customer yet — matches
    // issueInvoice's own gate on when pdf_url gets set.
    pdf: data.invoice.status !== "draft",
    email: data.mayWrite && data.invoice.status !== "draft",
    createPaymentLink:
      data.mayWrite &&
      !data.invoice.payment_url &&
      ["sent", "partial", "overdue"].includes(data.invoice.status ?? ""),
  })

  /** `invoice_credits.credit_type` — a plain vocabulary column (L57); the
   *  label a person reads lives here, next to the only other place that
   *  reads the column. */
  const creditTypeLabel = (t: string) =>
    t === "write_off" ? "Write-off" : "Credit memo"

  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const locale = $derived(
    localeForCurrency(data.locations, data.invoice.currency, tenantLocale),
  )
  const cur = $derived(data.invoice.currency)
</script>

<PageHead title={data.invoice.invoice_number} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.invoice.invoice_number}
    items={[
      { label: "Finance & Accounting", path: "/accounting/invoices" },
      { label: "Invoices", path: "/accounting/invoices" },
      { label: data.invoice.invoice_number, active: true },
    ]}
  />

  {#if form?.issued}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>
        Issued. Revenue posted to the ledger as {form.issued}.
      </span>
    </div>
    {#if form.paymentLinkWarning}
      <div role="alert" class="alert alert-warning mt-2">
        <span class="iconify lucide--triangle-alert size-5"></span>
        <span>{form.paymentLinkWarning}</span>
      </div>
    {/if}
  {:else if form?.linkCreated}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Payment link created.</span>
    </div>
  {:else if form?.paid}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.paid} recorded. The invoice is now {form.status}.</span>
    </div>
  {:else if form?.voided}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Invoice voided.</span>
    </div>
  {:else if form?.credited}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.credited} recorded. The invoice is now {form.status}.</span>
    </div>
  {:else if form?.writtenOff}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span
        >{form.writtenOff} recorded. The invoice is now {form.status?.replace(
          /_/g,
          " ",
        )}.</span
      >
    </div>
  {:else if form?.emailSent}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Emailed to {form.emailSent}.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-base-content/70 text-sm">
          {data.invoice.customer_name ?? "No customer"} · issued {calendarDate(
            data.invoice.invoice_date,
            locale,
          )}
          {#if data.invoice.due_date}
            · due {calendarDate(data.invoice.due_date, locale)}
          {/if}
        </p>
        <div class="flex gap-1">
          {#if data.invoice.is_overdue}
            <span class="badge badge-error badge-sm">overdue</span>
          {/if}
          <StatusBadge tone={statusTone(data.invoice.status)}>
            {data.invoice.status?.replace(/_/g, " ")}
          </StatusBadge>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Description</th>
              <th>Account</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit</th>
              <th class="text-right">Tax</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {#each data.lines as l (l.id)}
              <tr>
                <td>{l.description ?? "—"}</td>
                <td class="text-base-content/70 text-xs">
                  {l.account_name ?? "—"}
                </td>
                <td class="text-right tabular-nums">
                  {number(l.quantity ?? "0", locale)}
                </td>
                <td class="text-right tabular-nums">
                  {money(l.unit_price, cur, locale)}
                </td>
                <td class="text-right tabular-nums">
                  {money(l.tax_amount, cur, locale)}
                </td>
                <td class="text-right font-medium tabular-nums">
                  {money(l.amount, cur, locale)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.linesTotal > data.lines.length}
        <p class="text-base-content/70 text-xs">
          Showing the first {data.lines.length} of {data.linesTotal} lines.
        </p>
      {/if}

      <!-- Exact figures only — checked against a bank statement. -->
      <dl
        class="border-base-200 ms-auto grid w-full max-w-sm gap-1 border-t pt-3 text-sm"
      >
        <div class="flex justify-between">
          <dt class="text-base-content/70">Subtotal</dt>
          <dd class="tabular-nums">
            {money(data.invoice.subtotal, cur, locale)}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/70">Tax</dt>
          <dd class="tabular-nums">
            {money(data.invoice.tax_total, cur, locale)}
          </dd>
        </div>
        <div
          class="border-base-200 flex justify-between border-t pt-1 font-medium"
        >
          <dt>Total</dt>
          <dd class="tabular-nums">{money(data.invoice.total, cur, locale)}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/70">Paid</dt>
          <dd class="text-success tabular-nums">
            −{money(data.invoice.amount_paid, cur, locale)}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-base-content/70">Credited</dt>
          <dd class="text-success tabular-nums">
            −{money(data.invoice.amount_credited, cur, locale)}
          </dd>
        </div>
        <div
          class="border-base-200 flex justify-between border-t pt-1 font-medium"
        >
          <dt>Outstanding</dt>
          <dd class="tabular-nums">
            {money(data.invoice.amount_due, cur, locale)}
          </dd>
        </div>
      </dl>
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Payments received
    <span class="badge badge-sm ms-1">{data.paymentsTotal}</span>
  </h2>

  {#if data.payments.length === 0}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body items-center py-8 text-center">
        <p class="text-base-content/70 text-sm">Nothing received yet.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each data.payments as p (p.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">{p.payment_number}</p>
              <p class="text-base-content/70 text-xs">
                {p.payment_date ? calendarDate(p.payment_date, locale) : "—"}
                {#if p.method}· {p.method.replace(/_/g, " ")}{/if}
              </p>
            </div>
            <p class="font-medium tabular-nums">
              {money(p.amount, p.currency ?? cur, locale)}
            </p>
          </li>
        {/each}
      </ul>
      {#if data.paymentsTotal > data.payments.length}
        <p class="text-base-content/70 border-base-200 border-t p-3 text-xs">
          Showing the first {data.payments.length} of {data.paymentsTotal}.
        </p>
      {/if}
    </div>
  {/if}

  <h2 class="mt-6 text-base font-medium">
    Credits issued
    <span class="badge badge-sm ms-1">{data.creditsTotal}</span>
  </h2>

  {#if data.credits.length === 0}
    <div class="card bg-base-100 mt-2 shadow">
      <div class="card-body items-center py-8 text-center">
        <p class="text-base-content/70 text-sm">No credit memos issued.</p>
      </div>
    </div>
  {:else}
    <div class="card bg-base-100 mt-2 shadow">
      <ul class="list">
        {#each data.credits as c (c.id)}
          <li class="list-row">
            <div class="list-col-grow">
              <p class="font-medium">
                {c.credit_number}
                <span class="text-base-content/70 font-normal"
                  >· {creditTypeLabel(c.credit_type)}</span
                >
              </p>
              <p class="text-base-content/70 text-xs">
                {calendarDate(c.created_at, locale)} · {c.reason}
              </p>
            </div>
            <p class="font-medium tabular-nums">
              −{money(c.amount, c.currency ?? cur, locale)}
            </p>
          </li>
        {/each}
      </ul>
      {#if data.creditsTotal > data.credits.length}
        <p class="text-base-content/70 border-base-200 border-t p-3 text-xs">
          Showing the first {data.credits.length} of {data.creditsTotal}.
        </p>
      {/if}
    </div>
  {/if}

  {#if data.invoice.payment_url}
    <div class="alert alert-info mt-4">
      <span class="iconify lucide--link size-5"></span>
      <span>
        Payment link: <a
          href={data.invoice.payment_url}
          target="_blank"
          rel="noopener"
          class="link">{data.invoice.payment_url}</a
        >
      </span>
    </div>
  {/if}

  <!-- Each posts a balanced journal entry; POST only, never a link. -->
  {#if may.issue || may.pay || may.credit || may.writeOff || may.void || may.pdf || may.email || may.createPaymentLink}
    <div class="mt-4 flex flex-wrap items-center gap-2">
      {#if may.issue}
        <form method="POST" action="?/issue">
          <button class="btn btn-primary btn-sm">
            <span class="iconify lucide--send size-4"></span>
            Issue invoice
          </button>
        </form>
        <p class="text-base-content/70 text-xs">
          Posts {money(data.invoice.total, cur, locale)} to receivables and the revenue
          behind it.
        </p>
      {/if}
      {#if may.pay}
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={() => (paying = true)}
        >
          <span class="iconify lucide--banknote size-4"></span>
          Record a payment
        </button>
      {/if}
      {#if may.credit}
        <button
          type="button"
          class="btn btn-outline btn-sm"
          onclick={() => (crediting = true)}
        >
          <span class="iconify lucide--receipt-text size-4"></span>
          Issue a credit
        </button>
      {/if}
      {#if may.writeOff}
        <button
          type="button"
          class="btn btn-outline btn-sm"
          onclick={() => (writingOff = true)}
        >
          <span class="iconify lucide--file-x size-4"></span>
          Write off
        </button>
      {/if}
      {#if may.pdf}
        <a
          href="/accounting/invoices/{data.invoice.id}/pdf"
          target="_blank"
          rel="noopener"
          class="btn btn-outline btn-sm"
        >
          <span class="iconify lucide--file-text size-4"></span>
          Download PDF
        </a>
      {/if}
      {#if may.email}
        <form method="POST" action="?/emailInvoice" use:enhance>
          <button class="btn btn-outline btn-sm">
            <span class="iconify lucide--mail size-4"></span>
            Email invoice
          </button>
        </form>
      {/if}
      {#if may.createPaymentLink}
        <form method="POST" action="?/createPaymentLink" use:enhance>
          <button class="btn btn-outline btn-sm">
            <span class="iconify lucide--link size-4"></span>
            Create payment link
          </button>
        </form>
      {/if}
      {#if may.void}
        <button
          type="button"
          class="btn btn-ghost btn-sm ms-auto"
          onclick={() => (voiding = true)}
        >
          Void
        </button>
      {/if}
    </div>
  {/if}
</div>

<!-- Record a payment ------------------------------------------------------ -->
{#if paying}
  <div class="modal modal-open" role="dialog" aria-label="Record a payment">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Payment against {data.invoice.invoice_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        {money(data.invoice.amount_due, cur, locale)} outstanding. More than that
        is refused — an over-allocation is not something a later reconciliation can
        undo.
      </p>
      <form
        method="POST"
        action="?/recordPayment"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (paying = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Amount ({cur})</legend>
          <!-- inputmode, never type="number" — that round-trips through a float. -->
          <input
            name="amount"
            aria-invalid={err.aria("amount")}
            class={`input w-full ${err.input("amount")}`}
            inputmode="decimal"
            required
            value={data.invoice.amount_due ?? ""}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Received on</legend>
          <input
            name="payment_date"
            aria-invalid={err.aria("payment_date")}
            type="date"
            class={`input w-full ${err.input("payment_date")}`}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Method</legend>
          <select
            name="payment_method"
            aria-invalid={err.aria("payment_method")}
            class={`select w-full ${err.select("payment_method")}`}
            required
          >
            {#each data.methods as m (m)}
              <option value={m} class="capitalize"
                >{m.replace(/_/g, " ")}</option
              >
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Into</legend>
          <select
            name="bank_account_id"
            aria-invalid={err.aria("bank_account_id")}
            class={`select w-full ${err.select("bank_account_id")}`}
          >
            <option value="">Not recorded</option>
            {#each data.bankAccounts as b (b.id)}
              <option value={b.id}>{b.account_name}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reference</legend>
          <input
            name="reference"
            aria-invalid={err.aria("reference")}
            class={`input w-full ${err.input("reference")}`}
            maxlength="100"
          />
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (paying = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Record payment</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (paying = false)}
    ></button>
  </div>
{/if}

<!-- Issue a credit ---------------------------------------------------------- -->
{#if crediting}
  <div class="modal modal-open" role="dialog" aria-label="Issue a credit">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Credit against {data.invoice.invoice_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Reverses revenue without a cash receipt — {money(
          data.invoice.amount_due,
          cur,
          locale,
        )} outstanding. More than that is refused.
      </p>
      <form
        method="POST"
        action="?/recordCredit"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (crediting = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Amount ({cur})</legend>
          <!-- inputmode, never type="number" — that round-trips through a float. -->
          <input
            name="credit_amount"
            aria-invalid={err.aria("credit_amount")}
            class={`input w-full ${err.input("credit_amount")}`}
            inputmode="decimal"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Dated</legend>
          <input
            name="credit_date"
            aria-invalid={err.aria("credit_date")}
            type="date"
            class={`input w-full ${err.input("credit_date")}`}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <textarea
            name="credit_reason"
            aria-invalid={err.aria("credit_reason")}
            class={`textarea w-full ${err.textarea("credit_reason")}`}
            rows="2"
            maxlength="500"
            required
            placeholder="Recorded in the audit trail"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (crediting = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Issue credit</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (crediting = false)}
    ></button>
  </div>
{/if}

<!-- Write off --------------------------------------------------------------- -->
{#if writingOff}
  <div class="modal modal-open" role="dialog" aria-label="Write off">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Write off {data.invoice.invoice_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Recognises the balance as uncollectible — Dr Bad Debt Expense, Cr
        Accounts Receivable, not a reversal of revenue. {money(
          data.invoice.amount_due,
          cur,
          locale,
        )} outstanding. More than that is refused.
      </p>
      <form
        method="POST"
        action="?/recordWriteOff"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (writingOff = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Amount ({cur})</legend>
          <!-- inputmode, never type="number" — that round-trips through a float. -->
          <input
            name="writeoff_amount"
            aria-invalid={err.aria("writeoff_amount")}
            class={`input w-full ${err.input("writeoff_amount")}`}
            inputmode="decimal"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Dated</legend>
          <input
            name="writeoff_date"
            aria-invalid={err.aria("writeoff_date")}
            type="date"
            class={`input w-full ${err.input("writeoff_date")}`}
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Reason</legend>
          <textarea
            name="writeoff_reason"
            aria-invalid={err.aria("writeoff_reason")}
            class={`textarea w-full ${err.textarea("writeoff_reason")}`}
            rows="2"
            maxlength="500"
            required
            placeholder="Recorded in the audit trail"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (writingOff = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Write off</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (writingOff = false)}
    ></button>
  </div>
{/if}

<!-- Void ------------------------------------------------------------------ -->
{#if voiding}
  <div class="modal modal-open" role="dialog" aria-label="Void invoice">
    <div class="modal-box">
      <h3 class="text-lg font-medium">
        Void {data.invoice.invoice_number}
      </h3>
      <p class="text-base-content/70 mt-1 text-sm">
        Only a draft can be voided. Once an invoice is issued its revenue is in
        the ledger, and reversing it is a credit note — a new document — not an
        edit to this one.
      </p>
      <form
        method="POST"
        action="?/voidInvoice"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (voiding = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Why</legend>
          <textarea
            name="reason"
            aria-invalid={err.aria("reason")}
            class={`textarea w-full ${err.textarea("reason")}`}
            rows="2"
            maxlength="500"
            required
            placeholder="Recorded in the audit trail"
          ></textarea>
        </fieldset>
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (voiding = false)}>Keep it</button
          >
          <button type="submit" class="btn btn-error">Void invoice</button>
        </div>
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (voiding = false)}
    ></button>
  </div>
{/if}
