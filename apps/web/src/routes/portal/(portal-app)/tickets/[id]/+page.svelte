<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { enhance } from "$app/forms"
  import { instant } from "$lib/format"
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
  <div class="flex items-baseline justify-between gap-2">
    <h1 class="font-display text-2xl">{data.ticket.title}</h1>
    <StatusBadge tone={statusTone(data.ticket.status)}>
      {data.ticket.status.replace(/_/g, " ")}
    </StatusBadge>
  </div>
  <p class="text-base-content/70 text-sm">{data.ticket.ticket_number}</p>

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="card bg-base-100 mt-4 shadow">
    <div class="card-body p-4">
      <p class="text-sm">
        {data.ticket.external_summary ?? data.ticket.description}
      </p>
    </div>
  </div>

  <div class="mt-4 grid gap-2">
    {#each data.updates as u (u.id)}
      <div class="card bg-base-100 shadow">
        <div class="card-body p-4">
          <p class="text-sm">{u.content_text}</p>
          <p class="text-base-content/70 mt-1 text-xs">
            {u.author_name ?? "—"} · {fmt(u.created_at)}
          </p>
        </div>
      </div>
    {/each}
  </div>

  <form method="POST" action="?/reply" use:enhance class="mt-4 grid gap-3">
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Reply</legend>
      <textarea
        name="content"
        aria-invalid={err.aria("content")}
        class={`textarea w-full ${err.textarea("content")}`}
        rows="3"
        maxlength="5000"
        required
      ></textarea>
    </fieldset>
    <button type="submit" class="btn btn-primary btn-sm self-start">Send</button
    >
  </form>
</div>
