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
    status: 'won' | 'lost' | 'void',
    result: string
  ): Promise<BetSelection | undefined> {
    const updateData: any = { 
      status,
      result,
      updated_at: new Date().toISOString() 
    };

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
    status: 'won' | 'lost' | 'void',
    actualWinnings: number
  ): Promise<Bet | undefined> {
    const updateData: any = { 
      status,
      actual_winnings: actualWinnings,
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    };

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
    amountToAdd: number,
  ): Promise<User | undefined> {
    // First get the current balance
    const { data: userData, error: fetchError } = await this.client
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch user balance: ${fetchError.message}`);
    }

    const currentBalance = userData.balance || 0;
    const newBalance = currentBalance + amountToAdd;

    if (newBalance < 0) {
      throw new Error("Insufficient balance");
    }

    // Update with the new balance
    const { data, error } = await this.client
      .from('users')
      .update({ 
        balance: newBalance,
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
      .in('status', ['pending']);

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

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }

    return data?.map(mappers.toUser) || [];
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

  async getAllTransactions(): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get all transactions: ${error.message}`);
    }

    return data?.map(mappers.toTransaction) || [];
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const updateData: any = {};
    
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.description !== undefined) updateData.description = updates.description;

    const { data, error } = await this.client
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Failed to update transaction: ${error.message}`);
    }

    return data ? mappers.toTransaction(data) : undefined;
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

  async getAuditLogs(limit: number = 50, offset: number = 0): Promise<AuditLog[]> {
    try {
      const { data, error } = await this.client
        .from('audit_logs')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to get audit logs: ${error.message}`);
      }

      return (data || []).map(log => ({
        id: log.id,
        adminId: log.admin_id,
        actionType: log.action_type,
        targetType: log.target_type,
        targetId: log.target_id,
        dataBefore: log.data_before,
        dataAfter: log.data_after,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        note: log.note,
        success: log.success,
        errorMessage: log.error_message,
        createdAt: log.created_at
      }));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
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
  }): Promise<{ bets: any[]; total: number; }> {
    let query = this.client
      .from('bets')
      .select('*, bet_selections(*), users(username, email)', { count: 'exact' });

    // Apply filters
    if (params?.status) {
      query = query.eq('status', params.status);
    }
    if (params?.betType) {
      query = query.eq('type', params.betType);
    }
    if (params?.userId) {
      query = query.eq('user_id', params.userId);
    }
    if (params?.dateFrom) {
      query = query.gte('placed_at', params.dateFrom.toISOString());
    }
    if (params?.dateTo) {
      query = query.lte('placed_at', params.dateTo.toISOString());
    }
    if (params?.minStake) {
      query = query.gte('total_stake', params.minStake);
    }
    if (params?.maxStake) {
      query = query.lte('total_stake', params.maxStake);
    }

    // Search across user data and bet ID
    if (params?.search) {
      // For search, we'll need to filter on the client side since Supabase doesn't support OR across joined tables easily
    }

    // Pagination
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    // Order by most recent
    query = query.order('placed_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get all bets: ${error.message}`);
    }

    const bets = data?.map((bet: any) => {
      const mapped = mappers.toBet(bet);
      return {
        id: mapped.id,
        userId: mapped.userId,
        username: bet.users?.username || '',
        userEmail: bet.users?.email || '',
        betType: mapped.type,
        totalStakeCents: mapped.totalStake,
        potentialWinCents: mapped.potentialWinnings,
        actualWinCents: mapped.actualWinnings,
        status: mapped.status,
        placedAt: mapped.placedAt,
        settledAt: mapped.settledAt,
        selectionsCount: bet.bet_selections?.length || 0,
        selections: bet.bet_selections?.map(mappers.toBetSelection) || [],
        totalOdds: mapped.totalOdds,
        ipAddress: bet.ip_address
      };
    }) || [];

    return { 
      bets, 
      total: count || 0 
    };
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
    const now = new Date().toISOString();
    
    const { data, error } = await this.client
      .from('admin_sessions')
      .select('*, admin_users(username, email, role)')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get active admin sessions: ${error.message}`);
    }

    return data?.map((session: any) => ({
      id: session.id,
      adminId: session.admin_id,
      sessionToken: session.session_token,
      expiresAt: new Date(session.expires_at),
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      lastActivity: session.last_activity ? new Date(session.last_activity) : undefined,
      createdAt: new Date(session.created_at),
      admin: session.admin_users ? {
        username: session.admin_users.username,
        email: session.admin_users.email,
        role: session.admin_users.role
      } : undefined
    } as AdminSession & { admin?: any })) || [];
  }

  async getAllMatches(params?: {
    search?: string;
    sport?: string;
    league?: string;
    status?: string;
    source?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ matches: any[]; total: number }> {
    try {
      let query = this.client
        .from('matches')
        .select('*, markets(*, market_outcomes(*))', { count: 'exact' });

      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.sport) {
        query = query.eq('sport', params.sport);
      }
      if (params?.league) {
        query = query.eq('league_id', params.league);
      }
      if (params?.source === 'manual') {
        query = query.eq('is_manual', true);
      } else if (params?.source === 'sportmonks') {
        query = query.eq('is_manual', false);
      }
      if (params?.dateFrom) {
        query = query.gte('kickoff_time', params.dateFrom.toISOString());
      }
      if (params?.dateTo) {
        query = query.lte('kickoff_time', params.dateTo.toISOString());
      }
      if (params?.search) {
        query = query.or(`home_team_name.ilike.%${params.search}%,away_team_name.ilike.%${params.search}%,league_name.ilike.%${params.search}%`);
      }

      const limit = params?.limit || 50;
      const offset = params?.offset || 0;
      query = query.range(offset, offset + limit - 1);
      query = query.order('kickoff_time', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get matches: ${error.message}`);
      }

      const matches = data?.map((match: any) => {
        // Process markets and outcomes
        const markets = match.markets?.map((market: any) => ({
          id: market.id,
          matchId: market.match_id,
          key: market.key,
          name: market.name,
          type: market.type,
          parameter: market.parameter,
          status: market.status,
          outcomes: market.market_outcomes?.map((outcome: any) => ({
            id: outcome.id,
            marketId: outcome.market_id,
            key: outcome.key,
            label: outcome.label,
            odds: outcome.odds,
            status: outcome.status,
            displayOrder: outcome.display_order
          })) || []
        })) || [];

        // Find the 1x2 market for quick access to main odds
        const h2hMarket = markets.find(m => m.type === '1x2' || m.key === '1x2' || m.key.includes('h2h'));
        let mainOdds = null;
        
        if (h2hMarket && h2hMarket.outcomes) {
          const sortedOutcomes = [...h2hMarket.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
          mainOdds = {
            home: sortedOutcomes.find(o => o.key === '1' || o.key === 'home')?.odds || '0.00',
            draw: sortedOutcomes.find(o => o.key === 'x' || o.key === 'draw')?.odds || '0.00',
            away: sortedOutcomes.find(o => o.key === '2' || o.key === 'away')?.odds || '0.00'
          };
        }

        return {
          id: match.id,
          externalId: match.external_id,
          externalSource: match.external_source,
          sport: match.sport,
          sportId: match.sport_id,
          sportName: match.sport_name,
          leagueId: match.league_id,
          leagueName: match.league_name,
          homeTeamId: match.home_team_id,
          homeTeamName: match.home_team_name,
          awayTeamId: match.away_team_id,
          awayTeamName: match.away_team_name,
          kickoffTime: match.kickoff_time,
          status: match.status,
          homeScore: match.home_score,
          awayScore: match.away_score,
          isManual: match.is_manual,
          createdBy: match.created_by,
          updatedBy: match.updated_by,
          createdAt: match.created_at,
          updatedAt: match.updated_at,
          marketsCount: markets.length,
          totalExposure: 0,
          markets: markets,
          mainOdds: mainOdds
        };
      }) || [];

      return { matches, total: count || 0 };
    } catch (error: any) {
      console.error('Error getting matches:', error);
      return { matches: [], total: 0 };
    }
  }

  async getMatchesByTeamsAndTime(homeTeamId: string, awayTeamId: string, kickoffTime: Date): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('home_team_id', homeTeamId)
        .eq('away_team_id', awayTeamId)
        .eq('kickoff_time', kickoffTime.toISOString());

      if (error) {
        throw new Error(`Failed to get matches by teams and time: ${error.message}`);
      }

      return data?.map((match: any) => ({
        id: match.id,
        externalId: match.external_id,
        externalSource: match.external_source,
        sport: match.sport,
        leagueId: match.league_id,
        leagueName: match.league_name,
        homeTeamId: match.home_team_id,
        homeTeamName: match.home_team_name,
        awayTeamId: match.away_team_id,
        awayTeamName: match.away_team_name,
        kickoffTime: match.kickoff_time,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        isManual: match.is_manual
      })) || [];
    } catch (error: any) {
      console.error('Error getting matches by teams and time:', error);
      return [];
    }
  }

  async createMatch(matchData: any): Promise<any> {
    try {
      const insertData: any = {
        external_id: matchData.externalId,
        external_source: matchData.externalSource,
        sport: matchData.sport || 'football',
        sport_id: matchData.sportId,
        sport_name: matchData.sportName,
        league_id: matchData.leagueId,
        league_name: matchData.leagueName,
        home_team_id: matchData.homeTeamId,
        home_team_name: matchData.homeTeamName,
        away_team_id: matchData.awayTeamId,
        away_team_name: matchData.awayTeamName,
        kickoff_time: matchData.kickoffTime,
        status: matchData.status || 'scheduled',
        home_score: matchData.homeScore,
        away_score: matchData.awayScore,
        is_manual: matchData.isManual || false,
        created_by: matchData.adminId,
        updated_by: matchData.adminId
      };

      const { data, error } = await this.client
        .from('matches')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create match: ${error.message}`);
      }

      return {
        id: data.id,
        externalId: data.external_id,
        externalSource: data.external_source,
        sport: data.sport,
        sportId: data.sport_id,
        sportName: data.sport_name,
        leagueId: data.league_id,
        leagueName: data.league_name,
        homeTeamId: data.home_team_id,
        homeTeamName: data.home_team_name,
        awayTeamId: data.away_team_id,
        awayTeamName: data.away_team_name,
        kickoffTime: data.kickoff_time,
        status: data.status,
        homeScore: data.home_score,
        awayScore: data.away_score,
        isManual: data.is_manual,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error creating match:', error);
      throw error;
    }
  }

  async getMatch(id: string): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Failed to get match: ${error.message}`);
      }

      return {
        id: data.id,
        externalId: data.external_id,
        externalSource: data.external_source,
        sport: data.sport,
        sportId: data.sport_id,
        sportName: data.sport_name,
        leagueId: data.league_id,
        leagueName: data.league_name,
        homeTeamId: data.home_team_id,
        homeTeamName: data.home_team_name,
        awayTeamId: data.away_team_id,
        awayTeamName: data.away_team_name,
        kickoffTime: data.kickoff_time,
        status: data.status,
        homeScore: data.home_score,
        awayScore: data.away_score,
        isManual: data.is_manual,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error getting match:', error);
      return null;
    }
  }

  async updateMatch(id: string, updates: any): Promise<any> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.homeScore !== undefined) updateData.home_score = updates.homeScore;
      if (updates.awayScore !== undefined) updateData.away_score = updates.awayScore;
      if (updates.kickoffTime !== undefined) updateData.kickoff_time = updates.kickoffTime;
      if (updates.adminId !== undefined) updateData.updated_by = updates.adminId;

      const { data, error } = await this.client
        .from('matches')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update match: ${error.message}`);
      }

      return {
        id: data.id,
        externalId: data.external_id,
        externalSource: data.external_source,
        sport: data.sport,
        leagueId: data.league_id,
        leagueName: data.league_name,
        homeTeamId: data.home_team_id,
        homeTeamName: data.home_team_name,
        awayTeamId: data.away_team_id,
        awayTeamName: data.away_team_name,
        kickoffTime: data.kickoff_time,
        status: data.status,
        homeScore: data.home_score,
        awayScore: data.away_score,
        isManual: data.is_manual,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error updating match:', error);
      throw error;
    }
  }

  async softDeleteMatch(id: string, adminId: string): Promise<void> {
    try {
      // Note: This assumes database has CASCADE DELETE configured on foreign keys.
      // If CASCADE is properly set up, deleting the match will automatically delete:
      // - All markets (via match_id foreign key)
      // - All market_outcomes (via market_id foreign key from markets)
      // - All match_events (via match_id foreign key)
      
      // If CASCADE DELETE is NOT configured, we need to manually delete in order:
      // First, get all markets to delete their outcomes
      const { data: markets } = await this.client
        .from('markets')
        .select('id')
        .eq('match_id', id);
      
      if (markets && markets.length > 0) {
        // Delete all market outcomes for these markets
        for (const market of markets) {
          const { error: outcomesError } = await this.client
            .from('market_outcomes')
            .delete()
            .eq('market_id', market.id);
          
          if (outcomesError) {
            throw new Error(`Failed to delete outcomes for market ${market.id}: ${outcomesError.message}`);
          }
        }
        
        // Delete all markets for this match
        const { error: marketsError } = await this.client
          .from('markets')
          .delete()
          .eq('match_id', id);
        
        if (marketsError) {
          throw new Error(`Failed to delete markets: ${marketsError.message}`);
        }
      }
      
      // Delete all match events for this match
      const { error: eventsError } = await this.client
        .from('match_events')
        .delete()
        .eq('match_id', id);
      
      if (eventsError) {
        throw new Error(`Failed to delete match events: ${eventsError.message}`);
      }
      
      // Finally, delete the match itself
      const { error: matchError } = await this.client
        .from('matches')
        .delete()
        .eq('id', id);
      
      if (matchError) {
        throw new Error(`Failed to delete match: ${matchError.message}`);
      }
    } catch (error: any) {
      console.error('Error deleting match:', error);
      throw error;
    }
  }

  async getUpcomingManualMatches(limit: number = 50): Promise<any[]> {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await this.client
        .from('matches')
        .select('*, markets(*, market_outcomes(*))')
        .eq('is_manual', true)
        .eq('status', 'scheduled')
        .gte('kickoff_time', now)
        .order('kickoff_time', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching upcoming manual matches:', error);
        return [];
      }

      return data?.map((match: any) => ({
        id: match.id,
        externalId: match.external_id,
        externalSource: match.external_source || 'manual',
        sport: match.sport,
        sportId: match.sport_id,
        sportName: match.sport_name,
        leagueId: match.league_id,
        leagueName: match.league_name,
        homeTeamId: match.home_team_id,
        homeTeamName: match.home_team_name,
        awayTeamId: match.away_team_id,
        awayTeamName: match.away_team_name,
        kickoffTime: match.kickoff_time,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        isManual: match.is_manual,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
        markets: match.markets || []
      })) || [];
    } catch (error: any) {
      console.error('Error getting upcoming manual matches:', error);
      return [];
    }
  }

  async getLiveManualMatches(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*, markets(*, market_outcomes(*))')
        .eq('is_manual', true)
        .eq('status', 'live')
        .order('kickoff_time', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching live manual matches:', error);
        return [];
      }

      return data?.map((match: any) => ({
        id: match.id,
        externalId: match.external_id,
        externalSource: match.external_source || 'manual',
        sport: match.sport,
        sportId: match.sport_id,
        sportName: match.sport_name,
        leagueId: match.league_id,
        leagueName: match.league_name,
        homeTeamId: match.home_team_id,
        homeTeamName: match.home_team_name,
        awayTeamId: match.away_team_id,
        awayTeamName: match.away_team_name,
        kickoffTime: match.kickoff_time,
        status: match.status,
        homeScore: match.home_score || 0,
        awayScore: match.away_score || 0,
        isManual: match.is_manual,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
        markets: match.markets || []
      })) || [];
    } catch (error: any) {
      console.error('Error getting live manual matches:', error);
      return [];
    }
  }

  async getMatchMarkets(matchId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('markets')
        .select('*, market_outcomes(*)')
        .eq('match_id', matchId)
        .order('display_order', { ascending: true });

      if (error) {
        throw new Error(`Failed to get match markets: ${error.message}`);
      }

      return data?.map((market: any) => ({
        id: market.id,
        matchId: market.match_id,
        key: market.key,
        name: market.name,
        type: market.type,
        parameter: market.parameter,
        status: market.status,
        displayOrder: market.display_order,
        createdAt: market.created_at,
        updatedAt: market.updated_at,
        outcomes: market.market_outcomes?.map((outcome: any) => ({
          id: outcome.id,
          marketId: outcome.market_id,
          key: outcome.key,
          label: outcome.label,
          odds: outcome.odds,
          status: outcome.status,
          liabilityLimitCents: outcome.liability_limit_cents,
          displayOrder: outcome.display_order,
          createdAt: outcome.created_at,
          updatedAt: outcome.updated_at
        })) || []
      })) || [];
    } catch (error: any) {
      console.error('Error getting match markets:', error);
      return [];
    }
  }

  async createMarket(marketData: any): Promise<any> {
    try {
      const insertData: any = {
        match_id: marketData.matchId,
        key: marketData.key,
        name: marketData.name,
        type: marketData.type,
        parameter: marketData.parameter,
        status: marketData.status || 'open',
        min_stake_cents: marketData.minStakeCents,
        max_stake_cents: marketData.maxStakeCents,
        max_liability_cents: marketData.maxLiabilityCents,
        display_order: marketData.displayOrder || 0,
        is_published: marketData.isPublished !== false,
        created_by: marketData.createdBy,
        updated_by: marketData.updatedBy
      };

      const { data, error } = await this.client
        .from('markets')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create market: ${error.message}`);
      }

      return {
        id: data.id,
        matchId: data.match_id,
        key: data.key,
        name: data.name,
        type: data.type,
        parameter: data.parameter,
        status: data.status,
        minStakeCents: data.min_stake_cents,
        maxStakeCents: data.max_stake_cents,
        maxLiabilityCents: data.max_liability_cents,
        displayOrder: data.display_order,
        isPublished: data.is_published,
        createdBy: data.created_by,
        updatedBy: data.updated_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error creating market:', error);
      throw error;
    }
  }

  async createMarketWithOutcomes(marketData: any): Promise<any> {
    try {
      console.log('🏗️ Creating market with data:', {
        matchId: marketData.matchId,
        key: marketData.key,
        name: marketData.name,
        type: marketData.type,
        parameter: marketData.parameter,
        outcomesCount: marketData.outcomes?.length
      });
      
      const market = await this.createMarket(marketData);
      console.log('✅ Market created:', market.id);
      
      if (marketData.outcomes && marketData.outcomes.length > 0) {
        const outcomes = [];
        console.log(`📊 Creating ${marketData.outcomes.length} outcomes...`);
        
        for (let i = 0; i < marketData.outcomes.length; i++) {
          const outcomeData = marketData.outcomes[i];
          
          console.log(`  ➡️ Processing outcome ${i + 1}/${marketData.outcomes.length}:`, {
            key: outcomeData.key,
            label: outcomeData.label,
            odds: outcomeData.odds,
            defaultOdds: outcomeData.defaultOdds,
            resolvedOdds: outcomeData.odds || outcomeData.defaultOdds
          });
          
          const outcome = await this.createMarketOutcome({
            marketId: market.id,
            key: outcomeData.key,
            label: outcomeData.label,
            odds: outcomeData.odds || outcomeData.defaultOdds,
            status: outcomeData.status || 'active',
            liabilityLimitCents: outcomeData.liabilityLimitCents || 50000000,
            displayOrder: outcomeData.displayOrder !== undefined ? outcomeData.displayOrder : i,
            updatedBy: marketData.createdBy || marketData.updatedBy
          });
          
          console.log(`  ✅ Outcome ${i + 1} created:`, outcome.id);
          outcomes.push(outcome);
        }
        market.outcomes = outcomes;
      }

      console.log('🎉 Market with outcomes created successfully');
      return market;
    } catch (error: any) {
      console.error('❌ Error creating market with outcomes:', {
        message: error.message,
        stack: error.stack,
        marketData: {
          matchId: marketData.matchId,
          key: marketData.key,
          name: marketData.name,
          type: marketData.type,
          parameter: marketData.parameter,
          outcomesCount: marketData.outcomes?.length
        }
      });
      throw error;
    }
  }

  async createMarketOutcome(outcomeData: any): Promise<any> {
    try {
      const insertData: any = {
        market_id: outcomeData.marketId,
        key: outcomeData.key,
        label: outcomeData.label,
        odds: outcomeData.odds,
        status: outcomeData.status || 'active',
        liability_limit_cents: outcomeData.liabilityLimitCents || 50000000,
        display_order: outcomeData.displayOrder || 0,
        updated_by: outcomeData.updatedBy
      };

      console.log('💾 Inserting market outcome to database:', insertData);

      const { data, error } = await this.client
        .from('market_outcomes')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ Database error creating market outcome:', {
          error: error,
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          insertData: insertData
        });
        throw new Error(`Failed to create market outcome: ${error.message}`);
      }

      console.log('✅ Market outcome inserted successfully:', data.id);

      return {
        id: data.id,
        marketId: data.market_id,
        key: data.key,
        label: data.label,
        odds: data.odds,
        previousOdds: data.previous_odds,
        oddsSource: data.odds_source,
        status: data.status,
        liabilityLimitCents: data.liability_limit_cents,
        displayOrder: data.display_order,
        isDeleted: data.is_deleted,
        updatedBy: data.updated_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('❌ Error creating market outcome:', {
        message: error.message,
        stack: error.stack,
        outcomeData: outcomeData
      });
      throw error;
    }
  }

  async updateMarket(id: string, updates: any): Promise<any> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.line !== undefined) updateData.line = updates.line;
      if (updates.displayOrder !== undefined) updateData.display_order = updates.displayOrder;

      const { data, error } = await this.client
        .from('markets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update market: ${error.message}`);
      }

      return {
        id: data.id,
        matchId: data.match_id,
        name: data.name,
        type: data.type,
        line: data.line,
        status: data.status,
        displayOrder: data.display_order,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error updating market:', error);
      throw error;
    }
  }

  async updateMarketStatus(marketId: string, status: string): Promise<any> {
    return this.updateMarket(marketId, { status });
  }

  async getMarket(marketId: string): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('markets')
        .select('*')
        .eq('id', marketId)
        .single();

      if (error) {
        throw new Error(`Failed to get market: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return {
        id: data.id,
        matchId: data.match_id,
        key: data.key,
        name: data.name,
        type: data.type,
        parameter: data.parameter,
        status: data.status,
        minStakeCents: data.min_stake_cents,
        maxStakeCents: data.max_stake_cents,
        isPublished: data.is_published,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error getting market:', error);
      throw error;
    }
  }

  async softDeleteMarket(marketId: string, adminId: string): Promise<void> {
    try {
      await this.updateMarket(marketId, {
        status: 'closed',
        updatedBy: adminId
      });
    } catch (error: any) {
      console.error('Error soft deleting market:', error);
      throw error;
    }
  }

  async getActiveBetsByMarket(marketId: string): Promise<Bet[]> {
    try {
      const { data, error } = await this.client
        .from('bets')
        .select(`
          *,
          bet_selections!inner(
            *,
            market_outcomes!inner(*)
          )
        `)
        .eq('bet_selections.market_outcomes.market_id', marketId)
        .in('status', ['pending', 'accepted']);

      if (error) {
        throw new Error(`Failed to get active bets by market: ${error.message}`);
      }

      return data?.map(mappers.toBet) || [];
    } catch (error: any) {
      console.error('Error getting active bets by market:', error);
      return [];
    }
  }

  async updateOutcomeOdds(outcomeId: string, odds: string): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('market_outcomes')
        .update({ 
          odds: parseFloat(odds),
          updated_at: new Date().toISOString() 
        })
        .eq('id', outcomeId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update outcome odds: ${error.message}`);
      }

      return {
        id: data.id,
        marketId: data.market_id,
        key: data.key,
        label: data.label,
        odds: data.odds,
        status: data.status,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error updating outcome odds:', error);
      throw error;
    }
  }

  async createMatchEvent(eventData: any): Promise<any> {
    try {
      const insertData: any = {
        match_id: eventData.matchId,
        type: eventData.type,
        team: eventData.team,
        player_name: eventData.playerName,
        minute: eventData.minute,
        extra_info: eventData.extraInfo
      };

      const { data, error } = await this.client
        .from('match_events')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create match event: ${error.message}`);
      }

      return {
        id: data.id,
        matchId: data.match_id,
        type: data.type,
        team: data.team,
        playerName: data.player_name,
        minute: data.minute,
        extraInfo: data.extra_info,
        createdAt: data.created_at
      };
    } catch (error: any) {
      console.error('Error creating match event:', error);
      throw error;
    }
  }

  async getMatchEvents(matchId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true });

      if (error) {
        throw new Error(`Failed to get match events: ${error.message}`);
      }

      return data?.map((event: any) => ({
        id: event.id,
        matchId: event.match_id,
        type: event.type,
        team: event.team,
        playerName: event.player_name,
        minute: event.minute,
        extraInfo: event.extra_info,
        createdAt: event.created_at
      })) || [];
    } catch (error: any) {
      console.error('Error getting match events:', error);
      return [];
    }
  }

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
  async getScheduledManualMatches(): Promise<any[]> {
    try {
      // Only fetch matches that should be starting now or have already passed their kickoff time
      // This optimizes performance by filtering at the database level
      const now = new Date().toISOString();
      
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('is_manual', true)
        .eq('status', 'scheduled')
        .lte('kickoff_time', now) // Only matches whose kickoff time has passed
        .order('kickoff_time', { ascending: true })
        .limit(50); // Limit to prevent overwhelming the system

      if (error) {
        console.error('Error getting scheduled manual matches:', error);
        return [];
      }

      return data || [];
    } catch (error: any) {
      console.error('Error getting scheduled manual matches:', error);
      return [];
    }
  }

  async getMatchWithEvents(matchId: string): Promise<any> {
    try {
      // Get the match
      const { data: match, error: matchError } = await this.client
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchError || !match) {
        return { match: null, events: [] };
      }

      // Get match events
      const { data: events, error: eventsError } = await this.client
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .order('minute', { ascending: true })
        .order('second', { ascending: true });

      if (eventsError) {
        console.error('Error getting match events:', eventsError);
        return { match, events: [] };
      }

      return { match, events: events || [] };
    } catch (error: any) {
      console.error('Error getting match with events:', error);
      return { match: null, events: [] };
    }
  }

  async deleteMarket(marketId: string, adminId: string): Promise<void> {
    try {
      // First delete all market outcomes
      const { error: outcomesError } = await this.client
        .from('market_outcomes')
        .delete()
        .eq('market_id', marketId);

      if (outcomesError) {
        throw new Error(`Failed to delete market outcomes: ${outcomesError.message}`);
      }

      // Then delete the market
      const { error } = await this.client
        .from('markets')
        .delete()
        .eq('id', marketId);

      if (error) {
        throw new Error(`Failed to delete market: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error deleting market:', error);
      throw error;
    }
  }

  async reorderMarkets(matchId: string, marketOrder: string[]): Promise<void> {
    try {
      for (let i = 0; i < marketOrder.length; i++) {
        await this.updateMarket(marketOrder[i], { displayOrder: i });
      }
    } catch (error: any) {
      console.error('Error reordering markets:', error);
      throw error;
    }
  }

  async getMarketOutcomes(marketId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('market_outcomes')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to get market outcomes: ${error.message}`);
      }

      return data?.map((outcome: any) => ({
        id: outcome.id,
        marketId: outcome.market_id,
        key: outcome.key,
        label: outcome.label,
        odds: outcome.odds,
        status: outcome.status,
        liabilityLimitCents: outcome.liability_limit_cents,
        displayOrder: outcome.display_order,
        createdAt: outcome.created_at,
        updatedAt: outcome.updated_at
      })) || [];
    } catch (error: any) {
      console.error('Error getting market outcomes:', error);
      return [];
    }
  }

  async updateMarketOutcome(outcomeId: string, updates: any): Promise<any> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.odds !== undefined) updateData.odds = parseFloat(updates.odds);
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.label !== undefined) updateData.label = updates.label;
      if (updates.liabilityLimitCents !== undefined) updateData.liability_limit_cents = updates.liabilityLimitCents;

      const { data, error } = await this.client
        .from('market_outcomes')
        .update(updateData)
        .eq('id', outcomeId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update market outcome: ${error.message}`);
      }

      return {
        id: data.id,
        marketId: data.market_id,
        key: data.key,
        label: data.label,
        odds: data.odds,
        status: data.status,
        liabilityLimitCents: data.liability_limit_cents,
        displayOrder: data.display_order,
        updatedAt: data.updated_at
      };
    } catch (error: any) {
      console.error('Error updating market outcome:', error);
      throw error;
    }
  }

  async getSports(): Promise<Array<{ id: string; name: string; displayName: string; matchCount: number }>> {
    try {
      const { data, error } = await this.client
        .from('matches')
        .select('sport, sport_name')
        .order('sport');

      if (error) {
        throw new Error(`Failed to get sports: ${error.message}`);
      }

      const sportsMap = new Map<string, { name: string; count: number }>();
      data?.forEach((match: any) => {
        const sportId = match.sport || 'football';
        const sportName = match.sport_name || 'Football';
        if (!sportsMap.has(sportId)) {
          sportsMap.set(sportId, { name: sportName, count: 0 });
        }
        sportsMap.set(sportId, {
          name: sportsMap.get(sportId)!.name,
          count: sportsMap.get(sportId)!.count + 1
        });
      });

      return Array.from(sportsMap.entries()).map(([id, data]) => ({
        id,
        name: id,
        displayName: data.name,
        matchCount: data.count
      }));
    } catch (error: any) {
      console.error('Error getting sports:', error);
      return [];
    }
  }

  async getLeagues(sportFilter?: string): Promise<Array<{ id: string; name: string; sport: string; matchCount: number }>> {
    try {
      let query = this.client
        .from('matches')
        .select('league_id, league_name, sport');

      if (sportFilter) {
        query = query.eq('sport', sportFilter);
      }

      const { data, error } = await query.order('league_name');

      if (error) {
        throw new Error(`Failed to get leagues: ${error.message}`);
      }

      const leaguesMap = new Map<string, { name: string; sport: string; count: number }>();
      data?.forEach((match: any) => {
        const leagueId = match.league_id;
        if (!leaguesMap.has(leagueId)) {
          leaguesMap.set(leagueId, {
            name: match.league_name,
            sport: match.sport || 'football',
            count: 0
          });
        }
        leaguesMap.set(leagueId, {
          ...leaguesMap.get(leagueId)!,
          count: leaguesMap.get(leagueId)!.count + 1
        });
      });

      return Array.from(leaguesMap.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        sport: data.sport,
        matchCount: data.count
      }));
    } catch (error: any) {
      console.error('Error getting leagues:', error);
      return [];
    }
  }

  async updateMatchToLive(matchId: string): Promise<void> {
    await this.updateMatch(matchId, { status: 'live' });
  }

  async updateMatchScore(matchId: string, homeScore: number, awayScore: number): Promise<void> {
    await this.updateMatch(matchId, { homeScore, awayScore });
  }

  async markEventAsExecuted(eventId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('match_events')
        .update({ is_executed: true })
        .eq('id', eventId);

      if (error) {
        console.error('Error marking event as executed:', error);
      }
    } catch (error: any) {
      console.error('Error marking event as executed:', error);
    }
  }

  async suspendAllMarkets(matchId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('markets')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('match_id', matchId);

      if (error) {
        throw new Error(`Failed to suspend markets: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error suspending markets:', error);
      throw error;
    }
  }

  async reopenAllMarkets(matchId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('markets')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('match_id', matchId);

      if (error) {
        throw new Error(`Failed to reopen markets: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error reopening markets:', error);
      throw error;
    }
  }

  async finishMatch(matchId: string, homeScore: number, awayScore: number): Promise<void> {
    await this.updateMatch(matchId, { 
      status: 'finished',
      homeScore,
      awayScore
    });
  }
}