import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemStorage } from '../../server/storage';
import { currencyUtils } from '@shared/schema';

describe('Wallet Transactions', () => {
  let storage: MemStorage;

  beforeEach(async () => {
    storage = new MemStorage();
  });

  describe('updateUserBalance', () => {
    it('should update user balance correctly', async () => {
      const user = await storage.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      expect(user.balance).toBe(0);

      // Add £50
      const updatedUser = await storage.updateUserBalance(user.id, 5000);

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.balance).toBe(5000);
      expect(updatedUser!.updatedAt).toBeInstanceOf(Date);
    });

    it('should reject negative balance', async () => {
      const user = await storage.createUser({
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      await expect(
        storage.updateUserBalance(user.id, -1000)
      ).rejects.toThrow('Balance cannot be negative');
    });

    it('should return undefined for non-existent user', async () => {
      const result = await storage.updateUserBalance('non-existent-id', 1000);
      expect(result).toBeUndefined();
    });
  });

  describe('createTransaction', () => {
    it('should create deposit transaction correctly', async () => {
      const user = await storage.createUser({
        username: 'testuser3',
        email: 'test3@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      const transaction = await storage.createTransaction({
        userId: user.id,
        type: 'deposit',
        amount: 5000, // £50
        balanceBefore: 0,
        balanceAfter: 5000,
        description: 'Bank deposit'
      });

      expect(transaction).toBeDefined();
      expect(transaction.type).toBe('deposit');
      expect(transaction.amount).toBe(5000);
      expect(transaction.balanceBefore).toBe(0);
      expect(transaction.balanceAfter).toBe(5000);
      expect(transaction.status).toBe('completed');
      expect(transaction.description).toBe('Bank deposit');
      expect(transaction.createdAt).toBeInstanceOf(Date);
    });

    it('should create withdrawal transaction correctly', async () => {
      const user = await storage.createUser({
        username: 'testuser4',
        email: 'test4@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      const transaction = await storage.createTransaction({
        userId: user.id,
        type: 'withdrawal',
        amount: -2000, // -£20
        balanceBefore: 5000,
        balanceAfter: 3000,
        reference: 'withdrawal_123',
        description: 'Bank withdrawal'
      });

      expect(transaction.type).toBe('withdrawal');
      expect(transaction.amount).toBe(-2000);
      expect(transaction.balanceBefore).toBe(5000);
      expect(transaction.balanceAfter).toBe(3000);
      expect(transaction.reference).toBe('withdrawal_123');
    });

    it('should create bet stake transaction correctly', async () => {
      const user = await storage.createUser({
        username: 'testuser5',
        email: 'test5@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      const transaction = await storage.createTransaction({
        userId: user.id,
        type: 'bet_stake',
        amount: -1000, // -£10 stake
        balanceBefore: 5000,
        balanceAfter: 4000,
        reference: 'bet_456',
        description: 'Single bet stake'
      });

      expect(transaction.type).toBe('bet_stake');
      expect(transaction.amount).toBe(-1000);
      expect(transaction.reference).toBe('bet_456');
    });

    it('should create bet winnings transaction correctly', async () => {
      const user = await storage.createUser({
        username: 'testuser6',
        email: 'test6@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      const transaction = await storage.createTransaction({
        userId: user.id,
        type: 'bet_winnings',
        amount: 2500, // £25 winnings
        balanceBefore: 4000,
        balanceAfter: 6500,
        reference: 'bet_456',
        description: 'Bet winnings payout'
      });

      expect(transaction.type).toBe('bet_winnings');
      expect(transaction.amount).toBe(2500);
      expect(transaction.balanceAfter).toBe(6500);
    });
  });

  describe('getUserTransactions', () => {
    it('should return user transactions in correct order', async () => {
      const user = await storage.createUser({
        username: 'testuser7',
        email: 'test7@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      // Create multiple transactions
      await storage.createTransaction({
        userId: user.id,
        type: 'deposit',
        amount: 5000,
        balanceBefore: 0,
        balanceAfter: 5000,
        description: 'First deposit'
      });

      await storage.createTransaction({
        userId: user.id,
        type: 'bet_stake',
        amount: -1000,
        balanceBefore: 5000,
        balanceAfter: 4000,
        description: 'Bet stake'
      });

      await storage.createTransaction({
        userId: user.id,
        type: 'bet_winnings',
        amount: 2000,
        balanceBefore: 4000,
        balanceAfter: 6000,
        description: 'Bet winnings'
      });

      const transactions = await storage.getUserTransactions(user.id);

      expect(transactions).toHaveLength(3);
      // Should be in reverse chronological order (newest first)
      expect(transactions[0].description).toBe('Bet winnings');
      expect(transactions[1].description).toBe('Bet stake');
      expect(transactions[2].description).toBe('First deposit');
    });

    it('should respect limit parameter', async () => {
      const user = await storage.createUser({
        username: 'testuser8',
        email: 'test8@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await storage.createTransaction({
          userId: user.id,
          type: 'deposit',
          amount: 1000,
          balanceBefore: i * 1000,
          balanceAfter: (i + 1) * 1000,
          description: `Transaction ${i + 1}`
        });
      }

      const transactions = await storage.getUserTransactions(user.id, 3);
      expect(transactions).toHaveLength(3);
    });

    it('should return empty array for user with no transactions', async () => {
      const user = await storage.createUser({
        username: 'testuser9',
        email: 'test9@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      const transactions = await storage.getUserTransactions(user.id);
      expect(transactions).toEqual([]);
    });
  });

  describe('Currency utilities', () => {
    it('should convert pounds to cents correctly', () => {
      expect(currencyUtils.poundsToCents(10.50)).toBe(1050);
      expect(currencyUtils.poundsToCents('25.99')).toBe(2599);
      expect(currencyUtils.poundsToCents(0.01)).toBe(1);
      expect(currencyUtils.poundsToCents(100)).toBe(10000);
    });

    it('should convert cents to pounds correctly', () => {
      expect(currencyUtils.centsToPounds(1050)).toBe(10.50);
      expect(currencyUtils.centsToPounds(2599)).toBe(25.99);
      expect(currencyUtils.centsToPounds(1)).toBe(0.01);
      expect(currencyUtils.centsToPounds(10000)).toBe(100);
    });

    it('should format currency correctly', () => {
      expect(currencyUtils.formatCurrency(1050)).toBe('£10.50');
      expect(currencyUtils.formatCurrency(2599)).toBe('£25.99');
      expect(currencyUtils.formatCurrency(1)).toBe('£0.01');
      expect(currencyUtils.formatCurrency(10000)).toBe('£100.00');
    });

    it('should parse currency input correctly', () => {
      expect(currencyUtils.parseCurrencyInput('£10.50')).toBe(1050);
      expect(currencyUtils.parseCurrencyInput('25.99')).toBe(2599);
      expect(currencyUtils.parseCurrencyInput('£1,000.00')).toBe(100000);
      expect(currencyUtils.parseCurrencyInput(' £ 50 ')).toBe(5000);
    });

    it('should throw error for invalid currency input', () => {
      expect(() => currencyUtils.parseCurrencyInput('invalid')).toThrow('Invalid currency format');
      expect(() => currencyUtils.parseCurrencyInput('')).toThrow('Invalid currency format');
      expect(() => currencyUtils.parseCurrencyInput('£')).toThrow('Invalid currency format');
    });
  });

  describe('Transaction integrity', () => {
    it('should maintain transaction history integrity', async () => {
      const user = await storage.createUser({
        username: 'integrity_test',
        email: 'integrity@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User'
      });

      let currentBalance = 0;

      // Deposit
      currentBalance += 10000; // +£100
      await storage.createTransaction({
        userId: user.id,
        type: 'deposit',
        amount: 10000,
        balanceBefore: currentBalance - 10000,
        balanceAfter: currentBalance,
        description: 'Initial deposit'
      });

      // Bet stake
      currentBalance -= 2000; // -£20
      await storage.createTransaction({
        userId: user.id,
        type: 'bet_stake',
        amount: -2000,
        balanceBefore: currentBalance + 2000,
        balanceAfter: currentBalance,
        description: 'Bet stake'
      });

      // Bet winnings
      currentBalance += 4000; // +£40
      await storage.createTransaction({
        userId: user.id,
        type: 'bet_winnings',
        amount: 4000,
        balanceBefore: currentBalance - 4000,
        balanceAfter: currentBalance,
        description: 'Bet winnings'
      });

      const transactions = await storage.getUserTransactions(user.id);
      
      // Verify transaction chain integrity
      expect(transactions).toHaveLength(3);
      
      // Most recent transaction should have final balance
      expect(transactions[0].balanceAfter).toBe(12000); // £120
      
      // Each transaction should properly reference previous balance
      const sortedTransactions = transactions.reverse(); // Oldest first
      expect(sortedTransactions[0].balanceBefore).toBe(0);
      expect(sortedTransactions[0].balanceAfter).toBe(10000);
      
      expect(sortedTransactions[1].balanceBefore).toBe(10000);
      expect(sortedTransactions[1].balanceAfter).toBe(8000);
      
      expect(sortedTransactions[2].balanceBefore).toBe(8000);
      expect(sortedTransactions[2].balanceAfter).toBe(12000);
    });
  });
});