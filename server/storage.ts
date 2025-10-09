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
  type InsertAuditLog,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import argon2 from "argon2";
import speakeasy from "speakeasy";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserProfile(
    userId: string,
    updates: Partial<InsertUser>,
  ): Promise<User | undefined>;
  updateUserBalance(
    userId: string,
    amountToAdd: number,
  ): Promise<User | undefined>;

  // Bet operations - removed old implementation, using new service

  // Favorites operations
  addFavorite(
    favorite: InsertFavorite & { userId: string },
  ): Promise<UserFavorite>;
  removeFavorite(userId: string, entityId: string): Promise<boolean>;
  getUserFavorites(userId: string): Promise<UserFavorite[]>;

  // Transaction operations
  createTransaction(
    transaction: InsertTransaction & { userId: string },
  ): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  getUserTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  getAllTransactions(): Promise<Transaction[]>;

  // Session operations
  createSession(
    userId: string,
    sessionToken: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserSession>;
  getSession(sessionToken: string): Promise<UserSession | undefined>;
  deleteSession(sessionToken: string): Promise<boolean>;

  // Settlement operations
  getPendingBets(): Promise<Bet[]>;

  // Match management operations
  getMatchesByTeamsAndTime(
    homeTeamId: string,
    awayTeamId: string,
    kickoffTime: Date,
  ): Promise<any[]>;
  createMatch(match: any): Promise<any>;
  getMatch(id: string): Promise<any>;
  updateMatch(id: string, updates: any): Promise<any>;
  softDeleteMatch(id: string, adminId: string): Promise<void>;
  getActiveBetsByMatch(matchId: string): Promise<Bet[]>;
  getUpcomingManualMatches(limit?: number): Promise<any[]>;
  getLiveManualMatches(limit?: number): Promise<any[]>;

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
  updateAdminUser(
    adminId: string,
    updates: Partial<InsertAdminUser>,
  ): Promise<AdminUser | undefined>;
  updateAdminLoginAttempts(
    adminId: string,
    attempts: number,
    lockedUntil?: Date,
  ): Promise<AdminUser | undefined>;

  // Admin session operations
  createAdminSession(
    adminId: string,
    sessionToken: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminSession>;
  getAdminSession(sessionToken: string): Promise<AdminSession | undefined>;
  updateAdminSession(
    sessionId: string,
    updates: Partial<AdminSession>,
  ): Promise<AdminSession | undefined>;
  deleteAdminSession(sessionToken: string): Promise<boolean>;
  deleteAllAdminSessions(adminId: string): Promise<boolean>;

  // Audit operations
  createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]>;

  // 2FA operations
  enableAdmin2FA(
    adminId: string,
    totpSecret: string,
  ): Promise<AdminUser | undefined>;
  disableAdmin2FA(adminId: string): Promise<AdminUser | undefined>;

  // RBAC operations
  getAdminUsers(limit?: number, offset?: number): Promise<AdminUser[]>;
  getAdminsByRole(role: string): Promise<AdminUser[]>;
  updateAdminRole(
    adminId: string,
    newRole: string,
    updatedBy: string,
  ): Promise<{
    success: boolean;
    admin?: AdminUser;
    auditLog?: AuditLog;
    error?: string;
  }>;
  searchAdminUsers(params: {
    query?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }>;

  // Missing admin operations needed by routes.ts
  getAllBets(params?: {
    search?: string;
    status?: string;
    betType?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minStake?: number;
    maxStake?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ bets: any[]; total: number }>;

  // Force settlement and refund operations
  forceBetSettlement(
    betId: string,
    outcome: "win" | "lose" | "void",
    payoutCents: number,
  ): Promise<{ success: boolean; bet?: Bet; error?: string }>;
  refundBet(
    betId: string,
  ): Promise<{ success: boolean; bet?: Bet; error?: string }>;

  // Export functionality
  exportBetsToCSV(params?: {
    search?: string;
    status?: string;
    betType?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minStake?: number;
    maxStake?: number;
  }): Promise<string>;
  getActiveAdminSessions(): Promise<AdminSession[]>;

  // Live match simulation methods
  getScheduledManualMatches(): Promise<any[]>;
  getMatchWithEvents(matchId: string): Promise<{
    match: any;
    events: any[];
  }>;
  updateMatchToLive(matchId: string): Promise<void>;
  updateMatchScore(matchId: string, homeScore: number, awayScore: number): Promise<void>;
  markEventAsExecuted(eventId: string): Promise<void>;
  suspendAllMarkets(matchId: string): Promise<void>;
  reopenAllMarkets(matchId: string): Promise<void>;
  updateMarketOdds(outcomeId: string, newOdds: string): Promise<void>;
  finishMatch(matchId: string, homeScore: number, awayScore: number): Promise<void>;

  // ===================== ENHANCED MATCH OPERATIONS =====================
  
  // Complete match CRUD operations
  getAllMatches(params?: {
    search?: string;
    sport?: string;
    league?: string;
    status?: string;
    source?: string; // 'manual' | 'sportmonks' | 'all'
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ matches: any[]; total: number }>;

  // ===================== ENHANCED MARKET OPERATIONS =====================
  
  getMatchMarkets(matchId: string): Promise<any[]>;
  createMarket(marketData: {
    matchId: string;
    key: string;
    name: string;
    type: string;
    parameter?: string;
    outcomes: Array<{
      key: string;
      label: string;
      odds: string;
    }>;
    adminId: string;
  }): Promise<any>;
  createMarketWithOutcomes(market: any): Promise<any>;
  updateMarketStatus(marketId: string, status: string): Promise<any>;
  updateOutcomeOdds(outcomeId: string, odds: string): Promise<any>;
  deleteMarket(marketId: string, adminId: string): Promise<void>;
  reorderMarkets(matchId: string, marketOrder: string[]): Promise<void>;

  // ===================== MARKET OUTCOME OPERATIONS =====================
  
  getMarketOutcomes(marketId: string): Promise<any[]>;
  updateMarketOutcome(outcomeId: string, updates: {
    odds?: string;
    status?: string;
    liabilityLimitCents?: number;
    adminId: string;
    reason?: string;
  }): Promise<any>;

  // ===================== SPORTS AND LEAGUES OPERATIONS =====================
  
  getSports(): Promise<Array<{
    id: string;
    name: string;
    displayName: string;
    matchCount: number;
  }>>;
  
  getLeagues(sportFilter?: string): Promise<Array<{
    id: string;
    name: string;
    sport: string;
    matchCount: number;
  }>>;

  // ===================== MISSING REPORTING METHODS =====================

  // Daily/Monthly GGR reports
  getDailyGgrReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    date: string;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    winRate: number;
  }>;

  getMonthlyGgrReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    year: number;
    month: number;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    highestDayCents: number;
    lowestDayCents: number;
    winRate: number;
    dailyBreakdown: Array<{
      day: number;
      stakeCents: number;
      ggrCents: number;
      bets: number;
    }>;
  }>;

  // Sport/League turnover reports
  getTurnoverBySportReport(
    startDate: Date,
    endDate: Date,
    sport?: string,
    league?: string,
  ): Promise<{
    sports: Array<{
      sport: string;
      turnoverCents: number;
      betCount: number;
      ggrCents: number;
    }>;
    totalTurnoverCents: number;
    totalBets: number;
    totalGgrCents: number;
  }>;

  // Payout ratio reports
  getPayoutRatioReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    payoutRatio: number;
    betCount: number;
    winningBets: number;
    losingBets: number;
    winRate: number;
  }>;

  // Top winners reports
  getTopWinnersReport(
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<{
    winners: Array<{
      userId: string;
      username: string;
      netWinningsCents: number;
      betCount: number;
    }>;
  }>;

  // Chargeback reports
  getChargebackReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    chargebacks: Array<{
      id: string;
      userId: string;
      username: string;
      amountCents: number;
      reason: string;
      status: string;
      createdAt: Date;
    }>;
    totalAmountCents: number;
    count: number;
  }>;

  // Custom report generation
  generateCustomReport(params: {
    reportType: string;
    dateFrom: Date;
    dateTo: Date;
    filters?: any;
    groupBy?: string;
    metrics?: string[];
  }): Promise<{
    title: string;
    data: any[];
    summary: any;
    generatedAt: Date;
  }>;

  // Export report data
  exportReportData(params: {
    reportType: string;
    format: "csv" | "excel" | "json";
    dateFrom: Date;
    dateTo: Date;
    filters?: any;
  }): Promise<string>;

  // Scheduled reports
  createScheduledReport(report: {
    name: string;
    reportType: string;
    frequency: "daily" | "weekly" | "monthly";
    recipients: string[];
    filters?: any;
    format?: "csv" | "excel" | "pdf";
  }): Promise<any>;

  // ===================== MISSING DASHBOARD METHODS =====================

  // Dashboard alerts
  getDashboardAlerts(): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      severity: "low" | "medium" | "high" | "critical";
      timestamp: Date;
      isResolved: boolean;
      actionRequired: boolean;
    }>
  >;

  resolveAlert(
    alertId: string,
    adminId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }>;

  // Notification settings
  updateNotificationSettings(settings: {
    emailSettings: any;
    slackSettings: any;
    webhookSettings: any;
    alertThresholds: any;
    updatedBy: string;
    updatedAt: Date;
  }): Promise<any>;

  // Dashboard metrics
  getTotalUsers(): Promise<number>;
  getNewUsersCount(since: Date): Promise<number>;
  getTotalBets(): Promise<number>;
  getPendingBetsCount(): Promise<number>;
  getBetsCount(since: Date): Promise<number>;
  getTurnoverMetrics(
    todayStart: Date,
    weekStart: Date,
  ): Promise<{
    todayCents: number;
    weekCents: number;
    totalCents: number;
  }>;
  getExposureMetrics(): Promise<{
    totalCents: number;
    highRiskCount: number;
  }>;
  getRecentActivity(limit: number): Promise<
    Array<{
      id: string;
      type: string;
      title?: string;
      description?: string;
      action?: string;
      details?: string;
      timestamp?: Date;
      createdAt: Date;
      userId?: string;
      adminId?: string;
      betId?: string;
      amount?: number;
      severity?: string;
    }>
  >;
  getSystemAlerts(): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
      message?: string;
      description?: string;
      severity: string;
      timestamp?: Date;
      createdAt: Date;
      isResolved: boolean;
      actionRequired: boolean;
    }>
  >;

  // ===================== MISSING MATCH/MARKET METHODS =====================

  getAllMatches(params?: {
    search?: string;
    status?: string;
    sport?: string;
    league?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    matches: any[];
    total: number;
  }>;

  // New methods for optimized bulk operations
  getMatchesFiltered(params: {
    filters: {
      externalId?: string;
      externalSource?: string;
      sport?: string;
      status?: string;
      isDeleted?: boolean;
    };
    limit?: number;
    offset?: number;
  }): Promise<{
    matches: any[];
    total: number;
  }>;

  getMatchesByExternalIds(externalIds: string[]): Promise<any[]>;

  upsertMatch(matchData: {
    externalId: string;
    externalSource?: string;
    sport: string;
    sportId?: string;
    sportName?: string;
    leagueId: string;
    leagueName: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    kickoffTime: Date;
    status: string;
    homeScore?: number;
    awayScore?: number;
    isManual?: boolean;
    createdBy?: string;
    updatedBy?: string;
  }): Promise<any>;

  createMarketOutcome(outcome: {
    marketId: string;
    name: string;
    odds: string;
    isActive: boolean;
  }): Promise<any>;

  updateMarketOutcomeOdds(outcomeId: string, odds: string): Promise<any>;

  // ===================== MISSING USER METHODS =====================

  searchUsersData(params: {
    query?: string;
    isActive?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    users: any[];
    total: number;
  }>;

  getUserLimits(userId: string): Promise<{
    dailyDepositLimitCents: number;
    weeklyDepositLimitCents: number;
    monthlyDepositLimitCents: number;
    maxBetLimitCents: number;
    sessionTimeLimitMinutes: number;
    cooldownPeriodHours: number;
  } | null>;

  upsertUserLimits(
    userId: string,
    limits: {
      dailyDepositLimitCents?: number;
      weeklyDepositLimitCents?: number;
      monthlyDepositLimitCents?: number;
      maxBetLimitCents?: number;
      sessionTimeLimitMinutes?: number;
      cooldownPeriodHours?: number;
    },
  ): Promise<any>;

  // ===================== MISSING FINANCIAL METHODS =====================

  calculateGGRReport(params: {
    dateFrom: Date;
    dateTo: Date;
    groupBy?: "day" | "week" | "month";
  }): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    ggrCents: number;
    betCount: number;
    playerCount: number;
    breakdown: Array<{
      period: string;
      stakeCents: number;
      payoutsCents: number;
      ggrCents: number;
      betCount: number;
    }>;
  }>;

  // Additional dashboard helper method to create alerts
  createDashboardAlert(alert: {
    type: string;
    title: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
    actionRequired?: boolean;
  }): Promise<any>;
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
    if (process.env.DEMO_MODE !== "true") {
      return;
    }

    // Warn if demo mode is enabled in production-like environments
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️  WARNING: DEMO_MODE is enabled in production environment! This is a security risk.",
      );
      console.warn(
        "⚠️  Demo accounts should never be available in production.",
      );
      return; // Don't create demo accounts in production
    }

    try {
      const demoUsername = "demo";
      const demoPassword = "demo123";
      const demoEmail = "demo@oddroyal.com";

      // Check if demo user already exists (idempotent seeding)
      const existingUser = await this.getUserByUsername(demoUsername);
      if (existingUser) {
        console.log("Demo account already exists");
      } else {
        // Hash password the same way as registration
        const hashedPassword = await bcrypt.hash(demoPassword, 12);

        // Create demo user
        const demoUser = await this.createUser({
          username: demoUsername,
          email: demoEmail,
          password: hashedPassword,
          firstName: "Demo",
          lastName: "User",
        });

        // Give demo user initial balance of £500 (50000 cents)
        await this.updateUserBalance(demoUser.id, 50000);

        // Security: Never log credentials in plaintext
        console.log("Demo account created successfully with initial balance");
      }

      // Create demo admin account with unique credentials to avoid conflicts with AdminSeeder
      const adminUsername = "demo-storage-admin"; // Unique username to avoid conflicts
      const adminPassword = "admin123456"; // Strong password for admin
      const adminEmail = "demo.storage.admin@oddroyal.com"; // Unique email to avoid conflicts

      // Check if demo admin already exists (idempotent)
      const existingAdmin = await this.getAdminUserByUsername(adminUsername);
      if (existingAdmin) {
        console.log("Demo storage admin account already exists");
        return;
      }

      // Also check by email to ensure no conflicts
      const existingAdminByEmail = await this.getAdminUserByEmail(adminEmail);
      if (existingAdminByEmail) {
        console.log(
          "Demo storage admin account with this email already exists",
        );
        return;
      }

      // Create demo admin user
      const hashedAdminPassword = await argon2.hash(adminPassword);
      const demoAdmin = await this.createAdminUser({
        username: adminUsername,
        email: adminEmail,
        passwordHash: hashedAdminPassword,
        role: "admin",
      });

      console.log("Demo storage admin account created successfully");
    } catch (error) {
      console.error("Failed to create demo accounts:", error);
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
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
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
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<InsertUser>,
  ): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      ...updates,
      id: user.id, // Ensure ID cannot be changed
      balance: user.balance, // Ensure balance cannot be changed via profile update
      createdAt: user.createdAt, // Ensure creation date cannot be changed
      updatedAt: new Date(),
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserBalance(
    userId: string,
    amountToAdd: number,
  ): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const newBalance = user.balance + amountToAdd;

    if (newBalance < 0) {
      throw new Error("Insufficient balance");
    }

    const updatedUser = {
      ...user,
      balance: newBalance,
      updatedAt: new Date(),
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  // Bet operations







  // Favorites operations
  async addFavorite(
    favorite: InsertFavorite & { userId: string },
  ): Promise<UserFavorite> {
    const id = randomUUID();
    const newFavorite: UserFavorite = {
      id,
      ...favorite,
      createdAt: new Date(),
    };
    this.userFavorites.set(id, newFavorite);
    return newFavorite;
  }

  async removeFavorite(userId: string, entityId: string): Promise<boolean> {
    const favorites = Array.from(this.userFavorites.entries());
    const favoriteEntry = favorites.find(
      ([_, fav]) => fav.userId === userId && fav.entityId === entityId,
    );

    if (favoriteEntry) {
      this.userFavorites.delete(favoriteEntry[0]);
      return true;
    }
    return false;
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return Array.from(this.userFavorites.values())
      .filter((favorite) => favorite.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Transaction operations
  async createTransaction(
    transaction: InsertTransaction & { userId: string },
  ): Promise<Transaction> {
    const id = randomUUID();
    const newTransaction: Transaction = {
      id,
      ...transaction,
      reference: transaction.reference || null,
      description: transaction.description || null,
      status: transaction.status || "completed",
      createdAt: new Date(),
    };
    this.transactions.set(id, newTransaction);
    return newTransaction;
  }

  async updateTransaction(
    id: string,
    updates: Partial<Transaction>,
  ): Promise<Transaction | undefined> {
    const transaction = this.transactions.get(id);
    if (!transaction) return undefined;
    
    const updatedTransaction = {
      ...transaction,
      ...updates,
      updatedAt: new Date(),
    };
    this.transactions.set(id, updatedTransaction);
    return updatedTransaction;
  }

  async getUserTransactions(
    userId: string,
    limit: number = 100,
  ): Promise<Transaction[]> {
    return Array.from(this.transactions.values())
      .filter((transaction) => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  // Session operations
  async createSession(
    userId: string,
    sessionToken: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<UserSession> {
    const id = randomUUID();
    const session: UserSession = {
      id,
      userId,
      sessionToken,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    return Array.from(this.sessions.values()).find(
      (session) => session.sessionToken === sessionToken,
    );
  }

  async deleteSession(sessionToken: string): Promise<boolean> {
    const sessions = Array.from(this.sessions.entries());
    const sessionEntry = sessions.find(
      ([_, session]) => session.sessionToken === sessionToken,
    );

    if (sessionEntry) {
      this.sessions.delete(sessionEntry[0]);
      return true;
    }
    return false;
  }


  // Settlement operations
  async getPendingBets(): Promise<Bet[]> {
    return Array.from(this.bets.values()).filter(
      (bet) => bet.status === "pending",
    );
  }

  // Admin operations
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    return this.adminUsers.get(id);
  }

  async getAdminUserByUsername(
    username: string,
  ): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsers.values()).find(
      (admin) => admin.username === username,
    );
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    return Array.from(this.adminUsers.values()).find(
      (admin) => admin.email === email,
    );
  }

  async createAdminUser(insertAdmin: InsertAdminUser): Promise<AdminUser> {
    const id = randomUUID();
    const now = new Date();

    const admin: AdminUser = {
      id,
      username: insertAdmin.username,
      email: insertAdmin.email,
      passwordHash: insertAdmin.passwordHash,
      role: insertAdmin.role || "support",
      totpSecret: insertAdmin.totpSecret || null,
      isActive: true,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      ipWhitelist: (insertAdmin.ipWhitelist as string[]) || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: insertAdmin.createdBy || null,
    };

    this.adminUsers.set(id, admin);
    return admin;
  }

  async updateAdminUser(
    adminId: string,
    updates: Partial<InsertAdminUser>,
  ): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;

    const updatedAdmin: AdminUser = {
      ...admin,
      ...updates,
      id: admin.id,
      createdAt: admin.createdAt,
      updatedAt: new Date().toISOString(),
      ipWhitelist: (updates.ipWhitelist as string[]) || admin.ipWhitelist,
    };

    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  async updateAdminLoginAttempts(
    adminId: string,
    attempts: number,
    lockedUntil?: Date,
  ): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;

    const updatedAdmin = {
      ...admin,
      loginAttempts: attempts,
      lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  // Admin session operations
  async createAdminSession(
    adminId: string,
    sessionToken: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AdminSession> {
    const id = randomUUID();
    const now = new Date();

    const session: AdminSession = {
      id,
      adminId,
      sessionToken,
      refreshToken: "", // Deprecated - no longer used for security
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      twoFactorVerified: false,
      isRevoked: false,
      expiresAt,
      createdAt: now,
    };

    this.adminSessions.set(id, session);
    return session;
  }

  async getAdminSession(
    sessionToken: string,
  ): Promise<AdminSession | undefined> {
    return Array.from(this.adminSessions.values()).find(
      (session) => session.sessionToken === sessionToken,
    );
  }

  async updateAdminSession(
    sessionId: string,
    updates: Partial<AdminSession>,
  ): Promise<AdminSession | undefined> {
    const session = this.adminSessions.get(sessionId);
    if (!session) return undefined;

    const updatedSession = {
      ...session,
      ...updates,
      id: session.id, // Ensure ID cannot be changed
      createdAt: session.createdAt, // Ensure creation date cannot be changed
    };

    this.adminSessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    const sessions = Array.from(this.adminSessions.entries());
    const sessionEntry = sessions.find(
      ([_, session]) => session.sessionToken === sessionToken,
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
      success:
        insertAuditLog.success !== undefined ? insertAuditLog.success : true,
      errorMessage: insertAuditLog.errorMessage || null,
      createdAt: now,
    };

    this.auditLogs.set(id, auditLog);
    return auditLog;
  }

  async getAuditLogs(
    limit: number = 50,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return Array.from(this.auditLogs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  // 2FA operations
  async enableAdmin2FA(
    adminId: string,
    totpSecret: string,
  ): Promise<AdminUser | undefined> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) return undefined;

    const updatedAdmin = {
      ...admin,
      totpSecret,
      updatedAt: new Date(),
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
      updatedAt: new Date(),
    };

    this.adminUsers.set(adminId, updatedAdmin);
    return updatedAdmin;
  }

  // RBAC operations
  async getAdminUsers(
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminUser[]> {
    return Array.from(this.adminUsers.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    return Array.from(this.adminUsers.values())
      .filter((admin) => admin.role === role)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateAdminRole(
    adminId: string,
    newRole: string,
    updatedBy: string,
  ): Promise<{
    success: boolean;
    admin?: AdminUser;
    auditLog?: AuditLog;
    error?: string;
  }> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) {
      return { success: false, error: "Admin user not found" };
    }

    const oldRole = admin.role;

    // Prevent self-role modification for security
    if (adminId === updatedBy) {
      return { success: false, error: "Cannot modify your own role" };
    }

    // CRITICAL SECURITY SAFEGUARD: Prevent system lockout
    // If demoting from superadmin, ensure at least one other active superadmin exists
    if (oldRole === "superadmin" && newRole !== "superadmin") {
      const activeSuperadmins = Array.from(this.adminUsers.values()).filter(
        (a) => a.role === "superadmin" && a.isActive && a.id !== adminId,
      );

      if (activeSuperadmins.length === 0) {
        return {
          success: false,
          error:
            "Cannot demote the last active superadmin. At least one superadmin must remain to prevent system lockout.",
        };
      }
    }

    // Update admin role
    const updatedAdmin = {
      ...admin,
      role: newRole,
      updatedAt: new Date(),
    };

    this.adminUsers.set(adminId, updatedAdmin);

    // Create audit log for role change
    const auditLog = await this.createAuditLog({
      adminId: updatedBy,
      actionType: "admin_role_change",
      targetType: "admin_user",
      targetId: adminId,
      dataBefore: { role: oldRole },
      dataAfter: { role: newRole },
      note: `Admin role changed from ${oldRole} to ${newRole}`,
      ipAddress: null,
      userAgent: null,
      success: true,
      errorMessage: null,
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
      admins = admins.filter(
        (admin) =>
          admin.username.toLowerCase().includes(query) ||
          admin.email.toLowerCase().includes(query),
      );
    }

    // Filter by role
    if (params.role) {
      admins = admins.filter((admin) => admin.role === params.role);
    }

    // Filter by active status
    if (params.isActive !== undefined) {
      admins = admins.filter((admin) => admin.isActive === params.isActive);
    }

    const total = admins.length;

    // Sort by creation date (newest first)
    admins = admins.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // Apply pagination
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    admins = admins.slice(offset, offset + limit);

    return { users: admins, total };
  }

  // ===================== MATCH MANAGEMENT OPERATIONS =====================

  async getMatchesByTeamsAndTime(
    homeTeamId: string,
    awayTeamId: string,
    kickoffTime: Date,
  ): Promise<any[]> {
    // For now, return empty array (no duplicates found)
    return [];
  }

  async createMatch(match: any): Promise<any> {
    const id = randomUUID();
    const newMatch = {
      id,
      ...match,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // In a real implementation, this would save to database
    return newMatch;
  }

  async getMatch(id: string): Promise<any> {
    // In a real implementation, this would fetch from database
    return {
      id,
      homeTeamName: "Home Team",
      awayTeamName: "Away Team",
      status: "scheduled",
      kickoffTime: new Date(),
    };
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    // In a real implementation, this would update in database
    return {
      id,
      ...updates,
      updatedAt: new Date(),
    };
  }

  async softDeleteMatch(id: string, adminId: string): Promise<void> {
    // In a real implementation, this would set isDeleted = true
    console.log(`Match ${id} soft deleted by admin ${adminId}`);
  }

  async getActiveBetsByMatch(matchId: string): Promise<Bet[]> {
    // Check if any bets reference this match
    return Array.from(this.bets.values()).filter(
      (bet) => bet.status === "pending", // Would need to check bet selections for match reference
    );
  }

  async getMatchesByExternalIds(externalIds: string[]): Promise<any[]> {
    // In MemStorage, we don't have a persistent match store, so return empty array
    // This method is used for duplicate detection during import
    console.log(`MemStorage: Checking for existing matches with externalIds:`, externalIds);
    return [];
  }

  async upsertMatch(matchData: {
    externalId: string;
    externalSource?: string;
    sport: string;
    sportId?: string;
    sportName?: string;
    leagueId: string;
    leagueName: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    kickoffTime: Date;
    status?: string;
    homeScore?: number;
    awayScore?: number;
    isManual?: boolean;
    createdBy?: string;
    updatedBy?: string;
  }): Promise<{ match: any; isNew: boolean }> {
    // In MemStorage, always create a new match since we don't persist data
    const id = randomUUID();
    const now = new Date();
    
    const match = {
      id,
      externalId: matchData.externalId,
      externalSource: matchData.externalSource || 'sportmonks',
      sport: matchData.sport,
      sportId: matchData.sportId,
      sportName: matchData.sportName,
      leagueId: matchData.leagueId,
      leagueName: matchData.leagueName,
      homeTeamId: matchData.homeTeamId,
      homeTeamName: matchData.homeTeamName,
      awayTeamId: matchData.awayTeamId,
      awayTeamName: matchData.awayTeamName,
      kickoffTime: matchData.kickoffTime,
      status: matchData.status || 'scheduled',
      homeScore: matchData.homeScore,
      awayScore: matchData.awayScore,
      simulatedResult: null,
      isManual: matchData.isManual || false,
      isDeleted: false,
      createdBy: matchData.createdBy,
      updatedBy: matchData.updatedBy,
      createdAt: now,
      updatedAt: now,
    };

    console.log(`MemStorage: Created new match ${match.id} - ${match.homeTeamName} vs ${match.awayTeamName}`);
    
    return {
      match,
      isNew: true
    };
  }

  // ===================== MARKET MANAGEMENT OPERATIONS =====================

  async createMarket(market: any): Promise<any> {
    const id = randomUUID();
    const newMarket = {
      id,
      ...market,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return newMarket;
  }

  async updateMarket(id: string, updates: any): Promise<any> {
    return {
      id,
      ...updates,
      updatedAt: new Date(),
    };
  }

  // ===================== EXPOSURE OPERATIONS =====================

  async getMatchExposure(matchId: string): Promise<any> {
    return {
      matchId,
      totalExposureCents: 0,
      markets: [],
      lastCalculated: new Date(),
    };
  }

  async getMarketExposure(marketId: string): Promise<any> {
    return {
      marketId,
      totalExposureCents: 0,
      outcomes: [],
      lastCalculated: new Date(),
    };
  }

  async getOverallExposure(limit: number): Promise<any> {
    return {
      totalExposureCents: 0,
      matches: [],
      lastCalculated: new Date(),
    };
  }

  // ===================== PROMOTIONS OPERATIONS =====================

  async getPromotions(params: any): Promise<any> {
    return {
      promotions: [],
      total: 0,
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
      updatedAt: new Date(),
    };
  }

  async updatePromotion(id: string, updates: any): Promise<any> {
    return {
      id,
      ...updates,
      updatedAt: new Date(),
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
      totalBets: 0,
    };
  }

  async getMonthlyFinancialReport(year: number, month: number): Promise<any> {
    return {
      year,
      month,
      totalBetsAmountCents: 0,
      totalWinningsCents: 0,
      ggrCents: 0,
      dailyBreakdown: [],
    };
  }

  async getPlayerActivityReport(params: any): Promise<any> {
    return {
      players: [],
      totalPlayers: 0,
      period: params.period,
    };
  }

  async exportFinancialData(params: any): Promise<any> {
    const data = {
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      records: [],
    };

    if (params.format === "csv") {
      return {
        csv: "Date,Type,Amount,Description\n", // Empty CSV header
      };
    }

    return data;
  }

  // ===================== INITIALIZATION =====================

  // ===================== MISSING ADMIN OPERATIONS =====================

  async getAllBets(params?: {
    search?: string;
    status?: string;
    betType?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minStake?: number;
    maxStake?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ bets: any[]; total: number }> {
    let result = Array.from(this.bets.values());

    // Apply filters
    if (params?.search) {
      const searchLower = params.search.toLowerCase();
      result = result.filter((bet) => {
        const user = this.users.get(bet.userId);
        return (
          bet.id.toLowerCase().includes(searchLower) ||
          user?.username.toLowerCase().includes(searchLower) ||
          user?.email.toLowerCase().includes(searchLower)
        );
      });
    }

    if (params?.status && params.status !== "all") {
      result = result.filter((bet) => bet.status === params.status);
    }

    if (params?.betType && params.betType !== "all") {
      result = result.filter((bet) => bet.type === params.betType);
    }

    if (params?.userId) {
      result = result.filter((bet) => bet.userId === params.userId);
    }

    if (params?.dateFrom) {
      result = result.filter((bet) => bet.placedAt >= params.dateFrom!);
    }

    if (params?.dateTo) {
      result = result.filter((bet) => bet.placedAt <= params.dateTo!);
    }

    if (params?.minStake) {
      result = result.filter((bet) => bet.totalStake >= params.minStake!);
    }

    if (params?.maxStake) {
      result = result.filter((bet) => bet.totalStake <= params.maxStake!);
    }

    // Sort by date descending
    result.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());

    const total = result.length;

    // Apply pagination
    if (params?.offset) {
      result = result.slice(params.offset);
    }
    if (params?.limit) {
      result = result.slice(0, params.limit);
    }

    // Format for frontend with user data
    const formattedBets = result.map((bet) => {
      const user = this.users.get(bet.userId);
      const selections = Array.from(this.betSelections.values()).filter(
        (sel) => sel.betId === bet.id,
      );

      return {
        id: bet.id,
        userId: bet.userId,
        username: user?.username || "Unknown",
        userEmail: user?.email || "Unknown",
        betType: bet.type as "single" | "express" | "system",
        totalStakeCents: bet.totalStake,
        potentialWinCents: bet.potentialWinnings,
        actualWinCents: bet.actualWinnings || 0,
        status: bet.status as
          | "pending"
          | "settled_win"
          | "settled_lose"
          | "voided"
          | "refunded",
        placedAt: bet.placedAt.toISOString(),
        settledAt: bet.settledAt?.toISOString() || null,
        selections,
        selectionsCount: selections.length,
        totalOdds: parseFloat(bet.totalOdds),
        ipAddress: null,
      };
    });

    return {
      bets: formattedBets,
      total,
    };
  }

  async forceBetSettlement(
    betId: string,
    outcome: "win" | "lose" | "void",
    payoutCents: number,
  ): Promise<{ success: boolean; bet?: Bet; error?: string }> {
    const bet = this.bets.get(betId);
    if (!bet) {
      return { success: false, error: "Bet not found" };
    }

    if (bet.status !== "pending") {
      return { success: false, error: "Bet is not pending" };
    }

    // Update bet status
    const newStatus =
      outcome === "win"
        ? "settled_win"
        : outcome === "lose"
          ? "settled_lose"
          : "voided";

    const updatedBet = {
      ...bet,
      status: newStatus,
      settledAt: new Date(),
      actualWinnings: outcome === "win" ? payoutCents : 0,
    };

    this.bets.set(betId, updatedBet);

    // Update user balance if win or void
    if ((outcome === "win" && payoutCents > 0) || outcome === "void") {
      const user = this.users.get(bet.userId);
      if (user) {
        const balanceIncrease =
          outcome === "win" ? payoutCents : bet.totalStake;
        const updatedUser = {
          ...user,
          balance: user.balance + balanceIncrease,
        };
        this.users.set(bet.userId, updatedUser);

        // Create transaction record
        const transactionId = randomUUID();
        const transaction: Transaction = {
          id: transactionId,
          userId: bet.userId,
          type: outcome === "win" ? "bet_win" : "bet_refund",
          status: "completed",
          amount: balanceIncrease,
          balanceBefore: user.balance,
          balanceAfter: user.balance + balanceIncrease,
          reference: null,
          description: `Bet settlement - Force settled as ${outcome}`,
          createdAt: new Date(),
        };
        this.transactions.set(transactionId, transaction);
      }
    }

    return { success: true, bet: updatedBet };
  }

  async refundBet(
    betId: string,
  ): Promise<{ success: boolean; bet?: Bet; error?: string }> {
    const bet = this.bets.get(betId);
    if (!bet) {
      return { success: false, error: "Bet not found" };
    }

    if (bet.status !== "pending") {
      return { success: false, error: "Only pending bets can be refunded" };
    }

    // Update bet status to refunded
    const updatedBet = {
      ...bet,
      status: "refunded",
      settledAt: new Date(),
      actualWinnings: 0,
    };

    this.bets.set(betId, updatedBet);

    // Refund the stake to user balance
    const user = this.users.get(bet.userId);
    if (user) {
      const updatedUser = { ...user, balance: user.balance + bet.totalStake };
      this.users.set(bet.userId, updatedUser);

      // Create transaction record
      const transactionId = randomUUID();
      const transaction: Transaction = {
        id: transactionId,
        userId: bet.userId,
        type: "bet_refund",
        status: "completed",
        amount: bet.totalStake,
        balanceBefore: user.balance,
        balanceAfter: user.balance + bet.totalStake,
        reference: null,
        description: "Bet refund - Manual refund by admin",
        createdAt: new Date(),
      };
      this.transactions.set(transactionId, transaction);
    }

    return { success: true, bet: updatedBet };
  }

  async exportBetsToCSV(params?: {
    search?: string;
    status?: string;
    betType?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minStake?: number;
    maxStake?: number;
  }): Promise<string> {
    // Get all bets without pagination for export
    const { bets: allBets } = await this.getAllBets({
      ...params,
      limit: 10000,
      offset: 0,
    });

    // CSV headers
    const headers = [
      "Bet ID",
      "Username",
      "Email",
      "Bet Type",
      "Stake (£)",
      "Potential Win (£)",
      "Actual Win (£)",
      "Status",
      "Selections",
      "Total Odds",
      "Placed At",
      "Settled At",
      "Markets",
    ];

    // Convert bets to CSV rows
    const rows = allBets.map((bet) => {
      const selectionsText = bet.selections
        .map(
          (s: any) =>
            `${s.homeTeam} vs ${s.awayTeam} - ${s.market}: ${s.selection} @${s.odds}`,
        )
        .join(" | ");

      const marketsText = bet.selections.map((s: any) => s.market).join(", ");

      return [
        bet.id,
        bet.username,
        bet.userEmail,
        bet.betType,
        (bet.totalStakeCents / 100).toFixed(2),
        (bet.potentialWinCents / 100).toFixed(2),
        (bet.actualWinCents / 100).toFixed(2),
        bet.status,
        `"${selectionsText}"`, // Wrap in quotes to handle commas
        bet.totalOdds.toFixed(2),
        bet.placedAt,
        bet.settledAt || "N/A",
        marketsText,
      ];
    });

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((field) =>
            typeof field === "string" &&
            field.includes(",") &&
            !field.startsWith('"')
              ? `"${field}"`
              : field,
          )
          .join(","),
      )
      .join("\n");

    return csvContent;
  }

  async getActiveAdminSessions(): Promise<AdminSession[]> {
    const now = new Date();
    return Array.from(this.adminSessions.values())
      .filter((session) => session.expiresAt > now)
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

  // ===================== MISSING REPORTING METHODS =====================

  async getDailyGgrReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    date: string;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    winRate: number;
  }> {
    const allBets = Array.from(this.bets.values());
    const dayBets = allBets.filter(
      (bet) => bet.placedAt >= startDate && bet.placedAt <= endDate,
    );

    const totalStakeCents = dayBets.reduce(
      (sum, bet) => sum + bet.totalStake,
      0,
    );
    const settledBets = dayBets.filter((bet) => bet.status !== "pending");
    const totalPayoutsCents = settledBets
      .filter((bet) => bet.status === "settled_win")
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    const uniquePlayerIds = new Set(dayBets.map((bet) => bet.userId));
    const winningBets = settledBets.filter(
      (bet) => bet.status === "settled_win",
    ).length;

    return {
      date: startDate.toISOString().split("T")[0],
      totalStakeCents,
      totalPayoutsCents,
      grossGamingRevenueCents: totalStakeCents - totalPayoutsCents,
      totalBets: dayBets.length,
      activePlayers: uniquePlayerIds.size,
      averageStakeCents:
        dayBets.length > 0 ? totalStakeCents / dayBets.length : 0,
      winRate: settledBets.length > 0 ? winningBets / settledBets.length : 0,
    };
  }

  async getMonthlyGgrReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    year: number;
    month: number;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    highestDayCents: number;
    lowestDayCents: number;
    winRate: number;
    dailyBreakdown: Array<{
      day: number;
      stakeCents: number;
      ggrCents: number;
      bets: number;
    }>;
  }> {
    const allBets = Array.from(this.bets.values());
    const monthBets = allBets.filter(
      (bet) => bet.placedAt >= startDate && bet.placedAt <= endDate,
    );

    const totalStakeCents = monthBets.reduce(
      (sum, bet) => sum + bet.totalStake,
      0,
    );
    const settledBets = monthBets.filter((bet) => bet.status !== "pending");
    const totalPayoutsCents = settledBets
      .filter((bet) => bet.status === "settled_win")
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    const uniquePlayerIds = new Set(monthBets.map((bet) => bet.userId));
    const winningBets = settledBets.filter(
      (bet) => bet.status === "settled_win",
    ).length;

    // Generate daily breakdown
    const dailyBreakdown = [];
    const daysInMonth = endDate.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStart = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        day,
      );
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayBets = monthBets.filter(
        (bet) => bet.placedAt >= dayStart && bet.placedAt < dayEnd,
      );

      const dayStake = dayBets.reduce((sum, bet) => sum + bet.totalStake, 0);
      const dayPayouts = dayBets
        .filter((bet) => bet.status === "settled_win")
        .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

      dailyBreakdown.push({
        day,
        stakeCents: dayStake,
        ggrCents: dayStake - dayPayouts,
        bets: dayBets.length,
      });
    }

    const dailyGgrAmounts = dailyBreakdown.map((d) => d.ggrCents);

    return {
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      totalStakeCents,
      totalPayoutsCents,
      grossGamingRevenueCents: totalStakeCents - totalPayoutsCents,
      totalBets: monthBets.length,
      activePlayers: uniquePlayerIds.size,
      averageStakeCents:
        monthBets.length > 0 ? totalStakeCents / monthBets.length : 0,
      highestDayCents: Math.max(...dailyGgrAmounts, 0),
      lowestDayCents: Math.min(...dailyGgrAmounts, 0),
      winRate: settledBets.length > 0 ? winningBets / settledBets.length : 0,
      dailyBreakdown,
    };
  }

  async getTurnoverBySportReport(
    startDate: Date,
    endDate: Date,
    sport?: string,
    league?: string,
  ): Promise<{
    sports: Array<{
      sport: string;
      turnoverCents: number;
      betCount: number;
      ggrCents: number;
    }>;
    totalTurnoverCents: number;
    totalBets: number;
    totalGgrCents: number;
  }> {
    // Mock implementation for memory storage
    return {
      sports: [
        {
          sport: "Football",
          turnoverCents: 50000000,
          betCount: 1250,
          ggrCents: 2500000,
        },
        {
          sport: "Basketball",
          turnoverCents: 25000000,
          betCount: 600,
          ggrCents: 1250000,
        },
        {
          sport: "Tennis",
          turnoverCents: 15000000,
          betCount: 400,
          ggrCents: 750000,
        },
      ],
      totalTurnoverCents: 90000000,
      totalBets: 2250,
      totalGgrCents: 4500000,
    };
  }

  async getPayoutRatioReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    payoutRatio: number;
    betCount: number;
    winningBets: number;
    losingBets: number;
    winRate: number;
  }> {
    const allBets = Array.from(this.bets.values());
    const periodBets = allBets.filter(
      (bet) =>
        bet.placedAt >= startDate &&
        bet.placedAt <= endDate &&
        bet.status !== "pending",
    );

    const totalStakeCents = periodBets.reduce(
      (sum, bet) => sum + bet.totalStake,
      0,
    );
    const totalPayoutsCents = periodBets
      .filter((bet) => bet.status === "settled_win")
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    const winningBets = periodBets.filter(
      (bet) => bet.status === "settled_win",
    ).length;
    const losingBets = periodBets.filter(
      (bet) => bet.status === "settled_lose",
    ).length;

    return {
      totalStakeCents,
      totalPayoutsCents,
      payoutRatio:
        totalStakeCents > 0 ? totalPayoutsCents / totalStakeCents : 0,
      betCount: periodBets.length,
      winningBets,
      losingBets,
      winRate: periodBets.length > 0 ? winningBets / periodBets.length : 0,
    };
  }

  async getTopWinnersReport(
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<{
    winners: Array<{
      userId: string;
      username: string;
      netWinningsCents: number;
      betCount: number;
    }>;
  }> {
    const allBets = Array.from(this.bets.values());
    const periodBets = allBets.filter(
      (bet) =>
        bet.placedAt >= startDate &&
        bet.placedAt <= endDate &&
        bet.status !== "pending",
    );

    // Group by user
    const userStats = new Map();

    periodBets.forEach((bet) => {
      const user = this.users.get(bet.userId);
      if (!user) return;

      if (!userStats.has(bet.userId)) {
        userStats.set(bet.userId, {
          userId: bet.userId,
          username: user.username,
          totalStake: 0,
          totalWinnings: 0,
          betCount: 0,
        });
      }

      const stats = userStats.get(bet.userId);
      stats.totalStake += bet.totalStake;
      stats.betCount += 1;

      if (bet.status === "settled_win") {
        stats.totalWinnings += bet.actualWinnings || 0;
      }
    });

    const winners = Array.from(userStats.values())
      .map((stats) => ({
        userId: stats.userId,
        username: stats.username,
        netWinningsCents: stats.totalWinnings - stats.totalStake,
        betCount: stats.betCount,
      }))
      .sort((a, b) => b.netWinningsCents - a.netWinningsCents)
      .slice(0, limit);

    return { winners };
  }

  async getChargebackReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    chargebacks: Array<{
      id: string;
      userId: string;
      username: string;
      amountCents: number;
      reason: string;
      status: string;
      createdAt: Date;
    }>;
    totalAmountCents: number;
    count: number;
  }> {
    // Mock implementation for memory storage
    return {
      chargebacks: [],
      totalAmountCents: 0,
      count: 0,
    };
  }

  async generateCustomReport(params: {
    reportType: string;
    dateFrom: Date;
    dateTo: Date;
    filters?: any;
    groupBy?: string;
    metrics?: string[];
  }): Promise<{
    title: string;
    data: any[];
    summary: any;
    generatedAt: Date;
  }> {
    return {
      title: `Custom ${params.reportType} Report`,
      data: [],
      summary: {},
      generatedAt: new Date(),
    };
  }

  async exportReportData(params: {
    reportType: string;
    format: "csv" | "excel" | "json";
    dateFrom: Date;
    dateTo: Date;
    filters?: any;
  }): Promise<string> {
    return JSON.stringify({
      reportType: params.reportType,
      format: params.format,
      exportedAt: new Date().toISOString(),
    });
  }

  async createScheduledReport(report: {
    name: string;
    reportType: string;
    frequency: "daily" | "weekly" | "monthly";
    recipients: string[];
    filters?: any;
    format?: "csv" | "excel" | "pdf";
  }): Promise<any> {
    return {
      id: randomUUID(),
      ...report,
      createdAt: new Date(),
      isActive: true,
    };
  }

  // ===================== DASHBOARD METHODS =====================

  async getDashboardAlerts(): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      severity: "low" | "medium" | "high" | "critical";
      timestamp: Date;
      isResolved: boolean;
      actionRequired: boolean;
    }>
  > {
    return [];
  }

  async resolveAlert(
    alertId: string,
    adminId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    return {
      success: true,
      message: "Alert resolved successfully",
    };
  }

  async updateNotificationSettings(settings: {
    emailSettings: any;
    slackSettings: any;
    webhookSettings: any;
    alertThresholds: any;
    updatedBy: string;
    updatedAt: Date;
  }): Promise<any> {
    return settings;
  }

  async getTotalUsers(): Promise<number> {
    return this.users.size;
  }

  async getNewUsersCount(since: Date): Promise<number> {
    return Array.from(this.users.values()).filter(
      (user) => user.createdAt >= since,
    ).length;
  }

  async getTotalBets(): Promise<number> {
    return this.bets.size;
  }

  async getPendingBetsCount(): Promise<number> {
    return Array.from(this.bets.values()).filter(
      (bet) => bet.status === "pending",
    ).length;
  }

  async getBetsCount(since: Date): Promise<number> {
    return Array.from(this.bets.values()).filter((bet) => bet.placedAt >= since)
      .length;
  }

  async getTurnoverMetrics(
    todayStart: Date,
    weekStart: Date,
  ): Promise<{
    todayCents: number;
    weekCents: number;
    totalCents: number;
  }> {
    const allBets = Array.from(this.bets.values());

    const todayCents = allBets
      .filter((bet) => bet.placedAt >= todayStart)
      .reduce((sum, bet) => sum + bet.totalStake, 0);

    const weekCents = allBets
      .filter((bet) => bet.placedAt >= weekStart)
      .reduce((sum, bet) => sum + bet.totalStake, 0);

    const totalCents = allBets.reduce((sum, bet) => sum + bet.totalStake, 0);

    return { todayCents, weekCents, totalCents };
  }

  async getExposureMetrics(): Promise<{
    totalCents: number;
    highRiskCount: number;
  }> {
    const pendingBets = Array.from(this.bets.values()).filter(
      (bet) => bet.status === "pending",
    );

    const totalCents = pendingBets.reduce(
      (sum, bet) => sum + bet.potentialWinnings,
      0,
    );
    const highRiskCount = pendingBets.filter(
      (bet) => bet.potentialWinnings > 100000,
    ).length;

    return { totalCents, highRiskCount };
  }

  async getRecentActivity(limit: number): Promise<
    Array<{
      id: string;
      type: string;
      title?: string;
      description?: string;
      action?: string;
      details?: string;
      timestamp?: Date;
      createdAt: Date;
      userId?: string;
      adminId?: string;
      betId?: string;
      amount?: number;
      severity?: string;
    }>
  > {
    const recentBets = Array.from(this.bets.values())
      .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
      .slice(0, Math.floor(limit / 2))
      .map((bet) => ({
        id: bet.id,
        type: "bet_placed" as string,
        title: "New Bet Placed",
        description: `Bet placed for £${(bet.totalStake / 100).toFixed(2)}`,
        createdAt: bet.placedAt,
        userId: bet.userId,
        amount: bet.totalStake,
        severity: "info",
      }));

    const recentAudits = Array.from(this.auditLogs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.floor(limit / 2))
      .map((audit) => ({
        id: audit.id,
        type: "admin_action" as string,
        title: "Admin Action",
        description: audit.actionType.replace("_", " ").toUpperCase(),
        action: audit.actionType,
        createdAt: audit.createdAt,
        adminId: audit.adminId,
        severity: "info",
      }));

    return [...recentBets, ...recentAudits]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getSystemAlerts(): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
      message?: string;
      description?: string;
      severity: string;
      timestamp?: Date;
      createdAt: Date;
      isResolved: boolean;
      actionRequired: boolean;
    }>
  > {
    const alerts = [];
    const pendingBets = Array.from(this.bets.values()).filter(
      (bet) => bet.status === "pending",
    );

    const totalExposure = pendingBets.reduce(
      (sum, bet) => sum + bet.potentialWinnings,
      0,
    );
    const highRiskCount = pendingBets.filter(
      (bet) => bet.potentialWinnings > 100000,
    ).length;

    if (totalExposure > 10000000) {
      // > £100,000
      alerts.push({
        id: "high-total-exposure",
        type: "high_exposure",
        title: "High Total Exposure Alert",
        message: `Total exposure: £${(totalExposure / 100).toLocaleString()}`,
        severity: "high",
        createdAt: new Date(),
        isResolved: false,
        actionRequired: true,
      });
    }

    if (highRiskCount > 0) {
      alerts.push({
        id: "high-risk-bets",
        type: "high_exposure",
        title: "High Risk Bets Detected",
        message: `${highRiskCount} bets with potential payouts over £1,000`,
        severity: "medium",
        createdAt: new Date(),
        isResolved: false,
        actionRequired: true,
      });
    }

    return alerts;
  }

  // ===================== MATCH/MARKET METHODS =====================

  async getAllMatches(params?: {
    search?: string;
    status?: string;
    sport?: string;
    league?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    matches: any[];
    total: number;
  }> {
    return { matches: [], total: 0 };
  }

  async createMarketOutcome(outcome: {
    marketId: string;
    name: string;
    odds: string;
    isActive: boolean;
  }): Promise<any> {
    return {
      id: randomUUID(),
      ...outcome,
      createdAt: new Date(),
    };
  }

  async updateMarketOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    return {
      id: outcomeId,
      odds,
      updatedAt: new Date(),
    };
  }

  // ===================== USER METHODS =====================

  async searchUsersData(params: {
    query?: string;
    isActive?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    users: any[];
    total: number;
  }> {
    let result = Array.from(this.users.values());

    if (params.query) {
      const searchLower = params.query.toLowerCase();
      result = result.filter(
        (user) =>
          user.username.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower) ||
          user.firstName?.toLowerCase().includes(searchLower) ||
          user.lastName?.toLowerCase().includes(searchLower),
      );
    }

    if (params.isActive !== undefined) {
      result = result.filter((user) => user.isActive === params.isActive);
    }

    if (params.dateFrom) {
      result = result.filter((user) => user.createdAt >= params.dateFrom!);
    }

    if (params.dateTo) {
      result = result.filter((user) => user.createdAt <= params.dateTo!);
    }

    const total = result.length;
    const offset = params.offset || 0;
    const limit = params.limit || 50;

    result = result
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);

    return {
      users: result.map((user) => ({
        ...user,
        password: undefined, // Remove password from results
      })),
      total,
    };
  }

  async getUserLimits(userId: string): Promise<{
    dailyDepositLimitCents: number;
    weeklyDepositLimitCents: number;
    monthlyDepositLimitCents: number;
    maxBetLimitCents: number;
    sessionTimeLimitMinutes: number;
    cooldownPeriodHours: number;
  } | null> {
    return {
      dailyDepositLimitCents: 100000, // £1,000
      weeklyDepositLimitCents: 500000, // £5,000
      monthlyDepositLimitCents: 2000000, // £20,000
      maxBetLimitCents: 50000, // £500
      sessionTimeLimitMinutes: 240, // 4 hours
      cooldownPeriodHours: 24, // 24 hours
    };
  }

  async upsertUserLimits(
    userId: string,
    limits: {
      dailyDepositLimitCents?: number;
      weeklyDepositLimitCents?: number;
      monthlyDepositLimitCents?: number;
      maxBetLimitCents?: number;
      sessionTimeLimitMinutes?: number;
      cooldownPeriodHours?: number;
    },
  ): Promise<any> {
    return {
      userId,
      ...limits,
      updatedAt: new Date(),
    };
  }

  // ===================== FINANCIAL METHODS =====================

  async calculateGGRReport(params: {
    dateFrom: Date;
    dateTo: Date;
    groupBy?: "day" | "week" | "month";
  }): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    ggrCents: number;
    betCount: number;
    playerCount: number;
    breakdown: Array<{
      period: string;
      stakeCents: number;
      payoutsCents: number;
      ggrCents: number;
      betCount: number;
    }>;
  }> {
    const allBets = Array.from(this.bets.values());
    const periodBets = allBets.filter(
      (bet) => bet.placedAt >= params.dateFrom && bet.placedAt <= params.dateTo,
    );

    const totalStakeCents = periodBets.reduce(
      (sum, bet) => sum + bet.totalStake,
      0,
    );
    const totalPayoutsCents = periodBets
      .filter((bet) => bet.status === "settled_win")
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    const uniquePlayerIds = new Set(periodBets.map((bet) => bet.userId));

    const breakdown = [
      {
        period: params.dateFrom.toISOString().split("T")[0],
        stakeCents: totalStakeCents,
        payoutsCents: totalPayoutsCents,
        ggrCents: totalStakeCents - totalPayoutsCents,
        betCount: periodBets.length,
      },
    ];

    return {
      totalStakeCents,
      totalPayoutsCents,
      ggrCents: totalStakeCents - totalPayoutsCents,
      betCount: periodBets.length,
      playerCount: uniquePlayerIds.size,
      breakdown,
    };
  }

  async createDashboardAlert(alert: {
    type: string;
    title: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
    actionRequired?: boolean;
  }): Promise<any> {
    return {
      id: randomUUID(),
      ...alert,
      createdAt: new Date(),
      isResolved: false,
    };
  }
}

import { SupabaseStorage } from "./supabase-storage";

// Create storage based on Supabase availability
// If Supabase credentials are not configured, use in-memory storage as fallback
// This allows betting odds functionality to work without authentication
const memStorage = new MemStorage();
const supabaseStorage = isSupabaseConfigured ? new SupabaseStorage() : null;

// Export storage - use Supabase if configured, otherwise fallback to memory storage
export const storage: IStorage = supabaseStorage || memStorage;

if (!isSupabaseConfigured) {
  console.warn('⚠️  Using in-memory storage as fallback. Data will not persist between restarts.');
  console.warn('   Configure Supabase credentials for persistent storage and user authentication.');
}
