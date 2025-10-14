# Critical Database Migrations Required

## ⚠️ URGENT: Settlement Worker Not Functioning

The bet settlement worker is currently failing with the error:
```
Could not find the function public.settle_bet_atomically
```

This function is essential for production use and must be applied immediately.

## How to Apply Migrations

### Step 1: Access Supabase SQL Editor
1. Go to your Supabase Dashboard
2. Navigate to the SQL Editor
3. Create a new query

### Step 2: Run Migration - Enhanced Settlement Atomicity

**IMPORTANT:** Use the corrected migration file with alphabetical parameter ordering.

Copy and paste the **ENTIRE contents** of the file:
```
APPLY_THIS_IN_SUPABASE.sql
```

into the Supabase SQL Editor and click "Run".

**Note:** Supabase RPC requires function parameters in alphabetical order.

This migration will:
- ✅ Create the `settlement_audit_log` table for tracking all settlements
- ✅ Create the `settle_bet_atomically()` function for atomic bet settlement
- ✅ Add proper indexes for performance
- ✅ Add duplicate settlement prevention
- ✅ Add void bet handling (stake refunds)
- ✅ Add comprehensive error handling

### Step 3: Verify Installation

Run this query in the SQL Editor to verify the function was created:

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'settle_bet_atomically';
```

You should see one row returned with:
- `routine_name`: `settle_bet_atomically`
- `routine_type`: `FUNCTION`

### Step 4: Restart the Application

After applying the migration, restart your application:
1. The settlement worker will automatically start processing pending bets
2. Check logs for successful settlements
3. Verify bets are being settled correctly

## Expected Behavior After Migration

### Bet Settlement Worker Will:
- ✅ Process pending bets every interval (default: 2 minutes)
- ✅ Fetch match results from API and database
- ✅ Settle bets atomically (all-or-nothing)
- ✅ Update user balances correctly
- ✅ Handle void bets with stake refunds
- ✅ Retry failed settlements with exponential backoff
- ✅ Prevent duplicate settlements
- ✅ Log all settlement activity to audit trail

### Manual Match Simulation Will:
- ✅ Start matches at their scheduled kickoff time
- ✅ Execute match events (goals, cards, etc.) in real-time
- ✅ Update match scores based on events
- ✅ Complete matches after 90+ minutes
- ✅ Trigger bet settlement when match finishes

## Testing After Migration

1. **Create a manual match** with kickoff time in 2 minutes
2. **Place a bet** on that match
3. **Wait for kickoff** - match should go live
4. **Wait for completion** (92+ minutes simulated time)
5. **Check bet history** - bet should be settled with correct winnings

## Current Issues Identified

### ✅ Issue #1: Missing Database Function (CRITICAL)
- **Status**: Requires manual migration
- **Fix**: Apply migration 006 as described above
- **Impact**: Settlement worker completely non-functional

### ✅ Issue #2: Manual Match Simulation (VERIFIED WORKING)
- **Status**: Code is correct
- **Query**: Uses `.lte('kickoff_time', now)` correctly
- **Simulation**: Events triggered based on elapsed time
- **Issue**: Requires matches to be created with proper kickoff_time

## Production Readiness Checklist

- [ ] Apply migration 006 to Supabase
- [ ] Verify settlement function exists
- [ ] Restart application
- [ ] Test manual match creation → simulation → settlement flow
- [ ] Test API match settlement flow
- [ ] Verify retry mechanism for failed settlements
- [ ] Check settlement audit logs for proper tracking
- [ ] Verify user balances update correctly
- [ ] Test void bet handling (stake refunds)
- [ ] Monitor settlement worker logs for errors

## Support

If you encounter any errors during migration:
1. Check Supabase logs for detailed error messages
2. Verify you have proper permissions in Supabase
3. Ensure the `bets`, `users`, `bet_selections`, and `transactions` tables exist
4. Check that all referenced enum types are created

---
**Last Updated**: October 14, 2025
