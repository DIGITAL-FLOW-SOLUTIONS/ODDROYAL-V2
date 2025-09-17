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
  userLimits,
  exposureSnapshots,
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
  type UserLimits,
  type InsertUserLimits
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, count, inArray, ilike, or, SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import argon2 from "argon2";
import speakeasy from "speakeasy";
import type { IStorage } from "./storage";

/**
 * Database implementation of IStorage interface using Drizzle ORM
 * CRITICAL: This handles financial transactions - all operations must be secure and atomic
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
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser || undefined;
  }

  async updateUserBalance(userId: string, newBalanceCents: number): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ balance: newBalanceCents, updatedAt: new Date() })
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

  // ===================== COMPREHENSIVE ADMIN BET OPERATIONS =====================
  
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
    try {
      // Build base query with joins to get user data
      let query = db
        .select({
          // Bet fields
          id: bets.id,
          userId: bets.userId,
          type: bets.type,
          totalStake: bets.totalStake,
          potentialWinnings: bets.potentialWinnings,
          actualWinnings: bets.actualWinnings,
          totalOdds: bets.totalOdds,
          status: bets.status,
          placedAt: bets.placedAt,
          settledAt: bets.settledAt,
          // User fields
          username: users.username,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName
        })
        .from(bets)
        .innerJoin(users, eq(bets.userId, users.id));

      // Apply filters using proper Drizzle ORM syntax
      const conditions: SQL<unknown>[] = [];

      if (params?.search) {
        const searchTerm = `%${params.search.toLowerCase()}%`;
        conditions.push(
          or(
            ilike(bets.id, searchTerm),
            ilike(users.username, searchTerm),
            ilike(users.email, searchTerm)
          )!
        );
      }

      if (params?.status && params.status !== 'all') {
        conditions.push(eq(bets.status, params.status));
      }

      if (params?.betType && params.betType !== 'all') {
        conditions.push(eq(bets.type, params.betType));
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

      if (params?.minStake) {
        conditions.push(gte(bets.totalStake, params.minStake));
      }

      if (params?.maxStake) {
        conditions.push(lte(bets.totalStake, params.maxStake));
      }

      // Apply conditions
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // Get total count for pagination
      let totalQuery = db
        .select({ count: count() })
        .from(bets)
        .innerJoin(users, eq(bets.userId, users.id));

      if (conditions.length > 0) {
        totalQuery = totalQuery.where(and(...conditions)) as any;
      }

      const [{ count: totalCount }] = await totalQuery;

      // Apply sorting, pagination
      const finalQuery = query
        .orderBy(desc(bets.placedAt))
        .limit(params?.limit || 50)
        .offset(params?.offset || 0);

      const betResults = await finalQuery;

      // Get selections for each bet
      const betIds = betResults.map(bet => bet.id);
      const selections = betIds.length > 0 ? 
        await db
          .select({
            id: betSelections.id,
            betId: betSelections.betId,
            fixtureId: betSelections.fixtureId,
            homeTeam: betSelections.homeTeam,
            awayTeam: betSelections.awayTeam,
            league: betSelections.league,
            market: betSelections.market,
            selection: betSelections.selection,
            odds: betSelections.odds,
            status: betSelections.status,
            result: betSelections.result
          })
          .from(betSelections)
          .where(inArray(betSelections.betId, betIds))
        : [];

      // Group selections by bet ID
      const selectionsByBetId = selections.reduce((acc, selection) => {
        if (!acc[selection.betId]) {
          acc[selection.betId] = [];
        }
        acc[selection.betId].push(selection);
        return acc;
      }, {} as Record<string, any[]>);

      // Format response to match frontend expectations
      const formattedBets = betResults.map(bet => ({
        id: bet.id,
        userId: bet.userId,
        username: bet.username,
        userEmail: bet.userEmail,
        betType: bet.type as 'single' | 'express' | 'system',
        totalStakeCents: bet.totalStake,
        potentialWinCents: bet.potentialWinnings,
        actualWinCents: bet.actualWinnings || 0,
        status: bet.status as 'pending' | 'settled_win' | 'settled_lose' | 'voided' | 'refunded',
        placedAt: bet.placedAt.toISOString(),
        settledAt: bet.settledAt?.toISOString() || null,
        selections: selectionsByBetId[bet.id] || [],
        selectionsCount: (selectionsByBetId[bet.id] || []).length,
        totalOdds: parseFloat(bet.totalOdds),
        ipAddress: null // Would need to add to schema if required
      }));

      return {
        bets: formattedBets,
        total: totalCount
      };
    } catch (error) {
      console.error('Error in getAllBets:', error);
      throw error;
    }
  }

  async forceBetSettlement(betId: string, outcome: 'win' | 'lose' | 'void', payoutCents: number): Promise<{ success: boolean; bet?: Bet; error?: string }> {
    try {
      return await db.transaction(async (tx) => {
        // Get the bet and lock it
        const [bet] = await tx
          .select()
          .from(bets)
          .where(eq(bets.id, betId))
          .for('update');

        if (!bet) {
          return { success: false, error: 'Bet not found' };
        }

        if (bet.status !== 'pending') {
          return { success: false, error: 'Bet is not pending' };
        }

        // Update bet status
        const newStatus = outcome === 'win' ? 'settled_win' : 
                         outcome === 'lose' ? 'settled_lose' : 'voided';

        const [updatedBet] = await tx
          .update(bets)
          .set({
            status: newStatus,
            settledAt: new Date(),
            actualWinnings: outcome === 'win' ? payoutCents : 0
          })
          .where(eq(bets.id, betId))
          .returning();

        // Update user balance if win or refund
        if (outcome === 'win' && payoutCents > 0) {
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, bet.userId))
            .for('update');

          if (user) {
            const newBalance = user.balance + payoutCents;
            await tx
              .update(users)
              .set({ balance: newBalance })
              .where(eq(users.id, bet.userId));

            // Create transaction record with correct schema fields
            await tx.insert(transactions).values({
              userId: bet.userId,
              type: 'bet_winnings',
              amount: payoutCents,
              balanceBefore: user.balance,
              balanceAfter: newBalance,
              reference: betId,
              description: `Bet settlement - Force settled as win`
            });
          }
        } else if (outcome === 'void') {
          // Refund the stake for voided bets
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, bet.userId))
            .for('update');

          if (user) {
            const newBalance = user.balance + bet.totalStake;
            await tx
              .update(users)
              .set({ balance: newBalance })
              .where(eq(users.id, bet.userId));

            // Create transaction record with correct schema fields
            await tx.insert(transactions).values({
              userId: bet.userId,
              type: 'bet_refund',
              amount: bet.totalStake,
              balanceBefore: user.balance,
              balanceAfter: newBalance,
              reference: betId,
              description: `Bet refund - Force settled as void`
            });
          }
        }

        return { success: true, bet: updatedBet };
      });
    } catch (error) {
      console.error('Error in forceBetSettlement:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async refundBet(betId: string): Promise<{ success: boolean; bet?: Bet; error?: string }> {
    try {
      return await db.transaction(async (tx) => {
        // Get the bet and lock it
        const [bet] = await tx
          .select()
          .from(bets)
          .where(eq(bets.id, betId))
          .for('update');

        if (!bet) {
          return { success: false, error: 'Bet not found' };
        }

        if (bet.status !== 'pending') {
          return { success: false, error: 'Only pending bets can be refunded' };
        }

        // Update bet status to refunded
        const [updatedBet] = await tx
          .update(bets)
          .set({
            status: 'refunded',
            settledAt: new Date(),
            actualWinnings: 0
          })
          .where(eq(bets.id, betId))
          .returning();

        // Refund the stake to user balance
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, bet.userId))
          .for('update');

        if (user) {
          const newBalance = user.balance + bet.totalStake;
          await tx
            .update(users)
            .set({ balance: newBalance })
            .where(eq(users.id, bet.userId));

          // Create transaction record with correct schema fields
          await tx.insert(transactions).values({
            userId: bet.userId,
            type: 'bet_refund',
            amount: bet.totalStake,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            reference: betId,
            description: `Bet refund - Manual refund by admin`
          });
        }

        return { success: true, bet: updatedBet };
      });
    } catch (error) {
      console.error('Error in refundBet:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
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
    try {
      // Get all bets without pagination for export
      const { bets: allBets } = await this.getAllBets({ ...params, limit: 10000, offset: 0 });
      
      // CSV headers
      const headers = [
        'Bet ID',
        'Username',
        'Email', 
        'Bet Type',
        'Stake (£)',
        'Potential Win (£)',
        'Actual Win (£)',
        'Status',
        'Selections',
        'Total Odds',
        'Placed At',
        'Settled At',
        'Markets'
      ];

      // Convert bets to CSV rows
      const rows = allBets.map(bet => {
        const selectionsText = bet.selections.map((s: any) => 
          `${s.homeTeam} vs ${s.awayTeam} - ${s.market}: ${s.selection} @${s.odds}`
        ).join(' | ');

        const marketsText = bet.selections.map((s: any) => s.market).join(', ');

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
          bet.settledAt || 'N/A',
          marketsText
        ];
      });

      // Combine headers and rows
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => 
          typeof field === 'string' && field.includes(',') && !field.startsWith('"') 
            ? `"${field}"` 
            : field
        ).join(','))
        .join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting bets to CSV:', error);
      throw error;
    }
  }

  async getPendingBets(): Promise<Bet[]> {
    return await db
      .select()
      .from(bets)
      .where(eq(bets.status, 'pending'))
      .orderBy(desc(bets.placedAt));
  }

  // ===================== ATOMIC BET PLACEMENT =====================

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
        // CRITICAL: Acquire row-level lock to prevent concurrent bet placement for same user
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, params.userId))
          .for('update'); // Row-level lock prevents concurrency issues
          
        if (!user) {
          return { success: false, error: "User not found" };
        }

        if (user.balance < params.totalStakeCents) {
          return { success: false, error: "Insufficient balance" };
        }

        // Get user limits
        const [userLimitsRecord] = await tx
          .select()
          .from(userLimits)
          .where(eq(userLimits.userId, params.userId));

        if (userLimitsRecord) {
          const now = new Date();
          
          // Check if user is self-excluded
          if (userLimitsRecord.isSelfExcluded) {
            return { success: false, error: "Account is self-excluded from betting" };
          }
          
          // Check self-exclusion period
          if (userLimitsRecord.selfExclusionUntil && now < userLimitsRecord.selfExclusionUntil) {
            return { success: false, error: "Account is self-excluded until " + userLimitsRecord.selfExclusionUntil.toLocaleDateString() };
          }
          
          // Check cooldown period
          if (userLimitsRecord.cooldownUntil && now < userLimitsRecord.cooldownUntil) {
            return { success: false, error: "Account is in cooling-off period until " + userLimitsRecord.cooldownUntil.toLocaleDateString() };
          }

          // Check maximum single stake limit
          if (userLimitsRecord.maxStakeCents && params.totalStakeCents > userLimitsRecord.maxStakeCents) {
            return { 
              success: false, 
              error: `Stake exceeds maximum limit of £${(userLimitsRecord.maxStakeCents / 100).toFixed(2)}` 
            };
          }
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

        // Create bet selections
        const selections: BetSelection[] = [];
        for (const sel of params.selections) {
          const [selection] = await tx
            .insert(betSelections)
            .values({
              betId: bet.id,
              fixtureId: sel.fixtureId,
              homeTeam: sel.homeTeam,
              awayTeam: sel.awayTeam,
              league: sel.league,
              marketId: 'placeholder-market-id', // TODO: Implement proper market lookup
              outcomeId: 'placeholder-outcome-id', // TODO: Implement proper outcome lookup
              market: sel.market,
              selection: sel.selection,
              odds: sel.odds,
              status: 'pending'
            })
            .returning();
          selections.push(selection);
        }

        // Update user balance (deduct stake)
        const newBalance = user.balance - params.totalStakeCents;
        const [updatedUser] = await tx
          .update(users)
          .set({ balance: newBalance })
          .where(eq(users.id, params.userId))
          .returning();

        // Create transaction record with correct schema fields
        const [transaction] = await tx
          .insert(transactions)
          .values({
            userId: params.userId,
            type: 'bet_stake',
            amount: -params.totalStakeCents,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            reference: bet.id,
            description: `Bet placed: ${bet.type} bet with ${selections.length} selection(s)`
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
        console.error('Atomic bet placement error:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
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
    const [updatedSelection] = await db
      .update(betSelections)
      .set({ status, result })
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
    return (result.rowCount ?? 0) > 0;
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return await db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));
  }

  // ===================== TRANSACTION OPERATIONS =====================
  
  async createTransaction(transaction: InsertTransaction & { userId: string }): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  async getUserTransactions(userId: string, limit = 100): Promise<Transaction[]> {
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
        ipAddress,
        userAgent,
        expiresAt
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
    return (result.rowCount ?? 0) > 0;
  }

  // ===================== ADMIN OPERATIONS =====================
  
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return admin || undefined;
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return admin || undefined;
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return admin || undefined;
  }

  async createAdminUser(admin: InsertAdminUser): Promise<AdminUser> {
    // Clean the admin object to match schema expectations
    const cleanAdmin = {
      username: admin.username,
      email: admin.email,
      passwordHash: admin.passwordHash || (admin.password ? await argon2.hash(admin.password, {}) : ''),
      role: admin.role || 'support',
      totpSecret: admin.totpSecret || null,
      isActive: admin.isActive ?? true,
      ipWhitelist: admin.ipWhitelist || null
      // Note: createdBy is not included in InsertAdminUser schema
    };
    
    const [newAdmin] = await db
      .insert(adminUsers)
      .values(cleanAdmin)
      .returning();
    return newAdmin;
  }

  async updateAdminUser(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    // Clean the updates object to ensure proper typing
    const cleanUpdates: Partial<typeof adminUsers.$inferInsert> = {
      ...updates,
      updatedAt: new Date(),
      // Ensure ipWhitelist is properly typed as string[] or null
      ipWhitelist: updates.ipWhitelist ? updates.ipWhitelist as string[] : null
    };
    
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set(cleanUpdates)
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updatedAdmin || undefined;
  }

  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> {
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set({ 
        loginAttempts: attempts,
        lockedUntil,
        updatedAt: new Date()
      })
      .where(eq(adminUsers.id, adminId))
      .returning();
    return updatedAdmin || undefined;
  }

  // ===================== ADMIN SESSION OPERATIONS =====================
  
  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    const [session] = await db
      .insert(adminSessions)
      .values({
        adminId,
        sessionToken,
        refreshToken: randomUUID(),
        ipAddress,
        userAgent,
        expiresAt
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

  async updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined> {
    const [updatedSession] = await db
      .update(adminSessions)
      .set(updates)
      .where(eq(adminSessions.id, sessionId))
      .returning();
    return updatedSession || undefined;
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    const result = await db
      .delete(adminSessions)
      .where(eq(adminSessions.sessionToken, sessionToken));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAllAdminSessions(adminId: string): Promise<boolean> {
    const result = await db
      .delete(adminSessions)
      .where(eq(adminSessions.adminId, adminId));
    return result.rowCount >= 0; // Returns true even if no sessions to delete
  }

  async getActiveAdminSessions(): Promise<AdminSession[]> {
    return await db
      .select()
      .from(adminSessions)
      .where(and(
        eq(adminSessions.isRevoked, false),
        gte(adminSessions.expiresAt, new Date())
      ))
      .orderBy(desc(adminSessions.createdAt));
  }

  // ===================== AUDIT OPERATIONS =====================
  
  async createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db
      .insert(auditLogs)
      .values(auditLog)
      .returning();
    return newLog;
  }

  async getAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);
  }

  // ===================== 2FA OPERATIONS =====================
  
  async enableAdmin2FA(adminId: string, totpSecret: string): Promise<AdminUser | undefined> {
    const [updatedAdmin] = await db
      .update(adminUsers)
      .set({ 
        totpSecret,
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

  // ===================== RBAC OPERATIONS =====================
  
  async getAdminUsers(limit = 100, offset = 0): Promise<AdminUser[]> {
    return await db
      .select()
      .from(adminUsers)
      .orderBy(desc(adminUsers.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    return await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.role, role))
      .orderBy(adminUsers.username);
  }

  async updateAdminRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string }> {
    try {
      return await db.transaction(async (tx) => {
        // Get current admin data
        const [currentAdmin] = await tx
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.id, adminId));

        if (!currentAdmin) {
          return { success: false, error: 'Admin user not found' };
        }

        // Update role
        const [updatedAdmin] = await tx
          .update(adminUsers)
          .set({ 
            role: newRole,
            updatedAt: new Date()
          })
          .where(eq(adminUsers.id, adminId))
          .returning();

        // Create audit log
        const [auditLog] = await tx
          .insert(auditLogs)
          .values({
            adminId: updatedBy,
            actionType: 'update_admin_role',
            targetType: 'admin_user',
            targetId: adminId,
            dataBefore: { role: currentAdmin.role },
            dataAfter: { role: newRole },
            ipAddress: null,
            userAgent: null
          })
          .returning();

        return { 
          success: true, 
          admin: updatedAdmin,
          auditLog 
        };
      });
    } catch (error) {
      console.error('Error updating admin role:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async searchAdminUsers(params: {
    query?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }> {
    try {
      let query = db.select().from(adminUsers);
      let countQuery = db.select({ count: count() }).from(adminUsers);

      const conditions: SQL<unknown>[] = [];

      if (params.query) {
        const searchTerm = `%${params.query.toLowerCase()}%`;
        conditions.push(
          or(
            ilike(adminUsers.username, searchTerm),
            ilike(adminUsers.email, searchTerm)
          )!
        );
      }

      if (params.role) {
        conditions.push(eq(adminUsers.role, params.role));
      }

      if (params.isActive !== undefined) {
        conditions.push(eq(adminUsers.isActive, params.isActive));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
        countQuery = countQuery.where(and(...conditions)) as any;
      }

      const [{ count: total }] = await countQuery;
      
      const users = await query
        .orderBy(adminUsers.username)
        .limit(params.limit || 50)
        .offset(params.offset || 0);

      return { users, total };
    } catch (error) {
      console.error('Error searching admin users:', error);
      throw error;
    }
  }

  // ===================== PLACEHOLDER IMPLEMENTATIONS =====================
  // These methods need proper implementation based on business requirements

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
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, id));
    return match || undefined;
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    const [updatedMatch] = await db
      .update(matches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(matches.id, id))
      .returning();
    return updatedMatch || undefined;
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
    // This would need to join through bet selections to find bets on this match
    // Placeholder implementation
    return [];
  }

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
    return updatedMarket || undefined;
  }

  async getMatchMarkets(matchId: string): Promise<any[]> {
    return await db
      .select()
      .from(markets)
      .where(and(
        eq(markets.matchId, matchId),
        eq(markets.isDeleted, false)
      ))
      .orderBy(markets.sortOrder);
  }

  async createMarketWithOutcomes(market: any): Promise<any> {
    return await db.transaction(async (tx) => {
      const [newMarket] = await tx
        .insert(markets)
        .values(market)
        .returning();

      if (market.outcomes && Array.isArray(market.outcomes)) {
        const outcomes = await Promise.all(
          market.outcomes.map((outcome: any) =>
            tx.insert(marketOutcomes).values({
              ...outcome,
              marketId: newMarket.id
            }).returning()
          )
        );
        return { ...newMarket, outcomes };
      }

      return newMarket;
    });
  }

  async updateMarketStatus(marketId: string, status: string): Promise<any> {
    const [updatedMarket] = await db
      .update(markets)
      .set({ status, updatedAt: new Date() })
      .where(eq(markets.id, marketId))
      .returning();
    return updatedMarket;
  }

  async updateOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    const [updatedOutcome] = await db
      .update(marketOutcomes)
      .set({ 
        previousOdds: marketOutcomes.odds,
        odds: odds,
        updatedAt: new Date()
      })
      .where(eq(marketOutcomes.id, outcomeId))
      .returning();
    return updatedOutcome;
  }

  async reorderMarkets(matchId: string, marketOrder: string[]): Promise<void> {
    // Update sort order for markets in a single transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < marketOrder.length; i++) {
        await tx
          .update(markets)
          .set({ sortOrder: i })
          .where(eq(markets.id, marketOrder[i]));
      }
    });
  }

  // Exposure and financial operations (placeholder implementations)
  async getMatchExposure(matchId: string): Promise<any> {
    return { matchId, totalExposure: 0, betCount: 0 };
  }

  async getMarketExposure(marketId: string): Promise<any> {
    return { marketId, totalExposure: 0, betCount: 0 };
  }

  async getOverallExposure(limit: number): Promise<any> {
    return { totalExposure: 0, topMatches: [] };
  }

  async getPromotions(params: any): Promise<any> {
    return [];
  }

  async getPromotionByCode(code: string): Promise<any> {
    return null;
  }

  async createPromotion(promotion: any): Promise<any> {
    return null;
  }

  async updatePromotion(id: string, updates: any): Promise<any> {
    return null;
  }

  async getDailyFinancialReport(date: Date): Promise<any> {
    return { date, revenue: 0, profit: 0, betCount: 0 };
  }

  async getMonthlyFinancialReport(year: number, month: number): Promise<any> {
    return { year, month, revenue: 0, profit: 0, betCount: 0 };
  }

  async getPlayerActivityReport(params: any): Promise<any> {
    return { players: [], totalCount: 0 };
  }

  async exportFinancialData(params: any): Promise<any> {
    return '';
  }

  // ===================== COMPATIBILITY METHODS =====================
  // These methods provide compatibility with existing code that references them

  async getAdminByUsername(username: string): Promise<AdminUser | undefined> {
    // Alias for getAdminUserByUsername to maintain compatibility with admin-middleware.ts
    return this.getAdminUserByUsername(username);
  }

  async createDashboardAlert(alert: any): Promise<any> {
    // Placeholder implementation for dashboard alerts functionality
    // This method is called in routes.ts but not yet fully implemented
    console.warn('createDashboardAlert called but not yet implemented:', alert);
    return null;
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
}