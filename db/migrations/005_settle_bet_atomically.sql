-- Create function for atomic bet settlement
-- This ensures all settlement operations happen in a single transaction
CREATE OR REPLACE FUNCTION settle_bet_atomically(
  p_bet_id UUID,
  p_user_id UUID,
  p_final_status TEXT,
  p_actual_winnings BIGINT,
  p_selection_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
  v_selection JSONB;
BEGIN
  -- Start transaction (implicit in function)
  
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

  -- 3. If bet won, credit user balance and create transaction
  IF p_final_status = 'won' AND p_actual_winnings > 0 THEN
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM users
    WHERE id = p_user_id
    FOR UPDATE; -- Lock row for update

    -- Calculate new balance
    v_new_balance := v_current_balance + p_actual_winnings;

    -- Update user balance
    UPDATE users
    SET 
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = p_user_id;

    -- Create transaction record
    INSERT INTO transactions (
      id,
      user_id,
      type,
      amount_cents,
      balance_after_cents,
      description,
      status,
      metadata,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_user_id,
      'bet_win',
      p_actual_winnings,
      v_new_balance,
      'Bet win for bet #' || p_bet_id,
      'completed',
      jsonb_build_object('betId', p_bet_id),
      NOW()
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object('success', true);
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;
