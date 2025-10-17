-- ========================================================================
-- CRITICAL: Apply this SQL in Supabase SQL Editor to fix bet settlement
-- ========================================================================
-- This creates the missing settle_bet_atomically function that is 
-- preventing ALL bet settlements from working.
--
-- Instructions:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Copy and paste this ENTIRE file
-- 3. Click "Run"
-- 4. Restart your application
--
-- Expected result: ✅ Function created successfully
-- ========================================================================

-- Create settlement audit log table
CREATE TABLE IF NOT EXISTS settlement_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id UUID NOT NULL REFERENCES bets(id),
  user_id UUID NOT NULL REFERENCES users(id),
  settlement_status TEXT NOT NULL, -- 'success', 'failed', 'duplicate_prevented'
  final_bet_status TEXT, -- 'won', 'lost', 'void'
  actual_winnings BIGINT,
  error_message TEXT,
  processing_time_ms INTEGER,
  worker_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for querying audit logs
CREATE INDEX IF NOT EXISTS idx_settlement_audit_bet_id ON settlement_audit_log(bet_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_user_id ON settlement_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_status ON settlement_audit_log(settlement_status);
CREATE INDEX IF NOT EXISTS idx_settlement_audit_created_at ON settlement_audit_log(created_at DESC);

-- Enhanced atomic settlement function
-- IMPORTANT: Parameters MUST be in ALPHABETICAL ORDER for Supabase RPC
CREATE OR REPLACE FUNCTION settle_bet_atomically(
  p_actual_winnings BIGINT,
  p_bet_id UUID,
  p_final_status TEXT,
  p_selection_updates JSONB,
  p_user_id UUID,
  p_worker_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
  v_selection JSONB;
  v_current_bet_status TEXT;
  v_bet_stake BIGINT;
  v_start_time TIMESTAMP;
  v_processing_time_ms INTEGER;
  v_audit_id UUID;
BEGIN
  v_start_time := clock_timestamp();
  
  -- IDEMPOTENCY CHECK: Verify bet is still pending
  SELECT status, total_stake INTO v_current_bet_status, v_bet_stake
  FROM bets
  WHERE id = p_bet_id
  FOR UPDATE; -- Lock the bet row
  
  IF v_current_bet_status IS NULL THEN
    -- Bet not found
    INSERT INTO settlement_audit_log (bet_id, user_id, settlement_status, error_message, worker_id)
    VALUES (p_bet_id, p_user_id, 'failed', 'Bet not found', p_worker_id);
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bet not found'
    );
  END IF;
  
  IF v_current_bet_status != 'pending' THEN
    -- Duplicate settlement prevented
    v_processing_time_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
    
    INSERT INTO settlement_audit_log (
      bet_id, user_id, settlement_status, final_bet_status, 
      error_message, processing_time_ms, worker_id
    )
    VALUES (
      p_bet_id, p_user_id, 'duplicate_prevented', v_current_bet_status,
      'Bet already settled with status: ' || v_current_bet_status, 
      v_processing_time_ms, p_worker_id
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bet already settled',
      'currentStatus', v_current_bet_status
    );
  END IF;
  
  -- 1. Update all bet selections
  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selection_updates)
  LOOP
    UPDATE bet_selections
    SET 
      status = (v_selection->>'status')::TEXT,
      result = (v_selection->>'result')::TEXT,
      updated_at = NOW()
    WHERE id = (v_selection->>'selection_id')::UUID;
  END LOOP;

  -- 2. Update bet status and winnings
  UPDATE bets
  SET 
    status = p_final_status,
    actual_winnings = p_actual_winnings,
    settled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_bet_id;

  -- 3. Handle payout based on final status
  IF p_final_status = 'won' AND p_actual_winnings > 0 THEN
    -- BET WON: Credit winnings to user balance
    SELECT balance INTO v_current_balance
    FROM users
    WHERE id = p_user_id
    FOR UPDATE; -- Lock row for update

    v_new_balance := v_current_balance + p_actual_winnings;

    UPDATE users
    SET 
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = p_user_id;

    -- Create win transaction record
    INSERT INTO transactions (
      id, user_id, type, amount_cents, balance_after_cents,
      description, status, metadata, created_at
    ) VALUES (
      gen_random_uuid(), p_user_id, 'bet_win', p_actual_winnings, v_new_balance,
      'Bet win for bet #' || p_bet_id, 'completed',
      jsonb_build_object('betId', p_bet_id, 'betStatus', p_final_status),
      NOW()
    );
    
  ELSIF p_final_status = 'void' AND v_bet_stake > 0 THEN
    -- BET VOID: Refund stake to user balance
    SELECT balance INTO v_current_balance
    FROM users
    WHERE id = p_user_id
    FOR UPDATE; -- Lock row for update

    v_new_balance := v_current_balance + v_bet_stake;

    UPDATE users
    SET 
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = p_user_id;

    -- Create refund transaction record
    INSERT INTO transactions (
      id, user_id, type, amount_cents, balance_after_cents,
      description, status, metadata, created_at
    ) VALUES (
      gen_random_uuid(), p_user_id, 'bet_refund', v_bet_stake, v_new_balance,
      'Bet refund (void) for bet #' || p_bet_id, 'completed',
      jsonb_build_object('betId', p_bet_id, 'betStatus', p_final_status, 'reason', 'void'),
      NOW()
    );
  END IF;
  -- Note: For 'lost' status, no balance update needed (stake already deducted)

  -- 4. Create successful settlement audit log
  v_processing_time_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
  
  INSERT INTO settlement_audit_log (
    bet_id, user_id, settlement_status, final_bet_status,
    actual_winnings, processing_time_ms, worker_id
  )
  VALUES (
    p_bet_id, p_user_id, 'success', p_final_status,
    p_actual_winnings, v_processing_time_ms, p_worker_id
  )
  RETURNING id INTO v_audit_id;

  -- Return success with audit info
  RETURN jsonb_build_object(
    'success', true,
    'betId', p_bet_id,
    'finalStatus', p_final_status,
    'actualWinnings', p_actual_winnings,
    'processingTimeMs', v_processing_time_ms,
    'auditId', v_audit_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log failure to audit trail
    v_processing_time_ms := EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER;
    
    INSERT INTO settlement_audit_log (
      bet_id, user_id, settlement_status, error_message,
      processing_time_ms, worker_id
    )
    VALUES (
      p_bet_id, p_user_id, 'failed', SQLERRM,
      v_processing_time_ms, p_worker_id
    );
    
    -- Return error with details
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'errorDetail', SQLSTATE
    );
END;
$$;

-- Create function to get settlement statistics
CREATE OR REPLACE FUNCTION get_settlement_statistics(
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '24 hours',
  p_end_date TIMESTAMP DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalSettlements', COUNT(*),
    'successfulSettlements', COUNT(*) FILTER (WHERE settlement_status = 'success'),
    'failedSettlements', COUNT(*) FILTER (WHERE settlement_status = 'failed'),
    'duplicatesPrevented', COUNT(*) FILTER (WHERE settlement_status = 'duplicate_prevented'),
    'averageProcessingTimeMs', AVG(processing_time_ms) FILTER (WHERE processing_time_ms IS NOT NULL),
    'maxProcessingTimeMs', MAX(processing_time_ms),
    'wonBets', COUNT(*) FILTER (WHERE final_bet_status = 'won'),
    'lostBets', COUNT(*) FILTER (WHERE final_bet_status = 'lost'),
    'voidBets', COUNT(*) FILTER (WHERE final_bet_status = 'void'),
    'totalWinnings', COALESCE(SUM(actual_winnings) FILTER (WHERE final_bet_status = 'won'), 0),
    'totalRefunds', COALESCE(SUM(actual_winnings) FILTER (WHERE final_bet_status = 'void'), 0),
    'period', jsonb_build_object(
      'start', p_start_date,
      'end', p_end_date
    )
  ) INTO v_result
  FROM settlement_audit_log
  WHERE created_at BETWEEN p_start_date AND p_end_date;
  
  RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION settle_bet_atomically TO authenticated;
GRANT EXECUTE ON FUNCTION get_settlement_statistics TO authenticated;

-- Create view for easy settlement monitoring
CREATE OR REPLACE VIEW settlement_health_view AS
SELECT 
  date_trunc('hour', created_at) as hour,
  settlement_status,
  final_bet_status,
  COUNT(*) as count,
  AVG(processing_time_ms) as avg_processing_time_ms,
  MAX(processing_time_ms) as max_processing_time_ms,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT worker_id) as unique_workers
FROM settlement_audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY date_trunc('hour', created_at), settlement_status, final_bet_status
ORDER BY hour DESC;

-- Note: Index with date_trunc() removed due to IMMUTABLE requirement in Supabase
-- The view will still work correctly, just slightly slower for very large datasets
-- If needed, you can create this index manually after creating an IMMUTABLE wrapper function

-- ========================================================================
-- VERIFICATION QUERY
-- ========================================================================
-- Run this after the migration to verify:
--
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name = 'settle_bet_atomically';
--
-- Expected result: One row showing the function exists
-- ========================================================================
