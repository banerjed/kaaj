import { PRIVATE_SUPABASE_SERVICE_ROLE } from "$env/static/private"
import { PUBLIC_SUPABASE_URL } from "$env/static/public"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../../DatabaseDefinitions"

// This client is stateless: it never persists a user session. Reusing it avoids
// constructing a second auth client for every request that needs admin access.
export const supabaseServiceRole = createClient<Database>(
  PUBLIC_SUPABASE_URL,
  PRIVATE_SUPABASE_SERVICE_ROLE,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)
