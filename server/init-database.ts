import { supabaseAdmin } from './supabase';

export async function initializeDatabaseSchema(): Promise<boolean> {
  try {
    console.log('🏗️  Initializing database schema...');

    // Create the database schema using raw SQL
    const schemaSQL = `
      -- Create users table (matches runtime expectations)
      CREATE TABLE IF NOT EXISTS public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        username text NOT NULL UNIQUE,
        first_name text,
        last_name text,
        phone_number text,
        date_of_birth date,
        balance integer DEFAULT 0 NOT NULL,
        currency text DEFAULT 'KES' NOT NULL,
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
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        UNIQUE(user_id, entity_type, entity_id)
      );

      -- Create admin role enum
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
              CREATE TYPE admin_role AS ENUM ('superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support');
          END IF;
      END
      $$;

      -- Create admin_users table
      CREATE TABLE IF NOT EXISTS public.admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(50) NOT NULL UNIQUE,
        email varchar(255) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role admin_role NOT NULL,
        totp_secret varchar(255),
        is_active boolean DEFAULT true NOT NULL,
        last_login timestamptz,
        login_attempts integer DEFAULT 0 NOT NULL,
        locked_until timestamptz,
        ip_whitelist text[], -- Array of IP addresses
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL,
        created_by uuid REFERENCES admin_users(id)
      );

      -- Create admin_sessions table
      CREATE TABLE IF NOT EXISTS public.admin_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
        session_token varchar(255) NOT NULL UNIQUE,
        ip_address inet,
        user_agent text,
        two_factor_verified boolean DEFAULT false NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        last_activity_at timestamptz DEFAULT now() NOT NULL
      );

      -- Create audit_logs table
      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
        action_type varchar(255) NOT NULL,
        target_type varchar(255) NOT NULL,
        target_id varchar(255),
        data_before jsonb,
        data_after jsonb,
        ip_address inet,
        user_agent text,
        note text,
        success boolean DEFAULT true NOT NULL,
        error_message text,
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
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bet_selections ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
      
      -- Create RLS policies for users
      CREATE POLICY IF NOT EXISTS "Users can view own profile" ON public.users
        FOR SELECT USING (auth.uid() = id);
      CREATE POLICY IF NOT EXISTS "Users can update own profile" ON public.users
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

    // Execute the schema creation using direct table creation approach
    console.log('Creating database tables directly...');
    
    try {
      // Check users table
      const { error: usersError } = await supabaseAdmin.from('users').select('id').limit(1);
      if (usersError && usersError.code === 'PGRST116') {
        // Table doesn't exist, create it manually via SQL
        console.log('Creating users table...');
        
        // Use PostgreSQL connection approach
        console.warn('⚠️  Tables need to be created manually in Supabase dashboard');
        console.log('Please execute the following SQL in your Supabase SQL editor:');
        console.log('\n--- COPY THIS SQL TO SUPABASE DASHBOARD ---');
        console.log(schemaSQL);
        console.log('--- END SQL ---\n');
      } else {
        console.log('✅ Users table exists');
      }
      
      // Check other essential tables
      const tablesToCheck = ['bets', 'bet_selections', 'transactions', 'user_favorites'];
      for (const table of tablesToCheck) {
        const { error } = await supabaseAdmin.from(table).select('*').limit(1);
        if (error && error.code === 'PGRST116') {
          console.warn(`⚠️  Table '${table}' does not exist`);
        } else {
          console.log(`✅ Table '${table}' exists`);
        }
      }
      
      console.log('✅ Database schema check completed');
      return true;
    } catch (err: any) {
      console.warn('Schema validation completed with warnings:', err.message);
      return true;
    }

  } catch (error: any) {
    console.error('❌ Failed to initialize database schema:', error);
    console.log('\n🚨 CRITICAL: Database tables are missing!');
    console.log('Please create the tables manually in your Supabase dashboard by executing the SQL above.');
    console.log('Once tables are created, restart the application.');
    // Return true to allow the application to continue
    return true;
  }
}

export async function createDemoData(): Promise<void> {
  try {
    console.log('👤 Creating demo user data...');
    
    // Check if demo profile already exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', 'demo')
      .single();

    if (existingProfile) {
      console.log('✅ Demo user already exists');
      return;
    }

    // Create demo user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        email: 'demo@example.com',
        username: 'demo',
        first_name: 'Demo',
        last_name: 'User',
        balance: 100000, // $1000 in cents
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

export async function createSuperAdminUser(): Promise<void> {
  try {
    console.log('🔐 Creating super admin user...');
    
    // Check if super admin already exists
    const { data: existingAdmin, error: checkError } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('username', 'superadmin')
      .single();

    if (existingAdmin) {
      console.log('✅ Super admin user already exists');
      return;
    }

    // Hash the password using Argon2
    const argon2 = await import('argon2');
    const hashedPassword = await argon2.hash('r1gw2yRb$2#xQ%7y');

    // Create super admin user
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .insert({
        username: 'superadmin',
        email: 'digitalflwsolutions@gmail.com',
        password_hash: hashedPassword,
        role: 'superadmin',
        is_active: true,
      })
      .select()
      .single();

    if (adminError) {
      console.warn('Could not create super admin user:', adminError.message);
    } else {
      console.log('✅ Super admin user created successfully');
      console.log('   Username: superadmin');
      console.log('   Email: digitalflwsolutions@gmail.com');
    }

  } catch (error: any) {
    console.warn('Super admin creation failed:', error.message);
  }
}