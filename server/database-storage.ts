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

  // ===================== REPORTING METHODS IMPLEMENTATION =====================
  
  async getDailyGgrReport(startDate: Date, endDate: Date): Promise<{
    date: string;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    winRate: number;
  }> {
    const dayBets = await db
      .select()
      .from(bets)
      .where(and(
        gte(bets.placedAt, startDate),
        lte(bets.placedAt, endDate)
      ));

    const totalStakeCents = dayBets.reduce((sum, bet) => sum + bet.totalStake, 0);
    const settledBets = dayBets.filter(bet => bet.status !== 'pending');
    const totalPayoutsCents = settledBets
      .filter(bet => bet.status === 'settled_win')
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);
    
    const uniquePlayerIds = new Set(dayBets.map(bet => bet.userId));
    const winningBets = settledBets.filter(bet => bet.status === 'settled_win').length;
    
    return {
      date: startDate.toISOString().split('T')[0],
      totalStakeCents,
      totalPayoutsCents,
      grossGamingRevenueCents: totalStakeCents - totalPayoutsCents,
      totalBets: dayBets.length,
      activePlayers: uniquePlayerIds.size,
      averageStakeCents: dayBets.length > 0 ? totalStakeCents / dayBets.length : 0,
      winRate: settledBets.length > 0 ? winningBets / settledBets.length : 0
    };
  }

  async getMonthlyGgrReport(startDate: Date, endDate: Date): Promise<{
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
    const monthBets = await db
      .select()
      .from(bets)
      .where(and(
        gte(bets.placedAt, startDate),
        lte(bets.placedAt, endDate)
      ));

    const totalStakeCents = monthBets.reduce((sum, bet) => sum + bet.totalStake, 0);
    const settledBets = monthBets.filter(bet => bet.status !== 'pending');
    const totalPayoutsCents = settledBets
      .filter(bet => bet.status === 'settled_win')
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);
    
    const uniquePlayerIds = new Set(monthBets.map(bet => bet.userId));
    const winningBets = settledBets.filter(bet => bet.status === 'settled_win').length;

    // Generate daily breakdown
    const dailyBreakdown = [];
    const daysInMonth = endDate.getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStart = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayBets = monthBets.filter(bet => 
        bet.placedAt >= dayStart && bet.placedAt < dayEnd
      );
      
      const dayStake = dayBets.reduce((sum, bet) => sum + bet.totalStake, 0);
      const dayPayouts = dayBets
        .filter(bet => bet.status === 'settled_win')
        .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);
      
      dailyBreakdown.push({
        day,
        stakeCents: dayStake,
        ggrCents: dayStake - dayPayouts,
        bets: dayBets.length
      });
    }

    const dailyGgrAmounts = dailyBreakdown.map(d => d.ggrCents);
    
    return {
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      totalStakeCents,
      totalPayoutsCents,
      grossGamingRevenueCents: totalStakeCents - totalPayoutsCents,
      totalBets: monthBets.length,
      activePlayers: uniquePlayerIds.size,
      averageStakeCents: monthBets.length > 0 ? totalStakeCents / monthBets.length : 0,
      highestDayCents: Math.max(...dailyGgrAmounts, 0),
      lowestDayCents: Math.min(...dailyGgrAmounts, 0),
      winRate: settledBets.length > 0 ? winningBets / settledBets.length : 0,
      dailyBreakdown
    };
  }

  async getTurnoverBySportReport(startDate: Date, endDate: Date, sport?: string, league?: string): Promise<{
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
    // Get bet selections to extract sport/league data
    const betSelectionsQuery = db
      .select({
        betId: betSelections.betId,
        league: betSelections.league,
        totalStake: bets.totalStake,
        actualWinnings: bets.actualWinnings,
        status: bets.status
      })
      .from(betSelections)
      .innerJoin(bets, eq(betSelections.betId, bets.id))
      .where(and(
        gte(bets.placedAt, startDate),
        lte(bets.placedAt, endDate),
        sport ? ilike(betSelections.league, `%${sport}%`) : undefined,
        league ? eq(betSelections.league, league) : undefined
      ).filter(Boolean) as any);

    const selections = await betSelectionsQuery;

    // Group by sport (extracted from league name)
    const sportGroups = selections.reduce((acc, selection) => {
      const sportName = this.extractSportFromLeague(selection.league);
      if (!acc[sportName]) {
        acc[sportName] = {
          turnoverCents: 0,
          betCount: 0,
          payoutsCents: 0
        };
      }
      
      acc[sportName].turnoverCents += selection.totalStake;
      acc[sportName].betCount += 1;
      if (selection.status === 'settled_win') {
        acc[sportName].payoutsCents += selection.actualWinnings || 0;
      }
      
      return acc;
    }, {} as Record<string, { turnoverCents: number; betCount: number; payoutsCents: number }>);

    const sports = Object.entries(sportGroups).map(([sport, data]) => ({
      sport,
      turnoverCents: data.turnoverCents,
      betCount: data.betCount,
      ggrCents: data.turnoverCents - data.payoutsCents
    }));

    const totalTurnoverCents = sports.reduce((sum, s) => sum + s.turnoverCents, 0);
    const totalBets = sports.reduce((sum, s) => sum + s.betCount, 0);
    const totalGgrCents = sports.reduce((sum, s) => sum + s.ggrCents, 0);

    return {
      sports,
      totalTurnoverCents,
      totalBets,
      totalGgrCents
    };
  }

  private extractSportFromLeague(league: string): string {
    // Simple sport extraction logic - can be enhanced
    const lowerLeague = league.toLowerCase();
    if (lowerLeague.includes('premier league') || lowerLeague.includes('championship') || lowerLeague.includes('football')) {
      return 'Football';
    }
    if (lowerLeague.includes('nba') || lowerLeague.includes('basketball')) {
      return 'Basketball';
    }
    if (lowerLeague.includes('tennis') || lowerLeague.includes('atp') || lowerLeague.includes('wta')) {
      return 'Tennis';
    }
    return 'Other';
  }

  async getPayoutRatioReport(startDate: Date, endDate: Date): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    payoutRatio: number;
    betCount: number;
    winningBets: number;
    losingBets: number;
    winRate: number;
  }> {
    const periodBets = await db
      .select()
      .from(bets)
      .where(and(
        gte(bets.placedAt, startDate),
        lte(bets.placedAt, endDate),
        sql`status != 'pending'`
      ));

    const totalStakeCents = periodBets.reduce((sum, bet) => sum + bet.totalStake, 0);
    const totalPayoutsCents = periodBets
      .filter(bet => bet.status === 'settled_win')
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);

    const winningBets = periodBets.filter(bet => bet.status === 'settled_win').length;
    const losingBets = periodBets.filter(bet => bet.status === 'settled_lose').length;

    return {
      totalStakeCents,
      totalPayoutsCents,
      payoutRatio: totalStakeCents > 0 ? totalPayoutsCents / totalStakeCents : 0,
      betCount: periodBets.length,
      winningBets,
      losingBets,
      winRate: periodBets.length > 0 ? winningBets / periodBets.length : 0
    };
  }

  async getTopWinnersReport(startDate: Date, endDate: Date, limit: number): Promise<{
    winners: Array<{
      userId: string;
      username: string;
      netWinningsCents: number;
      betCount: number;
    }>;
  }> {
    const userStats = await db
      .select({
        userId: bets.userId,
        username: users.username,
        totalStake: sql`SUM(${bets.totalStake})`.as('totalStake'),
        totalWinnings: sql`SUM(CASE WHEN ${bets.status} = 'settled_win' THEN ${bets.actualWinnings} ELSE 0 END)`.as('totalWinnings'),
        betCount: sql`COUNT(*)`.as('betCount')
      })
      .from(bets)
      .innerJoin(users, eq(bets.userId, users.id))
      .where(and(
        gte(bets.placedAt, startDate),
        lte(bets.placedAt, endDate),
        sql`status != 'pending'`
      ))
      .groupBy(bets.userId, users.username)
      .orderBy(sql`SUM(CASE WHEN ${bets.status} = 'settled_win' THEN ${bets.actualWinnings} ELSE 0 END) - SUM(${bets.totalStake}) DESC`)
      .limit(limit);

    const winners = userStats.map(stat => ({
      userId: stat.userId,
      username: stat.username,
      netWinningsCents: (stat.totalWinnings as number) - (stat.totalStake as number),
      betCount: stat.betCount as number
    }));

    return { winners };
  }

  async getChargebackReport(startDate: Date, endDate: Date): Promise<{
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
    // Mock implementation - would need actual chargeback table
    return {
      chargebacks: [],
      totalAmountCents: 0,
      count: 0
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
    // Mock implementation - would expand based on reportType
    return {
      title: `Custom ${params.reportType} Report`,
      data: [],
      summary: {},
      generatedAt: new Date()
    };
  }

  async exportReportData(params: {
    reportType: string;
    format: 'csv' | 'excel' | 'json';
    dateFrom: Date;
    dateTo: Date;
    filters?: any;
  }): Promise<string> {
    // Mock implementation - would generate actual export data
    return JSON.stringify({
      reportType: params.reportType,
      format: params.format,
      exportedAt: new Date().toISOString()
    });
  }

  async createScheduledReport(report: {
    name: string;
    reportType: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    filters?: any;
    format?: 'csv' | 'excel' | 'pdf';
  }): Promise<any> {
    // Mock implementation - would need scheduled_reports table
    return {
      id: randomUUID(),
      ...report,
      createdAt: new Date(),
      isActive: true
    };
  }

  // ===================== DASHBOARD METHODS IMPLEMENTATION =====================

  async getDashboardAlerts(): Promise<Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
    isResolved: boolean;
    actionRequired: boolean;
  }>> {
    // Mock implementation - would need alerts table
    return [];
  }

  async resolveAlert(alertId: string, adminId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // Mock implementation - would update alerts table
    return {
      success: true,
      message: 'Alert resolved successfully'
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
    // Mock implementation - would need notification_settings table
    return settings;
  }

  // ===================== DASHBOARD METRICS IMPLEMENTATION =====================

  async getTotalUsers(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(users);
    return result.count;
  }

  async getNewUsersCount(since: Date): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, since));
    return result.count;
  }

  async getTotalBets(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(bets);
    return result.count;
  }

  async getPendingBetsCount(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(bets)
      .where(eq(bets.status, 'pending'));
    return result.count;
  }

  async getBetsCount(since: Date): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(bets)
      .where(gte(bets.placedAt, since));
    return result.count;
  }

  async getTurnoverMetrics(todayStart: Date, weekStart: Date): Promise<{
    todayCents: number;
    weekCents: number;
    totalCents: number;
  }> {
    const [todayResult] = await db
      .select({
        totalStake: sql`SUM(${bets.totalStake})`.as('totalStake')
      })
      .from(bets)
      .where(gte(bets.placedAt, todayStart));

    const [weekResult] = await db
      .select({
        totalStake: sql`SUM(${bets.totalStake})`.as('totalStake')
      })
      .from(bets)
      .where(gte(bets.placedAt, weekStart));

    const [totalResult] = await db
      .select({
        totalStake: sql`SUM(${bets.totalStake})`.as('totalStake')
      })
      .from(bets);

    return {
      todayCents: (todayResult.totalStake as number) || 0,
      weekCents: (weekResult.totalStake as number) || 0,
      totalCents: (totalResult.totalStake as number) || 0
    };
  }

  async getExposureMetrics(): Promise<{
    totalCents: number;
    highRiskCount: number;
  }> {
    const [exposureResult] = await db
      .select({
        totalExposure: sql`SUM(${bets.potentialWinnings})`.as('totalExposure'),
        highRiskCount: sql`COUNT(CASE WHEN ${bets.potentialWinnings} > 100000 THEN 1 END)`.as('highRiskCount')
      })
      .from(bets)
      .where(eq(bets.status, 'pending'));

    return {
      totalCents: (exposureResult.totalExposure as number) || 0,
      highRiskCount: (exposureResult.highRiskCount as number) || 0
    };
  }

  async getRecentActivity(limit: number): Promise<Array<{
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
  }>> {
    const recentBets = await db
      .select({
        id: bets.id,
        type: sql`'bet_placed'`.as('type'),
        userId: bets.userId,
        createdAt: bets.placedAt,
        amount: bets.totalStake
      })
      .from(bets)
      .orderBy(desc(bets.placedAt))
      .limit(Math.floor(limit / 2));

    const recentAudits = await db
      .select({
        id: auditLogs.id,
        type: sql`'admin_action'`.as('type'),
        adminId: auditLogs.adminId,
        createdAt: auditLogs.createdAt,
        action: auditLogs.actionType
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.floor(limit / 2));

    const combinedActivity = [
      ...recentBets.map(bet => ({
        id: bet.id,
        type: 'bet_placed' as string,
        title: 'New Bet Placed',
        description: `Bet placed for £${(bet.amount / 100).toFixed(2)}`,
        createdAt: bet.createdAt,
        userId: bet.userId,
        amount: bet.amount,
        severity: 'info'
      })),
      ...recentAudits.map(audit => ({
        id: audit.id,
        type: 'admin_action' as string,
        title: 'Admin Action',
        description: audit.action?.replace('_', ' ').toUpperCase() || 'Admin Activity',
        action: audit.action,
        createdAt: audit.createdAt,
        adminId: audit.adminId,
        severity: 'info'
      }))
    ];

    return combinedActivity
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getSystemAlerts(): Promise<Array<{
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
  }>> {
    // Check for high exposure situations
    const alerts = [];
    
    const [highExposure] = await db
      .select({
        totalExposure: sql`SUM(${bets.potentialWinnings})`.as('totalExposure'),
        highRiskCount: sql`COUNT(CASE WHEN ${bets.potentialWinnings} > 100000 THEN 1 END)`.as('highRiskCount')
      })
      .from(bets)
      .where(eq(bets.status, 'pending'));

    if ((highExposure.totalExposure as number) > 10000000) { // > £100,000
      alerts.push({
        id: 'high-total-exposure',
        type: 'high_exposure',
        title: 'High Total Exposure Alert',
        message: `Total exposure: £${((highExposure.totalExposure as number) / 100).toLocaleString()}`,
        severity: 'high',
        createdAt: new Date(),
        isResolved: false,
        actionRequired: true
      });
    }

    if ((highExposure.highRiskCount as number) > 0) {
      alerts.push({
        id: 'high-risk-bets',
        type: 'high_exposure',
        title: 'High Risk Bets Detected',
        message: `${highExposure.highRiskCount} bets with potential payouts over £1,000`,
        severity: 'medium',
        createdAt: new Date(),
        isResolved: false,
        actionRequired: true
      });
    }

    return alerts;
  }

  // ===================== MATCH/MARKET METHODS IMPLEMENTATION =====================

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
    const conditions: SQL<unknown>[] = [eq(matches.isDeleted, false)];

    if (params?.search) {
      const searchTerm = `%${params.search.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(matches.homeTeamName, searchTerm),
          ilike(matches.awayTeamName, searchTerm),
          ilike(matches.leagueName, searchTerm),
          ilike(matches.externalId, searchTerm)
        )!
      );
    }

    if (params?.status) {
      conditions.push(eq(matches.status, params.status));
    }

    if (params?.sport) {
      conditions.push(eq(matches.sport, params.sport));
    }

    if (params?.league) {
      conditions.push(eq(matches.leagueId, params.league));
    }

    if (params?.dateFrom) {
      conditions.push(gte(matches.kickoffTime, params.dateFrom));
    }

    if (params?.dateTo) {
      conditions.push(lte(matches.kickoffTime, params.dateTo));
    }

    // Get total count
    let countQuery = db
      .select({ count: count() })
      .from(matches);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }

    const [{ count: total }] = await countQuery;
    
    // Get matches with pagination
    let matchQuery = db
      .select()
      .from(matches);

    if (conditions.length > 0) {
      matchQuery = matchQuery.where(and(...conditions)) as any;
    }

    const matchResults = await matchQuery
      .orderBy(desc(matches.kickoffTime))
      .limit(params?.limit || 50)
      .offset(params?.offset || 0);

    // Add computed fields for frontend compatibility
    const enrichedMatches = matchResults.map(match => ({
      ...match,
      marketsCount: 0, // TODO: Count from markets table
      totalExposure: 0 // TODO: Calculate from exposure table
    }));

    return {
      matches: enrichedMatches,
      total
    };
  }

  // New optimized methods for SportMonks import
  async getMatchesFiltered(params: {
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
  }> {
    const conditions: SQL<unknown>[] = [];

    if (params.filters.externalId) {
      conditions.push(eq(matches.externalId, params.filters.externalId));
    }

    if (params.filters.externalSource) {
      conditions.push(eq(matches.externalSource, params.filters.externalSource));
    }

    if (params.filters.sport) {
      conditions.push(eq(matches.sport, params.filters.sport));
    }

    if (params.filters.status) {
      conditions.push(eq(matches.status, params.filters.status));
    }

    if (params.filters.isDeleted !== undefined) {
      conditions.push(eq(matches.isDeleted, params.filters.isDeleted));
    }

    // Get total count
    let countQuery = db
      .select({ count: count() })
      .from(matches);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }

    const [{ count: total }] = await countQuery;
    
    // Get matches
    let matchQuery = db
      .select()
      .from(matches);

    if (conditions.length > 0) {
      matchQuery = matchQuery.where(and(...conditions)) as any;
    }

    const matchResults = await matchQuery
      .limit(params.limit || 50)
      .offset(params.offset || 0);

    return {
      matches: matchResults,
      total
    };
  }

  async getMatchesByExternalIds(externalIds: string[]): Promise<any[]> {
    if (externalIds.length === 0) return [];
    
    return await db
      .select()
      .from(matches)
      .where(
        and(
          inArray(matches.externalId, externalIds),
          eq(matches.isDeleted, false)
        )
      );
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
    status: string;
    homeScore?: number;
    awayScore?: number;
    isManual?: boolean;
    createdBy?: string;
    updatedBy?: string;
  }): Promise<{ match: any; isNew: boolean }> {
    const now = new Date();
    const externalSource = matchData.externalSource || 'sportmonks';
    
    try {
      // Use INSERT ... ON CONFLICT DO UPDATE for true atomic upsert
      // This leverages our new composite unique constraint (externalId, externalSource)
      const [result] = await db
        .insert(matches)
        .values({
          ...matchData,
          externalSource,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [matches.externalId, matches.externalSource],
          set: {
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
            status: matchData.status,
            homeScore: matchData.homeScore,
            awayScore: matchData.awayScore,
            updatedBy: matchData.updatedBy,
            updatedAt: now,
            // Don't update: id, externalId, externalSource, isManual, createdBy, createdAt
          },
        })
        .returning();

      // Check if this was an insert (new) or update (existing)
      // If createdAt equals updatedAt, it was a new insert
      const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
      
      return {
        match: result,
        isNew
      };
      
    } catch (error) {
      console.error('Error in upsertMatch:', error);
      throw error;
    }
  }

  async createMarketOutcome(outcome: {
    marketId: string;
    name: string;
    odds: string;
    isActive: boolean;
  }): Promise<any> {
    // Mock implementation - would need market_outcomes table
    return {
      id: randomUUID(),
      ...outcome,
      createdAt: new Date()
    };
  }

  async updateMarketOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    // Mock implementation - would update market_outcomes table
    return {
      id: outcomeId,
      odds,
      updatedAt: new Date()
    };
  }

  // ===================== USER METHODS IMPLEMENTATION =====================

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
    const conditions: SQL<unknown>[] = [];

    if (params.query) {
      const searchTerm = `%${params.query.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(users.username, searchTerm),
          ilike(users.email, searchTerm),
          ilike(users.firstName, searchTerm),
          ilike(users.lastName, searchTerm)
        )!
      );
    }

    if (params.isActive !== undefined) {
      conditions.push(eq(users.isActive, params.isActive));
    }

    if (params.dateFrom) {
      conditions.push(gte(users.createdAt, params.dateFrom));
    }

    if (params.dateTo) {
      conditions.push(lte(users.createdAt, params.dateTo));
    }

    let query = db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        balance: users.balance,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })
      .from(users);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Get total count
    let countQuery = db
      .select({ count: count() })
      .from(users);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as any;
    }

    const [{ count: total }] = await countQuery;
    
    const userResults = await query
      .orderBy(desc(users.createdAt))
      .limit(params.limit || 50)
      .offset(params.offset || 0);

    return {
      users: userResults.map(user => ({
        ...user,
        // Remove password from results
        password: undefined
      })),
      total
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
    // Mock implementation - would need user_limits table
    return {
      dailyDepositLimitCents: 100000, // £1,000
      weeklyDepositLimitCents: 500000, // £5,000
      monthlyDepositLimitCents: 2000000, // £20,000
      maxBetLimitCents: 50000, // £500
      sessionTimeLimitMinutes: 240, // 4 hours
      cooldownPeriodHours: 24 // 24 hours
    };
  }

  async upsertUserLimits(userId: string, limits: {
    dailyDepositLimitCents?: number;
    weeklyDepositLimitCents?: number;
    monthlyDepositLimitCents?: number;
    maxBetLimitCents?: number;
    sessionTimeLimitMinutes?: number;
    cooldownPeriodHours?: number;
  }): Promise<any> {
    // Mock implementation - would upsert into user_limits table
    return {
      userId,
      ...limits,
      updatedAt: new Date()
    };
  }

  // ===================== COMPREHENSIVE REPORTING METHODS =====================
  
  // Daily GGR Report - Critical Financial Metric
  async getDailyGgrReport(startDate: Date, endDate: Date): Promise<{
    date: string;
    totalStakeCents: number;
    totalPayoutsCents: number;
    grossGamingRevenueCents: number;
    totalBets: number;
    activePlayers: number;
    averageStakeCents: number;
    winRate: number;
  }> {
    const dateStr = startDate.toISOString().split('T')[0];
    
    // Get all bets for the date range
    const betStats = await db
      .select({
        totalStake: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        totalPayouts: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`,
        totalBets: sql<number>`COUNT(*)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    // Get unique active players count
    const playerCount = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${bets.userId})` })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    // Get winning bets count for win rate calculation
    const winStats = await db
      .select({
        winningBets: sql<number>`COUNT(CASE WHEN ${bets.status} IN ('settled_win') THEN 1 END)`,
        totalBets: sql<number>`COUNT(*)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    const stats = betStats[0] || { totalStake: 0, totalPayouts: 0, totalBets: 0 };
    const players = playerCount[0]?.count || 0;
    const winData = winStats[0] || { winningBets: 0, totalBets: 0 };
    
    const grossGamingRevenueCents = stats.totalStake - stats.totalPayouts;
    const averageStakeCents = stats.totalBets > 0 ? Math.round(stats.totalStake / stats.totalBets) : 0;
    const winRate = winData.totalBets > 0 ? winData.winningBets / winData.totalBets : 0;
    
    return {
      date: dateStr,
      totalStakeCents: stats.totalStake,
      totalPayoutsCents: stats.totalPayouts,
      grossGamingRevenueCents,
      totalBets: stats.totalBets,
      activePlayers: players,
      averageStakeCents,
      winRate
    };
  }
  
  // Monthly GGR Report with daily breakdown
  async getMonthlyGgrReport(startDate: Date, endDate: Date): Promise<{
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
    // Monthly totals
    const monthlyStats = await db
      .select({
        totalStake: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        totalPayouts: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`,
        totalBets: sql<number>`COUNT(*)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    // Unique players
    const playerCount = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${bets.userId})` })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    // Daily breakdown
    const dailyStats = await db
      .select({
        day: sql<number>`EXTRACT(DAY FROM ${bets.placedAt})::int`,
        stakeCents: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        payoutsCents: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`,
        bets: sql<number>`COUNT(*)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      )
      .groupBy(sql`EXTRACT(DAY FROM ${bets.placedAt})`)
      .orderBy(sql`EXTRACT(DAY FROM ${bets.placedAt})`);
    
    // Win rate calculation
    const winStats = await db
      .select({
        winningBets: sql<number>`COUNT(CASE WHEN ${bets.status} IN ('settled_win') THEN 1 END)`,
        totalBets: sql<number>`COUNT(*)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    const stats = monthlyStats[0] || { totalStake: 0, totalPayouts: 0, totalBets: 0 };
    const players = playerCount[0]?.count || 0;
    const winData = winStats[0] || { winningBets: 0, totalBets: 0 };
    
    const grossGamingRevenueCents = stats.totalStake - stats.totalPayouts;
    const averageStakeCents = stats.totalBets > 0 ? Math.round(stats.totalStake / stats.totalBets) : 0;
    const winRate = winData.totalBets > 0 ? winData.winningBets / winData.totalBets : 0;
    
    // Calculate daily breakdown with GGR
    const dailyBreakdown = dailyStats.map(day => ({
      day: day.day,
      stakeCents: day.stakeCents,
      ggrCents: day.stakeCents - day.payoutsCents,
      bets: day.bets
    }));
    
    // Find highest and lowest GGR days
    const ggrAmounts = dailyBreakdown.map(d => d.ggrCents);
    const highestDayCents = ggrAmounts.length > 0 ? Math.max(...ggrAmounts) : 0;
    const lowestDayCents = ggrAmounts.length > 0 ? Math.min(...ggrAmounts) : 0;
    
    return {
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      totalStakeCents: stats.totalStake,
      totalPayoutsCents: stats.totalPayouts,
      grossGamingRevenueCents,
      totalBets: stats.totalBets,
      activePlayers: players,
      averageStakeCents,
      highestDayCents,
      lowestDayCents,
      winRate,
      dailyBreakdown
    };
  }
  
  // Turnover by Sport Report - Market Analysis
  async getTurnoverBySportReport(startDate: Date, endDate: Date, sport?: string, league?: string): Promise<{
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
    // Build conditions
    const conditions = [
      gte(bets.placedAt, startDate),
      lte(bets.placedAt, endDate)
    ];
    
    // Get sport breakdown with turnover and GGR
    const sportStats = await db
      .select({
        sport: sql<string>`COALESCE(${betSelections.league}, 'Unknown')`,
        turnoverCents: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        betCount: sql<number>`COUNT(DISTINCT ${bets.id})`,
        payoutsCents: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`
      })
      .from(bets)
      .innerJoin(betSelections, eq(bets.id, betSelections.betId))
      .where(and(...conditions))
      .groupBy(sql`COALESCE(${betSelections.league}, 'Unknown')`)
      .orderBy(sql`SUM(${bets.totalStake}) DESC`);
    
    // Calculate GGR for each sport
    const sports = sportStats.map(sport => ({
      sport: sport.sport,
      turnoverCents: sport.turnoverCents,
      betCount: sport.betCount,
      ggrCents: sport.turnoverCents - sport.payoutsCents
    }));
    
    const totalTurnoverCents = sports.reduce((sum, sport) => sum + sport.turnoverCents, 0);
    const totalBets = sports.reduce((sum, sport) => sum + sport.betCount, 0);
    const totalGgrCents = sports.reduce((sum, sport) => sum + sport.ggrCents, 0);
    
    return {
      sports,
      totalTurnoverCents,
      totalBets,
      totalGgrCents
    };
  }
  
  // Payout Ratio Report - Risk Management Metric
  async getPayoutRatioReport(startDate: Date, endDate: Date): Promise<{
    totalStakeCents: number;
    totalPayoutsCents: number;
    payoutRatio: number;
    betCount: number;
    winningBets: number;
    losingBets: number;
    winRate: number;
  }> {
    const stats = await db
      .select({
        totalStakeCents: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        totalPayoutsCents: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`,
        betCount: sql<number>`COUNT(*)`,
        winningBets: sql<number>`COUNT(CASE WHEN ${bets.status} IN ('settled_win') THEN 1 END)`,
        losingBets: sql<number>`COUNT(CASE WHEN ${bets.status} IN ('settled_lose') THEN 1 END)`
      })
      .from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    const result = stats[0] || {
      totalStakeCents: 0,
      totalPayoutsCents: 0,
      betCount: 0,
      winningBets: 0,
      losingBets: 0
    };
    
    const payoutRatio = result.totalStakeCents > 0 ? result.totalPayoutsCents / result.totalStakeCents : 0;
    const winRate = result.betCount > 0 ? result.winningBets / result.betCount : 0;
    
    return {
      ...result,
      payoutRatio,
      winRate
    };
  }
  
  // Top Winners Report - High-Value Player Analysis
  async getTopWinnersReport(startDate: Date, endDate: Date, limit: number): Promise<{
    winners: Array<{
      userId: string;
      username: string;
      netWinningsCents: number;
      betCount: number;
    }>;
  }> {
    const topWinners = await db
      .select({
        userId: bets.userId,
        username: users.username,
        totalStakeCents: sql<number>`COALESCE(SUM(${bets.totalStake}), 0)::int`,
        totalWinningsCents: sql<number>`COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0)::int`,
        betCount: sql<number>`COUNT(*)`
      })
      .from(bets)
      .innerJoin(users, eq(bets.userId, users.id))
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      )
      .groupBy(bets.userId, users.username)
      .orderBy(sql`(COALESCE(SUM(CASE WHEN ${bets.status} IN ('settled_win') THEN ${bets.actualWinnings} ELSE 0 END), 0) - COALESCE(SUM(${bets.totalStake}), 0)) DESC`)
      .limit(limit);
    
    const winners = topWinners.map(winner => ({
      userId: winner.userId,
      username: winner.username,
      netWinningsCents: winner.totalWinningsCents - winner.totalStakeCents,
      betCount: winner.betCount
    }));
    
    return { winners };
  }
  
  // Chargeback Report - Payment Processing Analysis
  async getChargebackReport(startDate: Date, endDate: Date): Promise<{
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
    // For now, return empty results as chargeback tracking would need its own table
    // In a real implementation, we'd have a chargebacks table
    return {
      chargebacks: [],
      totalAmountCents: 0,
      count: 0
    };
  }
  
  // Custom Report Generation - Flexible Analytics Engine
  async generateCustomReport(params: {
    reportType: string;
    startDate: Date;
    endDate: Date;
    filters?: any;
    groupBy?: string;
    metrics?: string[];
  }): Promise<{
    title: string;
    data: any[];
    summary: any;
    generatedAt: Date;
  }> {
    const { reportType, startDate, endDate, filters = {}, groupBy = 'date', metrics = ['turnover', 'bets', 'ggr'] } = params;
    
    let query = db.select().from(bets)
      .where(
        and(
          gte(bets.placedAt, startDate),
          lte(bets.placedAt, endDate)
        )
      );
    
    // Apply filters
    if (filters.userId) {
      query = query.where(eq(bets.userId, filters.userId)) as any;
    }
    
    if (filters.status) {
      query = query.where(eq(bets.status, filters.status)) as any;
    }
    
    // For basic implementation, get all matching bets
    const betsData = await query.limit(1000); // Limit for performance
    
    // Group and aggregate data
    const groupedData = new Map();
    
    for (const bet of betsData) {
      let groupKey: string;
      
      switch (groupBy) {
        case 'date':
          groupKey = bet.placedAt.toISOString().split('T')[0];
          break;
        case 'user':
          groupKey = bet.userId;
          break;
        case 'status':
          groupKey = bet.status;
          break;
        default:
          groupKey = 'all';
      }
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, {
          group: groupKey,
          turnover: 0,
          bets: 0,
          payouts: 0,
          ggr: 0
        });
      }
      
      const group = groupedData.get(groupKey);
      group.turnover += bet.totalStake;
      group.bets += 1;
      if (bet.status === 'settled_win' && bet.actualWinnings) {
        group.payouts += bet.actualWinnings;
      }
      group.ggr = group.turnover - group.payouts;
    }
    
    const data = Array.from(groupedData.values());
    
    // Calculate summary
    const summary = {
      totalRecords: data.length,
      totalTurnover: data.reduce((sum, row) => sum + row.turnover, 0),
      totalBets: data.reduce((sum, row) => sum + row.bets, 0),
      totalGGR: data.reduce((sum, row) => sum + row.ggr, 0)
    };
    
    return {
      title: `Custom ${reportType} Report`,
      data,
      summary,
      generatedAt: new Date()
    };
  }
  
  // Export Report Data - Multi-format Export Engine
  async exportReportData(params: {
    reportType: string;
    format: 'csv' | 'excel' | 'json';
    startDate: Date;
    endDate: Date;
    filters?: any;
  }): Promise<string> {
    const { reportType, format, startDate, endDate, filters } = params;
    
    // Get the appropriate report data
    let reportData: any;
    
    switch (reportType) {
      case 'daily':
        reportData = await this.getDailyGgrReport(startDate, endDate);
        break;
      case 'monthly':
        reportData = await this.getMonthlyGgrReport(startDate, endDate);
        break;
      case 'turnover':
        reportData = await this.getTurnoverBySportReport(startDate, endDate);
        break;
      case 'payout':
        reportData = await this.getPayoutRatioReport(startDate, endDate);
        break;
      case 'winners':
        reportData = await this.getTopWinnersReport(startDate, endDate, 50);
        break;
      default:
        reportData = { error: 'Unknown report type' };
    }
    
    // Format based on requested format
    switch (format) {
      case 'json':
        return JSON.stringify(reportData, null, 2);
      case 'csv':
        // Simple CSV implementation
        if (Array.isArray(reportData)) {
          const headers = Object.keys(reportData[0] || {}).join(',');
          const rows = reportData.map(row => 
            Object.values(row).map(val => 
              typeof val === 'string' ? `"${val}"` : val
            ).join(',')
          ).join('\n');
          return `${headers}\n${rows}`;
        }
        return Object.entries(reportData).map(([key, value]) => `${key},${value}`).join('\n');
      default:
        return JSON.stringify(reportData, null, 2);
    }
  }
  
  // Scheduled Report Management
  async createScheduledReport(report: {
    name: string;
    reportType: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    filters?: any;
    format?: 'csv' | 'excel' | 'pdf';
  }): Promise<any> {
    // For now, return a mock scheduled report
    // In a real implementation, this would be stored in a scheduledReports table
    return {
      id: randomUUID(),
      ...report,
      createdAt: new Date(),
      nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
      isActive: true
    };
  }
  
  // ===================== FINANCIAL METHODS IMPLEMENTATION =====================

  async calculateGGRReport(params: {
    dateFrom: Date;
    dateTo: Date;
    groupBy?: 'day' | 'week' | 'month';
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
    const periodBets = await db
      .select()
      .from(bets)
      .where(and(
        gte(bets.placedAt, params.dateFrom),
        lte(bets.placedAt, params.dateTo)
      ));

    const totalStakeCents = periodBets.reduce((sum, bet) => sum + bet.totalStake, 0);
    const totalPayoutsCents = periodBets
      .filter(bet => bet.status === 'settled_win')
      .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);
    
    const uniquePlayerIds = new Set(periodBets.map(bet => bet.userId));
    
    // Generate breakdown (simplified implementation)
    const breakdown = [{
      period: params.dateFrom.toISOString().split('T')[0],
      stakeCents: totalStakeCents,
      payoutsCents: totalPayoutsCents,
      ggrCents: totalStakeCents - totalPayoutsCents,
      betCount: periodBets.length
    }];

    return {
      totalStakeCents,
      totalPayoutsCents,
      ggrCents: totalStakeCents - totalPayoutsCents,
      betCount: periodBets.length,
      playerCount: uniquePlayerIds.size,
      breakdown
    };
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

  // ===================== MISSING ENHANCED MARKET OPERATIONS =====================

  async deleteMarket(marketId: string, adminId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Soft delete the market
      await tx
        .update(markets)
        .set({ 
          isDeleted: true, 
          updatedBy: adminId,
          updatedAt: new Date() 
        })
        .where(eq(markets.id, marketId));

      // Soft delete all associated outcomes
      await tx
        .update(marketOutcomes)
        .set({ 
          isDeleted: true, 
          updatedBy: adminId,
          updatedAt: new Date() 
        })
        .where(eq(marketOutcomes.marketId, marketId));
    });
  }

  async getMarketOutcomes(marketId: string): Promise<any[]> {
    return await db
      .select()
      .from(marketOutcomes)
      .where(
        and(
          eq(marketOutcomes.marketId, marketId),
          eq(marketOutcomes.isDeleted, false)
        )
      )
      .orderBy(marketOutcomes.displayOrder);
  }

  async updateMarketOutcome(outcomeId: string, updates: {
    odds?: string;
    status?: string;
    liabilityLimitCents?: number;
    adminId: string;
    reason?: string;
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      // Get current outcome for audit trail
      const [currentOutcome] = await tx
        .select()
        .from(marketOutcomes)
        .where(eq(marketOutcomes.id, outcomeId));

      if (!currentOutcome) {
        throw new Error('Market outcome not found');
      }

      // Prepare update data
      const updateData: any = {
        updatedBy: updates.adminId,
        updatedAt: new Date()
      };

      if (updates.odds !== undefined) {
        updateData.previousOdds = currentOutcome.odds;
        updateData.odds = updates.odds;
      }

      if (updates.status !== undefined) {
        updateData.status = updates.status;
      }

      if (updates.liabilityLimitCents !== undefined) {
        updateData.liabilityLimitCents = updates.liabilityLimitCents;
      }

      // Update the outcome
      const [updatedOutcome] = await tx
        .update(marketOutcomes)
        .set(updateData)
        .where(eq(marketOutcomes.id, outcomeId))
        .returning();

      // Log odds change if odds were updated
      if (updates.odds !== undefined) {
        await tx
          .insert(oddsHistory)
          .values({
            id: randomUUID(),
            outcomeId,
            previousOdds: currentOutcome.odds,
            newOdds: updates.odds,
            source: 'manual',
            reason: updates.reason || 'Manual odds update',
            changedBy: updates.adminId,
            timestamp: new Date()
          });
      }

      return updatedOutcome;
    });
  }

  // ===================== ENHANCED SPORTS AND LEAGUES OPERATIONS =====================

  async getSports(): Promise<Array<{
    id: string;
    name: string;
    displayName: string;
    matchCount: number;
  }>> {
    const result = await db
      .select({
        sport: matches.sport,
        matchCount: count(matches.id).as('matchCount')
      })
      .from(matches)
      .where(
        and(
          eq(matches.isDeleted, false),
          gte(matches.kickoffTime, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
        )
      )
      .groupBy(matches.sport)
      .orderBy(desc(count(matches.id)));

    return result.map(row => ({
      id: row.sport,
      name: row.sport,
      displayName: row.sport,
      matchCount: row.matchCount
    }));
  }

  async getLeagues(sportFilter?: string): Promise<Array<{
    id: string;
    name: string;
    sport: string;
    matchCount: number;
  }>> {
    let query = db
      .select({
        leagueId: matches.leagueId,
        leagueName: matches.leagueName,
        sport: matches.sport,
        matchCount: count(matches.id).as('matchCount')
      })
      .from(matches)
      .where(
        and(
          eq(matches.isDeleted, false),
          gte(matches.kickoffTime, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
        )
      );

    if (sportFilter) {
      query = query.where(
        and(
          eq(matches.isDeleted, false),
          eq(matches.sport, sportFilter),
          gte(matches.kickoffTime, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        )
      ) as any;
    }

    const result = await query
      .groupBy(matches.leagueId, matches.leagueName, matches.sport)
      .orderBy(desc(count(matches.id)));

    return result.map(row => ({
      id: row.leagueId,
      name: row.leagueName,
      sport: row.sport,
      matchCount: row.matchCount
    }));
  }

  // ===================== ENHANCED MARKET CREATION =====================

  async createMarket(marketData: {
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
  }): Promise<any> {
    return await db.transaction(async (tx) => {
      // Verify match exists
      const [match] = await tx
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.id, marketData.matchId),
            eq(matches.isDeleted, false)
          )
        );

      if (!match) {
        throw new Error('Match not found or has been deleted');
      }

      // Create the market
      const [newMarket] = await tx
        .insert(markets)
        .values({
          id: randomUUID(),
          matchId: marketData.matchId,
          key: marketData.key,
          name: marketData.name,
          type: marketData.type,
          parameter: marketData.parameter,
          status: 'open',
          isPublished: true,
          createdBy: marketData.adminId,
          updatedBy: marketData.adminId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      // Create outcomes
      const outcomePromises = marketData.outcomes.map((outcome, index) =>
        tx
          .insert(marketOutcomes)
          .values({
            id: randomUUID(),
            marketId: newMarket.id,
            key: outcome.key,
            label: outcome.label,
            odds: outcome.odds,
            status: 'active',
            displayOrder: index,
            updatedBy: marketData.adminId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning()
      );

      const outcomes = await Promise.all(outcomePromises);

      return {
        ...newMarket,
        outcomes: outcomes.map(([outcome]) => outcome)
      };
    });
  }

  // ===================== LIVE MATCH SIMULATION METHODS =====================

  async getScheduledManualMatches(): Promise<any[]> {
    const now = new Date();
    return await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, 'scheduled'),
          eq(matches.isManual, true),
          eq(matches.isDeleted, false),
          lte(matches.kickoffTime, now)
        )
      );
  }

  async getMatchWithEvents(matchId: string): Promise<{ match: any; events: any[] }> {
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      throw new Error(`Match ${matchId} not found`);
    }

    const events = await db
      .select()
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.matchId, matchId),
          eq(matchEvents.isSimulated, true),
          eq(matchEvents.isExecuted, false)
        )
      )
      .orderBy(matchEvents.minute, matchEvents.second, matchEvents.orderIndex);

    return { match, events };
  }

  async updateMatchToLive(matchId: string): Promise<void> {
    await db
      .update(matches)
      .set({ 
        status: 'live',
        updatedAt: new Date()
      })
      .where(eq(matches.id, matchId));
  }

  async updateMatchScore(matchId: string, homeScore: number, awayScore: number): Promise<void> {
    await db
      .update(matches)
      .set({
        homeScore,
        awayScore,
        updatedAt: new Date()
      })
      .where(eq(matches.id, matchId));
  }

  async markEventAsExecuted(eventId: string): Promise<void> {
    await db
      .update(matchEvents)
      .set({ 
        isExecuted: true,
        updatedAt: new Date()
      })
      .where(eq(matchEvents.id, eventId));
  }

  async suspendAllMarkets(matchId: string): Promise<void> {
    await db
      .update(markets)
      .set({ 
        status: 'suspended',
        updatedAt: new Date()
      })
      .where(eq(markets.matchId, matchId));
  }

  async reopenAllMarkets(matchId: string): Promise<void> {
    await db
      .update(markets)
      .set({ 
        status: 'open',
        updatedAt: new Date()
      })
      .where(eq(markets.matchId, matchId));
  }

  async updateMarketOdds(outcomeId: string, newOdds: string): Promise<void> {
    await db
      .update(marketOutcomes)
      .set({ 
        odds: newOdds,
        updatedAt: new Date()
      })
      .where(eq(marketOutcomes.id, outcomeId));
  }

  async finishMatch(matchId: string, homeScore: number, awayScore: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Update match status
      await tx
        .update(matches)
        .set({ 
          status: 'finished',
          homeScore,
          awayScore,
          updatedAt: new Date()
        })
        .where(eq(matches.id, matchId));

      // Close all markets for this match
      await tx
        .update(markets)
        .set({ 
          status: 'settled',
          updatedAt: new Date()
        })
        .where(eq(markets.matchId, matchId));
    });
  }
}