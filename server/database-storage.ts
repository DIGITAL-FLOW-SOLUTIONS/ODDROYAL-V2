import { db } from './db';
import { 
  users, 
  bets, 
  betSelections, 
  userFavorites, 
  transactions, 
  userSessions,
  adminUsers,
  adminSessions,
  auditLogs,
  matches,
  markets,
  marketOutcomes,
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
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import argon2 from "argon2";
import speakeasy from "speakeasy";
import type { IStorage } from "./storage";

/**
 * Database implementation of IStorage interface using Drizzle ORM
 */
export class DatabaseStorage implements IStorage {
  // ===================== USER OPERATIONS =====================
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db
      .insert(users)
      .values(user)
      .returning();
    return newUser;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return updatedUser || undefined;
  }

  async updateUserBalance(userId: string, newBalanceCents: number): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ balance: newBalanceCents })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser || undefined;
  }

  // ===================== BET OPERATIONS =====================
  
  async createBet(bet: InsertBet & { userId: string }): Promise<Bet> {
    const [newBet] = await db
      .insert(bets)
      .values(bet)
      .returning();
    return newBet;
  }

  async getBet(id: string): Promise<Bet | undefined> {
    const [bet] = await db.select().from(bets).where(eq(bets.id, id));
    return bet || undefined;
  }

  async getUserBets(userId: string, limit = 50): Promise<Bet[]> {
    return await db
      .select()
      .from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.placedAt))
      .limit(limit);
  }

  async updateBetStatus(betId: string, status: string, actualWinningsCents?: number): Promise<Bet | undefined> {
    const updateData: any = { 
      status,
      settledAt: new Date()
    };
    if (actualWinningsCents !== undefined) {
      updateData.actualWinnings = actualWinningsCents;
    }

    const [updatedBet] = await db
      .update(bets)
      .set(updateData)
      .where(eq(bets.id, betId))
      .returning();
    return updatedBet || undefined;
  }

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
    return await db.transaction(async (tx) => {
      try {
        // Check user balance
        const [user] = await tx.select().from(users).where(eq(users.id, params.userId));
        if (!user) {
          return { success: false, error: "User not found" };
        }

        if (user.balance < params.totalStakeCents) {
          return { success: false, error: "Insufficient balance" };
        }

        // Calculate total odds and potential winnings
        const totalOdds = params.selections.reduce((acc, sel) => acc * parseFloat(sel.odds), 1);
        const potentialWinnings = Math.round(params.totalStakeCents * totalOdds);

        // Create bet
        const [bet] = await tx
          .insert(bets)
          .values({
            userId: params.userId,
            type: params.betType,
            totalStake: params.totalStakeCents,
            potentialWinnings,
            totalOdds: totalOdds.toString(),
            status: 'pending'
          })
          .returning();

        // Create bet selections with proper foreign key lookups
        const selections: BetSelection[] = [];
        for (const sel of params.selections) {
          // CRITICAL FIX: Look up the actual marketId and outcomeId
          // First find the match by fixtureId (this might be externalId in matches table)
          const [match] = await tx
            .select()
            .from(matches)
            .where(eq(matches.externalId, sel.fixtureId))
            .limit(1);
          
          if (!match) {
            throw new Error(`Match not found for fixture ${sel.fixtureId}`);
          }

          // Find the market by match and market key
          const [market] = await tx
            .select()
            .from(markets)
            .where(and(
              eq(markets.matchId, match.id),
              eq(markets.key, sel.market)
            ))
            .limit(1);
          
          if (!market) {
            throw new Error(`Market ${sel.market} not found for match ${match.id}`);
          }

          // Find the outcome by market and selection key
          const [outcome] = await tx
            .select()
            .from(marketOutcomes)
            .where(and(
              eq(marketOutcomes.marketId, market.id),
              eq(marketOutcomes.key, sel.selection)
            ))
            .limit(1);
          
          if (!outcome) {
            throw new Error(`Outcome ${sel.selection} not found for market ${market.id}`);
          }

          const [selection] = await tx
            .insert(betSelections)
            .values({
              betId: bet.id,
              fixtureId: sel.fixtureId,
              homeTeam: sel.homeTeam,
              awayTeam: sel.awayTeam,
              league: sel.league,
              marketId: market.id, // NEW: Foreign key to markets table
              outcomeId: outcome.id, // NEW: Foreign key to marketOutcomes table
              market: sel.market, // Kept for backwards compatibility
              selection: sel.selection, // Kept for backwards compatibility
              odds: sel.odds,
              status: 'pending'
            })
            .returning();
          selections.push(selection);
        }

        // Update user balance
        const [updatedUser] = await tx
          .update(users)
          .set({ balance: user.balance - params.totalStakeCents })
          .where(eq(users.id, params.userId))
          .returning();

        // Create transaction record
        const [transaction] = await tx
          .insert(transactions)
          .values({
            userId: params.userId,
            type: 'bet_stake',
            amount: -params.totalStakeCents,
            balanceBefore: user.balance,
            balanceAfter: updatedUser.balance,
            reference: bet.id,
            description: `Bet placed: ${params.betType} (${params.selections.length} selections)`
          })
          .returning();

        return {
          success: true,
          bet,
          selections,
          user: updatedUser,
          transaction
        };
      } catch (error) {
        console.error('Failed to place bet:', error);
        return { success: false, error: "Failed to place bet" };
      }
    });
  }

  // ===================== BET SELECTION OPERATIONS =====================
  
  async createBetSelection(selection: InsertBetSelection): Promise<BetSelection> {
    const [newSelection] = await db
      .insert(betSelections)
      .values(selection)
      .returning();
    return newSelection;
  }

  async getBetSelections(betId: string): Promise<BetSelection[]> {
    return await db
      .select()
      .from(betSelections)
      .where(eq(betSelections.betId, betId));
  }

  async updateSelectionStatus(selectionId: string, status: string, result?: string): Promise<BetSelection | undefined> {
    const updateData: any = { status };
    if (result) updateData.result = result;

    const [updatedSelection] = await db
      .update(betSelections)
      .set(updateData)
      .where(eq(betSelections.id, selectionId))
      .returning();
    return updatedSelection || undefined;
  }

  // ===================== FAVORITES OPERATIONS =====================
  
  async addFavorite(favorite: InsertFavorite & { userId: string }): Promise<UserFavorite> {
    const [newFavorite] = await db
      .insert(userFavorites)
      .values(favorite)
      .returning();
    return newFavorite;
  }

  async removeFavorite(userId: string, entityId: string): Promise<boolean> {
    const result = await db
      .delete(userFavorites)
      .where(and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.entityId, entityId)
      ));
    return (result.rowCount || 0) > 0;
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return await db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));
  }

  // ===================== TRANSACTION OPERATIONS =====================
  
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  async getUserTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  // ===================== SESSION OPERATIONS =====================
  
  async createSession(userId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<UserSession> {
    const [session] = await db
      .insert(userSessions)
      .values({
        userId,
        sessionToken,
        expiresAt,
        ipAddress,
        userAgent
      })
      .returning();
    return session;
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.sessionToken, sessionToken));
    return session || undefined;
  }

  async deleteSession(sessionToken: string): Promise<boolean> {
    const result = await db
      .delete(userSessions)
      .where(eq(userSessions.sessionToken, sessionToken));
    return (result.rowCount || 0) > 0;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await db
      .delete(userSessions)
      .where(lte(userSessions.expiresAt, new Date()));
    return result.rowCount || 0;
  }

  // ===================== ADMIN OPERATIONS =====================
  
  async createAdminUser(admin: InsertAdminUser): Promise<AdminUser> {
    const [newAdmin] = await db
      .insert(adminUsers)
      .values(admin)
      .returning();
    return newAdmin;
  }

  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return admin || undefined;
  }

  async getAdminByUsername(username: string): Promise<AdminUser | undefined> {
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username));
    return admin || undefined;
  }

  async updateAdminUser(id: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning();
    return updatedAdmin || undefined;
  }

  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    const refreshToken = randomUUID(); // Generate refresh token
    const [session] = await db
      .insert(adminSessions)
      .values({
        adminId,
        sessionToken,
        refreshToken,
        expiresAt,
        ipAddress,
        userAgent
      })
      .returning();
    return session;
  }

  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> {
    const [session] = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.sessionToken, sessionToken));
    return session || undefined;
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    const result = await db
      .delete(adminSessions)
      .where(eq(adminSessions.sessionToken, sessionToken));
    return (result.rowCount || 0) > 0;
  }

  // ===================== AUDIT OPERATIONS =====================
  
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db
      .insert(auditLogs)
      .values(log)
      .returning();
    return newLog;
  }

  async getAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    return await db.select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // ===================== DEMO ACCOUNT INITIALIZATION =====================
  
  async initializeDemoAccount(): Promise<void> {
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
      
      const existingAdmin = await this.getAdminByUsername(adminUsername);
      if (existingAdmin) {
        console.log('Demo admin account already exists');
      } else {
        // Hash admin password with Argon2
        const hashedAdminPassword = await argon2.hash(adminPassword);
        
        // Create demo admin user
        await this.createAdminUser({
          username: adminUsername,
          email: adminEmail,
          passwordHash: hashedAdminPassword,
          role: 'superadmin',
          isActive: true
        });
        
        console.log('Demo admin account created successfully');
      }
      
    } catch (error) {
      console.error('Failed to initialize demo accounts:', error);
    }
  }

  // ===================== ADDITIONAL METHODS FOR SETTLEMENT WORKER =====================
  
  async getPendingBets(): Promise<Bet[]> {
    return await db
      .select()
      .from(bets)
      .where(eq(bets.status, 'pending'))
      .orderBy(bets.placedAt);
  }

  async getBetsWithSelections(): Promise<Array<Bet & { selections: BetSelection[] }>> {
    const pendingBets = await this.getPendingBets();
    const betsWithSelections = [];
    
    for (const bet of pendingBets) {
      const selections = await this.getBetSelections(bet.id);
      betsWithSelections.push({ ...bet, selections });
    }
    
    return betsWithSelections;
  }

  // ===================== PLACEHOLDER IMPLEMENTATIONS =====================
  // These need to be implemented for full admin functionality
  
  async getActiveUsersCount(): Promise<number> {
    const result = await db.select({ count: count() }).from(users);
    return result[0]?.count || 0;
  }

  async getTotalOpenBets(): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(bets)
      .where(eq(bets.status, 'pending'));
    return result[0]?.count || 0;
  }

  async getDailyTurnoverCents(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)` 
      })
      .from(bets)
      .where(gte(bets.placedAt, today));
    
    return result[0]?.total || 0;
  }

  async getAllUsersData(limit: number, offset: number): Promise<{ users: User[], total: number }> {
    const [usersResult, countResult] = await Promise.all([
      db.select()
        .from(users)
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(users)
    ]);

    return {
      users: usersResult,
      total: countResult[0]?.count || 0
    };
  }

  async getAllAdminUsers(limit: number, offset: number): Promise<{ users: AdminUser[], total: number }> {
    const [adminsResult, countResult] = await Promise.all([
      db.select()
        .from(adminUsers)
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(adminUsers)
    ]);

    return {
      users: adminsResult,
      total: countResult[0]?.count || 0
    };
  }

  // Temporary stubs for remaining methods - these will need full implementation
  async getMatchesByTeamsAndTime(homeTeamId: string, awayTeamId: string, kickoffTime: Date): Promise<any[]> {
    return [];
  }

  async createMatch(match: any): Promise<any> {
    return { id: randomUUID(), ...match, createdAt: new Date(), updatedAt: new Date() };
  }

  async getMatch(id: string): Promise<any> {
    return null;
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async softDeleteMatch(id: string, adminId: string): Promise<void> {
    console.log(`Match ${id} soft deleted by admin ${adminId}`);
  }

  async getActiveBetsByMatch(matchId: string): Promise<Bet[]> {
    return [];
  }

  async createMarket(market: any): Promise<any> {
    return { id: randomUUID(), ...market, createdAt: new Date(), updatedAt: new Date() };
  }

  async updateMarket(id: string, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async getMatchExposure(matchId: string): Promise<any> {
    return { matchId, totalExposureCents: 0, markets: [], lastCalculated: new Date() };
  }

  async getMarketExposure(marketId: string): Promise<any> {
    return { marketId, totalExposureCents: 0, outcomes: [], lastCalculated: new Date() };
  }

  async getOverallExposure(limit: number): Promise<any> {
    return { totalExposureCents: 0, matches: [], lastCalculated: new Date() };
  }

  async createPromotion(promotion: any): Promise<any> {
    return { id: randomUUID(), ...promotion, createdAt: new Date(), updatedAt: new Date() };
  }

  async updatePromotion(id: string, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async getPromotions(params: { limit?: number; offset?: number }): Promise<{ promotions: any[], total: number }> {
    return { promotions: [], total: 0 };
  }

  async generateFinancialReport(params: any): Promise<any> {
    return { records: [] };
  }
}