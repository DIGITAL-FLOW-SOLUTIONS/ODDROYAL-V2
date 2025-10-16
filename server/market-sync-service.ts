import { storage } from './storage';
import { oddsApiClient } from './odds-api-client';
import { redisCache } from './redis-cache';
import { getSportApiConfig, getSportMarketConfig } from './match-utils';

interface MarketOutcome {
  name: string;
  price: number;
  point?: number;
}

interface ApiMarket {
  key: string;
  outcomes: MarketOutcome[];
  last_update?: string;
}

interface PersistedMarket {
  id: string;
  matchId: string;
  key: string;
  name: string;
  type: string;
  outcomes: Array<{
    id: string;
    key: string;
    label: string;
    odds: string;
    status: string;
  }>;
}

/**
 * Market Sync Service
 * Fetches markets from The Odds API and persists them to the database
 * Ensures markets are always available even if API fails
 */
class MarketSyncService {
  /**
   * Sync markets for a specific match
   * @param matchId - Internal match ID
   * @param externalId - The Odds API event ID
   * @param sportKey - Sport key (football, basketball, etc.)
   * @param sportCategory - Our internal sport category
   */
  async syncMarketsForMatch(
    matchId: string,
    externalId: string,
    sportKey: string,
    sportCategory: string
  ): Promise<void> {
    try {
      console.log(`🔄 Syncing markets for match ${matchId} (${sportKey})`);

      // Get sport-specific config
      const apiConfig = getSportApiConfig(sportCategory);
      const marketConfig = getSportMarketConfig(sportCategory);

      // Fetch markets from The Odds API
      const oddsData = await oddsApiClient.getEventOdds(sportKey, externalId, {
        markets: apiConfig.markets,
        regions: apiConfig.regions,
        sportCategory,
      });

      if (!oddsData || !oddsData.bookmakers || oddsData.bookmakers.length === 0) {
        console.log(`⚠️ No odds data available for match ${matchId}`);
        return;
      }

      // Use the first bookmaker (or the one with most markets)
      const bestBookmaker = oddsData.bookmakers.reduce((best: any, current: any) => {
        const bestMarkets = best.markets?.length || 0;
        const currentMarkets = current.markets?.length || 0;
        return currentMarkets > bestMarkets ? current : best;
      }, oddsData.bookmakers[0]);

      if (!bestBookmaker.markets) {
        console.log(`⚠️ No markets available for match ${matchId}`);
        return;
      }

      console.log(`📊 Found ${bestBookmaker.markets.length} markets from API`);

      // Get existing markets from database
      const existingMarkets = await storage.getMatchMarkets(matchId);
      const existingMarketKeys = new Set(existingMarkets.map((m: any) => m.key));

      // Process each market
      for (const apiMarket of bestBookmaker.markets) {
        await this.syncSingleMarket(
          matchId,
          apiMarket,
          sportCategory,
          marketConfig,
          existingMarkets
        );
      }

      // Cache the synced markets
      const allMarkets = await storage.getMatchMarkets(matchId);
      await redisCache.setMatchMarkets(matchId, allMarkets, 300); // 5 min TTL

      console.log(`✅ Market sync complete for match ${matchId}`);
    } catch (error) {
      console.error(`❌ Error syncing markets for match ${matchId}:`, error);
      // Don't throw - keep existing markets available
    }
  }

  /**
   * Sync a single market
   */
  private async syncSingleMarket(
    matchId: string,
    apiMarket: ApiMarket,
    sportCategory: string,
    marketConfig: any,
    existingMarkets: PersistedMarket[]
  ): Promise<void> {
    try {
      const marketKey = apiMarket.key;
      
      // Find market label from config
      let marketName = marketKey.replace(/_/g, ' ').toUpperCase();
      for (const category of marketConfig.categories) {
        const configMarket = category.markets.find((m: any) => m.key === marketKey);
        if (configMarket) {
          marketName = configMarket.name;
          break;
        }
      }

      // Check if market exists
      const existingMarket = existingMarkets.find((m: any) => m.key === marketKey);

      if (existingMarket) {
        // Update existing market outcomes
        await this.updateMarketOutcomes(existingMarket, apiMarket.outcomes);
      } else {
        // Create new market with outcomes
        await this.createNewMarket(matchId, marketKey, marketName, apiMarket.outcomes);
      }
    } catch (error) {
      console.error(`❌ Error syncing market ${apiMarket.key}:`, error);
      // Continue with other markets
    }
  }

  /**
   * Create a new market with outcomes
   */
  private async createNewMarket(
    matchId: string,
    marketKey: string,
    marketName: string,
    outcomes: MarketOutcome[]
  ): Promise<void> {
    try {
      const marketData = {
        matchId,
        key: marketKey,
        name: marketName,
        type: marketKey,
        status: 'open',
        outcomes: outcomes.map((outcome, index) => ({
          key: this.generateOutcomeKey(outcome.name, marketKey),
          label: outcome.name,
          odds: outcome.price.toString(),
          status: 'active',
          displayOrder: index,
          point: outcome.point,
        })),
      };

      await storage.createMarketWithOutcomes(marketData);
      console.log(`✅ Created new market: ${marketName} (${marketKey})`);
    } catch (error) {
      console.error(`❌ Error creating market ${marketKey}:`, error);
      throw error;
    }
  }

  /**
   * Update outcomes for an existing market
   */
  private async updateMarketOutcomes(
    existingMarket: PersistedMarket,
    newOutcomes: MarketOutcome[]
  ): Promise<void> {
    try {
      let updatedCount = 0;

      for (const newOutcome of newOutcomes) {
        const outcomeKey = this.generateOutcomeKey(newOutcome.name, existingMarket.key);
        const existingOutcome = existingMarket.outcomes.find(
          (o: any) => o.key === outcomeKey || o.label === newOutcome.name
        );

        if (existingOutcome) {
          const newOdds = newOutcome.price.toString();
          
          // Only update if odds changed
          if (existingOutcome.odds !== newOdds) {
            await storage.updateMarketOutcome(existingOutcome.id, {
              odds: newOdds,
            });
            updatedCount++;
          }
        } else {
          // New outcome added to existing market
          await storage.createMarketOutcome({
            marketId: existingMarket.id,
            key: outcomeKey,
            label: newOutcome.name,
            odds: newOutcome.price.toString(),
            status: 'active',
            displayOrder: existingMarket.outcomes.length,
          });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        console.log(`✅ Updated ${updatedCount} outcomes for market: ${existingMarket.name}`);
      }
    } catch (error) {
      console.error(`❌ Error updating market outcomes:`, error);
      throw error;
    }
  }

  /**
   * Generate a consistent outcome key
   */
  private generateOutcomeKey(outcomeName: string, marketKey: string): string {
    const normalized = outcomeName.toLowerCase().replace(/\s+/g, '_');
    
    // Map common outcome names to standard keys
    const standardKeys: Record<string, string> = {
      // h2h market
      home: '1',
      draw: 'x',
      away: '2',
      // Over/Under
      over: 'over',
      under: 'under',
    };

    // Check if this is a standard key
    for (const [key, value] of Object.entries(standardKeys)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return normalized;
  }

  /**
   * Batch sync markets for multiple matches
   */
  async batchSyncMarkets(
    matches: Array<{
      matchId: string;
      externalId: string;
      sportKey: string;
      sportCategory: string;
    }>
  ): Promise<void> {
    console.log(`🔄 Batch syncing markets for ${matches.length} matches`);

    // Sync in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < matches.length; i += batchSize) {
      const batch = matches.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map((match) =>
          this.syncMarketsForMatch(
            match.matchId,
            match.externalId,
            match.sportKey,
            match.sportCategory
          )
        )
      );

      // Small delay between batches
      if (i + batchSize < matches.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Batch market sync complete`);
  }

  /**
   * Get cached markets or fetch from database
   */
  async getMarketsForMatch(matchId: string): Promise<any[]> {
    try {
      // Try Redis cache first
      const cached = await redisCache.getMatchMarkets(matchId);
      if (cached) {
        return cached;
      }

      // Fallback to database
      const markets = await storage.getMatchMarkets(matchId);
      
      // Cache for future requests
      if (markets.length > 0) {
        await redisCache.setMatchMarkets(matchId, markets, 300);
      }

      return markets;
    } catch (error) {
      console.error(`Error getting markets for match ${matchId}:`, error);
      return [];
    }
  }
}

export const marketSyncService = new MarketSyncService();
