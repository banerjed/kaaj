<script lang="ts">
  import { WebsiteName } from "../../config"

  /**
   * Composes `<title>` as `{subject} · {WebsiteName}`, one home instead of
   * 28 hand-written tags. `title` is the page's own subject only; null
   * (nullable columns like `payroll_runs.run_id`) renders the product name
   * alone rather than the literal text "null". Not the `<h1>` — see PageTitle.
   */
  let { title }: { title: string | null | undefined } = $props()
</script>

<svelte:head>
  <title>{title ? `${title} · ${WebsiteName}` : WebsiteName}</title>
</svelte:head>
