<script module lang="ts">
  export type ComboboxOption = {
    id: string
    label: string
    sublabel?: string
  }
</script>

<script lang="ts">
  /**
   * A searchable picker that posts plain form fields — `multiple` renders one
   * hidden `<input>` per selection (so `formList`/`idList` on the server need
   * no changes), single mode renders one. Two search modes: `options` filters
   * a small list client-side (people pickers, a dozen rows); `search` calls a
   * server action for anything that can run past what a picker should ever
   * inline (tickets — a business area alone can run to thousands), debounced
   * and race-guarded so a slow response for an old keystroke can't clobber a
   * newer one.
   *
   * Full `role="combobox"` keyboard support — arrow keys, Enter, Escape,
   * Backspace-to-remove-last-chip — a picker no keyboard can reach is exactly
   * the silent-failure class docs/10-lessons-learned.md tracks.
   */
  let {
    name,
    multiple = false,
    options,
    search,
    selected = [],
    placeholder = "Search…",
    emptyText = "No matches",
    invalid = false,
    disabled = false,
    max,
    form,
  }: {
    name: string
    multiple?: boolean
    options?: ComboboxOption[]
    search?: (query: string) => Promise<ComboboxOption[]>
    selected?: ComboboxOption[]
    placeholder?: string
    emptyText?: string
    invalid?: boolean
    disabled?: boolean
    /** Multi-select only: refuses another pick once reached (BR: linked tickets cap at 20). */
    max?: number
    /** Associates the hidden inputs with a `<form>` elsewhere in the DOM — for a picker that lives outside the form it submits with (native `form` attribute, same mechanism as `<button form="...">`). */
    form?: string
  } = $props()

  // Seeded once from the prop, then a locally-owned list — same shape as
  // RichTextEditor's `html`, which does the same for the same reason: the
  // parent's `data.ticket.*` doesn't change shape as the user picks.
  // svelte-ignore state_referenced_locally
  let selectedItems = $state<ComboboxOption[]>([...selected])
  let query = $state("")
  let open = $state(false)
  let activeIndex = $state(-1)
  let results = $state<ComboboxOption[]>([])
  let loading = $state(false)
  let inputEl: HTMLInputElement | undefined = $state()
  let rootEl: HTMLDivElement | undefined = $state()

  const listboxId = $derived(`combobox-listbox-${name}`)
  const atMax = $derived(
    multiple && max !== undefined && selectedItems.length >= max,
  )

  function isSelected(id: string): boolean {
    return selectedItems.some((s) => s.id === id)
  }

  let searchToken = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  async function runSearch(q: string) {
    if (options) {
      const needle = q.trim().toLowerCase()
      results = options
        .filter((o) => !isSelected(o.id))
        .filter(
          (o) =>
            needle === "" ||
            o.label.toLowerCase().includes(needle) ||
            o.sublabel?.toLowerCase().includes(needle),
        )
        .slice(0, 50)
      return
    }
    if (!search) return
    const token = ++searchToken
    loading = true
    try {
      const rows = await search(q)
      if (token !== searchToken) return // superseded by a newer keystroke
      results = rows.filter((o) => !isSelected(o.id))
    } finally {
      if (token === searchToken) loading = false
    }
  }

  function onInput() {
    open = true
    activeIndex = -1
    if (debounceTimer) clearTimeout(debounceTimer)
    if (options) {
      runSearch(query)
    } else {
      debounceTimer = setTimeout(() => runSearch(query), 300)
    }
  }

  function focusOpen() {
    open = true
    if (results.length === 0 && !loading) runSearch(query)
  }

  function choose(opt: ComboboxOption) {
    if (multiple) {
      if (atMax) return
      selectedItems = [...selectedItems, opt]
      query = ""
    } else {
      selectedItems = [opt]
      query = opt.label
      open = false
    }
    results = results.filter((r) => r.id !== opt.id)
    activeIndex = -1
    inputEl?.focus()
  }

  function remove(id: string) {
    selectedItems = selectedItems.filter((s) => s.id !== id)
    if (!multiple) query = ""
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) focusOpen()
      activeIndex = Math.min(activeIndex + 1, results.length - 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault()
        choose(results[activeIndex])
      }
    } else if (e.key === "Escape") {
      open = false
      activeIndex = -1
    } else if (
      e.key === "Backspace" &&
      query === "" &&
      multiple &&
      selectedItems.length > 0
    ) {
      remove(selectedItems[selectedItems.length - 1].id)
    }
  }

  function onDocumentClick(e: MouseEvent) {
    if (rootEl && !rootEl.contains(e.target as Node)) {
      open = false
      if (!multiple) query = selectedItems[0]?.label ?? ""
    }
  }

  $effect(() => {
    if (!open) return
    document.addEventListener("click", onDocumentClick)
    return () => document.removeEventListener("click", onDocumentClick)
  })

  // Single-select shows the chosen label in the text box itself rather than
  // a chip — seed it once, the same "own copy after this" shape as `html`.
  // svelte-ignore state_referenced_locally
  if (!multiple) query = selectedItems[0]?.label ?? ""
</script>

<div class="relative" bind:this={rootEl}>
  {#if multiple}
    {#each selectedItems as item (item.id)}
      <input type="hidden" {name} {form} value={item.id} />
    {/each}
  {:else}
    <input type="hidden" {name} {form} value={selectedItems[0]?.id ?? ""} />
  {/if}

  <!-- Forwards focus to the real combobox <input> inside it — never
       independently interactive. Chips wrap onto their own lines as they
       accumulate, so the input can end up on a later line with visually
       "empty" space above it (after the last chip, before the wrap) that
       belongs to this div; without this, a click there does nothing, which
       reads as "the picker is broken". -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class={`input w-full min-w-0 flex-wrap items-center gap-1 ${multiple ? "h-auto min-h-10 py-1.5" : ""} ${invalid ? "input-error" : ""}`}
    onclick={() => inputEl?.focus()}
  >
    {#if multiple}
      {#each selectedItems as item (item.id)}
        <span class="badge badge-outline badge-sm gap-1">
          {item.label}
          <button
            type="button"
            class="hover:text-error"
            aria-label={`Remove ${item.label}`}
            {disabled}
            onclick={() => remove(item.id)}
          >
            <span class="iconify lucide--x size-3"></span>
          </button>
        </span>
      {/each}
    {/if}
    <input
      bind:this={inputEl}
      type="text"
      class="min-w-24 grow border-none bg-transparent p-0 text-sm outline-none focus:outline-none"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0
        ? `${listboxId}-${activeIndex}`
        : undefined}
      autocomplete="off"
      {disabled}
      placeholder={multiple && selectedItems.length > 0 ? "" : placeholder}
      bind:value={query}
      oninput={onInput}
      onfocus={focusOpen}
      onkeydown={onKeydown}
    />
  </div>

  {#if open && !disabled}
    <ul
      id={listboxId}
      role="listbox"
      class="menu bg-base-100 rounded-box border-base-300 absolute z-10 mt-1 max-h-60 w-full flex-nowrap overflow-y-auto border p-1 shadow-lg"
    >
      {#if atMax}
        <li class="text-base-content/60 px-2 py-1.5 text-xs">
          Maximum of {max} reached.
        </li>
      {:else if loading}
        <li class="text-base-content/60 px-2 py-1.5 text-sm">Searching…</li>
      {:else if results.length === 0}
        <li class="text-base-content/60 px-2 py-1.5 text-sm">{emptyText}</li>
      {:else}
        {#each results as opt, i (opt.id)}
          <li
            id={`${listboxId}-${i}`}
            role="option"
            aria-selected={i === activeIndex}
          >
            <button
              type="button"
              class={i === activeIndex ? "active" : ""}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => choose(opt)}
            >
              <span class="text-sm">{opt.label}</span>
              {#if opt.sublabel}
                <span class="text-base-content/60 text-xs">{opt.sublabel}</span>
              {/if}
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
