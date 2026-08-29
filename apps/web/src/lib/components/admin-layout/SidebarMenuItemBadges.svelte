<script module lang="ts">
  export type ISidebarMenuItemBadges = {
    badges?: Array<"new" | string>
  }
</script>

<script lang="ts">
  let { badges }: ISidebarMenuItemBadges = $props()
</script>

{#if !badges || !badges.length}
  <div></div>
{:else}
  <div class="ms-auto inline-flex gap-2">
    {#each badges as badge, index (index)}
      {#if badge === "new"}
        <div
          class="border-primary/20 bg-primary/10 text-primary rounded-box border px-1.5 text-[12px]"
        >
          New
        </div>
      {:else}
        <div
          class="bg-secondary text-secondary-content rounded-box ms-0 px-1.5 text-[12px]"
        >
          {badge}
        </div>
      {/if}
    {/each}
  </div>
{/if}
