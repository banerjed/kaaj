<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { ticketStatusTone as statusTone } from "$lib/components/status-tone"

  let { data } = $props()
</script>

<PageHead title="Tickets" />

<div class="p-4 lg:p-6">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-2xl">Tickets</h1>
    <a href="/portal/tickets/new" class="btn btn-primary btn-sm">New ticket</a>
  </div>

  {#if data.tickets.length === 0}
    <p class="text-base-content/70 mt-4 text-sm">
      Nothing yet — raise a ticket if you need anything.
    </p>
  {:else}
    <div class="mt-4 grid gap-2">
      {#each data.tickets as t (t.id)}
        <a
          href="/portal/tickets/{t.id}"
          class="card bg-base-100 shadow hover:shadow-md"
        >
          <div
            class="card-body flex-row items-center justify-between gap-2 p-4"
          >
            <div>
              <p class="font-medium">{t.title}</p>
              <p class="text-base-content/70 text-xs">{t.ticket_number}</p>
            </div>
            <StatusBadge tone={statusTone(t.status)}>
              {t.status.replace(/_/g, " ")}
            </StatusBadge>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
