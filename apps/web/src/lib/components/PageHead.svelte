<script lang="ts">
  import { WebsiteName } from "../../config"

  /**
   * The document title for a page, composed rather than spelled out.
   *
   * Twenty-eight pages each wrote `<title>Employees · Kaaj</title>` by hand,
   * which hardcoded two things: the product name, and the fact that the
   * separator is a middot. Renaming the product meant twenty-eight edits, and
   * nothing stopped the twenty-ninth page from picking a different separator.
   *
   * `title` is the page's own subject only — "Employees", or an invoice
   * number. The product name is appended here.
   *
   * It accepts null because several subjects come from nullable columns —
   * `payroll_runs.run_id` is one — and the template strings this replaced
   * coerced those to the literal text "null" in the browser tab. An absent
   * subject renders the product name alone rather than a stray separator.
   *
   * Renders nothing visible. The `<h1>` on the page is `PageTitle`, which is a
   * different component for a different job: one is what a screen reader
   * announces as the page's heading, the other is what the browser tab says.
   */
  let { title }: { title: string | null | undefined } = $props()
</script>

<svelte:head>
  <title>{title ? `${title} · ${WebsiteName}` : WebsiteName}</title>
</svelte:head>
