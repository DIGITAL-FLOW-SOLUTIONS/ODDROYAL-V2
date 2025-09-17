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
  type UserSession,
  type AdminUser,
  type InsertAdminUser,
  type AdminSession,
  type AuditLog,
  type InsertAuditLog
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import argon2 from "argon2";
import speakeasy from "speakeasy";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(userId: string, updates: Partial<InsertUser>): Promise<User | undefined>;
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
  
  // Match management operations
  getMatchesByTeamsAndTime(homeTeamId: string, awayTeamId: string, kickoffTime: Date): Promise<any[]>;
  createMatch(match: any): Promise<any>;
  getMatch(id: string): Promise<any>;
  updateMatch(id: string, updates: any): Promise<any>;
  softDeleteMatch(id: string, adminId: string): Promise<void>;
  getActiveBetsByMatch(matchId: string): Promise<Bet[]>;
  
  // Market management operations
  createMarket(market: any): Promise<any>;
  updateMarket(id: string, updates: any): Promise<any>;
  
  // Exposure operations
  getMatchExposure(matchId: string): Promise<any>;
  getMarketExposure(marketId: string): Promise<any>;
  getOverallExposure(limit: number): Promise<any>;
  
  // Promotions operations
  getPromotions(params: any): Promise<any>;
  getPromotionByCode(code: string): Promise<any>;
  createPromotion(promotion: any): Promise<any>;
  updatePromotion(id: string, updates: any): Promise<any>;
  
  // Financial reporting operations
  getDailyFinancialReport(date: Date): Promise<any>;
  getMonthlyFinancialReport(year: number, month: number): Promise<any>;
  getPlayerActivityReport(params: any): Promise<any>;
  exportFinancialData(params: any): Promise<any>;
  
  // Admin operations
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  getAdminUserByUsername(username: string): Promise<AdminUser | undefined>;
  getAdminUserByEmail(email: string): Promise<AdminUser | undefined>;
  createAdminUser(admin: InsertAdminUser): Promise<AdminUser>;
  updateAdminUser(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined>;
  updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined>;
  
  // Admin session operations
  createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession>;
  getAdminSession(sessionToken: string): Promise<AdminSession | undefined>;
  updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined>;
  deleteAdminSession(sessionToken: string): Promise<boolean>;
  deleteAllAdminSessions(adminId: string): Promise<boolean>;
  
  // Audit operations
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]>;
  
  // 2FA operations
  enableAdmin2FA(adminId: string, totpSecret: string): Promise<AdminUser | undefined>;
  disableAdmin2FA(adminId: string): Promise<AdminUser | undefined>;
  
  // RBAC operations
  getAdminUsers(limit?: number, offset?: number): Promise<AdminUser[]>;
  getAdminsByRole(role: string): Promise<AdminUser[]>;
  updateAdminRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string }>;
  searchAdminUsers(params: {
    query?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }>;

  // Missing admin operations needed by routes.ts
  getAllBets(params?: {
    status?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Bet[]>;
  getActiveAdminSessions(): Promise<AdminSession[]>;
  getMatchMarkets(matchId: string): Promise<any[]>;
  createMarketWithOutcomes(market: any): Promise<any>;
  updateMarketStatus(marketId: string, status: string): Promise<any>;
  updateOutcomeOdds(outcomeId: string, odds: string): Promise<any>;
  reorderMarkets(matchId: string, marketOrder: string[]): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bets: Map<string, Bet>;
  private betSelections: Map<string, BetSelection>;
  private userFavorites: Map<string, UserFavorite>;
  private transactions: Map<string, Transaction>;
  private sessions: Map<string, UserSession>;
  private adminUsers: Map<string, AdminUser>;
  private adminSessions: Map<string, AdminSession>;
  private auditLogs: Map<string, AuditLog>;

  constructor() {
    this.users = new Map();
    this.bets = new Map();
    this.betSelections = new Map();
    this.userFavorites = new Map();
    this.transactions = new Map();
    this.sessions = new Map();
    this.adminUsers = new Map();
    this.adminSessions = new Map();
    this.auditLogs = new Map();
  }

  // Create demo account for testing
  async initializeDemoAccount() {
    // Only create demo account in demo mode - critical security check
    if (process.env.DEMO_MODE !== 'true') {
      return;
    }
    
    // Warn if demo mode is enabled in production-like environments
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: DEMO_MODE is enabled in production environment! This is a security risk.');
      console.warn('⚠️  Demo accounts should never be available in production.');
      return; // Don't create demo accounts in production
    }
    
    try {
      const demoUsername = "demo";
      const demoPassword = "demo123";
      const demoEmail = "demo@primestake.com";
      
      // Check if demo user already exists (idempotent seeding)
      const existingUser = await this.getUserByUsername(demoUsername);
      if (existingUser) {
        console.log('Demo account already exists');
      } else {
        // Hash password the same way as registration
        const hashedPassword = await bcrypt.hash(demoPassword, 12);
        
        // Create demo user
        const demoUser = await this.createUser({
          username: demoUsername,
          email: demoEmail,
          password: hashedPassword,
          firstName: "Demo",
          lastName: "User"
        });
        
        // Give demo user initial balance of £500 (50000 cents)
        await this.updateUserBalance(demoUser.id, 50000);
        
        // Security: Never log credentials in plaintext
        console.log('Demo account created successfully with initial balance');
      }
      
      // Create demo admin account
      const adminUsername = "admin";
      const adminPassword = "admin123456"; // Strong password for admin
      const adminEmail = "admin@primestake.com";
      
      // Check if demo admin already exists
      const existingAdmin = await this.getAdminUserByUsername(adminUsername);
      if (existingAdmin) {
        console.log('Demo admin account already exists');
        return;
      }
      
      // Create demo admin user  
      const hashedAdminPassword = await argon2.hash(adminPassword);
      const demoAdmin = await this.createAdminUser({
        username: adminUsername,
        email: adminEmail,
        passwordHash: hashedAdminPassword,
        role: 'admin'
      });
      
      console.log('Demo admin account created successfully');
    } catch (error) {
      console.error('Failed to create demo accounts:', error);
    }
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

  async updateUserProfile(userId: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { 
      ...user, 
      ...updates, 
      id: user.id, // Ensure ID cannot be changed
      balance: user.balance, // Ensure balance cannot be changed via profile update
      createdAt: user.createdAt, // Ensure creation date cannot be changed
      updatedAt: new Date() 
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
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

      // Create bet selections with placeholder market/outcome IDs
      const selections: BetSelection[] = [];
      for (const selectionData of params.selections) {
        const selection = await this.createBetSelection({
          betId: bet.id,
          fixtureId: selectionData.fixtureId,
          homeTeam: selectionData.homeTeam,
          awayTeam: selectionData.awayTeam,
          league: selectionData.league,
          marketId: 'placeholder-market-id', // TODO: Implement proper market lookup
          outcomeId: 'placeholder-outcome-id', // TODO: Implement proper outcome lookup
          market: selectionData.market,
          selection: selectionData.selection,
          odds: selectionData.odds
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

  // Admin operations
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    return this.adminUsers.get(id);
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsers.values()).find(
      (admin) => admin.username === username
    );
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsers.values()).find(
      (admin) => admin.email === email
    );
  }

  async createAdminUser(insertAdmin: InsertAdminUser): Promise<AdminUser> {
    const id = randomUUID();
    const now = new Date();
    
    // Hash password with Argon2
    const passwordHash = await argon2.hash(insertAdmin.password || '', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
    
    const admin: AdminUser = {
      id,
      username: insertAdmin.username,
      email: insertAdmin.email,
      passwordHash,
      role: insertAdmin.role || 'support',
      totpSecret: insertAdmin.totpSecret || null,
      isActive: true,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      ipWhitelist: (insertAdmin.ipWhitelist as string[]) || null,
      createdAt: now,
      updatedAt: now,
      createdBy: null
    };
    
    this.adminUsers.set(id, admin);
    return admin;
  }

  async updateAdminUser(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;
    
    const updatedAdmin: AdminUser = {
      ...admin,
      ...updates,
      id: admin.id, // Ensure ID cannot be changed
      createdAt: admin.createdAt, // Ensure creation date cannot be changed
      updatedAt: new Date(),
      ipWhitelist: (updates.ipWhitelist as string[]) || admin.ipWhitelist
    };
    
    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;
    
    const updatedAdmin = {
      ...admin,
      loginAttempts: attempts,
      lockedUntil: lockedUntil || null,
      updatedAt: new Date()
    };
    
    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  // Admin session operations
  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    const id = randomUUID();
    const now = new Date();
    
    const session: AdminSession = {
      id,
      adminId,
      sessionToken,
      refreshToken: '', // Deprecated - no longer used for security
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      twoFactorVerified: false,
      isRevoked: false,
      expiresAt,
      createdAt: now
    };
    
    this.adminSessions.set(id, session);
    return session;
  }

  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> {
    return Array.from(this.adminSessions.values())
      .find(session => session.sessionToken === sessionToken);
  }

  async updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined> {
    const session = this.adminSessions.get(sessionId);
    if (!session) return undefined;
    
    const updatedSession = {
      ...session,
      ...updates,
      id: session.id, // Ensure ID cannot be changed
      createdAt: session.createdAt // Ensure creation date cannot be changed
    };
    
    this.adminSessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    const sessions = Array.from(this.adminSessions.entries());
    const sessionEntry = sessions.find(([_, session]) => 
      session.sessionToken === sessionToken
    );
    
    if (sessionEntry) {
      this.adminSessions.delete(sessionEntry[0]);
      return true;
    }
    return false;
  }

  async deleteAllAdminSessions(adminId: string): Promise<boolean> {
    let deletedAny = false;
    const sessions = Array.from(this.adminSessions.entries());
    
    for (const [sessionId, session] of sessions) {
      if (session.adminId === adminId) {
        this.adminSessions.delete(sessionId);
        deletedAny = true;
      }
    }
    
    return deletedAny;
  }

  // Audit operations
  async createAuditLog(insertAuditLog: InsertAuditLog): Promise<AuditLog> {
    const id = randomUUID();
    const now = new Date();
    
    const auditLog: AuditLog = {
      id,
      adminId: insertAuditLog.adminId,
      actionType: insertAuditLog.actionType,
      targetType: insertAuditLog.targetType || null,
      targetId: insertAuditLog.targetId || null,
      dataBefore: insertAuditLog.dataBefore || null,
      dataAfter: insertAuditLog.dataAfter || null,
      note: insertAuditLog.note || null,
      ipAddress: insertAuditLog.ipAddress || null,
      userAgent: insertAuditLog.userAgent || null,
      success: insertAuditLog.success !== undefined ? insertAuditLog.success : true,
      errorMessage: insertAuditLog.errorMessage || null,
      createdAt: now
    };
    
    this.auditLogs.set(id, auditLog);
    return auditLog;
  }

  async getAuditLogs(limit: number = 50, offset: number = 0): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  // 2FA operations
  async enableAdmin2FA(adminId: string, totpSecret: string): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;
    
    const updatedAdmin = {
      ...admin,
      totpSecret,
      updatedAt: new Date()
    };
    
    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  async disableAdmin2FA(adminId: string): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;
    
    const updatedAdmin = {
      ...admin,
      totpSecret: null,
      updatedAt: new Date()
    };
    
    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  // RBAC operations
  async getAdminUsers(limit: number = 50, offset: number = 0): Promise<AdminUser[]> {
    return Array.from(this.adminUsers.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    return Array.from(this.adminUsers.values())
      .filter(admin => admin.role === role)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateAdminRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string }> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) {
      return { success: false, error: 'Admin user not found' };
    }

    const oldRole = admin.role;
    
    // Prevent self-role modification for security
    if (adminId === updatedBy) {
      return { success: false, error: 'Cannot modify your own role' };
    }

    // CRITICAL SECURITY SAFEGUARD: Prevent system lockout
    // If demoting from superadmin, ensure at least one other active superadmin exists
    if (oldRole === 'superadmin' && newRole !== 'superadmin') {
      const activeSuperadmins = Array.from(this.adminUsers.values())
        .filter(a => a.role === 'superadmin' && a.isActive && a.id !== adminId);
      
      if (activeSuperadmins.length === 0) {
        return { 
          success: false, 
          error: 'Cannot demote the last active superadmin. At least one superadmin must remain to prevent system lockout.' 
        };
      }
    }

    // Update admin role
    const updatedAdmin = {
      ...admin,
      role: newRole,
      updatedAt: new Date()
    };

    this.adminUsers.set(adminId, updatedAdmin);

    // Create audit log for role change
    const auditLog = await this.createAuditLog({
      adminId: updatedBy,
      actionType: 'admin_role_change',
      targetType: 'admin_user',
      targetId: adminId,
      dataBefore: { role: oldRole },
      dataAfter: { role: newRole },
      note: `Admin role changed from ${oldRole} to ${newRole}`,
      ipAddress: null,
      userAgent: null,
      success: true,
      errorMessage: null
    });

    return { success: true, admin: updatedAdmin, auditLog };
  }

  async searchAdminUsers(params: {
    query?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }> {
    let admins = Array.from(this.adminUsers.values());

    // Filter by search query (username, email only - AdminUser doesn't have firstName/lastName)
    if (params.query) {
      const query = params.query.toLowerCase();
      admins = admins.filter(admin => 
        admin.username.toLowerCase().includes(query) ||
        admin.email.toLowerCase().includes(query)
      );
    }

    // Filter by role
    if (params.role) {
      admins = admins.filter(admin => admin.role === params.role);
    }

    // Filter by active status
    if (params.isActive !== undefined) {
      admins = admins.filter(admin => admin.isActive === params.isActive);
    }

    const total = admins.length;
    
    // Sort by creation date (newest first)
    admins = admins.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    admins = admins.slice(offset, offset + limit);

    return { users: admins, total };
  }
  
  // ===================== MATCH MANAGEMENT OPERATIONS =====================
  
  async getMatchesByTeamsAndTime(homeTeamId: string, awayTeamId: string, kickoffTime: Date): Promise<any[]> {
    // For now, return empty array (no duplicates found)
    return [];
  }
  
  async createMatch(match: any): Promise<any> {
    const id = randomUUID();
    const newMatch = {
      id,
      ...match,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // In a real implementation, this would save to database
    return newMatch;
  }
  
  async getMatch(id: string): Promise<any> {
    // In a real implementation, this would fetch from database
    return {
      id,
      homeTeamName: 'Home Team',
      awayTeamName: 'Away Team',
      status: 'scheduled',
      kickoffTime: new Date()
    };
  }
  
  async updateMatch(id: string, updates: any): Promise<any> {
    // In a real implementation, this would update in database
    return {
      id,
      ...updates,
      updatedAt: new Date()
    };
  }
  
  async softDeleteMatch(id: string, adminId: string): Promise<void> {
    // In a real implementation, this would set isDeleted = true
    console.log(`Match ${id} soft deleted by admin ${adminId}`);
  }
  
  async getActiveBetsByMatch(matchId: string): Promise<Bet[]> {
    // Check if any bets reference this match
    return Array.from(this.bets.values()).filter(
      bet => bet.status === 'pending' // Would need to check bet selections for match reference
    );
  }
  
  // ===================== MARKET MANAGEMENT OPERATIONS =====================
  
  async createMarket(market: any): Promise<any> {
    const id = randomUUID();
    const newMarket = {
      id,
      ...market,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return newMarket;
  }
  
  async updateMarket(id: string, updates: any): Promise<any> {
    return {
      id,
      ...updates,
      updatedAt: new Date()
    };
  }
  
  // ===================== EXPOSURE OPERATIONS =====================
  
  async getMatchExposure(matchId: string): Promise<any> {
    return {
      matchId,
      totalExposureCents: 0,
      markets: [],
      lastCalculated: new Date()
    };
  }
  
  async getMarketExposure(marketId: string): Promise<any> {
    return {
      marketId,
      totalExposureCents: 0,
      outcomes: [],
      lastCalculated: new Date()
    };
  }
  
  async getOverallExposure(limit: number): Promise<any> {
    return {
      totalExposureCents: 0,
      matches: [],
      lastCalculated: new Date()
    };
  }
  
  // ===================== PROMOTIONS OPERATIONS =====================
  
  async getPromotions(params: any): Promise<any> {
    return {
      promotions: [],
      total: 0
    };
  }
  
  async getPromotionByCode(code: string): Promise<any> {
    return null; // No promotion found
  }
  
  async createPromotion(promotion: any): Promise<any> {
    const id = randomUUID();
    return {
      id,
      ...promotion,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  async updatePromotion(id: string, updates: any): Promise<any> {
    return {
      id,
      ...updates,
      updatedAt: new Date()
    };
  }
  
  // ===================== FINANCIAL REPORTING OPERATIONS =====================
  
  async getDailyFinancialReport(date: Date): Promise<any> {
    return {
      date,
      totalBetsAmountCents: 0,
      totalWinningsCents: 0,
      ggrCents: 0,
      depositsCents: 0,
      withdrawalsCents: 0,
      activePlayers: 0,
      totalBets: 0
    };
  }
  
  async getMonthlyFinancialReport(year: number, month: number): Promise<any> {
    return {
      year,
      month,
      totalBetsAmountCents: 0,
      totalWinningsCents: 0,
      ggrCents: 0,
      dailyBreakdown: []
    };
  }
  
  async getPlayerActivityReport(params: any): Promise<any> {
    return {
      players: [],
      totalPlayers: 0,
      period: params.period
    };
  }
  
  async exportFinancialData(params: any): Promise<any> {
    const data = {
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      records: []
    };
    
    if (params.format === 'csv') {
      return {
        csv: 'Date,Type,Amount,Description\n' // Empty CSV header
      };
    }
    
    return data;
  }

  // ===================== INITIALIZATION =====================

  // ===================== MISSING ADMIN OPERATIONS =====================
  
  async getAllBets(params?: {
    status?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Bet[]> {
    let result = Array.from(this.bets.values());

    if (params?.status) {
      result = result.filter(bet => bet.status === params.status);
    }
    if (params?.userId) {
      result = result.filter(bet => bet.userId === params.userId);
    }
    if (params?.dateFrom) {
      result = result.filter(bet => bet.placedAt >= params.dateFrom!);
    }
    if (params?.dateTo) {
      result = result.filter(bet => bet.placedAt <= params.dateTo!);
    }

    // Sort by date descending
    result.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());

    if (params?.offset) {
      result = result.slice(params.offset);
    }
    if (params?.limit) {
      result = result.slice(0, params.limit);
    }

    return result;
  }

  async getActiveAdminSessions(): Promise<AdminSession[]> {
    const now = new Date();
    return Array.from(this.adminSessions.values())
      .filter(session => session.expiresAt > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getMatchMarkets(matchId: string): Promise<any[]> {
    // Stub implementation for memory storage
    return [];
  }

  async createMarketWithOutcomes(market: any): Promise<any> {
    // Stub implementation for memory storage
    return { id: randomUUID(), ...market };
  }

  async updateMarketStatus(marketId: string, status: string): Promise<any> {
    // Stub implementation for memory storage
    return { id: marketId, status };
  }

  async updateOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    // Stub implementation for memory storage
    return { id: outcomeId, odds };
  }

  async reorderMarkets(matchId: string, marketOrder: string[]): Promise<void> {
    // Stub implementation for memory storage
    console.log(`Reordering markets for match ${matchId}:`, marketOrder);
  }
}

import { DatabaseStorage } from './database-storage';

export const storage = new DatabaseStorage();
