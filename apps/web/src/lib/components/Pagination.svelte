<script lang="ts">
  /**
   * The range/Prev/Next footer `/ticketing` already had — shared so a new
   * paginated list doesn't hand-copy the range math and disabled-state
   * logic (L72 is the same drift this codebase already paid for once, for
   * status badges).
   */
  let {
    page,
    pageSize,
    total,
    hrefFor,
  }: {
    page: number
    pageSize: number
    total: number
    /** Builds the URL for a given page number, carrying the caller's own filters. */
    hrefFor: (page: number) => string
  } = $props()

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)))
  const rangeStart = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1)
  const rangeEnd = $derived(Math.min(total, page * pageSize))
</script>

<div class="border-base-200 flex items-center justify-between border-t p-3">
  <p class="text-base-content/70 text-xs">
    {rangeStart}–{rangeEnd} of {total}
  </p>
  <div class="join">
    <a
      href={hrefFor(page - 1)}
      class="btn btn-sm join-item"
      class:btn-disabled={page <= 1}
      aria-disabled={page <= 1}>Prev</a
    >
    <span class="btn btn-sm join-item btn-disabled"
      >Page {page} of {totalPages}</span
    >
    <a
      href={hrefFor(page + 1)}
      class="btn btn-sm join-item"
      class:btn-disabled={page >= totalPages}
      aria-disabled={page >= totalPages}>Next</a
    >
  </div>
</div>
