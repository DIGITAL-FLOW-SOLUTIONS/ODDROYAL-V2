import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types/database';

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

// Server-side client with service role key (full access)
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Client for user-scoped operations (when we have user JWT)
export const createUserSupabaseClient = (accessToken: string): SupabaseClient<Database> => {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
};