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
  promotions,
  oddsHistory,
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
import { eq, and, desc, gte, lte, sql, count, inArray } from "drizzle-orm";
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
  
  async createTransaction(transaction: InsertTransaction & { userId: string }): Promise<Transaction> {
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

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    return this.getAdminByUsername(username);
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email));
    return admin || undefined;
  }

  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> {
    const updateData: any = { 
      loginAttempts: attempts,
      updatedAt: new Date()
    };
    if (lockedUntil !== undefined) {
      updateData.lockedUntil = lockedUntil;
    }
    if (attempts === 0) {
      updateData.lastLogin = new Date();
    }

    const [updatedAdmin] = await db
      .update(adminUsers)
      .set(updateData)
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updatedAdmin || undefined;
  }

  async updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined> {
    const [updatedSession] = await db
      .update(adminSessions)
      .set(updates)
      .where(eq(adminSessions.id, sessionId))
      .returning();
    return updatedSession || undefined;
  }

  async deleteAllAdminSessions(adminId: string): Promise<boolean> {
    const result = await db
      .delete(adminSessions)
      .where(eq(adminSessions.adminId, adminId));
    return (result.rowCount || 0) > 0;
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

  async getAdminUsers(limit = 50, offset = 0): Promise<AdminUser[]> {
    return await db
      .select()
      .from(adminUsers)
      .limit(limit)
      .offset(offset);
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    return await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.role, role));
  }

  async updateAdminRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string }> {
    try {
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, adminId));
      
      if (!admin) {
        return { success: false, error: 'Admin user not found' };
      }

      const oldRole = admin.role;
      const [updatedAdmin] = await db
        .update(adminUsers)
        .set({ role: newRole, updatedAt: new Date() })
        .where(eq(adminUsers.id, adminId))
        .returning();

      // Create audit log
      const auditLog = await this.createAuditLog({
        adminId: updatedBy,
        actionType: 'update_admin_role',
        targetType: 'admin_user',
        targetId: adminId,
        dataBefore: { role: oldRole },
        dataAfter: { role: newRole },
        note: `Admin role changed from ${oldRole} to ${newRole}`,
        ipAddress: null,
        userAgent: null,
        success: true
      });

      return { success: true, admin: updatedAdmin, auditLog };
    } catch (error) {
      return { success: false, error: 'Failed to update admin role' };
    }
  }

  async searchAdminUsers(params: {
    query?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }> {
    let whereConditions = [];
    
    if (params.query) {
      whereConditions.push(
        sql`(${adminUsers.username} ILIKE ${'%' + params.query + '%'} OR ${adminUsers.email} ILIKE ${'%' + params.query + '%'})`
      );
    }
    
    if (params.role) {
      whereConditions.push(eq(adminUsers.role, params.role));
    }
    
    if (params.isActive !== undefined) {
      whereConditions.push(eq(adminUsers.isActive, params.isActive));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [usersResult, countResult] = await Promise.all([
      db.select()
        .from(adminUsers)
        .where(whereClause)
        .limit(params.limit || 50)
        .offset(params.offset || 0)
        .orderBy(desc(adminUsers.createdAt)),
      db.select({ count: count() })
        .from(adminUsers)
        .where(whereClause)
    ]);

    return {
      users: usersResult,
      total: countResult[0]?.count || 0
    };
  }

  // ===================== 2FA OPERATIONS =====================
  
  async enableAdmin2FA(adminId: string, totpSecret: string): Promise<AdminUser | undefined> {
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set({ 
        totpSecret: totpSecret,
        updatedAt: new Date()
      })
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updatedAdmin || undefined;
  }

  async disableAdmin2FA(adminId: string): Promise<AdminUser | undefined> {
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set({ 
        totpSecret: null,
        updatedAt: new Date()
      })
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updatedAdmin || undefined;
  }

  // ===================== MATCH MANAGEMENT =====================
  
  async getMatchesByTeamsAndTime(homeTeamId: string, awayTeamId: string, kickoffTime: Date): Promise<any[]> {
    return await db
      .select()
      .from(matches)
      .where(and(
        eq(matches.homeTeamId, homeTeamId),
        eq(matches.awayTeamId, awayTeamId),
        eq(matches.kickoffTime, kickoffTime)
      ));
  }

  async createMatch(match: any): Promise<any> {
    const [newMatch] = await db
      .insert(matches)
      .values(match)
      .returning();
    return newMatch;
  }

  async getMatch(id: string): Promise<any> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || null;
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    const [updatedMatch] = await db
      .update(matches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(matches.id, id))
      .returning();
    return updatedMatch;
  }

  async softDeleteMatch(id: string, adminId: string): Promise<void> {
    await db
      .update(matches)
      .set({ 
        isDeleted: true, 
        updatedBy: adminId, 
        updatedAt: new Date() 
      })
      .where(eq(matches.id, id));
  }

  async getActiveBetsByMatch(matchId: string): Promise<Bet[]> {
    // Get bet selections for this match and their corresponding bets
    const betSelectionIds = await db
      .select({ betId: betSelections.betId })
      .from(betSelections)
      .innerJoin(matches, eq(matches.externalId, betSelections.fixtureId))
      .where(eq(matches.id, matchId));

    if (betSelectionIds.length === 0) return [];

    const betIds = Array.from(new Set(betSelectionIds.map(b => b.betId)));
    return await db
      .select()
      .from(bets)
      .where(and(inArray(bets.id, betIds), eq(bets.status, 'pending')));
  }

  // ===================== MARKET MANAGEMENT =====================
  
  async createMarket(market: any): Promise<any> {
    const [newMarket] = await db
      .insert(markets)
      .values(market)
      .returning();
    return newMarket;
  }

  async updateMarket(id: string, updates: any): Promise<any> {
    const [updatedMarket] = await db
      .update(markets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(markets.id, id))
      .returning();
    return updatedMarket;
  }

  // ===================== EXPOSURE CALCULATIONS =====================
  
  async getMatchExposure(matchId: string): Promise<any> {
    // Get all active bets for this match
    const activeBets = await this.getActiveBetsByMatch(matchId);
    let totalExposureCents = 0;
    
    for (const bet of activeBets) {
      totalExposureCents += bet.potentialWinnings - bet.totalStake;
    }
    
    return { 
      matchId, 
      totalExposureCents, 
      betCount: activeBets.length,
      lastCalculated: new Date() 
    };
  }

  async getMarketExposure(marketId: string): Promise<any> {
    // Get all bet selections for this market
    const selections = await db
      .select()
      .from(betSelections)
      .innerJoin(bets, eq(bets.id, betSelections.betId))
      .where(and(
        eq(betSelections.marketId, marketId),
        eq(bets.status, 'pending')
      ));

    let totalExposureCents = 0;
    for (const selection of selections) {
      const bet = selection.bets;
      totalExposureCents += bet.potentialWinnings - bet.totalStake;
    }
    
    return { 
      marketId, 
      totalExposureCents,
      betCount: selections.length,
      lastCalculated: new Date() 
    };
  }

  async getOverallExposure(limit: number): Promise<any> {
    // Get all pending bets
    const pendingBets = await this.getPendingBets();
    let totalExposureCents = 0;
    
    for (const bet of pendingBets) {
      totalExposureCents += bet.potentialWinnings - bet.totalStake;
    }
    
    return { 
      totalExposureCents, 
      betCount: pendingBets.length,
      lastCalculated: new Date() 
    };
  }

  // ===================== PROMOTION MANAGEMENT =====================
  
  async createPromotion(promotion: any): Promise<any> {
    const [newPromotion] = await db
      .insert(promotions)
      .values(promotion)
      .returning();
    return newPromotion;
  }

  async updatePromotion(id: string, updates: any): Promise<any> {
    const [updatedPromotion] = await db
      .update(promotions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(promotions.id, id))
      .returning();
    return updatedPromotion;
  }

  async getPromotions(params: { limit?: number; offset?: number }): Promise<{ promotions: any[], total: number }> {
    const [promotionsResult, countResult] = await Promise.all([
      db.select()
        .from(promotions)
        .limit(params.limit || 50)
        .offset(params.offset || 0)
        .orderBy(desc(promotions.createdAt)),
      db.select({ count: count() }).from(promotions)
    ]);

    return {
      promotions: promotionsResult,
      total: countResult[0]?.count || 0
    };
  }

  async getPromotionByCode(code: string): Promise<any> {
    const [promotion] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.promoCode, code));
    return promotion || null;
  }

  // ===================== FINANCIAL REPORTING =====================
  
  async generateFinancialReport(params: any): Promise<any> {
    return { records: [] };
  }

  async getDailyFinancialReport(date: Date): Promise<any> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const [betsResult, transactionsResult] = await Promise.all([
      db.select()
        .from(bets)
        .where(and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )),
      db.select()
        .from(transactions)
        .where(and(
          gte(transactions.createdAt, startDate),
          lte(transactions.createdAt, endDate)
        ))
    ]);

    return {
      date: date.toISOString().split('T')[0],
      bets: betsResult,
      transactions: transactionsResult,
      summary: {
        totalBets: betsResult.length,
        totalStakeCents: betsResult.reduce((sum, bet) => sum + bet.totalStake, 0),
        totalPayoutsCents: transactionsResult
          .filter(t => t.type === 'bet_winnings')
          .reduce((sum, t) => sum + t.amount, 0)
      }
    };
  }

  async getMonthlyFinancialReport(year: number, month: number): Promise<any> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [betsResult, transactionsResult] = await Promise.all([
      db.select()
        .from(bets)
        .where(and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )),
      db.select()
        .from(transactions)
        .where(and(
          gte(transactions.createdAt, startDate),
          lte(transactions.createdAt, endDate)
        ))
    ]);

    return {
      year,
      month,
      bets: betsResult,
      transactions: transactionsResult,
      summary: {
        totalBets: betsResult.length,
        totalStakeCents: betsResult.reduce((sum, bet) => sum + bet.totalStake, 0),
        totalPayoutsCents: transactionsResult
          .filter(t => t.type === 'bet_winnings')
          .reduce((sum, t) => sum + t.amount, 0)
      }
    };
  }

  async getPlayerActivityReport(params: any): Promise<any> {
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const [usersResult] = await Promise.all([
      db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        balance: users.balance,
        isActive: users.isActive,
        createdAt: users.createdAt
      })
        .from(users)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(users.createdAt))
    ]);

    // Get bet counts for each user
    const usersWithActivity = [];
    for (const user of usersResult) {
      const betCount = await db
        .select({ count: count() })
        .from(bets)
        .where(eq(bets.userId, user.id));
      
      usersWithActivity.push({
        ...user,
        totalBets: betCount[0]?.count || 0
      });
    }

    return {
      users: usersWithActivity,
      total: usersWithActivity.length
    };
  }

  async exportFinancialData(params: any): Promise<any> {
    return { exportUrl: '/tmp/financial-export.csv', generatedAt: new Date() };
  }

  // ===================== DASHBOARD METRICS =====================
  
  async getTotalUsers(): Promise<number> {
    const result = await db.select({ count: count() }).from(users);
    return result[0]?.count || 0;
  }

  async getNewUsersCount(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, cutoffDate));
    return result[0]?.count || 0;
  }

  async getTotalBets(): Promise<number> {
    const result = await db.select({ count: count() }).from(bets);
    return result[0]?.count || 0;
  }

  async getPendingBetsCount(): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(bets)
      .where(eq(bets.status, 'pending'));
    return result[0]?.count || 0;
  }

  async getBetsCount(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await db
      .select({ count: count() })
      .from(bets)
      .where(gte(bets.placedAt, cutoffDate));
    return result[0]?.count || 0;
  }

  async getTurnoverMetrics(days: number): Promise<{ stakeCents: number; payoutsCents: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const [stakesResult, payoutsResult] = await Promise.all([
      db.select({ total: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)` })
        .from(bets)
        .where(gte(bets.placedAt, cutoffDate)),
      db.select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
        .from(transactions)
        .where(and(
          eq(transactions.type, 'bet_winnings'),
          gte(transactions.createdAt, cutoffDate)
        ))
    ]);

    return {
      stakeCents: stakesResult[0]?.total || 0,
      payoutsCents: payoutsResult[0]?.total || 0
    };
  }

  async getExposureMetrics(): Promise<{ totalExposureCents: number }> {
    const pendingBets = await this.getPendingBets();
    let totalExposureCents = 0;
    
    for (const bet of pendingBets) {
      totalExposureCents += bet.potentialWinnings - bet.totalStake;
    }
    
    return { totalExposureCents };
  }

  async getRecentActivity(limit: number): Promise<any[]> {
    const [recentBets, recentTransactions, recentAudits] = await Promise.all([
      db.select()
        .from(bets)
        .orderBy(desc(bets.placedAt))
        .limit(Math.floor(limit / 3)),
      db.select()
        .from(transactions)
        .orderBy(desc(transactions.createdAt))
        .limit(Math.floor(limit / 3)),
      db.select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(Math.floor(limit / 3))
    ]);

    // Combine and sort by timestamp
    const activities = [
      ...recentBets.map(bet => ({ 
        type: 'bet', 
        data: bet, 
        timestamp: bet.placedAt 
      })),
      ...recentTransactions.map(txn => ({ 
        type: 'transaction', 
        data: txn, 
        timestamp: txn.createdAt 
      })),
      ...recentAudits.map(audit => ({ 
        type: 'audit', 
        data: audit, 
        timestamp: audit.createdAt 
      }))
    ];

    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getSystemAlerts(): Promise<any[]> {
    // Get failed audit logs as system alerts
    const failedAudits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.success, false))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);

    return failedAudits.map(audit => ({
      id: audit.id,
      type: 'error',
      message: audit.errorMessage || 'System error occurred',
      timestamp: audit.createdAt,
      severity: 'high'
    }));
  }

  // ===================== ADDITIONAL ADMIN METHODS =====================
  
  async getAllMatches(): Promise<any[]> {
    return await db
      .select()
      .from(matches)
      .where(eq(matches.isDeleted, false))
      .orderBy(desc(matches.createdAt));
  }

  async createMarketOutcome(outcome: any): Promise<any> {
    const [newOutcome] = await db
      .insert(marketOutcomes)
      .values(outcome)
      .returning();
    return newOutcome;
  }

  async updateMarketOutcomeOdds(marketId: string, outcomeKey: string, newOdds: string, adminId: string, reason: string): Promise<any> {
    // Find the outcome
    const [outcome] = await db
      .select()
      .from(marketOutcomes)
      .innerJoin(markets, eq(markets.id, marketOutcomes.marketId))
      .where(and(
        eq(markets.id, marketId),
        eq(marketOutcomes.key, outcomeKey)
      ));

    if (!outcome) {
      return null;
    }

    const previousOdds = outcome.market_outcomes.odds;
    
    // Update the odds
    const [updatedOutcome] = await db
      .update(marketOutcomes)
      .set({ 
        odds: newOdds,
        previousOdds: previousOdds,
        updatedBy: adminId,
        updatedAt: new Date()
      })
      .where(eq(marketOutcomes.id, outcome.market_outcomes.id))
      .returning();

    // Create odds history record
    await db
      .insert(oddsHistory)
      .values({
        outcomeId: outcome.market_outcomes.id,
        previousOdds: previousOdds,
        newOdds: newOdds,
        source: 'manual',
        reason: reason,
        changedBy: adminId
      });

    return updatedOutcome;
  }

  async calculateGGRReport(params: { startDate: Date; endDate: Date; groupBy: string }): Promise<any> {
    // Get all bets in the period
    const betsInPeriod = await db
      .select()
      .from(bets)
      .where(and(
        gte(bets.placedAt, params.startDate),
        lte(bets.placedAt, params.endDate)
      ));

    // Calculate total stakes
    const totalStakeCents = betsInPeriod.reduce((sum, bet) => sum + bet.totalStake, 0);
    
    // Calculate total payouts (settled winning bets)
    const totalPayoutsCents = betsInPeriod
      .filter(bet => bet.status === 'won')
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    // GGR = Stakes - Payouts
    const ggrCents = totalStakeCents - totalPayoutsCents;

    // Group by day/week/month if needed
    let groupedData = [];
    if (params.groupBy === 'day') {
      // Group by day logic - simplified for now
      const dayGroups = new Map();
      for (const bet of betsInPeriod) {
        const day = bet.placedAt.toISOString().split('T')[0];
        if (!dayGroups.has(day)) {
          dayGroups.set(day, { stakes: 0, payouts: 0 });
        }
        const group = dayGroups.get(day);
        group.stakes += bet.totalStake;
        if (bet.status === 'won') {
          group.payouts += bet.actualWinnings || 0;
        }
      }
      
      groupedData = Array.from(dayGroups.entries()).map(([date, data]) => ({
        date,
        stakeCents: data.stakes,
        payoutsCents: data.payouts,
        ggrCents: data.stakes - data.payouts
      }));
    }

    return {
      summary: {
        totalStakeCents,
        totalPayoutsCents,
        ggrCents,
        totalBets: betsInPeriod.length,
        winningBets: betsInPeriod.filter(b => b.status === 'won').length,
        margin: totalStakeCents > 0 ? ((ggrCents / totalStakeCents) * 100).toFixed(2) : '0.00'
      },
      groupedData: params.groupBy === 'day' ? groupedData : [],
      period: {
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
        groupBy: params.groupBy
      }
    };
  }

  // ===================== MISSING ADMIN OPERATIONS =====================
  
  async getAllBets(params?: {
    status?: string;
    userId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Bet[]> {
    let query = db.select().from(bets);
    const conditions = [];

    if (params?.status) {
      conditions.push(eq(bets.status, params.status));
    }
    if (params?.userId) {
      conditions.push(eq(bets.userId, params.userId));
    }
    if (params?.dateFrom) {
      conditions.push(gte(bets.placedAt, params.dateFrom));
    }
    if (params?.dateTo) {
      conditions.push(lte(bets.placedAt, params.dateTo));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(bets.placedAt));

    if (params?.limit) {
      query = query.limit(params.limit);
    }
    if (params?.offset) {
      query = query.offset(params.offset);
    }

    return await query;
  }

  async getActiveAdminSessions(): Promise<AdminSession[]> {
    const now = new Date();
    return await db
      .select()
      .from(adminSessions)
      .where(and(
        gte(adminSessions.expiresAt, now),
        eq(adminSessions.isRevoked, false)
      ))
      .orderBy(desc(adminSessions.createdAt));
  }

  async getMatchMarkets(matchId: string): Promise<any[]> {
    return await db
      .select()
      .from(markets)
      .where(eq(markets.matchId, matchId))
      .orderBy(markets.sortOrder);
  }

  async createMarketWithOutcomes(market: any): Promise<any> {
    return await db.transaction(async (tx) => {
      // Create the market
      const [newMarket] = await tx
        .insert(markets)
        .values({
          matchId: market.matchId,
          key: market.key,
          name: market.name,
          type: market.type,
          sortOrder: market.sortOrder || 0,
          isActive: market.isActive ?? true
        })
        .returning();

      // Create outcomes if provided
      if (market.outcomes && Array.isArray(market.outcomes)) {
        for (const outcome of market.outcomes) {
          await tx
            .insert(marketOutcomes)
            .values({
              marketId: newMarket.id,
              key: outcome.key,
              name: outcome.name,
              odds: outcome.odds,
              sortOrder: outcome.sortOrder || 0,
              isActive: outcome.isActive ?? true
            });
        }
      }

      return newMarket;
    });
  }

  async updateMarketStatus(marketId: string, status: string): Promise<any> {
    const isActive = status === 'active';
    const [updatedMarket] = await db
      .update(markets)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(markets.id, marketId))
      .returning();
    return updatedMarket;
  }

  async updateOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    const [updatedOutcome] = await db
      .update(marketOutcomes)
      .set({ odds, updatedAt: new Date() })
      .where(eq(marketOutcomes.id, outcomeId))
      .returning();
    return updatedOutcome;
  }

  async reorderMarkets(matchId: string, marketOrder: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < marketOrder.length; i++) {
        await tx
          .update(markets)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(and(
            eq(markets.id, marketOrder[i]),
            eq(markets.matchId, matchId)
          ));
      }
    });
  }
}