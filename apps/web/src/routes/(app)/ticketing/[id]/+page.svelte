<script lang="ts">
  import { instant } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance, deserialize } from "$app/forms"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { ticketStatusTone as statusTone } from "$lib/components/status-tone"
  import RichTextEditor from "$lib/components/RichTextEditor.svelte"
  import TicketSubjectAndBody from "$lib/components/TicketSubjectAndBody.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import type { ComboboxOption } from "$lib/components/Combobox.svelte"
  import { closeOnSuccess, resetOnSuccess, keepValues } from "$lib/form-enhance"
  import type { TicketUpdateRow } from "$lib/server/ticketing/ticketing.repo"

  let { data, form } = $props()

  // One tab set. "Update" only exists while `editing` — it holds the one
  // thing that has no other home (subject + the update composer) and is
  // reached only through the single "Update" button, never shown as a
  // standing tab a viewer could mistake for editable. The other five —
  // Details, Summary, Parent/Linked, Tasklist, Attachments — exist in both
  // modes; each renders its own read vs. write controls internally, gated on
  // `editing`. "Details" (Status/People/business-area fields) is the default
  // tab: it's the highest-signal view of a ticket, and folding it into a tab
  // (rather than a side panel with its own, mismatched height) is what
  // removed the dead whitespace a short main panel used to leave next to a
  // taller one.
  const EDIT_FORM_ID = "ticket-edit-form"

  let activeTab = $state<
    "update" | "details" | "tasks" | "relationships" | "attachments" | "summary"
  >("details")
  let editing = $state(false)
  let taskInputEl: HTMLInputElement | undefined = $state()
  const err = $derived(fieldErrors(form))
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const tenantZone = $derived(data.tenant?.default_timezone ?? "UTC")
  const fmt = (v: string | Date) =>
    instant(v, {
      locale: tenantLocale,
      currency: "USD",
      timezone: tenantZone,
      timeFormat: data.tenant?.time_format,
    })

  function startEditing() {
    editing = true
    activeTab = "update"
  }

  // "update" is the one tab that stops existing the moment editing ends —
  // land somewhere that's still there rather than on a hidden tab with no
  // button left to select it.
  function stopEditing() {
    editing = false
    if (activeTab === "update") activeTab = "details"
  }

  // Field names that belong ONLY to `saveTicket`, and which tab each lives
  // on — this drives which tab a refusal auto-opens (below). The Tasklist
  // tab's `addTask` form used to share "title" with this one, which made the
  // effect unable to tell "the edit form was refused" from "a task failed to
  // validate" without an action name on `form`; addTask's field is now
  // `task_title` (+page.server.ts) specifically so every saveTicket field is
  // unique to it.
  const SAVE_TICKET_FIELD_TABS: Record<
    string,
    "update" | "details" | "relationships" | "summary"
  > = {
    title: "update",
    content: "update",
    status: "details",
    due_date: "details",
    private: "details",
    visibility: "details",
    assignee_ids: "details",
    subscriber_ids: "details",
    parent_id: "relationships",
    linked_ticket_ids: "relationships",
    external_summary: "summary",
  }
  const SAVE_TICKET_FIELDS = new Set(Object.keys(SAVE_TICKET_FIELD_TABS))
  $effect(() => {
    const fields = form?.errorFields ?? []
    if (fields.some((f) => SAVE_TICKET_FIELDS.has(f))) {
      editing = true
      const tab = fields.map((f) => SAVE_TICKET_FIELD_TABS[f]).find(Boolean)
      if (tab) activeTab = tab
    }
  })

  // The efficient updates feed: newest 3 + first are shipped in `data`; the
  // collapsed middle is fetched on demand, one page at a time, never all at
  // once. `data.updates.latest` is DESC, so its LAST item is the oldest of
  // the three and the boundary the "load more" pagination starts from.
  // Everything reads most-recent-first (item 6), the hidden middle included:
  // each page walks backward in time from that boundary toward `first`, so
  // `beforeId` is the moving cursor and `first.id` the fixed floor.
  const earliestOfLatest = $derived(
    data.updates.latest[data.updates.latest.length - 1] ?? null,
  )
  const hiddenCount = $derived(
    Math.max(
      0,
      data.updates.total -
        data.updates.latest.length -
        (data.updates.first ? 1 : 0),
    ),
  )
  let middleUpdates = $state<TicketUpdateRow[]>([])
  let middleLoading = $state(false)
  let middleExhausted = $state(false)

  async function loadMore() {
    if (!earliestOfLatest || !data.updates.first) return
    middleLoading = true
    const beforeId = middleUpdates.at(-1)?.id ?? earliestOfLatest.id
    const body = new FormData()
    body.set("after_id", data.updates.first.id)
    body.set("before_id", beforeId)
    const res = await fetch("?/loadMoreUpdates", { method: "POST", body })
    // devalue-encoded, not plain JSON (it carries real Date values) —
    // `deserialize` is the same helper `use:enhance` uses internally.
    const result = deserialize<
      { middle: TicketUpdateRow[] },
      Record<string, unknown>
    >(await res.text())
    const page: TicketUpdateRow[] =
      result.type === "success" ? (result.data?.middle ?? []) : []
    middleUpdates = [...middleUpdates, ...page]
    if (page.length < data.updatesMiddlePageSize) middleExhausted = true
    middleLoading = false
  }

  /** The one status that greys/strikes a cross-referenced ticket — literally "closed", not any other terminal-looking status ("duplicate" included). */
  const isClosed = (status: string) => status === "closed"

  function formatCustomFieldValue(
    def: (typeof data.customFieldDefinitions)[number],
    value: string | number | boolean | null | undefined,
  ): string {
    if (value === null || value === undefined || value === "") return "—"
    if (def.data_type === "boolean") return value ? "Yes" : "No"
    if (def.data_type === "select") {
      return def.options?.find((o) => o.value === value)?.label ?? String(value)
    }
    return String(value)
  }

  // Item 2: parent/linked-ticket pickers search on demand rather than
  // choosing from a capped preloaded list — a business area (or the whole
  // tenant) can run to thousands of tickets, so "search the visible options"
  // would silently miss real matches outside that cap.
  async function searchTickets(
    scope: "parent" | "link",
    q: string,
  ): Promise<ComboboxOption[]> {
    const body = new FormData()
    body.set("scope", scope)
    body.set("q", q)
    const res = await fetch("?/searchTickets", { method: "POST", body })
    const result = deserialize<
      { results: ComboboxOption[] },
      Record<string, unknown>
    >(await res.text())
    return result.type === "success" ? (result.data?.results ?? []) : []
  }

  const peopleOptions = $derived(
    data.people.map((p): ComboboxOption => ({ id: p.id, label: p.name })),
  )
  const assigneeSelected = $derived(
    data.ticket.assignees.map((a): ComboboxOption => ({
      id: a.employee_id,
      label: a.name,
    })),
  )
  const subscriberSelected = $derived(
    data.ticket.subscribers.map((s): ComboboxOption => ({
      id: s.employee_id,
      label: s.name,
    })),
  )
  const linkedSelected = $derived(
    data.ticket.linked.map((l): ComboboxOption => ({
      id: l.id,
      label: `${l.ticket_number} — ${l.title}`,
      sublabel: l.status,
    })),
  )
  const parentSelected = $derived(
    data.ticket.parent_ticket_id
      ? [
          {
            id: data.ticket.parent_ticket_id,
            label: `${data.ticket.parent_ticket_number ?? ""} — ${data.ticket.parent_ticket_title ?? ""}`,
          },
        ]
      : [],
  )

  // Item 5: the due date is one of the few fields worth a colour, and only
  // while it can still be missed — a closed/duplicate ticket's due date is
  // history, not a warning.
  const todayStr = new Date().toISOString().slice(0, 10)
  const soonStr = new Date(Date.now() + 2 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const dueTone = $derived.by((): "critical" | "caution" | null => {
    const due = data.ticket.due_date
    if (
      !due ||
      isClosed(data.ticket.status) ||
      data.ticket.status === "duplicate"
    )
      return null
    if (due < todayStr) return "critical"
    if (due <= soonStr) return "caution"
    return null
  })
</script>

<PageHead title={data.ticket.ticket_number} />

<div class="p-4 lg:p-6">
  {#if form?.saved}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Ticket updated.</span>
    </div>
  {:else if form?.customFieldsSet}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Fields updated.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-start gap-2">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <!-- The only heading on the page (L64) — the breadcrumb and
                   standalone "IT-0001" page title above this card were
                   dropped as duplicates of the ticket number already here. -->
            <h1 class="text-lg font-semibold">
              {data.ticket.ticket_number} — {data.ticket.title}
            </h1>
            <StatusBadge tone={statusTone(data.ticket.status)} size="sm">
              {data.ticket.status.replace(/_/g, " ")}
            </StatusBadge>
            {#if data.mayWrite && !editing}
              <button
                class="btn btn-primary btn-xs gap-1"
                onclick={startEditing}
              >
                <span class="iconify lucide--pencil size-3.5"></span>
                Update
              </button>
            {/if}
          </div>
          <p class="text-base-content/70 text-sm">
            {data.ticket.business_area_name}
            {#if data.ticket.customer_name}
              · {data.ticket.customer_name}
            {/if}
          </p>
        </div>
      </div>

      <p class="text-base-content/70 grow-0 text-xs">
        Logged {fmt(data.ticket.logged_at)}
      </p>

      <div
        role="tablist"
        class="tabs tabs-lifted mt-1 flex-nowrap overflow-x-auto"
      >
        {#if editing}
          <button
            role="tab"
            class={`tab ${activeTab === "update" ? "tab-active" : ""}`}
            aria-selected={activeTab === "update"}
            onclick={() => (activeTab = "update")}
          >
            Update
          </button>
        {/if}
        <button
          role="tab"
          class={`tab ${activeTab === "details" ? "tab-active" : ""}`}
          aria-selected={activeTab === "details"}
          onclick={() => (activeTab = "details")}
        >
          Details
        </button>
        <button
          role="tab"
          class={`tab ${activeTab === "summary" ? "tab-active" : ""}`}
          aria-selected={activeTab === "summary"}
          onclick={() => (activeTab = "summary")}
        >
          Summary
        </button>
        <button
          role="tab"
          class={`tab ${activeTab === "relationships" ? "tab-active" : ""}`}
          aria-selected={activeTab === "relationships"}
          onclick={() => (activeTab = "relationships")}
        >
          Parent/Linked
        </button>
        <button
          role="tab"
          class={`tab ${activeTab === "tasks" ? "tab-active" : ""}`}
          aria-selected={activeTab === "tasks"}
          onclick={() => (activeTab = "tasks")}
        >
          Tasklist
          {#if data.tasks.length > 0}
            <span class="badge badge-ghost badge-xs ms-1"
              >{data.tasks.filter((t) => t.is_done).length}/{data.tasks
                .length}</span
            >
          {/if}
        </button>
        <button
          role="tab"
          class={`tab ${activeTab === "attachments" ? "tab-active" : ""}`}
          aria-selected={activeTab === "attachments"}
          onclick={() => (activeTab = "attachments")}
        >
          Attachments
          {#if data.referenceLinks.length > 0}
            <span class="badge badge-ghost badge-xs ms-1"
              >{data.referenceLinks.length}</span
            >
          {/if}
        </button>
      </div>
      <div
        class="border-base-300 bg-base-100 rounded-b-box rounded-tr-box -mt-px border p-4"
      >
        {#snippet tasksPanel()}
          {#if data.mayWrite && editing}
            <!-- Only reachable in Update mode (item 2) — type and press
                   Enter to add, same as any quick-add checklist. The field
                   clears and refocuses on success so a run of tasks can go
                   in without reaching for the mouse between them. -->
            <form
              method="POST"
              action="?/addTask"
              use:enhance={resetOnSuccess(() => taskInputEl?.focus())}
              class="mb-2"
            >
              <input
                bind:this={taskInputEl}
                name="task_title"
                aria-invalid={err.aria("task_title")}
                class={`input input-sm w-full ${err.input("task_title")}`}
                placeholder="Add a task and press Enter…"
                maxlength="255"
                required
              />
            </form>
          {/if}

          <p class="text-base-content/60 text-xs">
            {data.tasks.length > 0
              ? `${data.tasks.filter((t) => t.is_done).length} of ${data.tasks.length} done`
              : "No tasks yet."}
          </p>

          {#if data.tasks.length > 0}
            <ul class="flex flex-col gap-1">
              {#each data.tasks as t (t.id)}
                <li
                  class="border-base-200 flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  <form method="POST" action="?/toggleTask" use:enhance>
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="hidden"
                      name="is_done"
                      value={(!t.is_done).toString()}
                    />
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      checked={t.is_done}
                      aria-label={t.is_done ? "Mark not done" : "Mark done"}
                      disabled={!data.mayWrite || !editing}
                      onchange={(e) => e.currentTarget.form?.requestSubmit()}
                    />
                  </form>
                  <span
                    class={`flex-1 text-sm ${t.is_done ? "text-base-content/50 line-through" : ""}`}
                    >{t.title}</span
                  >
                  {#if data.mayWrite && editing}
                    <form method="POST" action="?/archiveTask" use:enhance>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        class="btn btn-ghost btn-xs btn-square text-error"
                        aria-label={`Remove ${t.title}`}
                      >
                        <span class="iconify lucide--x size-3.5"></span>
                      </button>
                    </form>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/snippet}

        <!-- Item 2: below the subject rather than in the narrow meta panel —
             a ticket ref's full label ("IT-0002 — VPN access for new
             starter") wraps badly at the meta panel's width; the main
             column has room for it on one line. -->
        {#snippet relationshipsFields()}
          <!-- Stacked, not a 3-column grid — a ticket ref's full label
               ("IT-0002 — VPN access for new starter") needs more than a
               third of the column to stay on one line, and one-third of
               this width is exactly the constraint item 2 moved these
               fields to get away from. -->
          <div class="flex flex-col gap-3">
            <fieldset class="fieldset min-w-0">
              <legend class="fieldset-legend text-xs">Parent ticket</legend>
              {#if editing}
                <Combobox
                  name="parent_id"
                  selected={parentSelected}
                  search={(q) => searchTickets("parent", q)}
                  placeholder="Search tickets…"
                  invalid={err.has("parent_id")}
                  form={EDIT_FORM_ID}
                />
              {:else if data.ticket.parent_ticket_number}
                <p class="text-sm">
                  <a
                    href={`/ticketing/${data.ticket.parent_ticket_id}`}
                    class={`link link-hover ${
                      data.ticket.parent_ticket_status &&
                      isClosed(data.ticket.parent_ticket_status)
                        ? "text-base-content/50 line-through"
                        : ""
                    }`}
                    >{data.ticket.parent_ticket_number} — {data.ticket
                      .parent_ticket_title}</a
                  >
                  {#if data.ticket.parent_ticket_status && isClosed(data.ticket.parent_ticket_status)}
                    <span class="text-base-content/50 text-xs">(closed)</span>
                  {/if}
                </p>
              {:else}
                <p class="text-base-content/60 text-sm">None</p>
              {/if}
            </fieldset>
            <fieldset class="fieldset min-w-0">
              <legend class="fieldset-legend text-xs">Linked tickets</legend>
              {#if editing}
                <Combobox
                  name="linked_ticket_ids"
                  multiple
                  max={20}
                  selected={linkedSelected}
                  search={(q) => searchTickets("link", q)}
                  placeholder="Search any ticket…"
                  form={EDIT_FORM_ID}
                />
              {:else}
                <div class="flex flex-wrap gap-1">
                  {#each data.ticket.linked as l (l.id)}
                    <a
                      href={`/ticketing/${l.id}`}
                      class={`badge badge-sm gap-1 ${isClosed(l.status) ? "badge-ghost text-base-content/50 line-through" : "badge-outline"}`}
                      title={isClosed(l.status) ? "Closed" : undefined}
                      >{l.ticket_number}</a
                    >
                  {:else}
                    <p class="text-base-content/60 text-sm">None</p>
                  {/each}
                </div>
              {/if}
            </fieldset>
            <fieldset class="fieldset min-w-0">
              <legend class="fieldset-legend text-xs">Children</legend>
              <ul class="flex flex-col gap-1">
                {#each data.ticket.children as c (c.id)}
                  <li class="flex items-baseline gap-2">
                    <a
                      href={`/ticketing/${c.id}`}
                      class={`link link-hover shrink-0 text-sm ${isClosed(c.status) ? "text-base-content/50 line-through" : ""}`}
                      >{c.ticket_number}</a
                    >
                    <span
                      class={`truncate text-sm ${isClosed(c.status) ? "text-base-content/50 line-through" : "text-base-content/70"}`}
                      >{c.title}</span
                    >
                  </li>
                {:else}
                  <li class="text-base-content/60 text-sm">None</li>
                {/each}
              </ul>
            </fieldset>
          </div>
        {/snippet}

        <!-- Item 7 (and the Attachments tab): a label + URL, not a file
             attachment (see 20260911110000_ticketing_reference_links.sql).
             Same shared-snippet pattern as tasksPanel, and gated on `editing`
             the same way (item 2). -->
        {#snippet referenceLinksPanel()}
          {#if data.mayWrite && editing}
            <form
              method="POST"
              action="?/addReferenceLink"
              use:enhance={resetOnSuccess(() => {})}
              class="flex flex-wrap items-end gap-2"
            >
              <fieldset class="fieldset flex-1">
                <legend class="fieldset-legend text-xs">Link label</legend>
                <input
                  name="link_label"
                  aria-invalid={err.aria("link_label")}
                  class={`input input-sm w-full ${err.input("link_label")}`}
                  placeholder="Vendor spec, wiki page, …"
                  maxlength="255"
                  required
                />
              </fieldset>
              <fieldset class="fieldset flex-1">
                <legend class="fieldset-legend text-xs">URL</legend>
                <input
                  name="link_url"
                  type="url"
                  aria-invalid={err.aria("link_url")}
                  class={`input input-sm w-full ${err.input("link_url")}`}
                  placeholder="https://…"
                  maxlength="2048"
                  required
                />
              </fieldset>
              <button class="btn btn-primary btn-sm">Add</button>
            </form>
          {/if}

          {#if data.referenceLinks.length > 0}
            <ul class="flex flex-col gap-1">
              {#each data.referenceLinks as l (l.id)}
                <li
                  class="border-base-200 flex items-center gap-2 border-b py-1.5 last:border-b-0"
                >
                  <span
                    class="iconify lucide--link text-base-content/50 size-3.5"
                  ></span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="link link-hover flex-1 text-sm"
                  >
                    {l.label}
                  </a>
                  {#if data.mayWrite && editing}
                    <form
                      method="POST"
                      action="?/archiveReferenceLink"
                      use:enhance
                    >
                      <input type="hidden" name="id" value={l.id} />
                      <button
                        class="btn btn-ghost btn-xs btn-square text-error"
                        aria-label={`Remove ${l.label}`}
                      >
                        <span class="iconify lucide--x size-3.5"></span>
                      </button>
                    </form>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else if !(data.mayWrite && editing)}
            <p class="text-base-content/60 text-sm">No reference links.</p>
          {/if}
        {/snippet}

        {#if editing}
          <form
            id={EDIT_FORM_ID}
            method="POST"
            action="?/saveTicket"
            use:enhance={closeOnSuccess(stopEditing)}
          >
            <div hidden={activeTab !== "update"} class="grid gap-3">
              <TicketSubjectAndBody
                {err}
                titleValue={data.ticket.title}
                bodyName="content"
                bodyLabel="Post an update"
                bodyPlaceholder="Write an update — leave blank to save the fields above without commenting"
              />
            </div>

            <!-- Status, due date, private, update visibility, assignees,
                 subscribers and Details are edited from the meta panel on the
                 right — `form={EDIT_FORM_ID}` associates those controls with
                 THIS form despite living outside it, so they submit together
                 and stay visible next to their own current values instead of
                 being repeated here. -->

            <div hidden={activeTab !== "summary"} class="grid gap-3">
              <fieldset class="fieldset">
                <legend class="fieldset-legend text-xs"
                  >Executive summary</legend
                >
                <RichTextEditor
                  name="external_summary"
                  value={data.ticket.external_summary ?? ""}
                  placeholder="What the client sees as the current state"
                  invalid={err.has("external_summary")}
                />
              </fieldset>
            </div>
          </form>
        {:else}
          <div hidden={activeTab !== "summary"} class="flex flex-col gap-3">
            <div>
              <p class="text-base-content/70 text-xs font-medium uppercase">
                Description
              </p>
              <div
                class="mt-1 text-sm [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
              >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side in ticketById(), $lib/server/rich-text.ts -->
                {@html data.ticket.description}
              </div>
            </div>

            {#if data.ticket.external_summary}
              <div
                class="border-primary/20 bg-primary/5 rounded-box border p-3"
              >
                <p
                  class="text-base-content/70 flex items-center gap-1 text-xs font-medium uppercase"
                >
                  <span class="iconify lucide--megaphone text-primary size-3.5"
                  ></span>
                  Executive summary
                </p>
                <div class="mt-1 text-sm">
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side in ticketById() -->
                  {@html data.ticket.external_summary}
                </div>
              </div>
            {:else}
              <p class="text-base-content/60 text-sm">No executive summary.</p>
            {/if}
          </div>
        {/if}

        <!-- Item 4/single-button rule: Status/People/business-area fields
               are all edited in place here (via form={EDIT_FORM_ID}) the
               moment "Update" is clicked — no button of their own. Folded
               out of a side panel into this tab (the new default) so the
               main panel's height is never mismatched against a sidebar's —
               that mismatch was the dead whitespace above the Updates feed
               on a short ticket. -->
        <div
          hidden={activeTab !== "details"}
          class="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3"
        >
          {#snippet sectionHeader(label: string)}
            <p
              class="text-base-content/70 text-xs font-semibold tracking-wide uppercase"
            >
              {label}
            </p>
          {/snippet}
          {#snippet row(label: string)}
            <span class="text-base-content/60 pt-0.5">{label}</span>
          {/snippet}

          <div>
            {@render sectionHeader("Status")}
            <div
              class="mt-2 grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2.5"
            >
              {@render row("Status")}
              {#if editing}
                <select
                  name="status"
                  form={EDIT_FORM_ID}
                  class={`select select-sm w-full ${err.select("status")}`}
                >
                  {#each data.statuses as s (s)}
                    <option value={s} selected={s === data.ticket.status}
                      >{s.replace(/_/g, " ")}</option
                    >
                  {/each}
                </select>
              {:else}
                <StatusBadge tone={statusTone(data.ticket.status)} size="sm">
                  {data.ticket.status.replace(/_/g, " ")}
                </StatusBadge>
              {/if}
              {@render row("Due date")}
              {#if editing}
                <input
                  type="date"
                  name="due_date"
                  form={EDIT_FORM_ID}
                  value={data.ticket.due_date}
                  aria-invalid={err.aria("due_date")}
                  class={`input input-sm w-full ${err.input("due_date")}`}
                  required
                />
              {:else}
                <span class="flex flex-wrap items-center gap-1.5">
                  {data.ticket.due_date ?? "—"}
                  {#if dueTone === "critical"}
                    <StatusBadge tone="critical" size="sm">overdue</StatusBadge>
                  {:else if dueTone === "caution"}
                    <StatusBadge tone="caution" size="sm">due soon</StatusBadge>
                  {/if}
                </span>
              {/if}
              {@render row("Category")}
              <span
                >{data.ticket.category_name}{data.ticket.subcategory_name
                  ? ` / ${data.ticket.subcategory_name}`
                  : ""}</span
              >
              {#if editing}
                {@render row("Private")}
                <input
                  type="checkbox"
                  name="private"
                  form={EDIT_FORM_ID}
                  class="checkbox checkbox-sm"
                  checked={data.ticket.private === true}
                />
                {@render row("New update")}
                <select
                  name="visibility"
                  form={EDIT_FORM_ID}
                  aria-invalid={err.aria("visibility")}
                  class={`select select-sm w-full ${err.select("visibility")}`}
                >
                  <option value="external">External — client sees this</option>
                  <option value="internal">Internal — staff only</option>
                </select>
              {:else if data.ticket.private}
                {@render row("Visibility")}
                <span class="badge badge-warning badge-sm w-fit">Private</span>
              {/if}
            </div>
          </div>

          <div>
            {@render sectionHeader("People")}
            <div
              class="mt-2 grid grid-cols-[6.5rem_1fr] items-start gap-x-3 gap-y-3"
            >
              {@render row("Assignees")}
              {#if editing && data.mayManageAssignees}
                <Combobox
                  name="assignee_ids"
                  multiple
                  options={peopleOptions}
                  selected={assigneeSelected}
                  placeholder="Search people…"
                  form={EDIT_FORM_ID}
                />
              {:else}
                <div class="flex flex-wrap gap-1 pt-0.5">
                  {#each data.ticket.assignees as a (a.employee_id)}
                    <span class="badge badge-outline badge-sm">{a.name}</span>
                  {:else}
                    <span class="text-base-content/60">Unassigned</span>
                  {/each}
                </div>
              {/if}
              {@render row("Subscribers")}
              <div>
                {#if editing}
                  <Combobox
                    name="subscriber_ids"
                    multiple
                    options={peopleOptions}
                    selected={subscriberSelected}
                    placeholder="Search people…"
                    form={EDIT_FORM_ID}
                  />
                {:else}
                  <div class="flex flex-wrap gap-1 pt-0.5">
                    {#each data.ticket.subscribers as s (s.employee_id)}
                      <span class="badge badge-outline badge-sm">{s.name}</span>
                    {:else}
                      <span class="text-base-content/60">None</span>
                    {/each}
                  </div>
                {/if}
                <p class="text-base-content/60 mt-1 text-xs">
                  Also grants visibility, if not already a default viewer.
                </p>
              </div>
              {@render row("Logger")}
              <span class="pt-0.5">{data.ticket.reported_by_name ?? "—"}</span>
            </div>
          </div>

          {#if data.customFieldDefinitions.length > 0}
            <div>
              {@render sectionHeader("Details")}
              <p class="text-base-content/60 mt-2 text-xs">
                {data.ticket.business_area_name} fields
              </p>

              {#if !editing}
                <dl
                  class="mt-1 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm"
                >
                  {#each data.customFieldDefinitions as def (def.id)}
                    <dt class="text-base-content/60">{def.label}</dt>
                    <dd>
                      {formatCustomFieldValue(
                        def,
                        data.ticket.custom_fields[def.field_key],
                      )}
                    </dd>
                  {/each}
                </dl>
              {:else}
                <form
                  method="POST"
                  action="?/setCustomFields"
                  use:enhance={keepValues}
                  class="mt-2 grid gap-3"
                >
                  {#each data.customFieldDefinitions as def (def.id)}
                    {@const name = `cf_${def.field_key}`}
                    {@const current = data.ticket.custom_fields[def.field_key]}
                    <fieldset class="fieldset">
                      <legend class="fieldset-legend text-xs">
                        {def.label}{def.is_required ? " *" : ""}
                      </legend>
                      {#if def.data_type === "boolean"}
                        <input
                          type="checkbox"
                          {name}
                          class="checkbox"
                          checked={current === true}
                        />
                      {:else if def.data_type === "select"}
                        <select
                          {name}
                          class={`select select-sm w-full ${err.select(name)}`}
                          required={def.is_required}
                        >
                          <option value="">—</option>
                          {#each def.options ?? [] as opt (opt.value)}
                            <option
                              value={opt.value}
                              selected={opt.value === current}
                              >{opt.label}</option
                            >
                          {/each}
                        </select>
                      {:else}
                        <input
                          type={def.data_type === "number"
                            ? "number"
                            : def.data_type === "date"
                              ? "date"
                              : "text"}
                          {name}
                          value={current ?? ""}
                          class={`input input-sm w-full ${err.input(name)}`}
                          required={def.is_required}
                        />
                      {/if}
                      {#if def.help_text}
                        <p class="text-base-content/60 text-xs">
                          {def.help_text}
                        </p>
                      {/if}
                    </fieldset>
                  {/each}
                  <div>
                    <button class="btn btn-primary btn-sm">Save fields</button>
                  </div>
                </form>
              {/if}
            </div>
          {/if}
        </div>

        <div hidden={activeTab !== "relationships"} class="flex flex-col gap-3">
          {@render relationshipsFields()}
        </div>

        <div hidden={activeTab !== "tasks"}>
          {@render tasksPanel()}
        </div>

        <div hidden={activeTab !== "attachments"} class="flex flex-col gap-3">
          {@render referenceLinksPanel()}
        </div>

        <!-- One Save/Cancel for the whole ticket, regardless of which tab
               is active — `form={EDIT_FORM_ID}` submits it from outside the
               <form>, the same mechanism the meta panel's fields use, so it
               can sit after every tab's content instead of only the two
               that are physically inside the form element. -->
        {#if editing}
          <div
            class="border-base-300 mt-4 flex items-center gap-3 border-t pt-3"
          >
            <button
              type="submit"
              form={EDIT_FORM_ID}
              class="btn btn-primary btn-sm">Save</button
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              onclick={stopEditing}>Cancel</button
            >
          </div>
        {/if}
      </div>
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Updates
    <span class="badge badge-sm ms-1">{data.updates.total}</span>
  </h2>

  <ul class="mt-2 flex flex-col gap-2">
    {#each data.updates.latest as u (u.id)}
      <li class="card bg-base-100 border-base-300 border shadow-sm">
        <div class="card-body gap-1 p-3">
          <div
            class="text-sm [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side -->
            {@html u.content_text}
          </div>
          <p
            class="text-base-content/70 border-base-200 mt-1 border-t pt-1 text-xs"
          >
            <span class="font-medium">{u.author_name ?? "—"}</span>
            · {fmt(u.created_at)}
            {#if u.visibility === "internal"}
              <span class="badge badge-ghost badge-sm ms-1">internal</span>
            {/if}
          </p>
        </div>
      </li>
    {:else}
      <li class="card bg-base-100 border-base-300 border shadow-sm">
        <div class="card-body p-3">
          <p class="text-base-content/70 text-sm">No updates yet.</p>
        </div>
      </li>
    {/each}

    {#if hiddenCount > 0 && !middleExhausted}
      <li class="flex justify-center py-1">
        <button
          class="btn btn-ghost btn-sm"
          disabled={middleLoading}
          onclick={loadMore}
        >
          {middleLoading
            ? "Loading…"
            : `Show ${hiddenCount - middleUpdates.length} earlier update${hiddenCount - middleUpdates.length === 1 ? "" : "s"}`}
        </button>
      </li>
    {/if}

    {#each middleUpdates as u (u.id)}
      <li class="card bg-base-100 border-base-300 border shadow-sm">
        <div class="card-body gap-1 p-3">
          <div
            class="text-sm [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side -->
            {@html u.content_text}
          </div>
          <p
            class="text-base-content/70 border-base-200 mt-1 border-t pt-1 text-xs"
          >
            <span class="font-medium">{u.author_name ?? "—"}</span>
            · {fmt(u.created_at)}
            {#if u.visibility === "internal"}
              <span class="badge badge-ghost badge-sm ms-1">internal</span>
            {/if}
          </p>
        </div>
      </li>
    {/each}

    {#if data.updates.first}
      <li class="card bg-base-200/50 border-base-300 border shadow-sm">
        <div class="card-body gap-1 p-3">
          <p class="text-base-content/70 text-xs font-medium uppercase">
            Opened the ticket
          </p>
          <div
            class="text-sm [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side -->
            {@html data.updates.first.content_text}
          </div>
          <p
            class="text-base-content/70 border-base-300 mt-1 border-t pt-1 text-xs"
          >
            <span class="font-medium"
              >{data.updates.first.author_name ?? "—"}</span
            >
            · {fmt(data.updates.first.created_at)}
          </p>
        </div>
      </li>
    {/if}
  </ul>
</div>
