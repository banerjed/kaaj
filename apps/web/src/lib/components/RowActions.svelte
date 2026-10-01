<script lang="ts">
  import { enhance } from "$app/forms"
  import {
    isDestructive,
    isLink,
    isPost,
    type ActionKind,
    type RowAction,
  } from "./row-actions"

  /**
   * The per-row action cluster every list surface uses, so a row never
   * depends on someone knowing its name is clickable
   * (docs/02-ux-design-specification.md § List/Table View).
   *
   * Inline icons, never a dropdown: every list table sits inside
   * `overflow-x-auto`, which clips an absolutely-positioned menu to a few
   * pixels with nothing erroring (L80).
   */
  let {
    actions,
    size = "sm",
  }: {
    actions: RowAction[]
    /** `xs` for a nested or sub-table, matching CustomFieldSettings. */
    size?: "sm" | "xs"
  } = $props()

  /** Complete class strings — never assembled, or Tailwind cannot see them. */
  const BUTTON: Record<"sm" | "xs", Record<"default" | "danger", string>> = {
    sm: {
      default: "btn btn-ghost btn-sm btn-square",
      danger: "btn btn-ghost btn-sm btn-square text-error",
    },
    xs: {
      default: "btn btn-ghost btn-xs btn-square",
      danger: "btn btn-ghost btn-xs btn-square text-error",
    },
  }

  const ICON: Record<"sm" | "xs", Record<ActionKind, string>> = {
    sm: {
      view: "iconify lucide--eye size-4",
      edit: "iconify lucide--pencil size-4",
      settings: "iconify lucide--settings size-4",
      archive: "iconify lucide--archive size-4",
      restore: "iconify lucide--rotate-ccw size-4",
      download: "iconify lucide--download size-4",
    },
    xs: {
      view: "iconify lucide--eye size-3.5",
      edit: "iconify lucide--pencil size-3.5",
      settings: "iconify lucide--settings size-3.5",
      archive: "iconify lucide--archive size-3.5",
      restore: "iconify lucide--rotate-ccw size-3.5",
      download: "iconify lucide--download size-3.5",
    },
  }

  const buttonClass = (a: RowAction) =>
    BUTTON[size][isDestructive(a.kind) ? "danger" : "default"]
</script>

<div class="flex gap-1">
  {#each actions as action (action.label)}
    {#if isLink(action)}
      <a
        href={action.href}
        class={buttonClass(action)}
        aria-label={action.label}
        title={action.title}
      >
        <span class={ICON[size][action.kind]}></span>
      </a>
    {:else if isPost(action)}
      <form method="POST" action={action.post.action} use:enhance>
        {#each Object.entries(action.post.fields ?? {}) as [name, value] (name)}
          <input type="hidden" {name} {value} />
        {/each}
        <button
          class={buttonClass(action)}
          aria-label={action.label}
          title={action.title}
          disabled={action.disabled}
        >
          <span class={ICON[size][action.kind]}></span>
        </button>
      </form>
    {:else}
      <button
        type="button"
        class={buttonClass(action)}
        aria-label={action.label}
        title={action.title}
        disabled={action.disabled}
        onclick={action.onclick}
      >
        <span class={ICON[size][action.kind]}></span>
      </button>
    {/if}
  {/each}
</div>
