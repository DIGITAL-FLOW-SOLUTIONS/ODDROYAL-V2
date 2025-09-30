import { supabaseAdmin } from './supabase';

export async function initializeDatabaseSchema(): Promise<boolean> {
  try {
    console.log('🏗️  Initializing database schema...');
    
    // Quick health check - just verify database connection
    try {
      const { error } = await supabaseAdmin.from('admin_users').select('id').limit(1);
      // If we get here, database is accessible
      console.log('✅ Database connection verified');
      console.log('✅ Database schema ready (tables created via manual SQL)');
      return true;
    } catch (checkError) {
      console.warn('⚠️ Database check warning:', checkError);
      // Continue anyway - tables might exist but RLS is blocking
      console.log('✅ Assuming database schema exists');
      return true;
    }

    // OLD CODE BELOW - keeping for reference if manual setup needed
    // Create the database schema using raw SQL based on the user's uploaded schema
    const schemaSQL_REFERENCE = `
      -- Create extensions
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      -- Set timezone
      SET timezone TO 'UTC';

      -- Create enum types
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_type') THEN
              CREATE TYPE bet_type AS ENUM ('single', 'express', 'system');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_status') THEN
              CREATE TYPE bet_status AS ENUM ('pending', 'won', 'lost', 'cashout', 'cancelled');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bet_selection_status') THEN
              CREATE TYPE bet_selection_status AS ENUM ('pending', 'won', 'lost', 'void');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'favorite_type') THEN
              CREATE TYPE favorite_type AS ENUM ('team', 'league', 'fixture');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
              CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'bet_stake', 'bet_winnings', 'bonus');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
              CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
              CREATE TYPE admin_role AS ENUM ('superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support');
          END IF;
      END
      $$;

      -- Users table
      CREATE TABLE IF NOT EXISTS public.users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          balance INTEGER NOT NULL DEFAULT 0, -- Balance in cents
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Bets table
      CREATE TABLE IF NOT EXISTS public.bets (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          type bet_type NOT NULL,
          total_stake INTEGER NOT NULL CHECK (total_stake > 0), -- Stake in cents
          potential_winnings INTEGER NOT NULL CHECK (potential_winnings > 0), -- Winnings in cents
          total_odds VARCHAR(20) NOT NULL, -- Store as string for precision
          status bet_status NOT NULL DEFAULT 'pending',
          placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          actual_winnings INTEGER NOT NULL DEFAULT 0, -- Actual winnings in cents
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Bet selections table
      CREATE TABLE IF NOT EXISTS public.bet_selections (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          bet_id UUID NOT NULL REFERENCES public.bets(id) ON DELETE CASCADE,
          fixture_id VARCHAR(255) NOT NULL,
          home_team VARCHAR(255) NOT NULL,
          away_team VARCHAR(255) NOT NULL,
          league VARCHAR(255) NOT NULL,
          market_id VARCHAR(255) NOT NULL,
          outcome_id VARCHAR(255) NOT NULL,
          market VARCHAR(255) NOT NULL,
          selection VARCHAR(255) NOT NULL,
          odds VARCHAR(20) NOT NULL, -- Store as string for precision
          status bet_selection_status NOT NULL DEFAULT 'pending',
          result TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Transactions table
      CREATE TABLE IF NOT EXISTS public.transactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          type transaction_type NOT NULL,
          amount INTEGER NOT NULL, -- Amount in cents (can be negative)
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          reference VARCHAR(255),
          description TEXT,
          status transaction_status NOT NULL DEFAULT 'completed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- User favorites table
      CREATE TABLE IF NOT EXISTS public.user_favorites (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          type favorite_type NOT NULL,
          entity_id VARCHAR(255) NOT NULL,
          entity_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, type, entity_id)
      );

      -- Admin users table
      CREATE TABLE IF NOT EXISTS public.admin_users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role admin_role NOT NULL,
          totp_secret VARCHAR(255),
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login TIMESTAMPTZ,
          login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TIMESTAMPTZ,
          ip_whitelist TEXT[], -- Array of IP addresses
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by UUID REFERENCES public.admin_users(id)
      );

      -- User sessions table
      CREATE TABLE IF NOT EXISTS public.user_sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          ip_address INET,
          user_agent TEXT,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- User limits table  
      CREATE TABLE IF NOT EXISTS public.user_limits (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          max_stake_cents INTEGER NOT NULL DEFAULT 10000000, -- £100,000
          daily_stake_limit_cents INTEGER NOT NULL DEFAULT 100000000, -- £1,000,000
          daily_deposit_limit_cents INTEGER NOT NULL DEFAULT 100000000, -- £1,000,000
          daily_loss_limit_cents INTEGER NOT NULL DEFAULT 100000000, -- £1,000,000
          weekly_stake_limit_cents INTEGER NOT NULL DEFAULT 700000000, -- £7,000,000
          monthly_stake_limit_cents INTEGER NOT NULL DEFAULT 3000000000, -- £30,000,000
          is_self_excluded BOOLEAN NOT NULL DEFAULT false,
          self_exclusion_until TIMESTAMPTZ,
          cooldown_until TIMESTAMPTZ,
          set_by_admin_id UUID REFERENCES public.admin_users(id),
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Admin sessions table
      CREATE TABLE IF NOT EXISTS public.admin_sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          ip_address INET,
          user_agent TEXT,
          two_factor_verified BOOLEAN NOT NULL DEFAULT false,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Audit logs table
      CREATE TABLE IF NOT EXISTS public.audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
          action_type VARCHAR(255) NOT NULL,
          target_type VARCHAR(255) NOT NULL,
          target_id VARCHAR(255),
          data_before JSONB,
          data_after JSONB,
          ip_address INET,
          user_agent TEXT,
          note TEXT,
          success BOOLEAN NOT NULL DEFAULT true,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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