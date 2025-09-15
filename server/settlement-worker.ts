import { storage } from './storage';
import * as sportmonks from './sportmonks';
import type { Bet, BetSelection } from '@shared/schema';

interface MatchResult {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status: 'finished' | 'cancelled' | 'postponed';
  winner: 'home' | 'away' | 'draw' | null;
}

interface SelectionOutcome {
  selectionId: string;
  status: 'won' | 'lost' | 'void';
  result: string;
}

interface BetOutcome {
  bet: Bet;
  selections: SelectionOutcome[];
  finalStatus: 'won' | 'lost' | 'void';
  actualWinnings: number;
}

export class BetSettlementWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private intervalMinutes = 2) {}

  /**
   * Start the settlement worker to run at specified intervals
   */
  start(): void {
    if (this.intervalId) {
      console.log('Settlement worker already running');
      return;
    }

    console.log(`Starting bet settlement worker (runs every ${this.intervalMinutes} minutes)`);
    
    // Run immediately on start
    this.processPendingBets().catch(console.error);
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.processPendingBets().catch(console.error);
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the settlement worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Settlement worker stopped');
    }
  }

  /**
   * Main settlement process - finds pending bets and settles them
   */
  private async processPendingBets(): Promise<void> {
    if (this.isRunning) {
      console.log('Settlement process already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    console.log('Processing pending bet settlements...');

    try {
      // Get all pending bets
      const pendingBets = await this.getPendingBets();
      console.log(`Found ${pendingBets.length} pending bets`);

      if (pendingBets.length === 0) {
        return;
      }

      // Get unique fixture IDs from all pending selections
      const fixtureIds = await this.getUniqueFixtureIds(pendingBets);
      console.log(`Checking results for ${fixtureIds.length} fixtures`);

      // Fetch completed match results
      const matchResults = await this.fetchCompletedMatches(fixtureIds);
      console.log(`Found ${matchResults.length} completed matches`);

      if (matchResults.length === 0) {
        console.log('No completed matches found');
        return;
      }

      // Process settlements for each bet
      let settledBetsCount = 0;
      for (const bet of pendingBets) {
        try {
          const settled = await this.settleBet(bet, matchResults);
          if (settled) {
            settledBetsCount++;
          }
        } catch (error) {
          console.error(`Failed to settle bet ${bet.id}:`, error);
        }
      }

      console.log(`Successfully settled ${settledBetsCount} bets`);
      
    } catch (error) {
      console.error('Error processing pending bets:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all pending bets with their selections
   */
  private async getPendingBets(): Promise<Bet[]> {
    // Get all pending bets from storage
    // In MemStorage, we need to iterate through the storage maps
    const allPendingBets: Bet[] = [];
    
    try {
      // Access the internal storage to get all bets
      // This is a workaround for the in-memory storage limitation
      const storageInstance = storage as any;
      const allBets = Array.from(storageInstance.bets.values()) as Bet[];
      
      // Filter for pending bets
      const pendingBets = allBets.filter(bet => bet.status === 'pending');
      allPendingBets.push(...pendingBets);
      
      console.log(`Found ${pendingBets.length} pending bets across all users`);
      return allPendingBets;
      
    } catch (error) {
      console.error('Error getting pending bets:', error);
      return [];
    }
  }


  /**
   * Extract unique fixture IDs from pending bets
   */
  private async getUniqueFixtureIds(bets: Bet[]): Promise<string[]> {
    const fixtureIds = new Set<string>();
    
    for (const bet of bets) {
      try {
        // Get selections for this bet - properly await the async call
        const selections = await storage.getBetSelections(bet.id);
        selections.forEach(selection => fixtureIds.add(selection.fixtureId));
      } catch (error) {
        console.error(`Error getting selections for bet ${bet.id}:`, error);
      }
    }
    
    console.log(`Extracted ${fixtureIds.size} unique fixture IDs`);
    return Array.from(fixtureIds);
  }

  /**
   * Fetch completed match results from SportMonks API
   */
  private async fetchCompletedMatches(fixtureIds: string[]): Promise<MatchResult[]> {
    const results: MatchResult[] = [];
    
    for (const fixtureId of fixtureIds) {
      try {
        // Fetch fixture with results from SportMonks API
        const fixtureResult = await this.fetchFixtureResult(fixtureId);
        if (fixtureResult) {
          results.push(fixtureResult);
        }
      } catch (error) {
        console.error(`Failed to fetch result for fixture ${fixtureId}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Fetch individual fixture result from SportMonks API
   */
  private async fetchFixtureResult(fixtureId: string): Promise<MatchResult | null> {
    try {
      console.log(`Fetching result for fixture ${fixtureId}`);
      
      // Get SportMonks API token from environment
      const apiToken = process.env.SPORTMONKS_API_TOKEN;
      if (!apiToken) {
        console.error('SPORTMONKS_API_TOKEN not found in environment');
        return null;
      }
      
      // Fetch fixture data from SportMonks API
      const response = await fetch(
        `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}?api_token=${apiToken}&include=scores,state,participants`
      );
      
      if (!response.ok) {
        console.error(`API response not ok for fixture ${fixtureId}:`, response.status);
        return null;
      }
      
      const result = await response.json();
      
      if (!result.data) {
        console.log(`No data returned for fixture ${fixtureId}`);
        return null;
      }
      
      const fixture = result.data;
      
      // Check if match is finished
      const state = fixture.state?.name;
      if (state !== 'FT' && state !== 'AET' && state !== 'PEN') {
        console.log(`Fixture ${fixtureId} not finished yet (state: ${state})`);
        return null; // Match not finished yet
      }
      
      // Extract scores from the scores array
      const scores = fixture.scores || [];
      const homeScore = scores.find((s: any) => 
        s.description === 'CURRENT' && s.score.participant === 'home'
      )?.score?.goals || 0;
      const awayScore = scores.find((s: any) => 
        s.description === 'CURRENT' && s.score.participant === 'away'
      )?.score?.goals || 0;
      
      console.log(`Fixture ${fixtureId} result: ${homeScore}-${awayScore} (${state})`);
      
      // Create MatchResult object
      return {
        fixtureId,
        homeScore,
        awayScore,
        totalGoals: homeScore + awayScore,
        matchDate: fixture.starting_at,
        homeTeam: fixture.participants?.find((p: any) => p.meta?.location === 'home')?.name || 'Home',
        awayTeam: fixture.participants?.find((p: any) => p.meta?.location === 'away')?.name || 'Away'
      };
      
    } catch (error) {
      console.error(`Error fetching fixture ${fixtureId}:`, error);
      return null;
    }
  }

  /**
   * Settle individual bet based on match results
   */
  private async settleBet(bet: Bet, matchResults: MatchResult[]): Promise<boolean> {
    try {
      // Get bet selections
      const selections = await storage.getBetSelections(bet.id);
      if (selections.length === 0) {
        console.warn(`No selections found for bet ${bet.id}`);
        return false;
      }

      // Check if all selections have results available
      const selectionOutcomes = await this.evaluateSelections(selections, matchResults);
      
      // Check if we have results for all selections
      if (selectionOutcomes.length !== selections.length) {
        console.log(`Bet ${bet.id}: Not all selections have results yet`);
        return false;
      }

      // Determine overall bet outcome
      const betOutcome = this.calculateBetOutcome(bet, selectionOutcomes);
      
      // Update individual selections
      for (const outcome of selectionOutcomes) {
        await storage.updateSelectionStatus(outcome.selectionId, outcome.status, outcome.result);
      }

      // Update bet status and winnings
      await storage.updateBetStatus(bet.id, betOutcome.finalStatus, betOutcome.actualWinnings);

      // Process payout if bet won
      if (betOutcome.finalStatus === 'won' && betOutcome.actualWinnings > 0) {
        await this.processPayout(bet.userId, betOutcome.actualWinnings, bet.id);
      }

      console.log(`Settled bet ${bet.id}: ${betOutcome.finalStatus} - winnings: ${betOutcome.actualWinnings}`);
      return true;
      
    } catch (error) {
      console.error(`Error settling bet ${bet.id}:`, error);
      return false;
    }
  }

  /**
   * Evaluate individual selections against match results
   */
  private async evaluateSelections(selections: BetSelection[], matchResults: MatchResult[]): Promise<SelectionOutcome[]> {
    const outcomes: SelectionOutcome[] = [];
    
    for (const selection of selections) {
      const matchResult = matchResults.find(result => result.fixtureId === selection.fixtureId);
      
      if (!matchResult) {
        // No result available yet
        continue;
      }

      if (matchResult.status !== 'finished') {
        // Match cancelled/postponed - mark as void
        outcomes.push({
          selectionId: selection.id,
          status: 'void',
          result: `Match ${matchResult.status}`
        });
        continue;
      }

      // Evaluate selection based on market type
      const outcome = this.evaluateSelection(selection, matchResult);
      outcomes.push(outcome);
    }
    
    return outcomes;
  }

  /**
   * Evaluate individual selection outcome based on market and result
   */
  private evaluateSelection(selection: BetSelection, matchResult: MatchResult): SelectionOutcome {
    const { market, selection: selectionType } = selection;
    const { homeScore, awayScore, winner } = matchResult;

    let isWon = false;
    let resultText = `${homeScore}-${awayScore}`;

    switch (market) {
      case '1x2':
        if (selectionType === 'home' && winner === 'home') isWon = true;
        else if (selectionType === 'away' && winner === 'away') isWon = true;
        else if (selectionType === 'draw' && winner === 'draw') isWon = true;
        resultText = `Result: ${homeScore}-${awayScore} (${winner})`;
        break;

      case 'totalgoals':
        const totalGoals = homeScore + awayScore;
        if (selectionType === 'over35' && totalGoals > 3.5) isWon = true;
        else if (selectionType === 'under35' && totalGoals < 3.5) isWon = true;
        else if (selectionType === 'over25' && totalGoals > 2.5) isWon = true;
        else if (selectionType === 'under25' && totalGoals < 2.5) isWon = true;
        resultText = `Total goals: ${totalGoals}`;
        break;

      case 'nextgoal':
        // For next goal markets, we'd need more detailed match data
        // For now, mark as void since we don't have minute-by-minute data
        return {
          selectionId: selection.id,
          status: 'void',
          result: 'Next goal market not supported yet'
        };

      default:
        console.warn(`Unknown market type: ${market}`);
        return {
          selectionId: selection.id,
          status: 'void',
          result: 'Unknown market type'
        };
    }

    return {
      selectionId: selection.id,
      status: isWon ? 'won' : 'lost',
      result: resultText
    };
  }

  /**
   * Calculate overall bet outcome based on selection outcomes
   */
  private calculateBetOutcome(bet: Bet, selectionOutcomes: SelectionOutcome[]): BetOutcome {
    const wonCount = selectionOutcomes.filter(o => o.status === 'won').length;
    const lostCount = selectionOutcomes.filter(o => o.status === 'lost').length;
    const voidCount = selectionOutcomes.filter(o => o.status === 'void').length;

    let finalStatus: 'won' | 'lost' | 'void';
    let actualWinnings = 0;

    switch (bet.type) {
      case 'single':
        // Single bet: all selections must win
        if (voidCount > 0) {
          finalStatus = 'void';
          actualWinnings = bet.totalStake; // Return stake
        } else if (wonCount === selectionOutcomes.length) {
          finalStatus = 'won';
          actualWinnings = bet.potentialWinnings;
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      case 'express':
        // Express bet: all selections must win
        if (lostCount > 0) {
          finalStatus = 'lost';
          actualWinnings = 0;
        } else if (voidCount > 0) {
          // Proper handling: remove void selections and recalculate with remaining odds
          const nonVoidSelections = selectionOutcomes.filter(o => o.status !== 'void');
          if (nonVoidSelections.length === 0) {
            finalStatus = 'void';
            actualWinnings = bet.totalStake;
          } else if (nonVoidSelections.every(s => s.status === 'won')) {
            // Recalculate winnings with reduced odds
            const combinedOdds = nonVoidSelections.reduce((acc, sel) => acc * sel.odds, 1);
            actualWinnings = bet.totalStake * combinedOdds;
            finalStatus = 'won';
          } else {
            finalStatus = 'lost';
            actualWinnings = 0;
          }
        } else if (wonCount === selectionOutcomes.length) {
          finalStatus = 'won';
          actualWinnings = bet.potentialWinnings;
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      case 'system':
        // System bet: complex calculation based on combinations
        // For now, simplified version
        if (wonCount >= Math.ceil(selectionOutcomes.length / 2)) {
          finalStatus = 'won';
          actualWinnings = Math.round(bet.potentialWinnings * (wonCount / selectionOutcomes.length));
        } else {
          finalStatus = 'lost';
          actualWinnings = 0;
        }
        break;

      default:
        finalStatus = 'lost';
        actualWinnings = 0;
    }

    return {
      bet,
      selections: selectionOutcomes,
      finalStatus,
      actualWinnings
    };
  }

  /**
   * Process payout to user's wallet
   */
  private async processPayout(userId: string, winningsCents: number, betId: string): Promise<void> {
    try {
      // Get user's current balance
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Calculate new balance
      const newBalanceCents = user.balance + winningsCents;
      
      // Update user balance
      await storage.updateUserBalance(userId, newBalanceCents);

      // Create transaction record
      await storage.createTransaction({
        userId,
        type: 'bet_winnings',
        amount: winningsCents,
        balanceBefore: user.balance,
        balanceAfter: newBalanceCents,
        reference: betId,
        description: `Winnings from bet ${betId.slice(0, 8)}...`
      });

      console.log(`Processed payout: ${winningsCents} cents to user ${userId}`);
      
    } catch (error) {
      console.error(`Failed to process payout for user ${userId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const settlementWorker = new BetSettlementWorker(2); // Run every 2 minutes