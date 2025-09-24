import { supabaseAdmin } from './supabase';
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
  type UserLimits,
  type InsertUserLimits,
} from "@shared/schema";
import type { IStorage } from "./storage";

export class SupabaseStorage implements IStorage {
  // ===================== USER OPERATIONS =====================
  
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      username: data.username,
      email: '', // We'll get this from auth.users if needed
      firstName: data.first_name,
      lastName: data.last_name,
      balance: data.balance_cents,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      username: data.username,
      email: '', // We'll get this from auth.users if needed
      firstName: data.first_name,
      lastName: data.last_name,
      balance: data.balance_cents,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data: authUser, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error || !authUser.users) return undefined;

    const user = authUser.users.find(u => u.email === email);
    if (!user) return undefined;

    return await this.getUser(user.id);
  }

  async createUser(user: InsertUser): Promise<User> {
    // Create auth user first
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: Math.random().toString(36).slice(-8), // Temporary password
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }

    // Create profile
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        username: user.username,
        first_name: user.firstName,
        last_name: user.lastName,
        balance_cents: user.balance || 0,
        is_active: user.isActive !== false,
      })
      .select()
      .single();

    if (error || !data) {
      // Cleanup auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${error?.message}`);
    }

    return {
      id: data.id,
      username: data.username,
      email: authData.user.email!,
      firstName: data.first_name,
      lastName: data.last_name,
      balance: data.balance_cents,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        username: updates.username,
        first_name: updates.firstName,
        last_name: updates.lastName,
        balance_cents: updates.balance,
        is_active: updates.isActive,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      username: data.username,
      email: '', // We'll get this from auth.users if needed
      firstName: data.first_name,
      lastName: data.last_name,
      balance: data.balance_cents,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateUserBalance(userId: string, newBalanceCents: number): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ balance_cents: newBalanceCents })
      .eq('id', userId)
      .select()
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      username: data.username,
      email: '',
      firstName: data.first_name,
      lastName: data.last_name,
      balance: data.balance_cents,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  // ===================== BET OPERATIONS =====================
  
  async createBet(bet: InsertBet & { userId: string }): Promise<Bet> {
    const { data, error } = await supabaseAdmin
      .from('bets')
      .insert({
        user_id: bet.userId,
        type: bet.type,
        total_stake_cents: bet.totalStake,
        potential_winnings_cents: bet.potentialWinnings,
        total_odds: bet.totalOdds,
        status: bet.status,
        actual_winnings_cents: bet.actualWinnings,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create bet: ${error?.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      totalStake: data.total_stake_cents,
      potentialWinnings: data.potential_winnings_cents,
      totalOdds: data.total_odds.toString(),
      status: data.status,
      placedAt: data.placed_at,
      settledAt: data.settled_at,
      actualWinnings: data.actual_winnings_cents,
    };
  }

  async getBet(id: string): Promise<Bet | undefined> {
    const { data, error } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      totalStake: data.total_stake_cents,
      potentialWinnings: data.potential_winnings_cents,
      totalOdds: data.total_odds.toString(),
      status: data.status,
      placedAt: data.placed_at,
      settledAt: data.settled_at,
      actualWinnings: data.actual_winnings_cents,
    };
  }

  async getUserBets(userId: string, limit = 50): Promise<Bet[]> {
    const { data, error } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(bet => ({
      id: bet.id,
      userId: bet.user_id,
      type: bet.type,
      totalStake: bet.total_stake_cents,
      potentialWinnings: bet.potential_winnings_cents,
      totalOdds: bet.total_odds.toString(),
      status: bet.status,
      placedAt: bet.placed_at,
      settledAt: bet.settled_at,
      actualWinnings: bet.actual_winnings_cents,
    }));
  }

  async updateBetStatus(betId: string, status: string, actualWinningsCents?: number): Promise<Bet | undefined> {
    const updates: any = { status, settled_at: new Date().toISOString() };
    if (actualWinningsCents !== undefined) {
      updates.actual_winnings_cents = actualWinningsCents;
    }

    const { data, error } = await supabaseAdmin
      .from('bets')
      .update(updates)
      .eq('id', betId)
      .select()
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      totalStake: data.total_stake_cents,
      potentialWinnings: data.potential_winnings_cents,
      totalOdds: data.total_odds.toString(),
      status: data.status,
      placedAt: data.placed_at,
      settledAt: data.settled_at,
      actualWinnings: data.actual_winnings_cents,
    };
  }

  // For now, implement a simplified version of placeBetAtomic
  async placeBetAtomic(params: {
    userId: string;
    betType: "single" | "express" | "system";
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
      // Start a transaction
      const user = await this.getUser(params.userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (user.balance < params.totalStakeCents) {
        return { success: false, error: "Insufficient balance" };
      }

      // Calculate total odds
      const totalOdds = params.selections.reduce((acc, sel) => acc * parseFloat(sel.odds), 1);
      const potentialWinnings = Math.round(params.totalStakeCents * totalOdds);

      // Create bet
      const bet = await this.createBet({
        userId: params.userId,
        type: params.betType,
        totalStake: params.totalStakeCents,
        potentialWinnings,
        totalOdds: totalOdds.toFixed(4),
        status: "pending",
        actualWinnings: 0,
      });

      // Create selections
      const selections: BetSelection[] = [];
      for (const sel of params.selections) {
        const selection = await this.createBetSelection({
          betId: bet.id,
          fixtureId: sel.fixtureId,
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          league: sel.league,
          marketId: "temp-market-id", // TODO: implement proper market system
          outcomeId: "temp-outcome-id",
          market: sel.market,
          selection: sel.selection,
          odds: sel.odds,
          status: "pending",
        });
        selections.push(selection);
      }

      // Update user balance
      const newBalance = user.balance - params.totalStakeCents;
      const updatedUser = await this.updateUserBalance(params.userId, newBalance);

      // Create transaction record
      const transaction = await this.createTransaction({
        userId: params.userId,
        type: "bet_stake",
        amount: -params.totalStakeCents,
        balanceBefore: user.balance,
        balanceAfter: newBalance,
        reference: bet.id,
        description: `Bet stake for ${params.betType} bet`,
        status: "completed",
      });

      return {
        success: true,
        bet,
        selections,
        user: updatedUser,
        transaction,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================== BET SELECTION OPERATIONS =====================
  
  async createBetSelection(selection: InsertBetSelection): Promise<BetSelection> {
    const { data, error } = await supabaseAdmin
      .from('bet_selections')
      .insert({
        bet_id: selection.betId,
        fixture_id: selection.fixtureId,
        home_team: selection.homeTeam,
        away_team: selection.awayTeam,
        league: selection.league,
        market_id: selection.marketId,
        outcome_id: selection.outcomeId,
        market: selection.market,
        selection: selection.selection,
        odds: selection.odds,
        status: selection.status,
        result: selection.result,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create bet selection: ${error?.message}`);
    }

    return {
      id: data.id,
      betId: data.bet_id,
      fixtureId: data.fixture_id,
      homeTeam: data.home_team,
      awayTeam: data.away_team,
      league: data.league,
      marketId: data.market_id,
      outcomeId: data.outcome_id,
      market: data.market,
      selection: data.selection,
      odds: data.odds.toString(),
      status: data.status,
      result: data.result,
    };
  }

  async getBetSelections(betId: string): Promise<BetSelection[]> {
    const { data, error } = await supabaseAdmin
      .from('bet_selections')
      .select('*')
      .eq('bet_id', betId);

    if (error || !data) return [];

    return data.map(sel => ({
      id: sel.id,
      betId: sel.bet_id,
      fixtureId: sel.fixture_id,
      homeTeam: sel.home_team,
      awayTeam: sel.away_team,
      league: sel.league,
      marketId: sel.market_id,
      outcomeId: sel.outcome_id,
      market: sel.market,
      selection: sel.selection,
      odds: sel.odds.toString(),
      status: sel.status,
      result: sel.result,
    }));
  }

  async updateSelectionStatus(selectionId: string, status: string, result?: string): Promise<BetSelection | undefined> {
    const updates: any = { status };
    if (result) updates.result = result;

    const { data, error } = await supabaseAdmin
      .from('bet_selections')
      .update(updates)
      .eq('id', selectionId)
      .select()
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      betId: data.bet_id,
      fixtureId: data.fixture_id,
      homeTeam: data.home_team,
      awayTeam: data.away_team,
      league: data.league,
      marketId: data.market_id,
      outcomeId: data.outcome_id,
      market: data.market,
      selection: data.selection,
      odds: data.odds.toString(),
      status: data.status,
      result: data.result,
    };
  }

  // ===================== FAVORITES OPERATIONS =====================
  
  async addFavorite(favorite: InsertFavorite & { userId: string }): Promise<UserFavorite> {
    const { data, error } = await supabaseAdmin
      .from('user_favorites')
      .insert({
        user_id: favorite.userId,
        type: favorite.type,
        entity_id: favorite.entityId,
        entity_name: favorite.entityName,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to add favorite: ${error?.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      entityId: data.entity_id,
      entityName: data.entity_name,
      createdAt: data.created_at,
    };
  }

  async removeFavorite(userId: string, entityId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('entity_id', entityId);

    return !error;
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    const { data, error } = await supabaseAdmin
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId);

    if (error || !data) return [];

    return data.map(fav => ({
      id: fav.id,
      userId: fav.user_id,
      type: fav.type,
      entityId: fav.entity_id,
      entityName: fav.entity_name,
      createdAt: fav.created_at,
    }));
  }

  // ===================== TRANSACTION OPERATIONS =====================
  
  async createTransaction(transaction: InsertTransaction & { userId: string }): Promise<Transaction> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: transaction.userId,
        type: transaction.type,
        amount_cents: transaction.amount,
        balance_before_cents: transaction.balanceBefore,
        balance_after_cents: transaction.balanceAfter,
        reference: transaction.reference,
        description: transaction.description,
        status: transaction.status,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create transaction: ${error?.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      amount: data.amount_cents,
      balanceBefore: data.balance_before_cents,
      balanceAfter: data.balance_after_cents,
      reference: data.reference,
      description: data.description,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  async getUserTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(txn => ({
      id: txn.id,
      userId: txn.user_id,
      type: txn.type,
      amount: txn.amount_cents,
      balanceBefore: txn.balance_before_cents,
      balanceAfter: txn.balance_after_cents,
      reference: txn.reference,
      description: txn.description,
      status: txn.status,
      createdAt: txn.created_at,
    }));
  }

  // ===================== SESSION OPERATIONS (SIMPLIFIED - SUPABASE HANDLES THIS) =====================
  
  async createSession(userId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<UserSession> {
    // Supabase handles sessions internally, but we'll create a record for compatibility
    return {
      id: `session-${userId}-${Date.now()}`,
      userId,
      sessionToken,
      ipAddress,
      userAgent,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    // This would typically be handled by Supabase Auth
    return undefined;
  }

  async deleteSession(sessionToken: string): Promise<boolean> {
    // This would typically be handled by Supabase Auth
    return true;
  }

  // ===================== STUB METHODS (NOT IMPLEMENTED YET) =====================
  // These would need proper implementation for a complete migration

  async loginUser(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    throw new Error("Use Supabase Auth for login");
  }

  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    // TODO: Implement admin user operations
    return undefined;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    // TODO: Implement audit logging
    throw new Error("Not implemented");
  }

  async initializeDemoAccount(): Promise<void> {
    // TODO: Implement demo account creation
  }

  // Add other required methods as stubs for now
  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> { return undefined; }
  async createAdminUser(admin: InsertAdminUser): Promise<AdminUser> { throw new Error("Not implemented"); }
  async updateAdminProfile(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> { return undefined; }
  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> { return undefined; }
  async updateAdminLastLogin(adminId: string): Promise<AdminUser | undefined> { return undefined; }
  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, twoFactorVerified?: boolean, ipAddress?: string, userAgent?: string): Promise<AdminSession> { throw new Error("Not implemented"); }
  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> { return undefined; }
  async deleteAdminSession(sessionToken: string): Promise<boolean> { return true; }
  async updateAdminSessionTwoFactor(sessionToken: string, verified: boolean): Promise<AdminSession | undefined> { return undefined; }
  async extendAdminSession(sessionToken: string, newExpiresAt: Date): Promise<AdminSession | undefined> { return undefined; }
  async setupAdminTwoFactor(adminId: string, secret: string): Promise<{ success: boolean; secret: string; qrCode: string; manualEntryKey: string }> { throw new Error("Not implemented"); }
  async verifyAdminTwoFactor(adminId: string, token: string): Promise<boolean> { return false; }
  async disableAdminTwoFactor(adminId: string): Promise<boolean> { return false; }
  async generateAdminTwoFactorBackupCodes(adminId: string): Promise<string[]> { return []; }
  async verifyAdminTwoFactorBackupCode(adminId: string, code: string): Promise<boolean> { return false; }
  async getAuditLogs(params: any): Promise<{ logs: AuditLog[]; total: number }> { return { logs: [], total: 0 }; }
  async toggleAdminUserStatus(adminId: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; error?: string }> { return { success: false }; }
  async changeAdminUserRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string }> { return { success: false }; }
  async searchAdminUsers(params: any): Promise<{ users: AdminUser[]; total: number }> { return { users: [], total: 0 }; }
  async getMatchesByTeamsAndTime(): Promise<any[]> { return []; }
  async createBettingMarket(): Promise<any> { throw new Error("Not implemented"); }
  async getBettingMarkets(): Promise<any[]> { return []; }
  async updateBettingMarket(): Promise<any> { return undefined; }
  async createMarketOutcome(): Promise<any> { throw new Error("Not implemented"); }
  async getMarketOutcomes(): Promise<any[]> { return []; }
  async updateMarketOutcome(): Promise<any> { return undefined; }
  async searchBets(): Promise<any> { return { bets: [], total: 0 }; }
  async getBetsRequiringReview(): Promise<any[]> { return []; }
  async reviewBet(): Promise<any> { return { success: false }; }
  async settleBet(): Promise<any> { return { success: false }; }
  async voidBet(): Promise<any> { return { success: false }; }
  async getBetsByStatus(): Promise<any[]> { return []; }
  async searchUsers(): Promise<any> { return { users: [], total: 0 }; }
  async getUserLimits(): Promise<UserLimits | undefined> { return undefined; }
  async updateUserLimits(): Promise<any> { return { success: false }; }
  async getRiskMetrics(): Promise<any> { return {}; }
  async getExposureByMarket(): Promise<any[]> { return []; }
  async createExposureSnapshot(): Promise<any> { throw new Error("Not implemented"); }
  async getExposureHistory(): Promise<any[]> { return []; }
  async getPromotions(): Promise<any[]> { return []; }
  async createPromotion(): Promise<any> { throw new Error("Not implemented"); }
  async updatePromotion(): Promise<any> { return undefined; }
  async deletePromotion(): Promise<boolean> { return false; }
  async applyPromotionToUser(): Promise<any> { return { success: false }; }
  async getRevenueTrends(): Promise<any> { return {}; }
  async createDashboardAlert(): Promise<any> { return {}; }
}