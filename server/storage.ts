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
  updateUserBalance(userId: string, newBalance: string): Promise<User | undefined>;
  
  // Bet operations
  createBet(bet: InsertBet & { userId: string }): Promise<Bet>;
  getBet(id: string): Promise<Bet | undefined>;
  getUserBets(userId: string, limit?: number): Promise<Bet[]>;
  updateBetStatus(betId: string, status: string, actualWinnings?: string): Promise<Bet | undefined>;
  
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
      balance: '0.00',
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserBalance(userId: string, newBalance: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { ...user, balance: newBalance, updatedAt: new Date() };
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
      actualWinnings: '0.00'
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

  async updateBetStatus(betId: string, status: string, actualWinnings?: string): Promise<Bet | undefined> {
    const bet = this.bets.get(betId);
    if (!bet) return undefined;
    
    const updatedBet = { 
      ...bet, 
      status, 
      settledAt: new Date(),
      actualWinnings: actualWinnings || bet.actualWinnings
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
}

export const storage = new MemStorage();
