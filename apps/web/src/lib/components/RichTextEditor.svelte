<script lang="ts">
  /**
   * Bold/italic/strikethrough/bulleted/numbered + font-size/color, over a
   * `contenteditable` div — no editor dependency, so the allowlist in
   * `$lib/server/rich-text.ts` is the only thing that has to be kept in sync
   * (duplicated here rather than imported: that file is server-only and
   * SvelteKit refuses a client import of `$lib/server/*`).
   *
   * `execCommand` is formally deprecated but universally supported, and its
   * exact per-browser output doesn't matter — the server sanitizes to a
   * fixed allowlist regardless. `fontSize` is the one exception: browsers
   * only ever apply it via the legacy `<font size>` element even with
   * `styleWithCSS` on, so size is applied by hand-wrapping the selection in
   * a `<span style="font-size:...">` instead.
   */
  let {
    name,
    value = "",
    placeholder = "",
    required = false,
    invalid = false,
  }: {
    name: string
    value?: string
    placeholder?: string
    required?: boolean
    invalid?: boolean
  } = $props()

  const FONT_SIZES = [
    { label: "Small", value: "0.85em" },
    { label: "Normal", value: "1em" },
    { label: "Large", value: "1.25em" },
    { label: "Huge", value: "1.75em" },
  ]

  /**
   * Kept in sync with `$lib/server/rich-text.ts`'s `COLORS` — a fixed
   * palette, not a picker, so the sanitizer's allowlist stays a short, exact
   * list. Complete class strings, never assembled — `bg-[#…]` built from a
   * variable is invisible to Tailwind's static scan (L72's rule, same shape).
   */
  const COLORS = [
    { label: "Blue", value: "#2563eb", swatch: "bg-[#2563eb]" },
    { label: "Black", value: "#000000", swatch: "bg-[#000000]" },
    { label: "Red", value: "#dc2626", swatch: "bg-[#dc2626]" },
    { label: "Brown", value: "#92400e", swatch: "bg-[#92400e]" },
    { label: "Purple", value: "#7e22ce", swatch: "bg-[#7e22ce]" },
    { label: "Orange", value: "#ea580c", swatch: "bg-[#ea580c]" },
  ]

  let editorEl: HTMLDivElement | undefined = $state()
  // Seeds the hidden input once from the initial prop — `html` then tracks
  // the DOM, not `value`, so this deliberately does not stay reactive.
  // svelte-ignore state_referenced_locally
  let html = $state(value)
  let initialized = false

  $effect(() => {
    if (editorEl && !initialized) {
      editorEl.innerHTML = value
      initialized = true
    }
  })

  function syncHidden() {
    if (editorEl) html = editorEl.innerHTML
  }

  function withFocus(fn: () => void) {
    editorEl?.focus()
    fn()
    syncHidden()
  }

  const format = (command: string) =>
    withFocus(() => document.execCommand(command, false))

  const applyColor = (color: string) =>
    withFocus(() => {
      document.execCommand("styleWithCSS", false, "true")
      document.execCommand("foreColor", false, color)
    })

  function applyFontSize(e: Event) {
    const size = (e.currentTarget as HTMLSelectElement).value
    if (!size) return
    editorEl?.focus()
    const sel = document.getSelection()
    if (
      !sel ||
      sel.rangeCount === 0 ||
      sel.isCollapsed ||
      !editorEl?.contains(sel.anchorNode)
    ) {
      return
    }
    const range = sel.getRangeAt(0)
    const span = document.createElement("span")
    span.style.fontSize = size
    try {
      range.surroundContents(span)
    } catch {
      const contents = range.extractContents()
      span.appendChild(contents)
      range.insertNode(span)
    }
    sel.removeAllRanges()
    sel.addRange(range)
    syncHidden()
  }
</script>

<div class="rounded-box border {invalid ? 'border-error' : 'border-base-300'}">
  <div class="border-base-300 flex flex-wrap items-center gap-2 border-b p-1">
    <div class="join">
      <button
        type="button"
        class="btn join-item btn-xs btn-ghost"
        aria-label="Bold"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => format("bold")}
      >
        <span class="iconify lucide--bold size-4"></span>
      </button>
      <button
        type="button"
        class="btn join-item btn-xs btn-ghost"
        aria-label="Italic"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => format("italic")}
      >
        <span class="iconify lucide--italic size-4"></span>
      </button>
      <button
        type="button"
        class="btn join-item btn-xs btn-ghost"
        aria-label="Strikethrough"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => format("strikeThrough")}
      >
        <span class="iconify lucide--strikethrough size-4"></span>
      </button>
      <button
        type="button"
        class="btn join-item btn-xs btn-ghost"
        aria-label="Bulleted list"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => format("insertUnorderedList")}
      >
        <span class="iconify lucide--list size-4"></span>
      </button>
      <button
        type="button"
        class="btn join-item btn-xs btn-ghost"
        aria-label="Numbered list"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => format("insertOrderedList")}
      >
        <span class="iconify lucide--list-ordered size-4"></span>
      </button>
    </div>

    <select
      class="select select-xs w-24"
      aria-label="Font size"
      onmousedown={(e) => e.stopPropagation()}
      onchange={applyFontSize}
      value=""
    >
      <option value="" disabled>Size</option>
      {#each FONT_SIZES as s (s.value)}
        <option value={s.value}>{s.label}</option>
      {/each}
    </select>

    <div class="join">
      {#each COLORS as c (c.value)}
        <button
          type="button"
          class="btn join-item btn-xs h-5 min-h-0 w-5 rounded-full p-0 {c.swatch}"
          aria-label={c.label}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => applyColor(c.value)}
        ></button>
      {/each}
    </div>
  </div>

  <div
    bind:this={editorEl}
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    aria-label={placeholder || "Rich text"}
    aria-invalid={invalid ? "true" : undefined}
    data-placeholder={placeholder}
    class="min-h-24 p-3 text-sm outline-none empty:before:opacity-50 empty:before:content-[attr(data-placeholder)] [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc"
    oninput={syncHidden}
  ></div>
</div>

<input type="hidden" {name} {required} value={html} />
