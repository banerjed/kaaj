import {
  Session,
  SupabaseClient,
  type AMREntry,
  User,
} from "@supabase/supabase-js"
import { Database } from "./DatabaseDefinitions"
import type { SafeAuthSession } from "$lib/server/auth_session"

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient<Database>
      /** The service-role client is deliberately NOT here — see "service role quarantined" in CLAUDE.md. */
      safeGetSession: (options?: { includeAmr?: boolean }) => Promise<{
        session: Session | null
        user: User | null
        amr: AMREntry[] | null
      }>
      session: Session | null
      user: User | null
      amr: AMREntry[] | null
      /** The tenant this request is scoped to (ADR-003 rule 5). Pass to withTenant(); null = no membership, not an error. */
      tenantId: string | null
      /** The BASE role — owner | firm_admin | employee | contractor. Exactly one. See docs/14-access-control.md. */
      tenantRole: string | null
      /** Functional roles on top: hr_admin, payroll_admin, … Zero or more. */
      functionalRoles: string[]
      /** Which PERSON is asking, distinct from which tenant. Null for a non-employee member. */
      employeeId: string | null
    }
    interface PageData {
      session: SafeAuthSession | null
    }
    /**
     * What `+error.svelte` can render. `id` is optional: only `handleError`
     * mints one, for unexpected errors — an expected `error(403, …)` has none.
     */
    interface Error {
      id?: string
    }
    // interface Platform {}
  }
}

export {}
