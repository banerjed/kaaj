<script lang="ts">
  import { page } from "$app/state"
  import { enhance } from "$app/forms"
  import { goto } from "$app/navigation"
  import PageHead from "$lib/components/PageHead.svelte"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import { fieldErrors, type FormResult } from "$lib/form-errors"
  import type { SubmitFunction } from "@sveltejs/kit"
  import Combobox from "$lib/components/Combobox.svelte"
  import { actionSearch } from "$lib/action-search"

  let { data, children } = $props()
  // The layout serves every /chat/* page, so it names /chat's own action.
  const searchPeople = actionSearch("/chat?/searchPeople")
  const searchChannels = actionSearch("/chat?/searchChannels")
  const searchConversations = actionSearch("/chat?/searchConversations")

  let creatingChannel = $state(false)
  let startingDm = $state(false)
  let browsing = $state(false)

  const activeId = $derived(page.params.conversationId ?? null)
  const dms = $derived(data.conversations.filter((c) => c.kind === "dm"))
  const channels = $derived(
    data.conversations.filter((c) => c.kind === "channel"),
  )

  // A modal hosted in a LAYOUT has no ambient `form` prop (only a `+page.svelte`
  // gets one) — capture the enhance result locally instead of relying on one.
  function captureAndClose(
    close: () => void,
    formState: (v: FormResult) => void,
  ): SubmitFunction {
    return () =>
      async ({ result, update }) => {
        if (result.type === "failure") formState(result.data as FormResult)
        else formState(null)
        await update({ reset: false })
        if (result.type === "success" || result.type === "redirect") close()
      }
  }

  let createForm = $state<FormResult>(null)
  const createErr = $derived(fieldErrors(createForm))
  let dmForm = $state<FormResult>(null)
  const dmErr = $derived(fieldErrors(dmForm))
</script>

<PageHead title="Chat" />

<div
  class="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]"
>
  <aside class="card bg-base-100 flex h-full min-h-0 flex-col shadow">
    <div
      class="card-body flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4"
    >
      <PageTitle title="Chat" />

      {#if data.conversationTotal > data.conversations.length}
        <!-- The sidebar holds the most recent conversations; the rest are a
             search away, never an unbounded list. -->
        <div>
          <Combobox
            name="find_conversation"
            search={searchConversations}
            placeholder="Find a conversation…"
            emptyText="No matching conversation"
            onchange={(picked) => {
              if (picked[0]) goto(`/chat/${picked[0].id}`)
            }}
          />
          <p class="text-base-content/60 mt-1 px-1 text-xs">
            The {data.conversations.length} most recent of {data.conversationTotal}
          </p>
        </div>
      {/if}

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div>
          <div class="flex items-center justify-between px-1">
            <h2
              class="text-base-content/60 text-xs font-semibold tracking-wide uppercase"
            >
              Direct Messages
            </h2>
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle"
              aria-label="New direct message"
              onclick={() => (startingDm = true)}
            >
              <span class="iconify lucide--plus size-4"></span>
            </button>
          </div>
          <ul class="menu w-full p-0">
            {#each dms as c (c.id)}
              <li>
                <a href={`/chat/${c.id}`} class:menu-active={c.id === activeId}>
                  <span class="truncate"
                    >{c.other_member_names ?? "(just you)"}</span
                  >
                  {#if c.unread_count > 0}
                    <span class="badge badge-primary badge-sm"
                      >{c.unread_count}</span
                    >
                  {/if}
                </a>
              </li>
            {/each}
            {#if dms.length === 0}
              <li class="text-base-content/50 px-3 py-1 text-sm">
                No direct messages yet
              </li>
            {/if}
          </ul>
        </div>

        <div>
          <div class="flex items-center justify-between px-1">
            <h2
              class="text-base-content/60 text-xs font-semibold tracking-wide uppercase"
            >
              Channels
            </h2>
            <div class="flex gap-1">
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle"
                aria-label="Browse channels"
                onclick={() => (browsing = true)}
              >
                <span class="iconify lucide--compass size-4"></span>
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle"
                aria-label="New channel"
                onclick={() => (creatingChannel = true)}
              >
                <span class="iconify lucide--plus size-4"></span>
              </button>
            </div>
          </div>
          <ul class="menu w-full p-0">
            {#each channels as c (c.id)}
              <li>
                <a href={`/chat/${c.id}`} class:menu-active={c.id === activeId}>
                  <span class="truncate">#{c.name}</span>
                  {#if c.unread_count > 0}
                    <span class="badge badge-primary badge-sm"
                      >{c.unread_count}</span
                    >
                  {/if}
                </a>
              </li>
            {/each}
            {#if channels.length === 0}
              <li class="text-base-content/50 px-3 py-1 text-sm">
                No channels yet
              </li>
            {/if}
          </ul>
        </div>
      </div>
    </div>
  </aside>

  <section class="min-h-0">
    {@render children()}
  </section>
</div>

{#if creatingChannel}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New channel</h3>
      <form
        method="POST"
        action="/chat?/createChannel"
        use:enhance={captureAndClose(
          () => (creatingChannel = false),
          (v) => (createForm = v),
        )}
        class="mt-4 flex flex-col gap-4"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="name"
            required
            maxlength="80"
            aria-invalid={createErr.aria("name")}
            class={`input w-full ${createErr.input("name")}`}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Topic</legend>
          <input
            name="topic"
            maxlength="500"
            aria-invalid={createErr.aria("topic")}
            class={`input w-full ${createErr.input("topic")}`}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Visibility</legend>
          <select name="visibility" class="select w-full">
            <option value="public">Public — anyone can browse and join</option>
            <option value="private">Private — invite only</option>
          </select>
        </fieldset>
        {#if createForm?.message}<p class="text-error text-sm">
            {createForm.message}
          </p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (creatingChannel = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creatingChannel = false)}
    ></button>
  </dialog>
{/if}

{#if startingDm}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New direct message</h3>
      <form
        method="POST"
        action="/chat?/startDm"
        use:enhance={captureAndClose(
          () => (startingDm = false),
          (v) => (dmForm = v),
        )}
        class="mt-4 flex flex-col gap-4"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">To</legend>
          <Combobox
            name="employee_id"
            search={searchPeople}
            invalid={!!dmErr.aria("employee_id")}
            placeholder="Pick someone"
            emptyText="No matching person"
          />
        </fieldset>
        {#if dmForm?.message}<p class="text-error text-sm">
            {dmForm.message}
          </p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (startingDm = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Start</button>
        </div>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (startingDm = false)}
    ></button>
  </dialog>
{/if}

{#if browsing}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Browse public channels</h3>
      <form
        method="POST"
        action="/chat?/joinChannel"
        class="mt-4 flex items-end gap-2"
        use:enhance={captureAndClose(
          () => (browsing = false),
          () => {},
        )}
      >
        <div class="grow">
          <Combobox
            name="conversation_id"
            search={searchChannels}
            placeholder="Search public channels…"
            emptyText="No public channel to join matches"
          />
        </div>
        <button type="submit" class="btn btn-sm btn-primary">Join</button>
      </form>
      <div class="modal-action">
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (browsing = false)}>Close</button
        >
      </div>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (browsing = false)}
    ></button>
  </dialog>
{/if}
