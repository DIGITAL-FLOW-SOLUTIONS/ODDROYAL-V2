-- Create profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    balance_cents INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Admin users table (also references auth.users)
CREATE TABLE public.admin_users (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support')) NOT NULL,
    totp_secret TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_login TIMESTAMPTZ,
    login_attempts INTEGER DEFAULT 0 NOT NULL,
    locked_until TIMESTAMPTZ,
    ip_whitelist TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES public.admin_users(id)
);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_users (only admins can access)
CREATE POLICY "Admins can view admin users" ON public.admin_users
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

-- Bets table
CREATE TABLE public.bets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('single', 'express', 'system')) NOT NULL,
    total_stake_cents INTEGER NOT NULL CHECK (total_stake_cents > 0),
    potential_winnings_cents INTEGER NOT NULL CHECK (potential_winnings_cents > 0),
    total_odds DECIMAL(8,4) NOT NULL,
    status TEXT CHECK (status IN ('pending', 'won', 'lost', 'cashout', 'cancelled')) DEFAULT 'pending' NOT NULL,
    placed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    settled_at TIMESTAMPTZ,
    actual_winnings_cents INTEGER DEFAULT 0 NOT NULL
);

-- Enable RLS on bets
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- RLS policies for bets
CREATE POLICY "Users can view own bets" ON public.bets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bets" ON public.bets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Bet selections table
CREATE TABLE public.bet_selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bet_id UUID REFERENCES public.bets ON DELETE CASCADE NOT NULL,
    fixture_id TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league TEXT NOT NULL,
    market_id UUID NOT NULL,
    outcome_id UUID NOT NULL,
    market TEXT NOT NULL,
    selection TEXT NOT NULL,
    odds DECIMAL(8,4) NOT NULL,
    status TEXT CHECK (status IN ('pending', 'won', 'lost', 'void')) DEFAULT 'pending' NOT NULL,
    result TEXT
);

-- Enable RLS on bet_selections
ALTER TABLE public.bet_selections ENABLE ROW LEVEL SECURITY;

-- RLS policies for bet_selections
CREATE POLICY "Users can view own bet selections" ON public.bet_selections
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.bets 
        WHERE bets.id = bet_selections.bet_id 
        AND bets.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own bet selections" ON public.bet_selections
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.bets 
        WHERE bets.id = bet_selections.bet_id 
        AND bets.user_id = auth.uid()
    ));

-- User favorites table
CREATE TABLE public.user_favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('team', 'league', 'fixture')) NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on user_favorites
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_favorites
CREATE POLICY "Users can manage own favorites" ON public.user_favorites
    FOR ALL USING (auth.uid() = user_id);

-- Transactions table
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('deposit', 'withdrawal', 'bet_stake', 'bet_winnings', 'bonus')) NOT NULL,
    amount_cents INTEGER NOT NULL,
    balance_before_cents INTEGER NOT NULL,
    balance_after_cents INTEGER NOT NULL,
    reference TEXT,
    description TEXT,
    status TEXT CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'completed' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions" ON public.transactions
    FOR INSERT WITH CHECK (true); -- Will be handled by server-side RPC

-- User limits table
CREATE TABLE public.user_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
    max_stake_cents INTEGER DEFAULT 10000000,
    daily_stake_limit_cents INTEGER DEFAULT 100000000,
    daily_deposit_limit_cents INTEGER DEFAULT 100000000,
    daily_loss_limit_cents INTEGER DEFAULT 100000000,
    weekly_stake_limit_cents INTEGER DEFAULT 700000000,
    monthly_stake_limit_cents INTEGER DEFAULT 3000000000,
    is_self_excluded BOOLEAN DEFAULT false NOT NULL,
    self_exclusion_until TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ,
    set_by_admin_id UUID REFERENCES public.admin_users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on user_limits
ALTER TABLE public.user_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_limits
CREATE POLICY "Users can view own limits" ON public.user_limits
    FOR SELECT USING (auth.uid() = user_id);

-- Audit logs table
CREATE TABLE public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES public.admin_users(id) NOT NULL,
    action_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    data_before JSONB,
    data_after JSONB,
    ip_address TEXT,
    user_agent TEXT,
    note TEXT,
    success BOOLEAN DEFAULT true NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit_logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

-- Create indexes for performance
CREATE INDEX idx_bets_user_id ON public.bets(user_id);
CREATE INDEX idx_bets_placed_at ON public.bets(placed_at);
CREATE INDEX idx_bet_selections_bet_id ON public.bet_selections(bet_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX idx_user_favorites_user_id ON public.user_favorites(user_id);
CREATE INDEX idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_limits_updated_at BEFORE UPDATE ON public.user_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();