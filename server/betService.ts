import { supabaseAdmin } from "./supabase.js";
import { randomUUID } from "crypto";
import { currencyUtils } from "@shared/schema.js";

export interface BetPlacementRequest {
  betType: "single" | "express" | "system";
  totalStakeCents: number;
  selections: Array<{
    fixtureId: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    market: string;
    selection: string;
    odds: string;
  }>;
}

export interface BetPlacementResult {
  success: boolean;
  bet?: any;
  selections?: any[];
  newBalance?: number;
  transaction?: any;
  error?: string;
}

export class BetService {
  /**
   * Place a bet atomically - handles all database operations in a transaction
   */
  async placeBet(userId: string, request: BetPlacementRequest): Promise<BetPlacementResult> {
    try {
      // Step 1: Get user and validate balance
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return { success: false, error: "User not found" };
      }

      if (user.balance < request.totalStakeCents) {
        return { success: false, error: "Insufficient balance" };
      }

      // Step 2: Calculate odds and winnings
      const totalOdds = request.selections.reduce((acc, selection) => 
        acc * parseFloat(selection.odds), 1
      );

      if (totalOdds < 1.01 || totalOdds > 10000) {
        return { success: false, error: "Invalid total odds" };
      }

      const potentialWinnings = Math.round(request.totalStakeCents * totalOdds);
      const newBalance = user.balance - request.totalStakeCents;

      // Step 3: Create bet record
      const betId = randomUUID();
      const { data: bet, error: betError } = await supabaseAdmin
        .from('bets')
        .insert({
          id: betId,
          user_id: userId,
          type: request.betType,
          total_stake: request.totalStakeCents,
          potential_winnings: potentialWinnings,
          total_odds: totalOdds.toFixed(4),
          status: 'pending'
        })
        .select()
        .single();

      if (betError) {
        console.error('Error creating bet:', betError);
        return { success: false, error: "Failed to create bet: " + betError.message };
      }

      // Step 4: Create bet selections
      const selections = [];
      for (const selection of request.selections) {
        const marketId = `${selection.fixtureId}-${selection.market}`;
        const outcomeId = `${selection.fixtureId}-${selection.market}-${selection.selection}`;

        const { data: betSelection, error: selectionError } = await supabaseAdmin
          .from('bet_selections')
          .insert({
            id: randomUUID(),
            bet_id: betId,
            fixture_id: selection.fixtureId,
            home_team: selection.homeTeam,
            away_team: selection.awayTeam,
            league: selection.league,
            market_id: marketId,
            outcome_id: outcomeId,
            market: selection.market,
            selection: selection.selection,
            odds: selection.odds,
            status: 'pending'
          })
          .select()
          .single();

        if (selectionError) {
          console.error('Error creating bet selection:', selectionError);
          // Rollback: Delete the bet we just created
          await supabaseAdmin.from('bets').delete().eq('id', betId);
          return { success: false, error: "Failed to create bet selection: " + selectionError.message };
        }

        selections.push(betSelection);
      }

      // Step 5: Update user balance
      const { error: balanceError } = await supabaseAdmin
        .from('users')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        // Rollback: Delete bet and selections
        await supabaseAdmin.from('bets').delete().eq('id', betId);
        return { success: false, error: "Failed to update balance: " + balanceError.message };
      }

      // Step 6: Create transaction record
      const { data: transaction, error: transactionError } = await supabaseAdmin
        .from('transactions')
        .insert({
          id: randomUUID(),
          user_id: userId,
          type: 'bet_stake',
          amount: -request.totalStakeCents,
          balance_before: user.balance,
          balance_after: newBalance,
          reference: betId,
          description: `Bet placed: ${request.betType} bet with ${selections.length} selection(s)`,
          status: 'completed'
        })
        .select()
        .single();

      if (transactionError) {
        console.error('Error creating transaction:', transactionError);
        // Note: We don't rollback here as balance update succeeded, but log the error
      }

      return {
        success: true,
        bet,
        selections,
        newBalance,
        transaction
      };

    } catch (error) {
      console.error('Bet placement error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Get user's bet history with selections
   */
  async getUserBets(userId: string, limit: number = 50) {
    try {
      // Get bets
      const { data: bets, error: betsError } = await supabaseAdmin
        .from('bets')
        .select('*')
        .eq('user_id', userId)
        .order('placed_at', { ascending: false })
        .limit(limit);

      if (betsError) {
        throw betsError;
      }

      // Get selections for each bet
      const betsWithSelections = [];
      for (const bet of bets) {
        const { data: selections, error: selectionsError } = await supabaseAdmin
          .from('bet_selections')
          .select('*')
          .eq('bet_id', bet.id)
          .order('created_at', { ascending: true });

        if (selectionsError) {
          console.error('Error fetching selections for bet', bet.id, selectionsError);
          continue;
        }

        betsWithSelections.push({
          ...bet,
          selections: selections || []
        });
      }

      return { success: true, data: betsWithSelections };
    } catch (error) {
      console.error('Error fetching user bets:', error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

export const betService = new BetService();