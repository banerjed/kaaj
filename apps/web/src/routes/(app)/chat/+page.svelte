<script lang="ts">
  import EmptyState from "$lib/components/EmptyState.svelte"
</script>

<div class="card bg-base-100 h-full shadow">
  <div class="card-body items-center justify-center">
    <EmptyState
      icon="lucide--message-square"
      class=""
      message="Pick a conversation, or start a new one."
    />
  </div>
</div>
