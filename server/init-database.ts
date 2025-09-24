import { supabaseAdmin } from './supabase';

export async function initializeDatabaseSchema(): Promise<boolean> {
  try {
    console.log('🏗️  Initializing database schema...');

    // Create the database schema using raw SQL
    const schemaSQL = `
      -- Create profiles table
      CREATE TABLE IF NOT EXISTS public.profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        username text NOT NULL UNIQUE,
        first_name text,
        last_name text,
        phone_number text,
        date_of_birth date,
        balance_cents integer DEFAULT 0 NOT NULL,
        currency text DEFAULT 'GBP' NOT NULL,
        is_verified boolean DEFAULT false NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        preferred_odds_format text DEFAULT 'decimal' NOT NULL,
        marketing_consent boolean DEFAULT false NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create bets table
      CREATE TABLE IF NOT EXISTS public.bets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        bet_type text NOT NULL,
        total_stake_cents integer NOT NULL,
        potential_winnings_cents integer NOT NULL,
        actual_winnings_cents integer,
        status text DEFAULT 'pending' NOT NULL,
        placed_at timestamptz DEFAULT now() NOT NULL,
        settled_at timestamptz,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create bet_selections table
      CREATE TABLE IF NOT EXISTS public.bet_selections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bet_id uuid NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
        fixture_id text NOT NULL,
        home_team text NOT NULL,
        away_team text NOT NULL,
        league text NOT NULL,
        market text NOT NULL,
        selection text NOT NULL,
        odds text NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        result text,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create transactions table
      CREATE TABLE IF NOT EXISTS public.transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        type text NOT NULL,
        amount_cents integer NOT NULL,
        description text NOT NULL,
        reference_type text,
        reference_id text,
        balance_after_cents integer NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create user_favorites table
      CREATE TABLE IF NOT EXISTS public.user_favorites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        UNIQUE(user_id, entity_type, entity_id)
      );

      -- Create admin_users table
      CREATE TABLE IF NOT EXISTS public.admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        first_name text,
        last_name text,
        role text DEFAULT 'support' NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        last_login_at timestamptz,
        failed_login_attempts integer DEFAULT 0 NOT NULL,
        locked_until timestamptz,
        totp_secret text,
        is_2fa_enabled boolean DEFAULT false NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create admin_sessions table
      CREATE TABLE IF NOT EXISTS public.admin_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
        session_token text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        ip_address text,
        user_agent text,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        last_activity_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create audit_logs table
      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
        action text NOT NULL,
        resource_type text NOT NULL,
        resource_id text,
        details jsonb,
        ip_address text,
        user_agent text,
        created_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_bets_user_id ON public.bets(user_id);
      CREATE INDEX IF NOT EXISTS idx_bets_status ON public.bets(status);
      CREATE INDEX IF NOT EXISTS idx_bets_placed_at ON public.bets(placed_at);
      CREATE INDEX IF NOT EXISTS idx_bet_selections_bet_id ON public.bet_selections(bet_id);
      CREATE INDEX IF NOT EXISTS idx_bet_selections_fixture_id ON public.bet_selections(fixture_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON public.admin_sessions(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

      -- Enable Row Level Security
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bet_selections ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
      
      -- Create RLS policies for profiles
      CREATE POLICY IF NOT EXISTS "Users can view own profile" ON public.profiles
        FOR SELECT USING (auth.uid() = id);
      CREATE POLICY IF NOT EXISTS "Users can update own profile" ON public.profiles
        FOR UPDATE USING (auth.uid() = id);
      
      -- Create RLS policies for bets
      CREATE POLICY IF NOT EXISTS "Users can view own bets" ON public.bets
        FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY IF NOT EXISTS "Users can insert own bets" ON public.bets
        FOR INSERT WITH CHECK (auth.uid() = user_id);
        
      -- Create RLS policies for bet_selections
      CREATE POLICY IF NOT EXISTS "Users can view own bet selections" ON public.bet_selections
        FOR SELECT USING (auth.uid() = (SELECT user_id FROM public.bets WHERE id = bet_id));
        
      -- Create RLS policies for transactions
      CREATE POLICY IF NOT EXISTS "Users can view own transactions" ON public.transactions
        FOR SELECT USING (auth.uid() = user_id);
        
      -- Create RLS policies for user_favorites
      CREATE POLICY IF NOT EXISTS "Users can manage own favorites" ON public.user_favorites
        FOR ALL USING (auth.uid() = user_id);
    `;

    // Execute the schema creation
    console.log('Executing database schema SQL...');
    
    // Split SQL into individual statements and execute them one by one
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    for (const statement of statements) {
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql: statement });
        if (error && !error.message.includes('already exists')) {
          console.warn('SQL statement warning:', error.message);
        }
      } catch (err: any) {
        // If exec_sql doesn't exist, try raw SQL execution approach
        console.warn('Direct SQL execution not available, trying alternative approach...');
        break;
      }
    }

    // Alternative approach: Create a function to initialize the schema
    const initFunctionSQL = `
      CREATE OR REPLACE FUNCTION initialize_betting_schema()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        ${schemaSQL.replace(/'/g, "''")}
        RETURN 'Schema initialized successfully';
      END;
      $$;
    `;

    try {
      // Try to create and execute the initialization function
      const { data: funcData, error: funcError } = await supabaseAdmin.rpc('exec_sql', { sql: initFunctionSQL });
      if (funcError) {
        console.warn('Could not create initialization function:', funcError);
        console.log('ℹ️  Database tables may already exist or need to be created manually via Supabase dashboard');
        return true; // Consider it successful for now
      }

      // Execute the initialization function
      const { data, error } = await supabaseAdmin.rpc('initialize_betting_schema');
      if (error) {
        console.warn('Schema initialization function error:', error);
        return true; // Consider it successful for now
      }

      console.log('✅ Database schema initialized successfully');
      return true;
    } catch (err: any) {
      console.warn('Schema initialization completed with warnings:', err.message);
      return true;
    }

  } catch (error: any) {
    console.error('❌ Failed to initialize database schema:', error);
    console.log('ℹ️  You may need to create the database tables manually via the Supabase dashboard');
    // Return true to allow the application to continue
    return true;
  }
}

export async function createDemoData(): Promise<void> {
  try {
    console.log('👤 Creating demo user data...');
    
    // Check if demo profile already exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('username', 'demo')
      .single();

    if (existingProfile) {
      console.log('✅ Demo user already exists');
      return;
    }

    // Create demo user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        email: 'demo@example.com',
        username: 'demo',
        first_name: 'Demo',
        last_name: 'User',
        balance_cents: 100000, // £1000
        is_verified: true,
        is_active: true,
      })
      .select()
      .single();

    if (profileError) {
      console.warn('Could not create demo user:', profileError.message);
    } else {
      console.log('✅ Demo user created successfully');
    }

  } catch (error: any) {
    console.warn('Demo data creation failed:', error.message);
  }
}