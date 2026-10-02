import type { PendingQuery, Row } from "postgres"
import type { Tx } from "./tenant"

export type Page = { limit: number; offset: number }
export type Paged<T> = { rows: T[]; total: number }

/** No list is deeper than this; past it, `OFFSET` is a scan with nothing to show. */
export const MAX_PAGE = 100_000

/**
 * `?<param>=n` as a page: a positive integer, at most MAX_PAGE; anything
 * else is page 1. A query string is as crafted as a form body (L37): `1.5`,
 * `1e400` and `99999999999999999999` all pass `Number()` and are then refused
 * by the `LIMIT`/`OFFSET` cast as "invalid input syntax for type bigint" —
 * an Internal Error, not an empty page. Only a run of digits gets through.
 */
export function pageParam(url: URL, param = "page"): number {
  const raw = url.searchParams.get(param)
  if (!raw || !/^\d{1,6}$/.test(raw)) return 1
  return Math.min(MAX_PAGE, Math.max(1, Number(raw)))
}

export function pageOf(page: number, size: number): Page {
  return { limit: size, offset: (page - 1) * size }
}

/**
 * How far to count a list that can run to hundreds of thousands of rows:
 * counting every one to print "of 417,680" cost more than the page itself.
 * At least 10,000, and always one past the page in view, so the pager still
 * knows whether a next page exists. A count that reaches the cap is shown
 * as "10,000+" — a lower bound, said as one, never a silent truncation.
 */
export function countCap(page: number, size: number): number {
  return Math.max(10_000, page * size + 1)
}

/**
 * One page of a report query that is otherwise read whole (its CSV export,
 * its tests): `base` is the report's own SELECT, without ORDER BY, and
 * `orderBy` names its columns through the alias `q`. `total` counts every
 * row of `base`. Totals a page shows must come from their own aggregate over
 * `base`, never from summing `rows`.
 */
export async function paged<T>(
  tx: Tx,
  base: PendingQuery<Row[]>,
  orderBy: PendingQuery<Row[]>,
  page: Page,
): Promise<Paged<T>> {
  const rows = await tx<(T & { total_rows: string })[]>`
    SELECT q.*, count(*) OVER ()::text AS total_rows
      FROM (${base}) q
     ORDER BY ${orderBy}
     LIMIT ${page.limit} OFFSET ${page.offset}
  `
  return {
    rows: rows.map(({ total_rows: _total, ...row }) => row as T),
    total: rows.length > 0 ? Number(rows[0].total_rows) : 0,
  }
}
