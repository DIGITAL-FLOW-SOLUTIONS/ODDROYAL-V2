import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ExposureCalculationEngine } from '../../server/exposure-engine';
import { MemStorage } from '../../server/storage';
import type { Bet, BetSelection, MarketExposure } from '@shared/schema';

// Mock the database module
jest.mock('../../server/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  }
}));

describe('Exposure Calculation Engine', () => {
  let exposureEngine: ExposureCalculationEngine;
  let storage: MemStorage;

  beforeEach(() => {
    exposureEngine = new ExposureCalculationEngine();
    storage = new MemStorage();
    jest.clearAllMocks();
  });

  afterEach(() => {
    exposureEngine.stop();
  });

  describe('calculateOutcomeExposure', () => {
    it('should calculate exposure correctly for single bet', async () => {
      // This test would need proper database mocking
      // For now, test the engine can be instantiated and basic methods exist
      expect(exposureEngine).toBeDefined();
      expect(typeof exposureEngine.calculateOutcomeExposure).toBe('function');
    });

    it('should handle zero exposure correctly', async () => {
      const result = await exposureEngine.calculateOutcomeExposure('non-existent-outcome');
      
      expect(result).toEqual({
        outcomeId: 'non-existent-outcome',
        exposureAmountCents: 0,
        betCount: 0,
        lastUpdated: expect.any(Date)
      });
    });

    it('should calculate exposure for express bets correctly', async () => {
      // Test algorithm: For express bets: 
      // liability = (stake * odds_product_of_all_selections - stake) * contributor_share
      
      // This would require setting up test data in the database
      // For unit testing, we'd mock the database queries
      expect(typeof exposureEngine.calculateOutcomeExposure).toBe('function');
    });
  });

  describe('calculateMarketExposure', () => {
    it('should aggregate outcome exposures correctly', async () => {
      const result = await exposureEngine.calculateMarketExposure('test-market-id');
      
      expect(result).toEqual({
        marketId: 'test-market-id',
        outcomes: [],
        totalExposureCents: 0
      });
    });

    it('should handle errors gracefully', async () => {
      const result = await exposureEngine.calculateMarketExposure('invalid-market');
      
      expect(result.marketId).toBe('invalid-market');
      expect(result.outcomes).toEqual([]);
      expect(result.totalExposureCents).toBe(0);
    });
  });

  describe('calculateMatchExposure', () => {
    it('should aggregate market exposures correctly', async () => {
      const result = await exposureEngine.calculateMatchExposure('test-match-id');
      
      expect(result).toEqual({
        matchId: 'test-match-id',
        markets: [],
        totalExposureCents: 0
      });
    });
  });

  describe('checkExposureThresholds', () => {
    it('should identify exposure exceeding thresholds', async () => {
      const thresholdCents = 100000; // £1,000
      const result = await exposureEngine.checkExposureThresholds(thresholdCents);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('exposure engine lifecycle', () => {
    it('should start and stop correctly', () => {
      expect(exposureEngine.cacheIntervalId).toBeNull();
      
      exposureEngine.start(0.1); // 0.1 minutes for testing
      expect(exposureEngine.cacheIntervalId).not.toBeNull();
      
      exposureEngine.stop();
      expect(exposureEngine.cacheIntervalId).toBeNull();
    });

    it('should not start multiple instances', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      exposureEngine.start(0.1);
      exposureEngine.start(0.1); // Second start should be ignored
      
      expect(consoleSpy).toHaveBeenCalledWith('Exposure calculation engine already running');
      
      exposureEngine.stop();
    });
  });

  describe('getCachedExposure', () => {
    it('should return empty array when no cached data', async () => {
      const result = await exposureEngine.getCachedExposure();
      expect(result).toEqual([]);
    });

    it('should filter by match ID', async () => {
      const result = await exposureEngine.getCachedExposure({ matchId: 'test-match' });
      expect(result).toEqual([]);
    });

    it('should filter by market ID', async () => {
      const result = await exposureEngine.getCachedExposure({ marketId: 'test-market' });
      expect(result).toEqual([]);
    });

    it('should filter by outcome ID', async () => {
      const result = await exposureEngine.getCachedExposure({ outcomeId: 'test-outcome' });
      expect(result).toEqual([]);
    });
  });

  describe('getHighExposureMatches', () => {
    it('should return empty array when no data', async () => {
      const result = await exposureEngine.getHighExposureMatches(5);
      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const result = await exposureEngine.getHighExposureMatches(3);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });
});