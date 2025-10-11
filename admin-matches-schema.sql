-- Admin Matches Management Schema
-- Run this SQL in your Supabase SQL Editor to create the required tables

-- Create matches table
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id TEXT UNIQUE,
    external_source TEXT,
    sport TEXT,
    sport_id TEXT,
    sport_name TEXT,
    league_id TEXT NOT NULL,
    league_name TEXT NOT NULL,
    home_team_id TEXT NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    kickoff_time TIMESTAMPTZ NOT NULL,
    status TEXT CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled', 'postponed')) DEFAULT 'scheduled' NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    is_manual BOOLEAN DEFAULT false NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    simulated_result JSONB,
    created_by UUID REFERENCES public.admin_users(id),
    updated_by UUID REFERENCES public.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create markets table
CREATE TABLE IF NOT EXISTS public.markets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN (
        '1x2', 'double_chance', 'draw_no_bet',
        'totals', 'btts', 'exact_goals', 'odd_even', 'both_halves',
        'first_half_1x2', 'first_half_totals', 'second_half_1x2', 'second_half_totals', 'highest_scoring_half',
        'team_to_score_first', 'team_to_score_last', 'clean_sheet', 'to_win_either_half', 'to_win_both_halves', 'to_score_both_halves',
        'correct_score', 'ht_ft', 'winning_margin',
        'handicap', 'asian_handicap',
        'first_goal_interval', 'penalty_awarded', 'own_goal',
        'custom'
    )) NOT NULL,
    parameter TEXT,
    status TEXT CHECK (status IN ('open', 'closed', 'suspended', 'settled')) DEFAULT 'open' NOT NULL,
    min_stake_cents INTEGER DEFAULT 100 NOT NULL,
    max_stake_cents INTEGER DEFAULT 10000000 NOT NULL,
    max_liability_cents INTEGER DEFAULT 100000000 NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    is_published BOOLEAN DEFAULT true NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    created_by UUID REFERENCES public.admin_users(id),
    updated_by UUID REFERENCES public.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create market_outcomes table
CREATE TABLE IF NOT EXISTS public.market_outcomes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    odds TEXT NOT NULL,
    previous_odds TEXT,
    odds_source TEXT CHECK (odds_source IN ('manual', 'sportmonks', 'automated')) DEFAULT 'manual' NOT NULL,
    status TEXT CHECK (status IN ('active', 'inactive', 'won', 'lost')) DEFAULT 'active' NOT NULL,
    liability_limit_cents INTEGER DEFAULT 50000000 NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    is_deleted BOOLEAN DEFAULT false NOT NULL,
    updated_by UUID REFERENCES public.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create match_events table (for simulated match events)
CREATE TABLE IF NOT EXISTS public.match_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    minute INTEGER NOT NULL,
    second INTEGER DEFAULT 0 NOT NULL,
    team TEXT,
    player_name TEXT,
    description TEXT,
    is_simulated BOOLEAN DEFAULT false NOT NULL,
    is_executed BOOLEAN DEFAULT false NOT NULL,
    order_index INTEGER DEFAULT 0 NOT NULL,
    scheduled_time TIMESTAMPTZ,
    created_by UUID REFERENCES public.admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create odds_history table (for tracking odds changes)
CREATE TABLE IF NOT EXISTS public.odds_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    outcome_id UUID REFERENCES public.market_outcomes(id) ON DELETE CASCADE NOT NULL,
    previous_odds TEXT,
    new_odds TEXT NOT NULL,
    source TEXT CHECK (source IN ('manual', 'sportmonks', 'automated')) NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES public.admin_users(id),
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_time ON public.matches(kickoff_time);
CREATE INDEX IF NOT EXISTS idx_matches_league_id ON public.matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_external_id ON public.matches(external_id);
CREATE INDEX IF NOT EXISTS idx_matches_is_deleted ON public.matches(is_deleted);

CREATE INDEX IF NOT EXISTS idx_markets_match_id ON public.markets(match_id);
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_is_deleted ON public.markets(is_deleted);

CREATE INDEX IF NOT EXISTS idx_market_outcomes_market_id ON public.market_outcomes(market_id);
CREATE INDEX IF NOT EXISTS idx_market_outcomes_status ON public.market_outcomes(status);

CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON public.match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_scheduled_time ON public.match_events(scheduled_time);

CREATE INDEX IF NOT EXISTS idx_odds_history_outcome_id ON public.odds_history(outcome_id);
CREATE INDEX IF NOT EXISTS idx_odds_history_timestamp ON public.odds_history(timestamp);

-- Enable Row Level Security (RLS)
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for matches (admins can manage, users can view)
CREATE POLICY "Admins can manage matches" ON public.matches
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

CREATE POLICY "Users can view non-deleted matches" ON public.matches
    FOR SELECT USING (is_deleted = false);

-- RLS policies for markets (admins can manage, users can view published)
CREATE POLICY "Admins can manage markets" ON public.markets
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

CREATE POLICY "Users can view published markets" ON public.markets
    FOR SELECT USING (is_published = true AND is_deleted = false);

-- RLS policies for market_outcomes (admins can manage, users can view active)
CREATE POLICY "Admins can manage outcomes" ON public.market_outcomes
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

CREATE POLICY "Users can view active outcomes" ON public.market_outcomes
    FOR SELECT USING (status = 'active' AND is_deleted = false);

-- RLS policies for match_events (admins only)
CREATE POLICY "Admins can manage match events" ON public.match_events
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

-- RLS policies for odds_history (admins can view)
CREATE POLICY "Admins can view odds history" ON public.odds_history
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE id = auth.uid() AND is_active = true
    ));

-- Add updated_at triggers
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON public.matches 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON public.markets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_outcomes_updated_at BEFORE UPDATE ON public.market_outcomes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_events_updated_at BEFORE UPDATE ON public.match_events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust based on your service role)
GRANT ALL ON public.matches TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.markets TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.market_outcomes TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.match_events TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.odds_history TO postgres, anon, authenticated, service_role;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Admin matches management schema created successfully!';
    RAISE NOTICE 'Tables created: matches, markets, market_outcomes, match_events, odds_history';
END $$;
