import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types/database';

// Make Supabase optional - betting odds functionality works without it
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Flag to check if Supabase is available
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (!isSupabaseConfigured) {
  console.warn('⚠️  Supabase credentials not configured. User authentication and admin features will be disabled.');
  console.warn('   Core betting odds functionality will still work using Redis cache.');
}

// Server-side client with service role key (full access)
// Returns null if credentials not configured
export const supabaseAdmin: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null;

// Client for user-scoped operations (when we have user JWT)
export const createUserSupabaseClient = (accessToken: string): SupabaseClient<Database> | null => {
  if (!isSupabaseConfigured || !SUPABASE_ANON_KEY) {
    console.warn('Cannot create user Supabase client - credentials not configured');
    return null;
  }
  
  return createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
};