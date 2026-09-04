<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte"

  let { data } = $props()
</script>

<PageHead title="Portal" />

<div class="p-4 lg:p-6">
  <div class="flex items-center justify-between">
    <h1 class="font-display text-2xl">Welcome</h1>
    <form method="POST" action="/portal/logout">
      <button class="btn btn-ghost btn-sm">Sign out</button>
    </form>
  </div>

  <p class="text-base-content/70 mt-2">
    Signed in as {data.user.fullName ?? data.user.email} · {data.customerName ??
      "—"}
  </p>
</div>
