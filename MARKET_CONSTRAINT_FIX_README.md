# Market Creation Constraint Fix

## Problem
Markets creation was failing with the error:
```
Failed to create market: new row for relation "markets" violates check constraint "markets_type_check"
```

This occurred when trying to create markets with types like:
- `highest_scoring_half`
- `double_chance`
- `draw_no_bet`
- And many other market types

## Root Cause
The database constraint in the `markets` table only allowed a limited set of market types:
- `1x2`
- `totals`
- `btts`
- `handicap`
- `correct_score`
- `custom`

However, the API in `server/routes.ts` accepts **28 different market types**, causing a mismatch.

## Solution
Updated the database constraint to include all market types that the API accepts:

### Main Markets:
- `1x2`, `double_chance`, `draw_no_bet`

### Goal Markets:
- `totals`, `btts`, `exact_goals`, `odd_even`, `both_halves`

### Half Markets:
- `first_half_1x2`, `first_half_totals`, `second_half_1x2`, `second_half_totals`, `highest_scoring_half`

### Team Markets:
- `team_to_score_first`, `team_to_score_last`, `clean_sheet`, `to_win_either_half`, `to_win_both_halves`, `to_score_both_halves`

### Score Markets:
- `correct_score`, `ht_ft`, `winning_margin`

### Handicap Markets:
- `handicap`, `asian_handicap`

### Special Markets:
- `first_goal_interval`, `penalty_awarded`, `own_goal`

### Custom:
- `custom`

## How to Apply the Fix

### Step 1: Run the Migration Script
Execute the SQL script `fix-markets-type-constraint.sql` in your **Supabase SQL Editor**:

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy the contents of `fix-markets-type-constraint.sql`
4. Paste and run the script

The script will:
- Drop the old constraint `markets_type_check`
- Add the new constraint with all supported market types

### Step 2: Verify the Fix
After running the migration:
1. Go to your admin panel at `/prime-admin/markets/{match_id}`
2. Try adding any market type (e.g., "Highest Scoring Half")
3. The market should be created successfully

## Files Modified
1. `admin-matches-schema.sql` - Updated for future fresh installations
2. `fix-markets-type-constraint.sql` - Migration script for existing databases

## Testing
After applying the fix, all 28 market types defined in the API (`server/routes.ts` lines 4772-4781) should work correctly.
