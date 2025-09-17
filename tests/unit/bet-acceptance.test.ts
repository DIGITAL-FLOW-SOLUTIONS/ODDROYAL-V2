import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MemStorage } from '../../server/storage';
import type { InsertUser, InsertBet } from '@shared/schema';
import { currencyUtils } from '@shared/schema';

describe('Bet Acceptance Logic', () => {
  let storage: MemStorage;

  beforeEach(async () => {
    storage = new MemStorage();
    await storage.initializeDemoAccount();
  });

  describe('placeBetAtomic', () => {
    it('should successfully place a valid single bet', async () => {
      // Create test user with sufficient balance
      const user = await storage.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      // Give user £100 balance
      await storage.updateUserBalance(user.id, 10000);

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000, // £10
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(true);
      expect(result.bet).toBeDefined();
      expect(result.bet!.type).toBe('single');
      expect(result.bet!.totalStake).toBe(1000);
      expect(result.bet!.potentialWinnings).toBe(2500); // £10 * 2.5
      expect(result.selections).toHaveLength(1);
      expect(result.user!.balance).toBe(9000); // £100 - £10
      expect(result.transaction).toBeDefined();
    });

    it('should reject bet with insufficient balance', async () => {
      const user = await storage.createUser({
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      // User has £0 balance
      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000, // £10
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient balance');
    });

    it('should handle express bet with multiple selections', async () => {
      const user = await storage.createUser({
        username: 'testuser3',
        email: 'test3@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await storage.updateUserBalance(user.id, 10000); // £100

      const betParams = {
        userId: user.id,
        betType: 'express' as const,
        totalStakeCents: 500, // £5
        selections: [
          {
            fixtureId: 'fixture_123',
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            league: 'Premier League',
            market: '1x2',
            selection: 'home',
            odds: '2.00'
          },
          {
            fixtureId: 'fixture_124',
            homeTeam: 'Liverpool',
            awayTeam: 'Man City',
            league: 'Premier League',
            market: '1x2',
            selection: 'away',
            odds: '1.80'
          }
        ]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(true);
      expect(result.bet!.type).toBe('express');
      expect(result.bet!.totalOdds).toBe('3.6000'); // 2.00 * 1.80
      expect(result.bet!.potentialWinnings).toBe(1800); // £5 * 3.6
      expect(result.selections).toHaveLength(2);
    });

    it('should reject bet with invalid odds', async () => {
      const user = await storage.createUser({
        username: 'testuser4',
        email: 'test4@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await storage.updateUserBalance(user.id, 10000);

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000,
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '0.50' // Invalid low odds
        }]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid total odds');
    });

    it('should reject bet for inactive user', async () => {
      const user = await storage.createUser({
        username: 'testuser5',
        email: 'test5@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      // Deactivate user
      await storage.updateUserProfile(user.id, { isActive: false });

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000,
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found or inactive');
    });

    it('should handle bet placement rollback on error', async () => {
      const user = await storage.createUser({
        username: 'testuser6',
        email: 'test6@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await storage.updateUserBalance(user.id, 10000);

      // Mock the updateUserBalance to fail after bet creation
      const originalUpdateBalance = storage.updateUserBalance;
      storage.updateUserBalance = jest.fn().mockResolvedValueOnce(undefined);

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000,
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const result = await storage.placeBetAtomic(betParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update user balance');

      // Restore original method
      storage.updateUserBalance = originalUpdateBalance;
    });
  });

  describe('updateBetStatus', () => {
    it('should update bet status to won', async () => {
      const user = await storage.createUser({
        username: 'testuser7',
        email: 'test7@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await storage.updateUserBalance(user.id, 10000);

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000,
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const placedBet = await storage.placeBetAtomic(betParams);
      expect(placedBet.success).toBe(true);

      const updatedBet = await storage.updateBetStatus(
        placedBet.bet!.id, 
        'won', 
        2500 // £25 winnings
      );

      expect(updatedBet).toBeDefined();
      expect(updatedBet!.status).toBe('won');
      expect(updatedBet!.actualWinnings).toBe(2500);
      expect(updatedBet!.settledAt).toBeDefined();
    });

    it('should update bet status to lost', async () => {
      const user = await storage.createUser({
        username: 'testuser8',
        email: 'test8@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await storage.updateUserBalance(user.id, 10000);

      const betParams = {
        userId: user.id,
        betType: 'single' as const,
        totalStakeCents: 1000,
        selections: [{
          fixtureId: 'fixture_123',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          league: 'Premier League',
          market: '1x2',
          selection: 'home',
          odds: '2.50'
        }]
      };

      const placedBet = await storage.placeBetAtomic(betParams);
      const updatedBet = await storage.updateBetStatus(placedBet.bet!.id, 'lost', 0);

      expect(updatedBet!.status).toBe('lost');
      expect(updatedBet!.actualWinnings).toBe(0);
    });
  });
});