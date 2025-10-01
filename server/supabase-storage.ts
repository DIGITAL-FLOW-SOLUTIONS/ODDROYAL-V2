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
      updateData.actual_winnings = actualWinningsCents;
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
      .from('users')
      .update({ 
        balance: newBalanceCents,
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
      amount: transaction.amount,
      balance_before: transaction.balanceBefore,
      balance_after: transaction.balanceAfter,
      reference: transaction.reference,
      description: transaction.description,
      status: transaction.status || 'completed'
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
      .from('users')
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
      .from('users')
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
      .from('users')
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
    const insertData: TablesInsert<'users'> = {
      email: user.email,
      username: user.username,
      first_name: user.firstName,
      last_name: user.lastName,
      balance: user.balanceCents || 0,
      is_active: user.isActive !== false, // Default to true
    };

    const { data, error } = await this.client
      .from('users')
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
      .from('users')
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
      type: bet.type,
      total_stake: bet.totalStake,
      potential_winnings: bet.potentialWinnings,
      total_odds: bet.totalOdds,
      actual_winnings: bet.actualWinnings,
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
      market_id: selection.marketId,
      outcome_id: selection.outcomeId,
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

  // Atomic bet placement using individual operations
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
      // Get user and validate balance
      const user = await this.getUser(params.userId);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (user.balance < params.totalStakeCents) {
        return { success: false, error: "Insufficient balance" };
      }

      // Calculate total odds and potential winnings
      const totalOdds = params.selections.reduce(
        (acc, selection) => acc * parseFloat(selection.odds),
        1,
      );

      if (totalOdds < 1.01 || totalOdds > 10000) {
        return { success: false, error: "Invalid total odds" };
      }

      const potentialWinningsCents = Math.round(
        params.totalStakeCents * totalOdds,
      );

      // Validate bet type vs selection count
      if (params.betType === "single" && params.selections.length !== 1) {
        return { success: false, error: "Single bets must have exactly 1 selection" };
      }
      if ((params.betType === "express" || params.betType === "system") && params.selections.length < 2) {
        return { success: false, error: "Express/System bets must have at least 2 selections" };
      }

      // Validate stake amount
      if (params.totalStakeCents < 100) { // Minimum £1
        return { success: false, error: "Minimum stake is £1.00" };
      }
      if (params.totalStakeCents > 10000000) { // Maximum £100,000
        return { success: false, error: "Maximum stake is £100,000.00" };
      }

      // Create bet record with correct field names
      const bet = await this.createBet({
        userId: params.userId,
        betType: params.betType,
        totalStakeCents: params.totalStakeCents,
        potentialWinningsCents: potentialWinningsCents,
        actualWinningsCents: 0,
        status: "pending",
        placedAt: new Date().toISOString(),
      });

      // Create bet selections
      const selections: BetSelection[] = [];
      for (const selectionData of params.selections) {
        const selection = await this.createBetSelection({
          betId: bet.id,
          fixtureId: selectionData.fixtureId,
          homeTeam: selectionData.homeTeam,
          awayTeam: selectionData.awayTeam,
          league: selectionData.league,
          marketId: "placeholder-market-id", // TODO: Implement proper market lookup
          outcomeId: "placeholder-outcome-id", // TODO: Implement proper outcome lookup
          market: selectionData.market,
          selection: selectionData.selection,
          odds: selectionData.odds,
        });
        selections.push(selection);
      }

      // Atomic balance update with balance check (prevents double-spend)
      const { data: balanceUpdate, error: balanceError } = await this.client
        .from('users')
        .update({ 
          balance: user.balance - params.totalStakeCents,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.userId)
        .eq('balance', user.balance) // Only update if balance hasn't changed
        .select()
        .single();

      if (balanceError || !balanceUpdate) {
        // TODO: Rollback bet and selections
        return { success: false, error: "Failed to update balance - insufficient funds or concurrent transaction" };
      }

      const updatedUser = mappers.toUser(balanceUpdate);

      if (!updatedUser) {
        // TODO: Rollback bet and selections if balance update fails
        return { success: false, error: "Failed to update user balance" };
      }

      // Create transaction record
      const transaction = await this.createTransaction({
        userId: params.userId,
        type: "bet_stake",
        amount: -params.totalStakeCents,
        balanceBefore: user.balance,
        balanceAfter: newBalanceCents,
        reference: bet.id,
        description: `Bet placed: ${bet.type} bet with ${selections.length} selection(s)`,
      });

      return {
        success: true,
        bet,
        selections,
        user: updatedUser,
        transaction,
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
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return undefined;
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email,
        passwordHash: data.password_hash,
        role: data.role,
        totpSecret: data.totp_secret,
        isActive: data.is_active,
        lastLogin: data.last_login,
        loginAttempts: data.login_attempts,
        lockedUntil: data.locked_until,
        ipWhitelist: data.ip_whitelist,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by
      };
    } catch (error) {
      console.error('Error fetching admin user by id:', error);
      return undefined;
    }
  }

  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        return undefined;
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role,
        totpSecret: data.totp_secret,
        isActive: data.is_active,
        lastLogin: data.last_login,
        loginAttempts: data.login_attempts,
        lockedUntil: data.locked_until,
        ipWhitelist: data.ip_whitelist,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by,
        passwordHash: data.password_hash // Include password hash for authentication
      } as AdminUser & { passwordHash?: string };
    } catch (error) {
      console.error('Error fetching admin user by username:', error);
      return undefined;
    }
  }

  // Alias for rate limiting middleware compatibility
  async getAdminByUsername(username: string): Promise<AdminUser | undefined> {
    return this.getAdminUserByUsername(username);
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | undefined> {
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !data) {
        return undefined;
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role,
        totpSecret: data.totp_secret,
        isActive: data.is_active,
        lastLogin: data.last_login,
        loginAttempts: data.login_attempts,
        lockedUntil: data.locked_until,
        ipWhitelist: data.ip_whitelist,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by,
        passwordHash: data.password_hash
      } as AdminUser & { passwordHash?: string };
    } catch (error) {
      console.error('Error fetching admin user by email:', error);
      return undefined;
    }
  }

  async createAdminUser(admin: InsertAdminUser & { passwordHash?: string }): Promise<AdminUser> {
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .insert({
          username: admin.username,
          email: admin.email,
          role: admin.role,
          password_hash: admin.passwordHash,
          totp_secret: admin.totpSecret,
          is_active: admin.isActive ?? true,
          ip_whitelist: admin.ipWhitelist,
          created_by: admin.createdBy,
          login_attempts: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create admin user: ${error.message}`);
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email,
        role: data.role,
        totpSecret: data.totp_secret,
        isActive: data.is_active,
        lastLogin: data.last_login,
        loginAttempts: data.login_attempts,
        lockedUntil: data.locked_until,
        ipWhitelist: data.ip_whitelist,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by
      };
    } catch (error) {
      console.error('Error creating admin user:', error);
      throw error;
    }
  }

  async updateAdminUser(adminId: string, updates: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.username) updateData.username = updates.username;
      if (updates.email) updateData.email = updates.email;
      if (updates.passwordHash) updateData.password_hash = updates.passwordHash;
      if (updates.role) updateData.role = updates.role;
      if (updates.totpSecret !== undefined) updateData.totp_secret = updates.totpSecret;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
      if (updates.ipWhitelist) updateData.ip_whitelist = updates.ipWhitelist;
      if (updates.createdBy !== undefined) updateData.created_by = updates.createdBy;
      
      if ('lastLogin' in updates) {
        updateData.last_login = updates.lastLogin || null;
      }

      const { data, error } = await this.client
        .from('admin_users')
        .update(updateData)
        .eq('id', adminId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating admin user:', error);
        return undefined;
      }

      if (!data) {
        return undefined;
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email,
        passwordHash: data.password_hash,
        role: data.role,
        totpSecret: data.totp_secret,
        isActive: data.is_active,
        lastLogin: data.last_login,
        loginAttempts: data.login_attempts,
        lockedUntil: data.locked_until,
        ipWhitelist: data.ip_whitelist,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        createdBy: data.created_by
      };
    } catch (error) {
      console.error('Error updating admin user:', error);
      return undefined;
    }
  }

  async updateAdminLoginAttempts(adminId: string, attempts: number, lockedUntil?: Date): Promise<AdminUser | undefined> {
    try {
      const updateData: any = {
        login_attempts: attempts,
        updated_at: new Date().toISOString()
      };

      if (lockedUntil !== undefined) {
        updateData.locked_until = lockedUntil?.toISOString() || null;
      }

      const { data, error } = await this.client
        .from('admin_users')
        .update(updateData)
        .eq('id', adminId)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update admin login attempts: ${error.message}`);
      }

      return mappers.toAdminUser(data);
    } catch (error) {
      console.error('Error updating admin login attempts:', error);
      throw error;
    }
  }

  async createAdminSession(adminId: string, sessionToken: string, expiresAt: Date, ipAddress?: string, userAgent?: string): Promise<AdminSession> {
    try {
      const { data, error } = await this.client
        .from('admin_sessions')
        .insert({
          admin_id: adminId,
          session_token: sessionToken,
          ip_address: ipAddress,
          user_agent: userAgent,
          two_factor_verified: false,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to create admin session: ${error.message}`);
      }

      return {
        id: data.id,
        adminId: data.admin_id,
        sessionToken: data.session_token,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        twoFactorVerified: data.two_factor_verified,
        expiresAt: data.expires_at,
        createdAt: data.created_at
      };
    } catch (error) {
      console.error('Error creating admin session:', error);
      throw error;
    }
  }

  async getAdminSession(sessionToken: string): Promise<AdminSession | undefined> {
    try {
      const { data, error } = await this.client
        .from('admin_sessions')
        .select('*')
        .eq('session_token', sessionToken)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return undefined; // Not found
        throw new Error(`Failed to get admin session: ${error.message}`);
      }

      if (!data) return undefined;

      // Check if session has expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < now) {
        // Session expired, delete it instead of deactivating
        await this.client
          .from('admin_sessions')
          .delete()
          .eq('id', data.id);
        return undefined;
      }

      return {
        id: data.id,
        adminId: data.admin_id,
        sessionToken: data.session_token,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        twoFactorVerified: data.two_factor_verified,
        expiresAt: data.expires_at,
        createdAt: data.created_at
      };
    } catch (error) {
      console.error('Error getting admin session:', error);
      throw error;
    }
  }

  async updateAdminSession(sessionId: string, updates: Partial<AdminSession>): Promise<AdminSession | undefined> {
    try {
      const updateData: any = {};
      
      if (updates.twoFactorVerified !== undefined) {
        updateData.two_factor_verified = updates.twoFactorVerified;
      }
      if (updates.expiresAt !== undefined) {
        updateData.expires_at = updates.expiresAt;
      }

      const { data, error } = await this.client
        .from('admin_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update admin session: ${error.message}`);
      }

      return {
        id: data.id,
        adminId: data.admin_id,
        sessionToken: data.session_token,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        twoFactorVerified: data.two_factor_verified,
        expiresAt: data.expires_at,
        createdAt: data.created_at
      };
    } catch (error) {
      console.error('Error updating admin session:', error);
      throw error;
    }
  }

  async deleteAdminSession(sessionToken: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('admin_sessions')
        .delete()
        .eq('session_token', sessionToken);

      if (error) {
        console.error('Error deleting admin session:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting admin session:', error);
      return false;
    }
  }

  async deleteAllAdminSessions(adminId: string): Promise<boolean> {
    throw new Error("deleteAllAdminSessions not implemented yet");
  }

  async createAuditLog(auditLog: InsertAuditLog): Promise<AuditLog> {
    try {
      const { data, error } = await this.client
        .from('audit_logs')
        .insert({
          admin_id: auditLog.adminId,
          action_type: auditLog.actionType,
          target_type: auditLog.targetType,
          target_id: auditLog.targetId,
          data_before: auditLog.dataBefore,
          data_after: auditLog.dataAfter,
          ip_address: auditLog.ipAddress,
          user_agent: auditLog.userAgent,
          note: auditLog.note,
          success: auditLog.success ?? true,
          error_message: auditLog.errorMessage,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create audit log: ${error.message}`);
      }

      return {
        id: data.id,
        adminId: data.admin_id,
        actionType: data.action_type,
        targetType: data.target_type,
        targetId: data.target_id,
        dataBefore: data.data_before,
        dataAfter: data.data_after,
        ipAddress: data.ip_address,
        userAgent: data.user_agent,
        note: data.note,
        success: data.success,
        errorMessage: data.error_message,
        createdAt: data.created_at
      };
    } catch (error) {
      console.error('Error creating audit log:', error);
      throw error;
    }
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

  async getAdminUsers(limit: number = 50, offset: number = 0): Promise<AdminUser[]> {
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to get admin users: ${error.message}`);
      }

      return (data || []).map(admin => ({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        passwordHash: admin.password_hash,
        role: admin.role,
        totpSecret: admin.totp_secret,
        isActive: admin.is_active,
        lastLogin: admin.last_login,
        loginAttempts: admin.login_attempts,
        lockedUntil: admin.locked_until,
        ipWhitelist: admin.ip_whitelist,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at,
        createdBy: admin.created_by
      }));
    } catch (error) {
      console.error('Error fetching admin users:', error);
      throw error;
    }
  }

  async getAdminsByRole(role: string): Promise<AdminUser[]> {
    try {
      const { data, error } = await this.client
        .from('admin_users')
        .select('*')
        .eq('role', role);

      if (error) {
        throw new Error(`Failed to get admins by role: ${error.message}`);
      }

      return (data || []).map(admin => ({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        totpSecret: admin.totp_secret,
        isActive: admin.is_active,
        lastLogin: admin.last_login,
        loginAttempts: admin.login_attempts,
        lockedUntil: admin.locked_until,
        ipWhitelist: admin.ip_whitelist,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at,
        createdBy: admin.created_by
      }));
    } catch (error) {
      console.error('Error fetching admins by role:', error);
      throw error;
    }
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