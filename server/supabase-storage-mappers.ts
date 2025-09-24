import { 
  User, 
  Bet, 
  BetSelection, 
  Transaction, 
  UserFavorite, 
  AdminUser, 
  AdminSession, 
  AuditLog 
} from "@shared/schema";
import { Tables } from "./types/database";

// Convert snake_case database rows to camelCase domain types

export function toUser(row: Tables<'profiles'>): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    balance: row.balance_cents,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBet(row: Tables<'bets'>): Bet {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.bet_type,
    totalStake: row.total_stake_cents,
    potentialWinnings: row.potential_winnings_cents,
    totalOdds: "1.00",
    status: row.status as "pending" | "won" | "lost" | "cashout" | "cancelled",
    placedAt: row.placed_at,
    settledAt: row.settled_at,
    actualWinnings: row.actual_winnings_cents,
  };
}

export function toBetSelection(row: Tables<'bet_selections'>): BetSelection {
  return {
    id: row.id,
    betId: row.bet_id,
    fixtureId: row.fixture_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    league: row.league,
    marketId: row.fixture_id, // Use fixture_id as placeholder
    outcomeId: row.id, // Use id as placeholder
    market: row.market,
    selection: row.selection,
    odds: row.odds,
    status: row.status as "void" | "pending" | "won" | "lost",
    result: row.result,
  };
}

export function toTransaction(row: Tables<'transactions'>): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as "deposit" | "withdrawal" | "bet_stake" | "bet_winnings" | "bonus",
    amount: row.amount_cents,
    balanceBefore: 0, // TODO: Add this field to database if needed
    balanceAfter: row.balance_after_cents,
    reference: row.reference_id,
    description: row.description,
    status: "completed", // TODO: Add this field to database if needed
    createdAt: row.created_at,
  };
}

export function toUserFavorite(row: Tables<'user_favorites'>): UserFavorite {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.entity_type as "league" | "team" | "fixture",
    entityId: row.entity_id,
    entityName: row.entity_id, // Use entity_id as placeholder
    createdAt: row.created_at,
  };
}

export function toAdminUser(row: Tables<'admin_users'>): AdminUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    totpSecret: row.totp_secret,
    is2faEnabled: row.is_2fa_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAdminSession(row: Tables<'admin_sessions'>): AdminSession {
  return {
    id: row.id,
    adminId: row.admin_id,
    sessionToken: row.session_token,
    expiresAt: row.expires_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  };
}

export function toAuditLog(row: Tables<'audit_logs'>): AuditLog {
  return {
    id: row.id,
    adminId: row.admin_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: row.details,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}