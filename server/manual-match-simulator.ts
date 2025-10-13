/**
 * Manual Match Simulator Worker
 * 
 * Monitors manual matches and simulates realistic match progression:
 * - Starts matches at kickoff time (scheduled → live)
 * - Updates scores based on simulation events (goals at specific minutes)
 * - Completes matches after full-time (live → finished)
 * - Updates Redis cache for instant frontend updates
 */

import { storage } from './storage';
import { unifiedMatchService } from './unified-match-service';
import { redisCache } from './redis-cache';

interface MatchEvent {
  id: string;
  match_id: string;
  type: string;
  minute: number;
  second?: number;
  team: 'home' | 'away';
  player_name?: string;
  description: string;
  is_executed: boolean;
}

export class ManualMatchSimulator {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private matchesProcessed = 0;
  private eventsExecuted = 0;
  private lastRun: Date | null = null;

  constructor(private intervalSeconds = 10) {}

  /**
   * Get simulator status
   */
  getStatus() {
    return {
      isRunning: this.intervalId !== null,
      lastRun: this.lastRun?.toISOString() || null,
      matchesProcessed: this.matchesProcessed,
      eventsExecuted: this.eventsExecuted
    };
  }

  /**
   * Start the simulator worker
   */
  start(): void {
    if (this.intervalId) {
      console.log('Manual match simulator already running');
      return;
    }

    console.log(`🎮 Starting manual match simulator (runs every ${this.intervalSeconds} seconds)`);
    
    // Run immediately on start
    this.processMatches().catch(console.error);
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.processMatches().catch(console.error);
    }, this.intervalSeconds * 1000);
  }

  /**
   * Stop the simulator worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Manual match simulator stopped');
    }
  }

  /**
   * Main processing loop
   */
  private async processMatches(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();

    try {
      const now = new Date();
      
      // 1. Check for scheduled matches that should start
      await this.startScheduledMatches(now);
      
      // 2. Update live matches with events
      await this.updateLiveMatches(now);
      
      // 3. Complete finished matches
      await this.completeFinishedMatches(now);
      
    } catch (error) {
      console.error('❌ Error in manual match simulator:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start matches that have reached kickoff time
   */
  private async startScheduledMatches(now: Date): Promise<void> {
    try {
      const scheduledMatches = await storage.getScheduledManualMatches();
      
      if (scheduledMatches.length > 0) {
        console.log(`🔍 Found ${scheduledMatches.length} scheduled manual match(es)`);
      }
      
      for (const match of scheduledMatches) {
        const kickoffTime = new Date(match.kickoff_time || match.kickoffTime);
        const timeDiff = now.getTime() - kickoffTime.getTime();
        const minutesLate = Math.floor(timeDiff / 60000);
        
        // Start any match whose kickoff time has passed (no time limit)
        // This ensures matches aren't stuck in scheduled status
        if (now >= kickoffTime) {
          if (minutesLate > 0) {
            console.log(`⚽ Starting match (${minutesLate} min late): ${match.home_team_name || match.homeTeamName} vs ${match.away_team_name || match.awayTeamName}`);
          } else {
            console.log(`⚽ Starting match: ${match.home_team_name || match.homeTeamName} vs ${match.away_team_name || match.awayTeamName}`);
          }
          
          // Update match status to live
          await storage.updateMatchToLive(match.id);
          
          // Suspend markets briefly (realistic simulation)
          await storage.suspendAllMarkets(match.id);
          
          // Reopen markets after 2 seconds
          setTimeout(async () => {
            await storage.reopenAllMarkets(match.id);
            await unifiedMatchService.updateManualMatchCache(match.id);
          }, 2000);
          
          // Update cache
          await unifiedMatchService.updateManualMatchCache(match.id);
          
          this.matchesProcessed++;
        } else {
          // Log why match wasn't started (for debugging)
          const minutesUntil = Math.ceil(-timeDiff / 60000);
          console.log(`⏰ Match not ready (starts in ${minutesUntil} min): ${match.home_team_name || match.homeTeamName} vs ${match.away_team_name || match.awayTeamName}`);
        }
      }
    } catch (error) {
      console.error('Error starting scheduled matches:', error);
    }
  }

  /**
   * Update live matches with events at the correct time
   */
  private async updateLiveMatches(now: Date): Promise<void> {
    try {
      const liveMatches = await storage.getLiveManualMatches();
      
      for (const match of liveMatches) {
        const kickoffTime = new Date(match.kickoff_time || match.kickoffTime);
        const elapsedMs = now.getTime() - kickoffTime.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
        
        // Get match events
        const { events } = await storage.getMatchWithEvents(match.id);
        
        // Find events that should have happened by now but haven't been executed
        const pendingEvents = events.filter((event: MatchEvent) => {
          if (event.is_executed) return false;
          
          const eventTotalSeconds = event.minute * 60 + (event.second || 0);
          const elapsedTotalSeconds = elapsedMinutes * 60 + elapsedSeconds;
          
          return eventTotalSeconds <= elapsedTotalSeconds;
        });
        
        if (pendingEvents.length > 0) {
          console.log(`⚡ Processing ${pendingEvents.length} events for match ${match.id}`);
          
          // Process each event
          for (const event of pendingEvents) {
            await this.executeEvent(match, event);
          }
          
          // Calculate current scores from all executed events
          const allEvents = await storage.getMatchWithEvents(match.id);
          const executedGoals = allEvents.events.filter(
            (e: MatchEvent) => e.is_executed && e.type === 'goal'
          );
          
          const homeScore = executedGoals.filter((e: MatchEvent) => e.team === 'home').length;
          const awayScore = executedGoals.filter((e: MatchEvent) => e.team === 'away').length;
          
          // Update match scores
          await storage.updateMatchScore(match.id, homeScore, awayScore);
          
          // Update cache
          await unifiedMatchService.updateManualMatchCache(match.id);
          
          this.eventsExecuted += pendingEvents.length;
        }
      }
    } catch (error) {
      console.error('Error updating live matches:', error);
    }
  }

  /**
   * Execute a single match event
   */
  private async executeEvent(match: any, event: MatchEvent): Promise<void> {
    try {
      console.log(`📌 Event: ${event.type} at ${event.minute}' - ${event.team} team - ${event.description}`);
      
      // Mark event as executed
      await storage.markEventAsExecuted(event.id);
      
      // For goals, suspend and reopen markets (simulate odds adjustment)
      if (event.type === 'goal') {
        await storage.suspendAllMarkets(match.id);
        
        // Reopen with potentially adjusted odds after 3 seconds
        setTimeout(async () => {
          await storage.reopenAllMarkets(match.id);
          await unifiedMatchService.updateManualMatchCache(match.id);
        }, 3000);
      }
      
    } catch (error) {
      console.error(`Error executing event ${event.id}:`, error);
    }
  }

  /**
   * Complete matches that have finished (90+ minutes elapsed)
   */
  private async completeFinishedMatches(now: Date): Promise<void> {
    try {
      const liveMatches = await storage.getLiveManualMatches();
      
      for (const match of liveMatches) {
        const kickoffTime = new Date(match.kickoff_time || match.kickoffTime);
        const elapsedMs = now.getTime() - kickoffTime.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        
        // Check if match should be completed (90+ minutes, with 2 min buffer)
        if (elapsedMinutes >= 92) {
          console.log(`🏁 Completing match: ${match.home_team_name || match.homeTeamName} vs ${match.away_team_name || match.awayTeamName}`);
          
          // Get final scores from events
          const { events } = await storage.getMatchWithEvents(match.id);
          const goals = events.filter((e: MatchEvent) => e.type === 'goal');
          
          const homeScore = goals.filter((e: MatchEvent) => e.team === 'home').length;
          const awayScore = goals.filter((e: MatchEvent) => e.team === 'away').length;
          
          // Mark match as finished
          await storage.finishMatch(match.id, homeScore, awayScore);
          
          // Close all markets
          await storage.suspendAllMarkets(match.id);
          
          // Update cache
          await unifiedMatchService.updateManualMatchCache(match.id);
          
          this.matchesProcessed++;
        }
      }
    } catch (error) {
      console.error('Error completing finished matches:', error);
    }
  }
}

// Export singleton instance
export const manualMatchSimulator = new ManualMatchSimulator(10); // Run every 10 seconds
