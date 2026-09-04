<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { instant } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { ticketStatusTone as statusTone } from "$lib/components/status-tone"

  let { data, form } = $props()

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

  {#if form?.posted}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Update posted.</span>
    </div>
  {:else if form?.statusChanged}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Status changed from {form.from} to {form.to}.</span>
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
        <div>
          <p class="font-medium">{data.ticket.title}</p>
          <p class="text-base-content/70 text-sm">
            {data.ticket.business_area_name}
            {#if data.ticket.customer_name}
              · {data.ticket.customer_name}
            {/if}
            · reported by {data.ticket.reported_by_name ?? "—"}
          </p>
        </div>
        <StatusBadge tone={statusTone(data.ticket.status)}>
          {data.ticket.status.replace(/_/g, " ")}
        </StatusBadge>
      </div>
      <p class="text-sm">{data.ticket.description}</p>

      {#if data.mayWrite}
        <form
          method="POST"
          action="?/setStatus"
          use:enhance
          class="flex items-center gap-2"
        >
          <select name="status" class="select select-sm">
            {#each data.statuses as s (s)}
              <option value={s} selected={s === data.ticket.status}
                >{s.replace(/_/g, " ")}</option
              >
            {/each}
          </select>
          <button class="btn btn-sm">Update status</button>
        </form>
      {/if}
    </div>
  </div>

  <h2 class="mt-6 text-base font-medium">
    Updates
    <span class="badge badge-sm ms-1">{data.updates.length}</span>
  </h2>

  <div class="card bg-base-100 mt-2 shadow">
    <ul class="list">
      {#each data.updates as u (u.id)}
        <li class="list-row">
          <div class="list-col-grow">
            <p class="text-sm">{u.content_text}</p>
            <p class="text-base-content/70 mt-1 text-xs">
              {u.author_name ?? "—"} · {fmt(u.created_at)}
              {#if u.visibility === "internal"}
                <span class="badge badge-ghost badge-sm ms-1">internal</span>
              {/if}
            </p>
          </div>
        </li>
      {:else}
        <li class="list-row">
          <p class="text-base-content/70 text-sm">No updates yet.</p>
        </li>
      {/each}
    </ul>
  </div>

  {#if data.mayWrite}
    <form
      method="POST"
      action="?/addUpdate"
      use:enhance
      class="mt-4 grid gap-3"
    >
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Add an update</legend>
        <textarea
          name="content"
          aria-invalid={err.aria("content")}
          class={`textarea w-full ${err.textarea("content")}`}
          rows="3"
          maxlength="5000"
          required
        ></textarea>
      </fieldset>
      <div class="flex items-center gap-3">
        <select
          name="visibility"
          aria-invalid={err.aria("visibility")}
          class={`select select-sm ${err.select("visibility")}`}
        >
          <option value="external">External — the client sees this</option>
          <option value="internal">Internal — staff only</option>
        </select>
        <button type="submit" class="btn btn-primary btn-sm">Post</button>
      </div>
    </form>
  {/if}
</div>
