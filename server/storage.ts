import { 
  type User, 
  type InsertUser, 
  type Bet, 
  type InsertBet,
  type BetSelection,
  type InsertBetSelection, 
  type UserFavorite,
  type InsertFavorite,
  type Transaction,
  type InsertTransaction,
  type UserSession
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(userId: string, newBalanceCents: number): Promise<User | undefined>;
  
  // Bet operations
  createBet(bet: InsertBet & { userId: string }): Promise<Bet>;
  getBet(id: string): Promise<Bet | undefined>;
  getUserBets(userId: string, limit?: number): Promise<Bet[]>;
  updateBetStatus(betId: string, status: string, actualWinningsCents?: number): Promise<Bet | undefined>;
  
  // Atomic bet placement - ensures transaction integrity
  placeBetAtomic(params: {
    userId: string;
    betType: 'single' | 'express' | 'system';
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
  }): Promise<{
    success: boolean;
    bet?: Bet;
    selections?: BetSelection[];
    user?: User;
    transaction?: Transaction;
    error?: string;
  }>;
  
  // Bet selection operations
  createBetSelection(selection: InsertBetSelection): Promise<BetSelection>;
  getBetSelections(betId: string): Promise<BetSelection[]>;
  updateSelectionStatus(selectionId: string, status: string, result?: string): Promise<BetSelection | undefined>;
  
  // Favorites operations
  addFavorite(favorite: InsertFavorite & { userId: string }): Promise<UserFavorite>;
  removeFavorite(userId: string, entityId: string): Promise<boolean>;
  getUserFavorites(userId: string): Promise<UserFavorite[]>;
  
  // Transaction operations
  createTransaction(transaction: InsertTransaction & { userId: string }): Promise<Transaction>;
  getUserTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  
  // Session operations
  createSession(userId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<UserSession>;
  getSession(sessionToken: string): Promise<UserSession | undefined>;
  deleteSession(sessionToken: string): Promise<boolean>;
  
  // Settlement operations
  getPendingBets(): Promise<Bet[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bets: Map<string, Bet>;
  private betSelections: Map<string, BetSelection>;
  private userFavorites: Map<string, UserFavorite>;
  private transactions: Map<string, Transaction>;
  private sessions: Map<string, UserSession>;

  constructor() {
    this.users = new Map();
    this.bets = new Map();
    this.betSelections = new Map();
    this.userFavorites = new Map();
    this.transactions = new Map();
    this.sessions = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      balance: 0, // Start with 0 cents
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserBalance(userId: string, newBalanceCents: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    if (newBalanceCents < 0) {
      throw new Error('Balance cannot be negative');
    }
    
    const updatedUser = { ...user, balance: newBalanceCents, updatedAt: new Date() };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  // Bet operations
  async createBet(bet: InsertBet & { userId: string }): Promise<Bet> {
    const id = randomUUID();
    const now = new Date();
    const newBet: Bet = {
      id,
      ...bet,
      status: 'pending',
      placedAt: now,
      settledAt: null,
      actualWinnings: 0 // Start with 0 cents
    };
    this.bets.set(id, newBet);
    return newBet;
  }

  async getBet(id: string): Promise<Bet | undefined> {
    return this.bets.get(id);
  }

  async getUserBets(userId: string, limit: number = 50): Promise<Bet[]> {
    return Array.from(this.bets.values())
      .filter(bet => bet.userId === userId)
      .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
      .slice(0, limit);
  }

  async updateBetStatus(betId: string, status: string, actualWinningsCents?: number): Promise<Bet | undefined> {
    const bet = this.bets.get(betId);
    if (!bet) return undefined;
    
    const updatedBet = { 
      ...bet, 
      status, 
      settledAt: new Date(),
      actualWinnings: actualWinningsCents ?? bet.actualWinnings
    };
    this.bets.set(betId, updatedBet);
    return updatedBet;
  }

  // Bet selection operations
  async createBetSelection(selection: InsertBetSelection): Promise<BetSelection> {
    const id = randomUUID();
    const newSelection: BetSelection = {
      id,
      ...selection,
      status: 'pending',
      result: null
    };
    this.betSelections.set(id, newSelection);
    return newSelection;
  }

  async getBetSelections(betId: string): Promise<BetSelection[]> {
    return Array.from(this.betSelections.values())
      .filter(selection => selection.betId === betId);
  }

  async updateSelectionStatus(selectionId: string, status: string, result?: string): Promise<BetSelection | undefined> {
    const selection = this.betSelections.get(selectionId);
    if (!selection) return undefined;
    
    const updatedSelection = { ...selection, status, result: result || selection.result };
    this.betSelections.set(selectionId, updatedSelection);
    return updatedSelection;
  }

  // Favorites operations
  async addFavorite(favorite: InsertFavorite & { userId: string }): Promise<UserFavorite> {
    const id = randomUUID();
    const newFavorite: UserFavorite = {
      id,
      ...favorite,
      createdAt: new Date()
    };
    this.userFavorites.set(id, newFavorite);
    return newFavorite;
  }

  async removeFavorite(userId: string, entityId: string): Promise<boolean> {
    const favorites = Array.from(this.userFavorites.entries());
    const favoriteEntry = favorites.find(([_, fav]) => 
      fav.userId === userId && fav.entityId === entityId
    );
    
    if (favoriteEntry) {
      this.userFavorites.delete(favoriteEntry[0]);
      return true;
    }
    return false;
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return Array.from(this.userFavorites.values())
      .filter(favorite => favorite.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Transaction operations
  async createTransaction(transaction: InsertTransaction & { userId: string }): Promise<Transaction> {
    const id = randomUUID();
    const newTransaction: Transaction = {
      id,
      ...transaction,
      reference: transaction.reference || null,
      description: transaction.description || null,
      status: 'completed',
      createdAt: new Date()
    };
    this.transactions.set(id, newTransaction);
    return newTransaction;
  }

  async getUserTransactions(userId: string, limit: number = 100): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Session operations
  async createSession(userId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<UserSession> {
    const id = randomUUID();
    const session: UserSession = {
      id,
      userId,
      sessionToken,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
      createdAt: new Date()
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    return Array.from(this.sessions.values())
      .find(session => session.sessionToken === sessionToken);
  }

  async deleteSession(sessionToken: string): Promise<boolean> {
    const sessions = Array.from(this.sessions.entries());
    const sessionEntry = sessions.find(([_, session]) => 
      session.sessionToken === sessionToken
    );
    
    if (sessionEntry) {
      this.sessions.delete(sessionEntry[0]);
      return true;
    }
    return false;
  }

  // Atomic bet placement - ensures transaction integrity
  async placeBetAtomic(params: {
    userId: string;
    betType: 'single' | 'express' | 'system';
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
  }): Promise<{
    success: boolean;
    bet?: Bet;
    selections?: BetSelection[];
    user?: User;
    transaction?: Transaction;
    error?: string;
  }> {
    try {
      // Get user and validate balance
      const user = this.users.get(params.userId);
      if (!user || !user.isActive) {
        return { success: false, error: 'User not found or inactive' };
      }

      if (user.balance < params.totalStakeCents) {
        return { success: false, error: 'Insufficient balance' };
      }

      // Calculate total odds and potential winnings
      const totalOdds = params.selections.reduce((acc, selection) => 
        acc * parseFloat(selection.odds), 1
      );
      
      if (totalOdds < 1.01 || totalOdds > 10000) {
        return { success: false, error: 'Invalid total odds' };
      }

      const potentialWinningsCents = Math.round(params.totalStakeCents * totalOdds);
      
      // Create bet record
      const bet = await this.createBet({
        userId: params.userId,
        type: params.betType,
        totalStake: params.totalStakeCents,
        potentialWinnings: potentialWinningsCents,
        totalOdds: totalOdds.toFixed(4)
      });

      // Create bet selections
      const selections: BetSelection[] = [];
      for (const selectionData of params.selections) {
        const selection = await this.createBetSelection({
          betId: bet.id,
          ...selectionData
        });
        selections.push(selection);
      }

      // Update user balance (deduct stake)
      const newBalanceCents = user.balance - params.totalStakeCents;
      const updatedUser = await this.updateUserBalance(params.userId, newBalanceCents);
      
      if (!updatedUser) {
        // Rollback: remove bet and selections
        this.bets.delete(bet.id);
        selections.forEach(s => this.betSelections.delete(s.id));
        return { success: false, error: 'Failed to update user balance' };
      }

      // Create transaction record
      const transaction = await this.createTransaction({
        userId: params.userId,
        type: 'bet_stake',
        amount: -params.totalStakeCents,
        balanceBefore: user.balance,
        balanceAfter: newBalanceCents,
        reference: bet.id,
        description: `Bet placed: ${bet.type} bet with ${selections.length} selection(s)`
      });

      return {
        success: true,
        bet,
        selections,
        user: updatedUser,
        transaction
      };

    } catch (error) {
      console.error('Atomic bet placement error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Settlement operations
  async getPendingBets(): Promise<Bet[]> {
    return Array.from(this.bets.values()).filter(bet => bet.status === 'pending');
  }
}

export const storage = new MemStorage();
