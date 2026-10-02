<script lang="ts">
  let { children } = $props()
</script>

<!-- Same reasoning as (marketing)/+layout.svelte: the account pages are
     CMSaasStarter's, so they claim the CMSaasStarter theme explicitly rather
     than inheriting whatever the (app) surface last set on <html>. -->
<div style="display: contents" data-theme="saasstartertheme">
  {@render children?.()}
</div>
