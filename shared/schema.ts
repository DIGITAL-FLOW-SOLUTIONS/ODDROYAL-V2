import { z } from "zod";

// ===================== USER TYPES =====================

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  balance: z.number().int().default(0), // Balance in cents
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  balance: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ===================== BET TYPES =====================

export const betSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["single", "express", "system"]),
  totalStake: z.number().int().positive(), // Stake in cents
  potentialWinnings: z.number().int().positive(), // Winnings in cents
  totalOdds: z.string(), // Store as string for precision
  status: z.enum(["pending", "won", "lost", "cashout", "cancelled"]).default("pending"),
  placedAt: z.string(),
  settledAt: z.string().nullable().optional(),
  actualWinnings: z.number().int().default(0), // Actual winnings in cents
});

export const insertBetSchema = z.object({
  userId: z.string(),
  type: z.enum(["single", "express", "system"]),
  totalStake: z.number().int().positive(),
  potentialWinnings: z.number().int().positive(),
  totalOdds: z.string(),
  status: z.enum(["pending", "won", "lost", "cashout", "cancelled"]).default("pending"),
  actualWinnings: z.number().int().default(0),
});

export type Bet = z.infer<typeof betSchema>;
export type InsertBet = z.infer<typeof insertBetSchema>;

// ===================== BET SELECTION TYPES =====================

export const betSelectionSchema = z.object({
  id: z.string(),
  betId: z.string(),
  fixtureId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  market: z.string(),
  selection: z.string(),
  odds: z.string(), // Store as string for precision
  status: z.enum(["pending", "won", "lost", "void"]).default("pending"),
  result: z.string().nullable().optional(),
});

export const insertBetSelectionSchema = z.object({
  betId: z.string(),
  fixtureId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string(),
  marketId: z.string(),
  outcomeId: z.string(),
  market: z.string(),
  selection: z.string(),
  odds: z.string(),
  status: z.enum(["pending", "won", "lost", "void"]).default("pending"),
  result: z.string().optional(),
});

export type BetSelection = z.infer<typeof betSelectionSchema>;
export type InsertBetSelection = z.infer<typeof insertBetSelectionSchema>;

// ===================== USER FAVORITE TYPES =====================

export const userFavoriteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["team", "league", "fixture"]),
  entityId: z.string(),
  entityName: z.string(),
  createdAt: z.string(),
});

export const insertFavoriteSchema = z.object({
  userId: z.string(),
  type: z.enum(["team", "league", "fixture"]),
  entityId: z.string(),
  entityName: z.string(),
});

export type UserFavorite = z.infer<typeof userFavoriteSchema>;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

// ===================== TRANSACTION TYPES =====================

export const transactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["deposit", "withdrawal", "bet_stake", "bet_winnings", "bonus"]),
  amount: z.number().int(), // Amount in cents (can be negative)
  balanceBefore: z.number().int(),
  balanceAfter: z.number().int(),
  reference: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["pending", "completed", "failed"]).default("completed"),
  createdAt: z.string(),
});

export const insertTransactionSchema = z.object({
  userId: z.string(),
  type: z.enum(["deposit", "withdrawal", "bet_stake", "bet_winnings", "bonus"]),
  amount: z.number().int(),
  balanceBefore: z.number().int(),
  balanceAfter: z.number().int(),
  reference: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["pending", "completed", "failed"]).default("completed"),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// ===================== SESSION TYPES =====================

export const userSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionToken: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type UserSession = z.infer<typeof userSessionSchema>;

// ===================== ADMIN USER TYPES =====================

export const adminUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  role: z.enum(["superadmin", "admin", "risk_manager", "finance", "compliance", "support"]),
  totpSecret: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  lastLogin: z.string().nullable().optional(),
  loginAttempts: z.number().int().default(0),
  lockedUntil: z.string().nullable().optional(),
  ipWhitelist: z.array(z.string()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().optional(),
});

export const insertAdminUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  role: z.enum(["superadmin", "admin", "risk_manager", "finance", "compliance", "support"]),
  totpSecret: z.string().optional(),
  isActive: z.boolean().default(true),
  ipWhitelist: z.array(z.string()).optional(),
  createdBy: z.string().optional(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;

// ===================== ADMIN SESSION TYPES =====================

export const adminSessionSchema = z.object({
  id: z.string(),
  adminId: z.string(),
  sessionToken: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  twoFactorVerified: z.boolean().default(false),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type AdminSession = z.infer<typeof adminSessionSchema>;

// ===================== AUDIT LOG TYPES =====================

export const auditLogSchema = z.object({
  id: z.string(),
  adminId: z.string(),
  actionType: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable().optional(),
  dataBefore: z.record(z.unknown()).nullable().optional(),
  dataAfter: z.record(z.unknown()).nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  success: z.boolean().default(true),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const insertAuditLogSchema = z.object({
  adminId: z.string(),
  actionType: z.string(),
  targetType: z.string(),
  targetId: z.string().optional(),
  dataBefore: z.record(z.unknown()).optional(),
  dataAfter: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  note: z.string().optional(),
  success: z.boolean().default(true),
  errorMessage: z.string().optional(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// ===================== USER LIMITS TYPES =====================

export const userLimitsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  maxStakeCents: z.number().int().default(10000000), // £100,000
  dailyStakeLimitCents: z.number().int().default(100000000), // £1,000,000
  dailyDepositLimitCents: z.number().int().default(100000000), // £1,000,000
  dailyLossLimitCents: z.number().int().default(100000000), // £1,000,000
  weeklyStakeLimitCents: z.number().int().default(700000000), // £7,000,000
  monthlyStakeLimitCents: z.number().int().default(3000000000), // £30,000,000
  isSelfExcluded: z.boolean().default(false),
  selfExclusionUntil: z.string().nullable().optional(),
  cooldownUntil: z.string().nullable().optional(),
  setByAdminId: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertUserLimitsSchema = z.object({
  userId: z.string(),
  maxStakeCents: z.number().int().default(10000000),
  dailyStakeLimitCents: z.number().int().default(100000000),
  dailyDepositLimitCents: z.number().int().default(100000000),
  dailyLossLimitCents: z.number().int().default(100000000),
  weeklyStakeLimitCents: z.number().int().default(700000000),
  monthlyStakeLimitCents: z.number().int().default(3000000000),
  isSelfExcluded: z.boolean().default(false),
  selfExclusionUntil: z.string().optional(),
  cooldownUntil: z.string().optional(),
  setByAdminId: z.string().optional(),
  reason: z.string().optional(),
});

export type UserLimits = z.infer<typeof userLimitsSchema>;
export type InsertUserLimits = z.infer<typeof insertUserLimitsSchema>;

// ===================== EXTENDED REGISTRATION SCHEMA =====================

export const registerUserSchema = insertUserSchema.extend({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type RegisterUser = z.infer<typeof registerUserSchema>;

// ===================== LOGIN SCHEMA =====================

export const loginUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type LoginUser = z.infer<typeof loginUserSchema>;