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
      supabaseServiceRole: SupabaseClient<Database>
      safeGetSession: (options?: { includeAmr?: boolean }) => Promise<{
        session: Session | null
        user: User | null
        amr: AMREntry[] | null
      }>
      session: Session | null
      user: User | null
      amr: AMREntry[] | null
      /**
       * The tenant every query in this request is scoped to (ADR-003 rule 5).
       * Pass it to withTenant(). Never take a tenant id from a route param,
       * form field or query string — this is the sole basis for isolation.
       * Null means no active membership: "no rows", not an error.
       */
      tenantId: string | null
      /**
       * The BASE role — owner | firm_admin | employee | contractor. Exactly
       * one. See docs/14-access-control.md.
       */
      tenantRole: string | null
      /** Functional roles on top: hr_admin, payroll_admin, … Zero or more. */
      functionalRoles: string[]
      /**
       * Which PERSON is asking, as distinct from which tenant. Null for a
       * member who is not an employee. "See your own record" is not
       * expressible without it.
       */
      employeeId: string | null
    }
    interface PageData {
      session: SafeAuthSession | null
    }
    // interface Error {}
    // interface Platform {}
  }
}

export {}
