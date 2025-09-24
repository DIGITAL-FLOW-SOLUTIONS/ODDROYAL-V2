import { SupabaseClient } from '@supabase/supabase-js';
import { Database, Tables, TablesInsert } from './types/database';
import { supabaseAdmin } from './supabase';
import {
  User,
  InsertUser,
  Bet,
  InsertBet,
  BetSelection,
  InsertBetSelection,
  UserFavorite,
  InsertFavorite,
  Transaction,
  InsertTransaction,
  UserSession,
  AdminUser,
  InsertAdminUser,
  AdminSession,
  AuditLog,
  InsertAuditLog,
} from "@shared/schema";
import { IStorage } from "./storage";
import * as mappers from "./supabase-storage-mappers";

export class SupabaseStorage implements IStorage {
  private client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database> = supabaseAdmin) {
    this.client = client;
  }

  // Static factory method for user-scoped operations
  static withUser(accessToken: string): SupabaseStorage {
    const { createUserSupabaseClient } = require('./supabase');
    return new SupabaseStorage(createUserSupabaseClient(accessToken));
  }

  // ===================== CRITICAL SETTLEMENT PATH =====================
  
  async getPendingBets(): Promise<Bet[]> {
    const { data, error } = await this.client
      .from('bets')
      .select('*')
      .eq('status', 'pending')
      .order('placed_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get pending bets: ${error.message}`);
    }

    return data?.map(mappers.toBet) || [];
  }

  async getBet(id: string): Promise<Bet | undefined> {
    const { data, error } = await this.client
      .from('bets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined; // Not found
      throw new Error(`Failed to get bet: ${error.message}`);
    }

    return data ? mappers.toBet(data) : undefined;
  }

  async getBetSelections(betId: string): Promise<BetSelection[]> {
    const { data, error } = await this.client
      .from('bet_selections')
      .select('*')
      .eq('bet_id', betId);

    if (error) {
      throw new Error(`Failed to get bet selections: ${error.message}`);
    }

    return data?.map(mappers.toBetSelection) || [];
  }

  async updateSelectionStatus(
    selectionId: string,
    status: string,
    result?: string,
  ): Promise<BetSelection | undefined> {
    const updateData: any = { 
      status, 
      updated_at: new Date().toISOString() 
    };
    if (result !== undefined) {
      updateData.result = result;
    }

    const { data, error } = await this.client
      .from('bet_selections')
      .update(updateData)
      .eq('id', selectionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update selection status: ${error.message}`);
    }

    return data ? mappers.toBetSelection(data) : undefined;
  }

  async updateBetStatus(
    betId: string,
    status: string,
    actualWinningsCents?: number,
  ): Promise<Bet | undefined> {
    const updateData: any = { 
      status, 
      updated_at: new Date().toISOString() 
    };
    
    if (actualWinningsCents !== undefined) {
      updateData.actual_winnings_cents = actualWinningsCents;
      updateData.settled_at = new Date().toISOString();
    }

    const { data, error } = await this.client
      .from('bets')
      .update(updateData)
      .eq('id', betId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update bet status: ${error.message}`);
    }

    return data ? mappers.toBet(data) : undefined;
  }

  async updateUserBalance(
    userId: string,
    newBalanceCents: number,
  ): Promise<User | undefined> {
    const { data, error } = await this.client
      .from('profiles')
      .update({ 
        balance_cents: newBalanceCents,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user balance: ${error.message}`);
    }

    return data ? mappers.toUser(data) : undefined;
  }

  async createTransaction(
    transaction: InsertTransaction & { userId: string },
  ): Promise<Transaction> {
    const insertData: TablesInsert<'transactions'> = {
      user_id: transaction.userId,
      type: transaction.type,
      amount_cents: transaction.amountCents,
      description: transaction.description,
      reference_type: transaction.referenceType,
      reference_id: transaction.referenceId,
      balance_after_cents: transaction.balanceAfterCents,
    };

    const { data, error } = await this.client
      .from('transactions')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create transaction: ${error.message}`);
    }

    return mappers.toTransaction(data);
  }

  async getActiveBetsByMatch(matchId: string): Promise<Bet[]> {
    const { data, error } = await this.client
      .from('bets')
      .select(`
        *,
        bet_selections!inner(*)
      `)
      .eq('bet_selections.fixture_id', matchId)
      .in('status', ['pending', 'accepted']);

    if (error) {
      throw new Error(`Failed to get active bets by match: ${error.message}`);
    }

    return data?.map(mappers.toBet) || [];
  }

  // ===================== USER OPERATIONS =====================

  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined; // Not found
      throw new Error(`Failed to get user: ${error.message}`);
    }

    return data ? mappers.toUser(data) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined; // Not found
      throw new Error(`Failed to get user by username: ${error.message}`);
    }

    return data ? mappers.toUser(data) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined; // Not found
      throw new Error(`Failed to get user by email: ${error.message}`);
    }

    return data ? mappers.toUser(data) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const insertData: TablesInsert<'profiles'> = {
      email: user.email,
      username: user.username,
      first_name: user.firstName,
      last_name: user.lastName,
      phone_number: user.phoneNumber,
      date_of_birth: user.dateOfBirth,
      balance_cents: user.balanceCents || 0,
      currency: user.currency || 'GBP',
      is_verified: user.isVerified || false,
      is_active: user.isActive !== false, // Default to true
      preferred_odds_format: user.preferredOddsFormat || 'decimal',
      marketing_consent: user.marketingConsent || false,
    };

    const { data, error } = await this.client
      .from('profiles')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return mappers.toUser(data);
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<InsertUser>,
  ): Promise<User | undefined> {
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Map camelCase to snake_case
    if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
    if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
    if (updates.phoneNumber !== undefined) updateData.phone_number = updates.phoneNumber;
    if (updates.dateOfBirth !== undefined) updateData.date_of_birth = updates.dateOfBirth;
    if (updates.preferredOddsFormat !== undefined) updateData.preferred_odds_format = updates.preferredOddsFormat;
    if (updates.marketingConsent !== undefined) updateData.marketing_consent = updates.marketingConsent;
    if (updates.isVerified !== undefined) updateData.is_verified = updates.isVerified;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { data, error } = await this.client
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user profile: ${error.message}`);
    }

    return data ? mappers.toUser(data) : undefined;
  }

  // ===================== CRITICAL BET OPERATIONS =====================

  async createBet(bet: InsertBet & { userId: string }): Promise<Bet> {
    const insertData: TablesInsert<'bets'> = {
      user_id: bet.userId,
      bet_type: bet.betType,
      total_stake_cents: bet.totalStakeCents,
      potential_winnings_cents: bet.potentialWinningsCents,
      actual_winnings_cents: bet.actualWinningsCents,
      status: bet.status || 'pending',
      placed_at: bet.placedAt || new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from('bets')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create bet: ${error.message}`);
    }

    return mappers.toBet(data);
  }

  async createBetSelection(selection: InsertBetSelection): Promise<BetSelection> {
    const insertData: TablesInsert<'bet_selections'> = {
      bet_id: selection.betId,
      fixture_id: selection.fixtureId,
      home_team: selection.homeTeam,
      away_team: selection.awayTeam,
      league: selection.league,
      market: selection.market,
      selection: selection.selection,
      odds: selection.odds,
      status: selection.status || 'pending',
      result: selection.result,
    };

    const { data, error } = await this.client
      .from('bet_selections')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create bet selection: ${error.message}`);
    }

    return mappers.toBetSelection(data);
  }

  async getUserBets(userId: string, limit: number = 50): Promise<Bet[]> {
    const { data, error } = await this.client
      .from('bets')
      .select('*')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get user bets: ${error.message}`);
    }

    return data?.map(mappers.toBet) || [];
  }

  async getUserTransactions(userId: string, limit: number = 50): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get user transactions: ${error.message}`);
    }

    return data?.map(mappers.toTransaction) || [];
  }

  // ===================== PLACEHOLDER METHODS (TODO) =====================

  // TODO: Implement atomic bet placement using Postgres function
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
      // TODO: Call app_place_bet Postgres function
      const { data, error } = await this.client.rpc('app_place_bet', {
        p_user_id: params.userId,
        p_bet_type: params.betType,
        p_total_stake_cents: params.totalStakeCents,
        p_selections: params.selections
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // For now, return a placeholder success
      return { 
        success: true, 
        error: "TODO: Implement app_place_bet Postgres function" 
      };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to place bet atomically' 
      };
    }
  }

  // Initialize demo account - create a demo user if it doesn't exist
  async initializeDemoAccount(): Promise<void> {
    try {
      const demoUser = await this.getUserByUsername('demo');
      if (!demoUser) {
        await this.createUser({
          email: 'demo@example.com',
          username: 'demo',
          firstName: 'Demo',
          lastName: 'User',
          balanceCents: 100000, // £1000
          isActive: true,
          isVerified: true,
        });
        console.log("✅ Demo user account created");
      }
    } catch (error: any) {
      console.warn("⚠️ Failed to initialize demo account:", error.message);
    }
  }

  // ===================== STUB METHODS =====================
  // These methods need to be implemented for full IStorage compatibility
  // For now, they return empty results or throw "not implemented" errors

  async addFavorite(favorite: InsertFavorite & { userId: string }): Promise<UserFavorite> {
    throw new Error("addFavorite not implemented yet");
  }

  async removeFavorite(userId: string, entityId: string): Promise<boolean> {
    throw new Error("removeFavorite not implemented yet");
  }

  async getUserFavorites(userId: string): Promise<UserFavorite[]> {
    return [];
  }

  async createSession(userId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<UserSession> {
    throw new Error("createSession not implemented - use Supabase Auth instead");
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    throw new Error("getSession not implemented - use Supabase Auth instead");
  }

  async deleteSession(sessionToken: string): Promise<boolean> {
    throw new Error("deleteSession not implemented - use Supabase Auth instead");
  }

  // Admin operations stubs
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    throw new Error("getAdminUser not implemented yet");
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    throw new Error("getAdminUserByUsername not implemented yet");
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    throw new Error("getAdminUserByEmail not implemented yet");
  }

  async createAdminUser(admin: InsertAdminUser): Promise<AdminUser> {
    throw new Error("createAdminUser not implemented yet");
  }

  async updateAdminUser(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    throw new Error("updateAdminUser not implemented yet");
  }

  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> {
    throw new Error("updateAdminLoginAttempts not implemented yet");
  }

  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    throw new Error("createAdminSession not implemented yet");
  }

  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> {
    throw new Error("getAdminSession not implemented yet");
  }

  async updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined> {
    throw new Error("updateAdminSession not implemented yet");
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    throw new Error("deleteAdminSession not implemented yet");
  }

  async deleteAllAdminSessions(adminId: string): Promise<boolean> {
    throw new Error("deleteAllAdminSessions not implemented yet");
  }

  async createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog> {
    throw new Error("createAuditLog not implemented yet");
  }

  async getAuditLogs(limit?: number, offset?: number): Promise<AuditLog[]> {
    throw new Error("getAuditLogs not implemented yet");
  }

  async enableAdmin2FA(adminId: string, totpSecret: string): Promise<AdminUser | undefined> {
    throw new Error("enableAdmin2FA not implemented yet");
  }

  async disableAdmin2FA(adminId: string): Promise<AdminUser | undefined> {
    throw new Error("disableAdmin2FA not implemented yet");
  }

  async getAdminUsers(limit?: number, offset?: number): Promise<AdminUser[]> {
    throw new Error("getAdminUsers not implemented yet");
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    throw new Error("getAdminsByRole not implemented yet");
  }

  async updateAdminRole(adminId: string, newRole: string, updatedBy: string): Promise<{ success: boolean; admin?: AdminUser; auditLog?: AuditLog; error?: string; }> {
    throw new Error("updateAdminRole not implemented yet");
  }

  async searchAdminUsers(params: { query?: string; role?: string; isActive?: boolean; limit?: number; offset?: number; }): Promise<{ users: AdminUser[]; total: number; }> {
    throw new Error("searchAdminUsers not implemented yet");
  }

  async getAllBets(params?: any): Promise<{ bets: any[]; total: number; }> {
    throw new Error("getAllBets not implemented yet");
  }

  async forceBetSettlement(betId: string, outcome: "win" | "lose" | "void", payoutCents: number): Promise<{ success: boolean; bet?: Bet; error?: string; }> {
    throw new Error("forceBetSettlement not implemented yet");
  }

  async refundBet(betId: string): Promise<{ success: boolean; bet?: Bet; error?: string; }> {
    throw new Error("refundBet not implemented yet");
  }

  async exportBetsToCSV(params?: any): Promise<string> {
    throw new Error("exportBetsToCSV not implemented yet");
  }

  async getActiveAdminSessions(): Promise<AdminSession[]> {
    throw new Error("getActiveAdminSessions not implemented yet");
  }

  // All other stub methods with minimal implementations
  async getMatchesByTeamsAndTime(): Promise<any[]> { return []; }
  async createMatch(): Promise<any> { throw new Error("createMatch not implemented yet"); }
  async getMatch(): Promise<any> { return null; }
  async updateMatch(): Promise<any> { throw new Error("updateMatch not implemented yet"); }
  async softDeleteMatch(): Promise<void> { throw new Error("softDeleteMatch not implemented yet"); }
  async createMarket(): Promise<any> { throw new Error("createMarket not implemented yet"); }
  async updateMarket(): Promise<any> { throw new Error("updateMarket not implemented yet"); }
  async getMatchExposure(): Promise<any> { return null; }
  async getMarketExposure(): Promise<any> { return null; }
  async getOverallExposure(): Promise<any> { return null; }
  async getPromotions(): Promise<any> { return []; }
  async getPromotionByCode(): Promise<any> { return null; }
  async createPromotion(): Promise<any> { throw new Error("createPromotion not implemented yet"); }
  async updatePromotion(): Promise<any> { throw new Error("updatePromotion not implemented yet"); }
  async getDailyFinancialReport(): Promise<any> { return null; }
  async getMonthlyFinancialReport(): Promise<any> { return null; }
  async getPlayerActivityReport(): Promise<any> { return null; }
  async exportFinancialData(): Promise<any> { return null; }
  async getScheduledManualMatches(): Promise<any[]> { return []; }
  async getMatchWithEvents(): Promise<any> { return { match: null, events: [] }; }
}