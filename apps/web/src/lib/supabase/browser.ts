import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
} from "$env/static/public"
import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "../../DatabaseDefinitions"

export type BrowserSupabaseClient = ReturnType<
  typeof createBrowserClient<Database>
>

let browserClient: BrowserSupabaseClient | undefined

export const getBrowserSupabase = (
  fetch?: typeof globalThis.fetch,
): BrowserSupabaseClient => {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY,
      fetch
        ? {
            global: { fetch },
          }
        : undefined,
    )
  }

  return browserClient
}
