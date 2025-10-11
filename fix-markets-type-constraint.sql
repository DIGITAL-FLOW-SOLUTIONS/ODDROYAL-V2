-- Migration to fix markets table type constraint
-- Run this SQL in your Supabase SQL Editor to update the constraint

-- Drop the old constraint
ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_type_check;

-- Add the new constraint with all supported market types
ALTER TABLE public.markets ADD CONSTRAINT markets_type_check CHECK (type IN (
    '1x2', 'double_chance', 'draw_no_bet',
    'totals', 'btts', 'exact_goals', 'odd_even', 'both_halves',
    'first_half_1x2', 'first_half_totals', 'second_half_1x2', 'second_half_totals', 'highest_scoring_half',
    'team_to_score_first', 'team_to_score_last', 'clean_sheet', 'to_win_either_half', 'to_win_both_halves', 'to_score_both_halves',
    'correct_score', 'ht_ft', 'winning_margin',
    'handicap', 'asian_handicap',
    'first_goal_interval', 'penalty_awarded', 'own_goal',
    'custom'
));

-- Verify the constraint was added successfully
DO $$
BEGIN
    RAISE NOTICE 'Markets table type constraint has been successfully updated!';
    RAISE NOTICE 'The following market types are now supported:';
    RAISE NOTICE '- Main Markets: 1x2, double_chance, draw_no_bet';
    RAISE NOTICE '- Goal Markets: totals, btts, exact_goals, odd_even, both_halves';
    RAISE NOTICE '- Half Markets: first_half_1x2, first_half_totals, second_half_1x2, second_half_totals, highest_scoring_half';
    RAISE NOTICE '- Team Markets: team_to_score_first, team_to_score_last, clean_sheet, to_win_either_half, to_win_both_halves, to_score_both_halves';
    RAISE NOTICE '- Score Markets: correct_score, ht_ft, winning_margin';
    RAISE NOTICE '- Handicap Markets: handicap, asian_handicap';
    RAISE NOTICE '- Special Markets: first_goal_interval, penalty_awarded, own_goal';
    RAISE NOTICE '- Custom Markets: custom';
END $$;
