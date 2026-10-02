<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import Pagination from "$lib/components/Pagination.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import Combobox from "$lib/components/Combobox.svelte"
  import { fieldErrors } from "$lib/form-errors"
  import { closeOnSuccess } from "$lib/form-enhance"
  import { actionSearch } from "$lib/action-search"
  import { instant } from "$lib/format"
  import { enhance } from "$app/forms"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const fmt = $derived({
    locale: data.tenant?.default_locale ?? "en-US",
    currency: "",
    timezone: data.tenant?.default_timezone ?? "UTC",
  })

  let composing = $state(false)
  // The composer's own channel: it decides which endpoints are offered and
  // which contacts the picker searches, so it is local state, not a
  // derived of the page's filter.
  let composeChannel = $state<"sms" | "email">("sms")
  let composeHasContact = $state(false)

  const composeEndpoints = $derived(
    data.endpoints.filter((e) => e.channel === composeChannel),
  )

  function hrefFor(page: number): string {
    const q = new URLSearchParams()
    if (data.filters.channel) q.set("channel", data.filters.channel)
    if (data.filters.status) q.set("status", data.filters.status)
    if (data.filters.unreadOnly) q.set("unread", "on")
    q.set("page", String(page))
    return `/messaging?${q}`
  }

  // The picker searches contacts reachable on the composer's CURRENT
  // channel, read at call time rather than captured once.
  const searchContacts = actionSearch("searchContacts", () => ({
    channel: composeChannel,
  }))

  const statusTone = (s: string) => (s === "open" ? "progress" : "neutral")
</script>

<PageHead title="Messaging" />

<div class="p-4 lg:p-6">
  <PageTitle title="Messaging" items={[{ label: "Messaging", active: true }]} />
  <p class="text-base-content/70 mt-1 text-sm">
    SMS and email with customers and anyone else outside the firm. Every thread
    here is one number or address on your side and one on theirs.
  </p>

  {#if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap items-end justify-between gap-3">
    <form method="GET" class="flex flex-wrap items-end gap-2">
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Channel</legend>
        <select name="channel" class="select select-sm">
          <option value="">All</option>
          {#each data.channels as c (c)}
            <option value={c} selected={data.filters.channel === c}>
              {c === "sms" ? "SMS" : "Email"}
            </option>
          {/each}
        </select>
      </fieldset>
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Status</legend>
        <select name="status" class="select select-sm">
          <option value="">All</option>
          {#each data.statuses as s (s)}
            <option value={s} selected={data.filters.status === s}>{s}</option>
          {/each}
        </select>
      </fieldset>
      <label class="label cursor-pointer gap-2 pb-2">
        <input
          type="checkbox"
          name="unread"
          class="checkbox checkbox-sm"
          checked={data.filters.unreadOnly}
        />
        <span class="label-text">Unread only</span>
      </label>
      <button type="submit" class="btn btn-sm">Filter</button>
    </form>

    {#if data.mayWrite}
      <button
        class="btn btn-primary btn-sm gap-2"
        onclick={() => (composing = true)}
        disabled={data.endpoints.length === 0}
        title={data.endpoints.length === 0
          ? "Set up a number or address under Settings → Messaging first"
          : undefined}
      >
        <span class="iconify lucide--pen-line size-4"></span>
        New message
      </button>
    {/if}
  </div>

  {#if data.conversations.length === 0}
    <EmptyState
      icon="lucide--inbox"
      title="No conversations"
      message={data.endpoints.length === 0
        ? "Nothing can arrive yet: add a number or an inbound email address under Settings → Messaging."
        : "Nothing matches these filters. Messages people send to your numbers and addresses appear here."}
    />
  {:else}
    <div class="card bg-base-100 mt-4 shadow">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th class="w-20">Channel</th>
              <th>With</th>
              <th>Subject</th>
              <th>Last activity</th>
              <th class="w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.conversations as c (c.id)}
              <tr class="hover:bg-base-200/40" class:font-medium={c.has_unread}>
                <td>
                  <StatusBadge tone="neutral" capitalize={false}
                    >{c.channel === "sms" ? "SMS" : "Email"}</StatusBadge
                  >
                </td>
                <td>
                  <a href={`/messaging/${c.id}`} class="link link-hover">
                    {#if c.has_unread}
                      <span
                        class="bg-primary mr-1 inline-block size-2 rounded-full"
                        aria-label="Unread"
                      ></span>
                    {/if}
                    {c.counterparty_name ?? c.counterparty_address}
                  </a>
                  <div class="text-base-content/70 text-xs font-normal">
                    {c.counterparty_address}{c.customer_name
                      ? ` · ${c.customer_name}`
                      : ""}
                  </div>
                </td>
                <td class="text-sm">{c.subject ?? "—"}</td>
                <td class="text-sm">
                  {instant(c.last_message_at, fmt)}
                  <div class="text-base-content/70 text-xs font-normal">
                    {c.last_direction === "inbound"
                      ? "They wrote"
                      : "You wrote"}
                  </div>
                </td>
                <td
                  ><StatusBadge tone={statusTone(c.status)}
                    >{c.status}</StatusBadge
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        atLeast={data.total >= data.countCap}
        {hrefFor}
      />
    </div>
  {/if}
</div>

{#if composing}
  <div class="modal modal-open" role="dialog" aria-label="New message">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">New message</h3>

      <form
        method="POST"
        action="?/compose"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (composing = false))}
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Channel</legend>
            <select
              name="channel"
              class="select w-full"
              bind:value={composeChannel}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Send from</legend>
            <select
              name="endpoint_id"
              aria-invalid={err.aria("endpoint_id")}
              class={`select w-full ${err.select("endpoint_id")}`}
              required
            >
              {#each composeEndpoints as e (e.id)}
                <option value={e.id}>{e.label} · {e.address}</option>
              {/each}
            </select>
          </fieldset>
        </div>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">To (a contact)</legend>
          {#key composeChannel}
            <Combobox
              name="contact_id"
              search={searchContacts}
              placeholder="Search contacts…"
              invalid={err.has("contact_id")}
              onchange={(picked) => (composeHasContact = picked.length > 0)}
            />
          {/key}
        </fieldset>

        {#if !composeHasContact}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">
              {composeChannel === "sms"
                ? "Or a number (+country code)"
                : "Or an email address"}
            </legend>
            <input
              name="address"
              aria-invalid={err.aria("address")}
              class={`input w-full ${err.input("address")}`}
              placeholder={composeChannel === "sms"
                ? "+1 212 555 0100"
                : "name@example.com"}
              inputmode={composeChannel === "sms" ? "tel" : "email"}
            />
          </fieldset>
        {/if}

        {#if composeChannel === "email"}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Subject</legend>
            <input
              name="subject"
              aria-invalid={err.aria("subject")}
              class={`input w-full ${err.input("subject")}`}
              required
            />
          </fieldset>
        {/if}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Message</legend>
          <textarea
            name="body"
            rows={composeChannel === "sms" ? 3 : 8}
            maxlength={composeChannel === "sms" ? 1600 : 20000}
            aria-invalid={err.aria("body")}
            class={`textarea w-full ${err.textarea("body")}`}
            required
          ></textarea>
        </fieldset>

        {#if form?.message}
          <p class="text-error text-sm">{form.message}</p>
        {/if}

        <ModalActions onCancel={() => (composing = false)} submitLabel="Send" />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (composing = false)}
    ></button>
  </div>
{/if}
