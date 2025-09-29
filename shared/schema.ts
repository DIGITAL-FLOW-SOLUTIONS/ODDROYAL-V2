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

// Admin registration schema with password validation
export const adminRegistrationSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminRegistration = z.infer<typeof adminRegistrationSchema>;

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
  maxStakeCents: z.number().int().default(10000000), // KES 100,000
  dailyStakeLimitCents: z.number().int().default(100000000), // KES 1,000,000
  dailyDepositLimitCents: z.number().int().default(100000000), // KES 1,000,000
  dailyLossLimitCents: z.number().int().default(100000000), // KES 1,000,000
  weeklyStakeLimitCents: z.number().int().default(700000000), // KES 7,000,000
  monthlyStakeLimitCents: z.number().int().default(3000000000), // KES 30,000,000
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

// ===================== ADMIN ROLES AND PERMISSIONS =====================

export const AdminRoles = [
  "superadmin", 
  "admin", 
  "risk_manager", 
  "finance", 
  "compliance", 
  "support"
] as const;

export type AdminRole = typeof AdminRoles[number];

// Role permissions mapping
export const rolePermissions: Record<AdminRole, string[]> = {
  superadmin: ['*'], // All permissions
  admin: [
    'users:read', 'users:write', 'users:update', 'users:ban',
    'bets:read', 'bets:review', 'bets:settle', 'bets:void',
    'transactions:read', 'transactions:write',
    'reports:read', 'reports:generate',
    'limits:read', 'limits:update',
    'admins:read', 'admins:create',
    'matches:read', 'matches:update',
    'markets:read', 'markets:update',
    'system:read'
  ],
  risk_manager: [
    'users:read', 'users:ban',
    'bets:read', 'bets:review', 'bets:settle', 'bets:void',
    'limits:read', 'limits:update',
    'reports:read', 'reports:generate',
    'matches:read', 'markets:read',
    'exposure:read'
  ],
  finance: [
    'users:read',
    'transactions:read', 'transactions:write',
    'reports:read', 'reports:generate',
    'bets:read'
  ],
  compliance: [
    'users:read', 'users:ban',
    'bets:read', 'bets:review',
    'transactions:read',
    'reports:read', 'reports:generate',
    'limits:read', 'limits:update',
    'audit:read'
  ],
  support: [
    'users:read',
    'bets:read',
    'transactions:read',
    'reports:read'
  ]
};

// Utility function to check if a role has a specific permission
export function hasPermission(role: AdminRole, permission: string): boolean {
  if (role === 'superadmin') return true;
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission) || permissions.includes('*');
}

// ===================== BET PLACEMENT SCHEMA =====================

// Betting limits constants
export const BETTING_LIMITS = {
  MIN_STAKE_CENTS: 10, // KES 0.10
  MAX_STAKE_CENTS: 10000000, // KES 100,000
  MIN_SINGLE_STAKE_CENTS: 10, // KES 0.10
  MAX_SINGLE_STAKE_CENTS: 1000000, // KES 10,000 per single bet
  MIN_EXPRESS_SELECTIONS: 2,
  MIN_SYSTEM_SELECTIONS: 3,
  MAX_SELECTIONS: 20,
  MIN_ODDS: 1.01,
  MAX_ODDS: 1000
} as const;

export const betPlacementSchema = z.object({
  betType: z.enum(["single", "express", "system"]),
  totalStakeCents: z.number().int()
    .min(BETTING_LIMITS.MIN_STAKE_CENTS, "Minimum stake is KES 0.10")
    .max(BETTING_LIMITS.MAX_STAKE_CENTS, "Maximum stake is KES 100,000"),
  totalOdds: z.string().refine((val) => {
    const oddsValue = parseFloat(val);
    return oddsValue >= BETTING_LIMITS.MIN_ODDS && oddsValue <= BETTING_LIMITS.MAX_ODDS;
  }, {
    message: `Total odds must be between ${BETTING_LIMITS.MIN_ODDS} and ${BETTING_LIMITS.MAX_ODDS}`
  }),
  selections: z.array(z.object({
    fixtureId: z.string(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    league: z.string(),
    market: z.string(),
    selection: z.string(),
    odds: z.string().refine((val) => {
      const oddsValue = parseFloat(val);
      return oddsValue >= BETTING_LIMITS.MIN_ODDS && oddsValue <= BETTING_LIMITS.MAX_ODDS;
    }, {
      message: `Odds must be between ${BETTING_LIMITS.MIN_ODDS} and ${BETTING_LIMITS.MAX_ODDS}`
    }),
  })).min(1, "At least 1 selection required").max(BETTING_LIMITS.MAX_SELECTIONS, `Maximum ${BETTING_LIMITS.MAX_SELECTIONS} selections allowed`),
});

// ===================== ADMIN LOGIN SCHEMA =====================

export const loginAdminSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

// ===================== CURRENCY UTILITIES =====================

// Helper functions for stake validation
export const stakeValidation = {
  isValidStake: (stakeCents: number): boolean => {
    return stakeCents >= BETTING_LIMITS.MIN_STAKE_CENTS && stakeCents <= BETTING_LIMITS.MAX_STAKE_CENTS;
  },
  isValidSingleStake: (stakeCents: number): boolean => {
    return stakeCents >= BETTING_LIMITS.MIN_SINGLE_STAKE_CENTS && stakeCents <= BETTING_LIMITS.MAX_SINGLE_STAKE_CENTS;
  },
  formatStakeError: (stakeCents: number, isSingle: boolean = false): string => {
    const limits = isSingle ? 
      { min: BETTING_LIMITS.MIN_SINGLE_STAKE_CENTS, max: BETTING_LIMITS.MAX_SINGLE_STAKE_CENTS } :
      { min: BETTING_LIMITS.MIN_STAKE_CENTS, max: BETTING_LIMITS.MAX_STAKE_CENTS };
    
    if (stakeCents < limits.min) {
      return `Minimum stake is ${currencyUtils.formatCurrency(limits.min)}`;
    }
    if (stakeCents > limits.max) {
      return `Maximum stake is ${currencyUtils.formatCurrency(limits.max)}`;
    }
    return "Invalid stake amount";
  }
};

export const currencyUtils = {
  centsToKES: (cents: number): string => {
    return (cents / 100).toFixed(2);
  },
  
  KESsToCents: (kes: number): number => {
    return Math.round(kes * 100);
  },
  
  formatCurrency: (cents: number): string => {
    return `KES ${(cents / 100).toFixed(2)}`;
  },
  
  formatCurrencyShort: (cents: number): string => {
    const kes = cents / 100;
    if (kes >= 1000000) {
      return `KES ${(kes / 1000000).toFixed(1)}M`;
    } else if (kes >= 1000) {
      return `KES ${(kes / 1000).toFixed(1)}K`;
    }
    return `KES ${kes.toFixed(2)}`;
  },
  
  // Backward compatibility aliases
  centsToPounds: (cents: number): string => {
    return (cents / 100).toFixed(2);
  },
  
  poundsToCents: (pounds: number): number => {
    return Math.round(pounds * 100);
  }
};