<script lang="ts">
  import { enhance } from "$app/forms"
  import { invalidateAll } from "$app/navigation"
  import { instant } from "$lib/format"
  import { fieldErrors } from "$lib/form-errors"
  import type { MessageRow } from "$lib/server/team-chat/team-chat.repo"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))

  const fmt = $derived({
    locale: data.tenant?.default_locale ?? "en-US",
    currency: "",
    timezone: data.timezone,
  })

  const title = $derived(
    data.conversation.kind === "channel"
      ? `#${data.conversation.name}`
      : data.members
          .filter((m) => m.employee_id !== data.myEmployeeId)
          .map((m) => m.employee_name)
          .join(", ") || "(just you)",
  )

  // Messages start from `data.messages` (server load) and grow client-side as
  // more history loads or new ones arrive — an $effect re-seeds it whenever
  // the underlying conversation changes (a real prop change), never a $state
  // initializer, which would freeze at the first conversation visited.
  let messages = $state<MessageRow[]>([])
  let oldestLoaded = $state<string | null>(null)
  let hasMore = $state(true)
  $effect(() => {
    messages = data.messages
    hasMore = data.messages.length >= data.pageSize
    oldestLoaded = data.messages[0]?.id ?? null
  })

  let editingId = $state<string | null>(null)
  let scrollEl: HTMLDivElement | undefined

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/)
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
  }

  function applyOlder(older: MessageRow[]) {
    hasMore = older.length >= data.pageSize
    oldestLoaded = older[0]?.id ?? oldestLoaded
    messages = [...older, ...messages]
  }

  // Mark-read is a side effect on something outside Svelte's own state (the
  // server's last_read_at cursor) — an $effect, never folded into load().
  // invalidateAll() afterward is what clears the sidebar's own unread badge,
  // whose data comes from the LAYOUT's load(), not this page's — but
  // invalidateAll() itself replaces `data` with a new object, and this
  // effect reads `data.conversation.id`, so without the guard below it
  // reruns on its own invalidation and POSTs markRead forever. `markedFor`
  // makes it fire once per conversation actually switched to, not once per
  // data refresh.
  let markedFor = $state<string | null>(null)
  $effect(() => {
    const id = data.conversation.id
    if (markedFor === id) return
    markedFor = id
    fetch(`/chat/${id}?/markRead`, {
      method: "POST",
      body: new FormData(),
    }).then(() => invalidateAll())
  })

  async function backfill(): Promise<void> {
    const id = data.conversation.id
    const last = messages[messages.length - 1]?.id
    if (!last) return
    const res = await fetch(`/chat/${id}/messages?after=${last}`)
    if (!res.ok) return
    const { messages: fresh } = await res.json()
    if (fresh.length) messages = [...messages, ...fresh]
  }

  // Safety-net poll (§5): backfills anything a dead/absent realtime relay
  // missed. Independent of whether SSE below is even connected — this
  // alone already satisfies the spec's own correctness floor.
  $effect(() => {
    const interval = setInterval(backfill, 45_000)
    return () => clearInterval(interval)
  })

  // Realtime nudge (§5): a pointer-only SSE frame just means "go check
  // now" — the actual content still comes back through backfill()'s own
  // authenticated, RLS-protected fetch, same as the poll above. A frame for
  // a different conversation (the stream covers every conversation this
  // employee belongs to) is ignored here; that conversation's own page, if
  // open in another tab, has its own stream connection to react to it.
  $effect(() => {
    const id = data.conversation.id
    const source = new EventSource("/chat/stream")
    // The browser's own EventSource reconnects on drop with no help needed
    // here — but a NOTIFY sent during the gap is simply lost (Postgres
    // doesn't queue it), so every successful (re)connection backfills once,
    // the same guarantee §5 requires.
    source.addEventListener("open", () => void backfill())
    source.addEventListener("message", (event) => {
      const frame = JSON.parse(event.data) as { conversationId: string }
      if (frame.conversationId === id) void backfill()
    })
    return () => source.close()
  })
</script>

<div class="card bg-base-100 flex h-full min-h-0 flex-col shadow">
  <div
    class="border-base-300 flex items-center justify-between border-b px-4 py-3"
  >
    <div>
      <div class="font-medium">{title}</div>
      {#if data.conversation.topic}
        <div class="text-base-content/60 text-sm">
          {data.conversation.topic}
        </div>
      {/if}
    </div>
    {#if data.conversation.kind === "channel"}
      <div class="flex gap-2">
        {#if data.myRole === "owner"}
          <form method="POST" action="?/archive" use:enhance>
            <button type="submit" class="btn btn-ghost btn-sm"
              >Archive channel</button
            >
          </form>
        {/if}
        {#if data.myRole}
          <form method="POST" action="?/leave" use:enhance>
            <button type="submit" class="btn btn-ghost btn-sm">Leave</button>
          </form>
        {/if}
      </div>
    {/if}
  </div>

  <div
    bind:this={scrollEl}
    class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
  >
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
      <div class="group flex gap-3">
        <div class="avatar avatar-placeholder shrink-0">
          <div class="bg-neutral text-neutral-content w-8 rounded-full">
            <span class="text-xs">{initials(m.author_name)}</span>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-medium">{m.author_name}</span>
            <span class="text-base-content/50 text-xs"
              >{instant(m.created_at, fmt, "time")}</span
            >
            {#if m.edited_at && !m.deleted_at}
              <span class="text-base-content/40 text-xs">(edited)</span>
            {/if}
          </div>
          {#if m.deleted_at}
            <p class="text-base-content/40 text-sm italic">message deleted</p>
          {:else if editingId === m.id}
            <form
              method="POST"
              action="?/edit"
              use:enhance={() =>
                async ({ result, update }) => {
                  await update({ reset: false })
                  if (result.type === "success") editingId = null
                }}
              class="mt-1 flex gap-2"
            >
              <input type="hidden" name="message_id" value={m.id} />
              <input
                name="body"
                value={m.body}
                maxlength="8000"
                class={`input input-sm flex-1 ${err.input("body")}`}
              />
              <button type="submit" class="btn btn-primary btn-sm">Save</button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onclick={() => (editingId = null)}>Cancel</button
              >
            </form>
          {:else}
            <p class="text-sm whitespace-pre-wrap">{m.body}</p>
          {/if}
        </div>
        {#if !m.deleted_at && m.author_employee_id === data.myEmployeeId && editingId !== m.id}
          <div class="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              aria-label="Edit message"
              onclick={() => (editingId = m.id)}
            >
              <span class="iconify lucide--pencil size-3.5"></span>
            </button>
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="message_id" value={m.id} />
              <button
                type="submit"
                class="btn btn-ghost btn-xs"
                aria-label="Delete message"
              >
                <span class="iconify lucide--trash-2 size-3.5"></span>
              </button>
            </form>
          </div>
        {/if}
      </div>
    {/each}

    {#if messages.length === 0}
      <p class="text-base-content/50 text-center text-sm">
        No messages yet — say hello.
      </p>
    {/if}
  </div>

  <div class="border-base-300 border-t p-3">
    <form
      method="POST"
      action="?/send"
      use:enhance={() =>
        async ({ result, update }) => {
          // Clear the composer on success; keep what was typed on a refusal
          // (L68) — the default `reset: true` would do the opposite of both.
          await update({ reset: result.type === "success" })
        }}
      class="flex gap-2"
    >
      <input
        name="body"
        required
        maxlength="8000"
        placeholder="Message..."
        aria-invalid={err.aria("body")}
        class={`input flex-1 ${err.input("body")}`}
      />
      <button type="submit" class="btn btn-primary">Send</button>
    </form>
    {#if form?.message}<p class="text-error mt-1 text-sm">
        {form.message}
      </p>{/if}
  </div>
</div>
