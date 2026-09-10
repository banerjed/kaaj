<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { instant } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance, deserialize } from "$app/forms"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { ticketStatusTone as statusTone } from "$lib/components/status-tone"
  import RichTextEditor from "$lib/components/RichTextEditor.svelte"
  import { closeOnSuccess } from "$lib/form-enhance"
  import type { TicketUpdateRow } from "$lib/server/ticketing/ticketing.repo"

  let { data, form } = $props()

  let editFormOpen = $state(false)
  let addingTask = $state(false)
  let editingCustomFields = $state(false)
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

  // The efficient updates feed: newest 3 + first are shipped in `data`; the
  // collapsed middle is fetched on demand, one page at a time, never all at
  // once. `data.updates.latest` is DESC, so its LAST item is the oldest of
  // the three and the boundary the "load more" pagination stops before.
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
    const afterId = middleUpdates.at(-1)?.id ?? data.updates.first.id
    const body = new FormData()
    body.set("after_id", afterId)
    body.set("before_id", earliestOfLatest.id)
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
    if (page.length < 20) middleExhausted = true
    middleLoading = false
  }

  /** The one status that greys/strikes a cross-referenced ticket — literally "closed", not "resolved". */
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

  // Parent/link pickers are capped server-side (a business area, or the
  // whole tenant, can run to thousands of tickets) — the CURRENT value is
  // merged back in here so it always has an option to stay selected, even
  // when it falls outside the capped "most recent" set.
  const linkedIds = $derived(new Set(data.ticket.linked.map((l) => l.id)))
  const linkOptions = $derived([
    ...data.ticket.linked,
    ...data.linkCandidates.filter((t) => !linkedIds.has(t.id)),
  ])
  const parentOptions = $derived(
    data.ticket.parent_ticket_id &&
      !data.possibleParents.some((t) => t.id === data.ticket.parent_ticket_id)
      ? [
          {
            id: data.ticket.parent_ticket_id,
            ticket_number: data.ticket.parent_ticket_number ?? "",
            title: data.ticket.parent_ticket_title ?? "",
            status: data.ticket.parent_ticket_status ?? "",
          },
          ...data.possibleParents,
        ]
      : data.possibleParents,
  )
</script>

<PageHead title={data.ticket.ticket_number} />

<div class="p-4 lg:p-6">
  <PageTitle
    title={data.ticket.ticket_number}
    items={[
      { label: "Support & Services", path: "/ticketing" },
      { label: "Ticketing", path: "/ticketing" },
      { label: data.ticket.ticket_number, active: true },
    ]}
  />

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

  <div class="grid gap-4 lg:grid-cols-3">
    <div class="card bg-base-100 shadow lg:col-span-2">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p class="font-medium">{data.ticket.title}</p>
            <p class="text-base-content/70 text-sm">
              {data.ticket.business_area_name}
              / {data.ticket.category_name}{data.ticket.subcategory_name
                ? ` / ${data.ticket.subcategory_name}`
                : ""}
              {#if data.ticket.customer_name}
                · {data.ticket.customer_name}
              {/if}
              · reported by {data.ticket.reported_by_name ?? "—"}
            </p>
          </div>
          <div class="flex items-center gap-2">
            {#if data.ticket.private}
              <span class="badge badge-warning badge-sm">private</span>
            {/if}
            <StatusBadge tone={statusTone(data.ticket.status)}>
              {data.ticket.status.replace(/_/g, " ")}
            </StatusBadge>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span class="text-base-content/70">
            Logged {fmt(data.ticket.logged_at)}
          </span>
          <span class="text-base-content/70">
            Due {data.ticket.due_date ?? "—"}
          </span>
        </div>

        <div
          class="text-sm [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side in ticketById(), $lib/server/rich-text.ts -->
          {@html data.ticket.description}
        </div>

        {#if data.ticket.external_summary}
          <div class="rounded-box bg-base-200/60 p-3">
            <p class="text-base-content/70 text-xs font-medium uppercase">
              Executive summary
            </p>
            <div class="mt-1 text-sm">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizeRichText() ran server-side in ticketById() -->
              {@html data.ticket.external_summary}
            </div>
          </div>
        {/if}

        <!-- Parent / linked / children — moved out of the right-hand meta
             panel per the user's request: this is the ticket's own place in
             a graph of other tickets, and reads better beside the summary
             than tucked in a sidebar. -->
        <div class="border-base-300 grid gap-3 border-t pt-3 sm:grid-cols-3">
          <div>
            <p class="text-base-content/70 text-xs font-medium uppercase">
              Parent
            </p>
            {#if data.ticket.parent_ticket_number}
              <a
                href={`/ticketing/${data.ticket.parent_ticket_id}`}
                class={`link link-hover text-sm ${
                  data.ticket.parent_ticket_status &&
                  isClosed(data.ticket.parent_ticket_status)
                    ? "text-base-content/50 line-through"
                    : ""
                }`}>{data.ticket.parent_ticket_number}</a
              >
              {#if data.ticket.parent_ticket_status && isClosed(data.ticket.parent_ticket_status)}
                <span class="text-base-content/50 text-xs">(closed)</span>
              {/if}
            {:else}
              <p class="text-base-content/60 text-sm">None</p>
            {/if}
          </div>
          <div>
            <p class="text-base-content/70 text-xs font-medium uppercase">
              Linked tickets
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              {#each data.ticket.linked as l (l.id)}
                <a
                  href={`/ticketing/${l.id}`}
                  class={`badge badge-sm gap-1 ${isClosed(l.status) ? "badge-ghost text-base-content/50 line-through" : "badge-outline"}`}
                  title={isClosed(l.status) ? "Closed" : undefined}
                  >{l.ticket_number}</a
                >
              {:else}
                <span class="text-base-content/60 text-sm">None</span>
              {/each}
            </div>
          </div>
          <div>
            <p class="text-base-content/70 text-xs font-medium uppercase">
              Children
            </p>
            <ul class="mt-1 flex flex-col gap-1">
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
          </div>
        </div>

        {#if data.customFieldDefinitions.length > 0}
          <div class="border-base-300 border-t pt-3">
            <div class="flex items-center justify-between">
              <p class="text-base-content/70 text-xs font-medium uppercase">
                {data.ticket.business_area_name} fields
              </p>
              {#if data.mayWrite}
                <button
                  class="btn btn-ghost btn-xs"
                  onclick={() => (editingCustomFields = !editingCustomFields)}
                  >{editingCustomFields ? "Cancel" : "Edit"}</button
                >
              {/if}
            </div>

            {#if !editingCustomFields}
              <dl class="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {#each data.customFieldDefinitions as def (def.id)}
                  <dt class="text-base-content/70">{def.label}</dt>
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
                use:enhance={closeOnSuccess(
                  () => (editingCustomFields = false),
                )}
                class="mt-2 grid gap-3 sm:grid-cols-2"
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
                            selected={opt.value === current}>{opt.label}</option
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
                <div class="sm:col-span-2">
                  <button class="btn btn-primary btn-sm">Save fields</button>
                </div>
              </form>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Meta panel: at-a-glance people. Editing lives in the unified form below. -->
    <div class="card bg-base-100 shadow">
      <div class="card-body gap-4 p-4 text-sm">
        <div>
          <p class="font-medium">Assignees</p>
          <div class="mt-1 flex flex-wrap gap-1">
            {#each data.ticket.assignees as a (a.employee_id)}
              <span class="badge badge-outline">{a.name}</span>
            {:else}
              <span class="text-base-content/60">Unassigned</span>
            {/each}
          </div>
        </div>

        <div>
          <p class="font-medium">Subscribers</p>
          <p class="text-base-content/60 text-xs">
            Subscribing someone also grants them visibility if they aren't
            otherwise a default viewer of this business area.
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            {#each data.ticket.subscribers as s (s.employee_id)}
              <span class="badge badge-outline">{s.name}</span>
            {:else}
              <span class="text-base-content/60">None</span>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Tasks -->
  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-medium">
          Tasks
          {#if data.tasks.length > 0}
            <span class="text-base-content/60 text-xs font-normal">
              {data.tasks.filter((t) => t.is_done).length} / {data.tasks.length} done
            </span>
          {/if}
        </h2>
        {#if data.mayWrite}
          <button
            class="btn btn-ghost btn-xs"
            onclick={() => (addingTask = !addingTask)}
          >
            {addingTask ? "Cancel" : "+ Add task"}
          </button>
        {/if}
      </div>

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
                  disabled={!data.mayWrite}
                  onchange={(e) => e.currentTarget.form?.requestSubmit()}
                />
              </form>
              <span
                class={`flex-1 text-sm ${t.is_done ? "text-base-content/50 line-through" : ""}`}
                >{t.title}</span
              >
              {#if t.assignee_name}
                <span class="text-base-content/60 text-xs"
                  >{t.assignee_name}</span
                >
              {/if}
              {#if t.due_date}
                <span class="text-base-content/60 text-xs tabular-nums"
                  >due {t.due_date}</span
                >
              {/if}
              {#if data.mayWrite}
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
      {:else if !addingTask}
        <p class="text-base-content/60 text-sm">No tasks yet.</p>
      {/if}

      {#if addingTask}
        <form
          method="POST"
          action="?/addTask"
          use:enhance={closeOnSuccess(() => (addingTask = false))}
          class="mt-1 flex flex-wrap items-end gap-2"
        >
          <fieldset class="fieldset flex-1">
            <legend class="fieldset-legend text-xs">Task</legend>
            <input
              name="title"
              aria-invalid={err.aria("title")}
              class={`input input-sm w-full ${err.input("title")}`}
              placeholder="What needs doing"
              required
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend text-xs">Assignee</legend>
            <select name="assignee_id" class="select select-sm">
              <option value="">Unassigned</option>
              {#each data.people as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend text-xs">Due</legend>
            <input type="date" name="due_date" class="input input-sm" />
          </fieldset>
          <button class="btn btn-primary btn-sm">Add</button>
        </form>
      {/if}
    </div>
  </div>

  {#if data.mayWrite}
    <div class="mt-6">
      {#if !editFormOpen}
        <button
          class="btn btn-primary btn-sm"
          onclick={() => (editFormOpen = true)}
        >
          <span class="iconify lucide--plus size-4"></span>
          Add an update
        </button>
      {:else}
        <div class="card border-primary/30 bg-base-100 border shadow">
          <div class="card-body gap-4 p-4">
            <div class="flex items-center justify-between">
              <h2 class="font-medium">Edit ticket</h2>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                onclick={() => (editFormOpen = false)}>Cancel</button
              >
            </div>
            <form
              method="POST"
              action="?/saveTicket"
              use:enhance={closeOnSuccess(() => (editFormOpen = false))}
              class="grid gap-4"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <fieldset class="fieldset sm:col-span-2">
                  <legend class="fieldset-legend text-xs">Subject</legend>
                  <input
                    name="title"
                    value={data.ticket.title}
                    aria-invalid={err.aria("title")}
                    class={`input input-sm w-full ${err.input("title")}`}
                    maxlength="255"
                    required
                  />
                </fieldset>
                <fieldset class="fieldset">
                  <legend class="fieldset-legend text-xs">Status</legend>
                  <select
                    name="status"
                    class={`select select-sm w-full ${err.select("status")}`}
                  >
                    {#each data.statuses as s (s)}
                      <option value={s} selected={s === data.ticket.status}
                        >{s.replace(/_/g, " ")}</option
                      >
                    {/each}
                  </select>
                </fieldset>
                <fieldset class="fieldset">
                  <legend class="fieldset-legend text-xs">Due date</legend>
                  <input
                    type="date"
                    name="due_date"
                    value={data.ticket.due_date}
                    aria-invalid={err.aria("due_date")}
                    class={`input input-sm w-full ${err.input("due_date")}`}
                    required
                  />
                </fieldset>
                <fieldset class="fieldset sm:col-span-2">
                  <legend class="fieldset-legend text-xs">Parent ticket</legend>
                  <select name="parent_id" class="select select-sm w-full">
                    <option value="">None</option>
                    {#each parentOptions as t (t.id)}
                      <option
                        value={t.id}
                        selected={t.id === data.ticket.parent_ticket_id}
                        >{t.ticket_number} — {t.title}</option
                      >
                    {/each}
                  </select>
                </fieldset>
                <fieldset class="fieldset sm:col-span-2">
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
                {#if data.mayManageAssignees}
                  <fieldset class="fieldset">
                    <legend class="fieldset-legend text-xs">Assignees</legend>
                    <div
                      class="max-h-40 overflow-y-auto rounded-box border border-base-300 p-2"
                    >
                      {#each data.people as p (p.id)}
                        <label
                          class="flex cursor-pointer items-center gap-2 py-1"
                        >
                          <input
                            type="checkbox"
                            name="assignee_ids"
                            value={p.id}
                            class="checkbox checkbox-sm"
                            checked={data.ticket.assignees.some(
                              (a) => a.employee_id === p.id,
                            )}
                          />
                          <span class="text-sm">{p.name}</span>
                        </label>
                      {/each}
                    </div>
                  </fieldset>
                {/if}
                <fieldset class="fieldset">
                  <legend class="fieldset-legend text-xs">Subscribers</legend>
                  <div
                    class="max-h-40 overflow-y-auto rounded-box border border-base-300 p-2"
                  >
                    {#each data.people as p (p.id)}
                      <label
                        class="flex cursor-pointer items-center gap-2 py-1"
                      >
                        <input
                          type="checkbox"
                          name="subscriber_ids"
                          value={p.id}
                          class="checkbox checkbox-sm"
                          checked={data.ticket.subscribers.some(
                            (s) => s.employee_id === p.id,
                          )}
                        />
                        <span class="text-sm">{p.name}</span>
                      </label>
                    {/each}
                  </div>
                  <p class="text-base-content/60 text-xs">
                    Also grants visibility, if not already a default viewer.
                  </p>
                </fieldset>
                <fieldset class="fieldset sm:col-span-2">
                  <legend class="fieldset-legend text-xs">Linked tickets</legend
                  >
                  <div
                    class="max-h-40 overflow-y-auto rounded-box border border-base-300 p-2"
                  >
                    {#each linkOptions as t (t.id)}
                      <label
                        class="flex cursor-pointer items-center gap-2 py-1"
                      >
                        <input
                          type="checkbox"
                          name="linked_ticket_ids"
                          value={t.id}
                          class="checkbox checkbox-sm"
                          checked={linkedIds.has(t.id)}
                        />
                        <span class="text-sm"
                          >{t.ticket_number} — {t.title}</span
                        >
                      </label>
                    {/each}
                  </div>
                </fieldset>
              </div>

              <div class="divider my-0 text-xs">Post an update (optional)</div>

              <fieldset class="fieldset">
                <RichTextEditor
                  name="content"
                  placeholder="Write an update — leave blank to save the fields above without commenting"
                  invalid={err.has("content")}
                />
              </fieldset>
              <div class="flex items-center gap-3">
                <select
                  name="visibility"
                  aria-invalid={err.aria("visibility")}
                  class={`select select-sm ${err.select("visibility")}`}
                >
                  <option value="external"
                    >External — the client sees this</option
                  >
                  <option value="internal">Internal — staff only</option>
                </select>
                <button type="submit" class="btn btn-primary btn-sm"
                  >Save</button
                >
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  onclick={() => (editFormOpen = false)}>Cancel</button
                >
              </div>
            </form>
          </div>
        </div>
      {/if}
    </div>
  {/if}

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
