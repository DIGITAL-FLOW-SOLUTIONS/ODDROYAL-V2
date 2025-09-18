import { eq, and, sql, lte } from "drizzle-orm";
import { db } from "./db";
import { matches, matchEvents, markets, marketOutcomes } from "@shared/schema";
import { broadcastMatchUpdate, broadcastMarketUpdate, broadcastEventUpdate } from "./websocket";

interface LiveMatchUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  events: any[];
}

interface MatchEvent {
  id: string;
  matchId: string;
  type: string;
  minute: number;
  second: number;
  team: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  description?: string;
  isExecuted: boolean;
  scheduledTime?: Date;
}

export class LiveMatchSimulator {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private simulationSpeed = 1; // 1 = real-time, 2 = 2x speed, etc.
  private activeSimulations = new Map<string, {
    matchId: string;
    startTime: Date;
    currentMinute: number;
    homeScore: number;
    awayScore: number;
    status: string;
    nextEventIndex: number;
    events: MatchEvent[];
    isPaused: boolean;
  }>();

  constructor() {
    console.log('🔴 Live Match Simulator initialized');
  }

  /**
   * Start the simulation engine
   * @param intervalSeconds How often to check for updates (default 30 seconds)
   * @param speed Simulation speed multiplier (1 = real-time, 2 = 2x speed)
   */
  start(intervalSeconds: number = 30, speed: number = 1) {
    if (this.isRunning) {
      console.log('⚠️ Live Match Simulator already running');
      return;
    }

    this.simulationSpeed = speed;
    this.isRunning = true;
    
    console.log(`🟢 Starting Live Match Simulator - Interval: ${intervalSeconds}s, Speed: ${speed}x`);
    
    // Run immediately then at intervals
    this.processLiveMatches();
    
    this.intervalId = setInterval(() => {
      this.processLiveMatches();
    }, intervalSeconds * 1000);
  }

  /**
   * Stop the simulation engine
   */
  stop() {
    if (!this.isRunning) return;
    
    console.log('🔴 Stopping Live Match Simulator');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.activeSimulations.clear();
  }

  /**
   * Set simulation speed
   * @param speed Multiplier (1 = real-time, 2 = 2x speed, etc.)
   */
  setSimulationSpeed(speed: number) {
    this.simulationSpeed = Math.max(0.1, Math.min(speed, 10)); // Clamp between 0.1x and 10x
    console.log(`⚡ Simulation speed set to ${this.simulationSpeed}x`);
  }

  /**
   * Pause simulation for a specific match
   */
  pauseMatch(matchId: string) {
    const simulation = this.activeSimulations.get(matchId);
    if (simulation) {
      simulation.isPaused = true;
      console.log(`⏸️ Match ${matchId} simulation paused`);
    }
  }

  /**
   * Resume simulation for a specific match
   */
  resumeMatch(matchId: string) {
    const simulation = this.activeSimulations.get(matchId);
    if (simulation) {
      simulation.isPaused = false;
      console.log(`▶️ Match ${matchId} simulation resumed`);
    }
  }

  /**
   * Main processing loop - checks for matches to start and processes active simulations
   */
  private async processLiveMatches() {
    try {
      console.log('🔄 Processing live matches...');
      
      // Check for matches that should start
      await this.checkForMatchesToStart();
      
      // Process active simulations
      await this.processActiveSimulations();
      
      // Check for matches to finish
      await this.checkForMatchesToFinish();
      
    } catch (error) {
      console.error('❌ Error in live match processing:', error);
    }
  }

  /**
   * Check for scheduled manual matches where kickoff time has passed
   */
  private async checkForMatchesToStart() {
    try {
      const now = new Date();
      
      // Find scheduled manual matches where kickoff time has passed
      const matchesToStart = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.status, 'scheduled'),
            eq(matches.isManual, true),
            eq(matches.isDeleted, false),
            lte(matches.kickoffTime, now)
          )
        );

      for (const match of matchesToStart) {
        await this.startMatchSimulation(match);
      }
      
    } catch (error) {
      console.error('❌ Error checking for matches to start:', error);
    }
  }

  /**
   * Start simulation for a specific match
   */
  private async startMatchSimulation(match: any) {
    try {
      console.log(`🚀 Starting simulation for match: ${match.homeTeamName} vs ${match.awayTeamName}`);
      
      // Update match status to live
      await db
        .update(matches)
        .set({ 
          status: 'live',
          updatedAt: new Date()
        })
        .where(eq(matches.id, match.id));

      // Get all simulated events for this match
      const events = await db
        .select()
        .from(matchEvents)
        .where(
          and(
            eq(matchEvents.matchId, match.id),
            eq(matchEvents.isSimulated, true),
            eq(matchEvents.isExecuted, false)
          )
        )
        .orderBy(matchEvents.minute, matchEvents.second, matchEvents.orderIndex);

      // Create simulation state
      const simulation = {
        matchId: match.id,
        startTime: new Date(),
        currentMinute: 0,
        homeScore: 0,
        awayScore: 0,
        status: 'live',
        nextEventIndex: 0,
        events: events as MatchEvent[],
        isPaused: false
      };

      this.activeSimulations.set(match.id, simulation);

      // Broadcast match started
      await broadcastMatchUpdate({
        type: 'match_started',
        matchId: match.id,
        homeTeam: match.homeTeamName,
        awayTeam: match.awayTeamName,
        homeScore: 0,
        awayScore: 0,
        minute: 0,
        status: 'live',
        timestamp: new Date().toISOString()
      });

      // Suspend all markets for this match temporarily
      await this.suspendMatchMarkets(match.id, 'Match started - markets temporarily suspended');

      // Reopen markets after 2 seconds (simulate brief suspension)
      setTimeout(async () => {
        await this.reopenMatchMarkets(match.id);
      }, 2000);

    } catch (error) {
      console.error(`❌ Error starting match simulation for ${match.id}:`, error);
    }
  }

  /**
   * Process all active simulations
   */
  private async processActiveSimulations() {
    const activeMatches = Array.from(this.activeSimulations.values());
    
    for (const simulation of activeMatches) {
      if (simulation.isPaused) continue;
      
      try {
        await this.processMatchSimulation(simulation);
      } catch (error) {
        console.error(`❌ Error processing simulation for match ${simulation.matchId}:`, error);
      }
    }
  }

  /**
   * Process individual match simulation
   */
  private async processMatchSimulation(simulation: any) {
    const now = new Date();
    const elapsedTime = now.getTime() - simulation.startTime.getTime();
    const simulatedElapsedMinutes = Math.floor((elapsedTime / 1000 / 60) * this.simulationSpeed);
    
    // Update current minute (max 90 minutes + injury time)
    const newMinute = Math.min(simulatedElapsedMinutes, 95);
    
    if (newMinute > simulation.currentMinute) {
      simulation.currentMinute = newMinute;
      
      // Check for events to execute at this minute
      await this.executeEventsAtMinute(simulation, newMinute);
    }

    // Broadcast periodic updates (every 5 minutes or on events)
    if (simulation.currentMinute % 5 === 0 && simulation.currentMinute !== 0) {
      await broadcastMatchUpdate({
        type: 'match_update',
        matchId: simulation.matchId,
        homeScore: simulation.homeScore,
        awayScore: simulation.awayScore,
        minute: simulation.currentMinute,
        status: 'live',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Execute events that should happen at the current minute
   */
  private async executeEventsAtMinute(simulation: any, minute: number) {
    const eventsToExecute = simulation.events.filter((event: MatchEvent) => 
      event.minute === minute && !event.isExecuted
    );

    for (const event of eventsToExecute) {
      await this.executeEvent(simulation, event);
    }
  }

  /**
   * Execute a specific match event
   */
  private async executeEvent(simulation: any, event: MatchEvent) {
    try {
      console.log(`⚽ Executing event: ${event.type} at ${event.minute}' for match ${simulation.matchId}`);
      
      // Update scores if it's a goal
      if (event.type === 'goal') {
        if (event.team === 'home') {
          simulation.homeScore++;
        } else {
          simulation.awayScore++;
        }

        // Update database
        await db
          .update(matches)
          .set({
            homeScore: simulation.homeScore,
            awayScore: simulation.awayScore,
            updatedAt: new Date()
          })
          .where(eq(matches.id, simulation.matchId));

        // Suspend markets temporarily for goal
        await this.suspendMatchMarkets(simulation.matchId, 'Goal scored - markets suspended');
        
        // Reopen with updated odds after 10 seconds
        setTimeout(async () => {
          await this.updateMarketOddsForScore(simulation.matchId, simulation.homeScore, simulation.awayScore);
          await this.reopenMatchMarkets(simulation.matchId);
        }, 10000);
      }

      // Mark event as executed
      await db
        .update(matchEvents)
        .set({ 
          isExecuted: true,
          updatedAt: new Date()
        })
        .where(eq(matchEvents.id, event.id));

      // Broadcast event update
      await broadcastEventUpdate({
        type: 'match_event',
        matchId: simulation.matchId,
        eventType: event.type,
        minute: event.minute,
        team: event.team,
        playerName: event.playerName,
        description: event.description,
        homeScore: simulation.homeScore,
        awayScore: simulation.awayScore,
        timestamp: new Date().toISOString()
      });

      // Update simulation state
      event.isExecuted = true;

    } catch (error) {
      console.error(`❌ Error executing event ${event.id}:`, error);
    }
  }

  /**
   * Suspend all markets for a match
   */
  private async suspendMatchMarkets(matchId: string, reason: string) {
    try {
      await db
        .update(markets)
        .set({ 
          status: 'suspended',
          updatedAt: new Date()
        })
        .where(eq(markets.matchId, matchId));

      await broadcastMarketUpdate({
        type: 'markets_suspended',
        matchId,
        reason,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error suspending markets for match ${matchId}:`, error);
    }
  }

  /**
   * Reopen markets for a match
   */
  private async reopenMatchMarkets(matchId: string) {
    try {
      await db
        .update(markets)
        .set({ 
          status: 'open',
          updatedAt: new Date()
        })
        .where(eq(markets.matchId, matchId));

      await broadcastMarketUpdate({
        type: 'markets_reopened',
        matchId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error reopening markets for match ${matchId}:`, error);
    }
  }

  /**
   * Update market odds based on current score
   */
  private async updateMarketOddsForScore(matchId: string, homeScore: number, awayScore: number) {
    try {
      // This is a simplified odds adjustment - in production you'd have more sophisticated algorithms
      const marketOutcomesToUpdate = await db
        .select()
        .from(marketOutcomes)
        .innerJoin(markets, eq(markets.id, marketOutcomes.marketId))
        .where(eq(markets.matchId, matchId));

      for (const outcome of marketOutcomesToUpdate) {
        let newOdds = parseFloat(outcome.market_outcomes.odds);
        
        // Adjust 1X2 odds based on score
        if (outcome.markets.type === '1x2') {
          if (outcome.market_outcomes.key === 'home' && homeScore > awayScore) {
            newOdds = Math.max(1.01, newOdds * 0.7); // Decrease odds for leading team
          } else if (outcome.market_outcomes.key === 'away' && awayScore > homeScore) {
            newOdds = Math.max(1.01, newOdds * 0.7); // Decrease odds for leading team
          } else if (outcome.market_outcomes.key === 'draw') {
            newOdds = newOdds * 1.3; // Increase draw odds when there's a score difference
          }
        }

        // Update the odds
        await db
          .update(marketOutcomes)
          .set({ 
            odds: newOdds.toFixed(2),
            updatedAt: new Date()
          })
          .where(eq(marketOutcomes.id, outcome.market_outcomes.id));
      }

    } catch (error) {
      console.error(`❌ Error updating market odds for match ${matchId}:`, error);
    }
  }

  /**
   * Check for matches that should finish
   */
  private async checkForMatchesToFinish() {
    const activeMatches = Array.from(this.activeSimulations.values());
    
    for (const simulation of activeMatches) {
      // Finish match if it's been running for more than 95 minutes
      if (simulation.currentMinute >= 95) {
        await this.finishMatch(simulation);
      }
    }
  }

  /**
   * Finish a match simulation
   */
  private async finishMatch(simulation: any) {
    try {
      console.log(`🏁 Finishing match ${simulation.matchId} - Final Score: ${simulation.homeScore}-${simulation.awayScore}`);
      
      // Update match status to finished
      await db
        .update(matches)
        .set({ 
          status: 'finished',
          homeScore: simulation.homeScore,
          awayScore: simulation.awayScore,
          updatedAt: new Date()
        })
        .where(eq(matches.id, simulation.matchId));

      // Close all markets for this match
      await db
        .update(markets)
        .set({ 
          status: 'settled',
          updatedAt: new Date()
        })
        .where(eq(markets.matchId, simulation.matchId));

      // Broadcast match finished
      await broadcastMatchUpdate({
        type: 'match_finished',
        matchId: simulation.matchId,
        homeScore: simulation.homeScore,
        awayScore: simulation.awayScore,
        minute: 90,
        status: 'finished',
        timestamp: new Date().toISOString()
      });

      // Remove from active simulations
      this.activeSimulations.delete(simulation.matchId);

    } catch (error) {
      console.error(`❌ Error finishing match ${simulation.matchId}:`, error);
    }
  }

  /**
   * Get current simulation status
   */
  getSimulationStatus() {
    return {
      isRunning: this.isRunning,
      simulationSpeed: this.simulationSpeed,
      activeSimulations: this.activeSimulations.size,
      matches: Array.from(this.activeSimulations.values()).map(sim => ({
        matchId: sim.matchId,
        minute: sim.currentMinute,
        score: `${sim.homeScore}-${sim.awayScore}`,
        status: sim.status,
        isPaused: sim.isPaused
      }))
    };
  }
}

// Export singleton instance
export const liveMatchSimulator = new LiveMatchSimulator();