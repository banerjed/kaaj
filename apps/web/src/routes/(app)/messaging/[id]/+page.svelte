<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import type { Tone } from "$lib/components/status-tone"
  import { fieldErrors } from "$lib/form-errors"
  import { keepValues } from "$lib/form-enhance"
  import { instant } from "$lib/format"
  import { enhance } from "$app/forms"
  import { invalidateAll } from "$app/navigation"
  import type { MessageRow } from "$lib/server/messaging/messaging.repo"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const fmt = $derived({
    locale: data.tenant?.default_locale ?? "en-US",
    currency: "",
    timezone: data.timezone,
  })

  const title = $derived(
    data.conversation.counterparty_name ??
      data.conversation.counterparty_address,
  )

  // Messages are seeded from load() and grow as earlier pages arrive; an
  // $effect re-seeds on a real data change (a poll, a sent reply), never a
  // $state initializer, which would freeze at the first visit.
  let messages = $state<MessageRow[]>([])
  let oldestLoaded = $state<string | null>(null)
  let hasMore = $state(false)
  $effect(() => {
    messages = data.messages
    hasMore = data.messages.length >= data.pageSize
    oldestLoaded = data.messages[0]?.id ?? null
  })

  function applyOlder(older: MessageRow[]) {
    hasMore = older.length >= data.pageSize
    oldestLoaded = older[0]?.id ?? oldestLoaded
    messages = [...older, ...messages]
  }

  // Opening the thread clears the inbox's unread mark — a server-side
  // cursor, so an $effect, fired once per thread actually switched to and
  // not once per data refresh (L96).
  let markedFor = $state<string | null>(null)
  $effect(() => {
    const id = data.conversation.id
    if (markedFor === id) return
    markedFor = id
    if (data.conversation.has_unread) {
      fetch(`/messaging/${id}?/markRead`, {
        method: "POST",
        body: new FormData(),
      }).then(() => invalidateAll())
    }
  })

  // A reply from the other side arrives through the Bird webhook, not
  // through this tab; a poll is how the open thread learns of it.
  $effect(() => {
    const interval = setInterval(() => void invalidateAll(), 30_000)
    return () => clearInterval(interval)
  })

  const deliveryTone = (s: MessageRow["status"]): Tone =>
    s === "delivered"
      ? "positive"
      : s === "failed"
        ? "critical"
        : s === "accepted" || s === "sent"
          ? "progress"
          : "neutral"
</script>

<PageHead {title} />

<div class="flex h-full min-h-0 flex-col p-4 lg:p-6">
  <PageTitle
    {title}
    items={[
      { label: "Messaging", path: "/messaging" },
      { label: title, active: true },
    ]}
  />

  <div class="card bg-base-100 mt-4 flex min-h-0 flex-1 flex-col shadow">
    <div
      class="border-base-300 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
    >
      <div>
        <div class="flex items-center gap-2">
          <StatusBadge tone="neutral" capitalize={false}
            >{data.conversation.channel === "sms"
              ? "SMS"
              : "Email"}</StatusBadge
          >
          <StatusBadge
            tone={data.conversation.status === "open" ? "progress" : "neutral"}
            >{data.conversation.status}</StatusBadge
          >
          <span class="text-sm font-medium">
            {data.conversation.counterparty_address}
          </span>
        </div>
        <div class="text-base-content/70 mt-1 text-xs">
          {#if data.conversation.customer_name}
            {data.conversation.customer_name} ·
          {/if}
          via {data.conversation.endpoint_label} ({data.conversation
            .endpoint_address})
          {#if data.conversation.subject}
            · {data.conversation.subject}
          {/if}
        </div>
      </div>
      {#if data.mayWrite}
        <form method="POST" action="?/setStatus" use:enhance>
          <input
            type="hidden"
            name="status"
            value={data.conversation.status === "open" ? "closed" : "open"}
          />
          <button type="submit" class="btn btn-ghost btn-sm">
            {data.conversation.status === "open" ? "Close thread" : "Reopen"}
          </button>
        </form>
      {/if}
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {#if hasMore}
        <div class="text-center">
          <form
            method="POST"
            action="?/loadMore"
            use:enhance={() =>
              async ({ result }) => {
                if (result.type === "success" && result.data) {
                  applyOlder((result.data.older as MessageRow[]) ?? [])
                }
              }}
          >
            <input type="hidden" name="before" value={oldestLoaded ?? ""} />
            <button type="submit" class="btn btn-ghost btn-xs"
              >Load earlier messages</button
            >
          </form>
        </div>
      {/if}

      {#each messages as m (m.id)}
        <div class="flex" class:justify-end={m.direction === "outbound"}>
          <div
            class={`max-w-[80%] rounded-box px-4 py-2 ${
              m.direction === "outbound"
                ? "bg-primary text-primary-content"
                : "bg-base-200"
            }`}
          >
            {#if m.subject && data.conversation.channel === "email"}
              <div class="text-sm font-medium">{m.subject}</div>
            {/if}
            <p class="text-sm whitespace-pre-wrap">{m.body_text}</p>
            <div
              class={`mt-1 flex flex-wrap items-center gap-2 text-xs ${
                m.direction === "outbound"
                  ? "text-primary-content/80"
                  : "text-base-content/70"
              }`}
            >
              <span>
                {#if m.direction === "outbound"}
                  {m.author_name ?? "You"} ·
                {/if}
                {instant(m.occurred_at, fmt)}
              </span>
              {#if m.direction === "outbound"}
                <StatusBadge tone={deliveryTone(m.status)}
                  >{m.status}</StatusBadge
                >
                {#if m.status_detail}
                  <span>{m.status_detail}</span>
                {/if}
              {:else if m.spf_pass === false || m.dkim_pass === false}
                <StatusBadge tone="caution">unverified sender</StatusBadge>
              {/if}
            </div>
          </div>
        </div>
      {/each}

      {#if messages.length === 0}
        <p class="text-base-content/70 text-center text-sm">
          No messages in this thread yet.
        </p>
      {/if}
    </div>

    {#if data.mayWrite}
      <div class="border-base-300 border-t p-3">
        <form
          method="POST"
          action="?/reply"
          use:enhance={keepValues}
          class="grid gap-2"
        >
          {#if data.conversation.channel === "email"}
            <input
              name="subject"
              placeholder={data.conversation.subject
                ? `Re: ${data.conversation.subject}`
                : "Subject"}
              aria-invalid={err.aria("subject")}
              class={`input input-sm w-full ${err.input("subject")}`}
            />
          {/if}
          <div class="flex gap-2">
            <textarea
              name="body"
              required
              rows={data.conversation.channel === "sms" ? 2 : 4}
              maxlength={data.conversation.channel === "sms" ? 1600 : 20000}
              placeholder={data.conversation.channel === "sms"
                ? "Text message…"
                : "Reply…"}
              aria-invalid={err.aria("body")}
              class={`textarea flex-1 ${err.textarea("body")}`}
            ></textarea>
            <button type="submit" class="btn btn-primary self-end">Send</button>
          </div>
        </form>
        {#if form?.message}
          <p class="text-error mt-1 text-sm">{form.message}</p>
        {:else if form?.sent}
          <p class="text-success mt-1 text-sm">Sent.</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
