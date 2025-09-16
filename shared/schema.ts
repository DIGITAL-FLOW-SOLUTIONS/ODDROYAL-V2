import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, json, uuid, primaryKey, index, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - Basic user authentication and profile
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  balance: integer("balance_cents").notNull().default(0), // Balance in cents to avoid floating-point issues
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Bets table - Main bet records
export const bets = pgTable("bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'single', 'express', 'system'
  totalStake: integer("total_stake_cents").notNull(), // Stake in cents
  potentialWinnings: integer("potential_winnings_cents").notNull(), // Winnings in cents
  totalOdds: decimal("total_odds", { precision: 8, scale: 4 }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'cashout', 'cancelled'
  placedAt: timestamp("placed_at").notNull().default(sql`now()`),
  settledAt: timestamp("settled_at"),
  actualWinnings: integer("actual_winnings_cents").default(0), // Actual winnings in cents
});

// Bet selections - Individual selections within a bet
export const betSelections = pgTable("bet_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  betId: varchar("bet_id").notNull().references(() => bets.id, { onDelete: 'cascade' }),
  fixtureId: text("fixture_id").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league").notNull(),
  marketId: varchar("market_id").notNull(), // Foreign key to markets table
  outcomeId: varchar("outcome_id").notNull(), // Foreign key to marketOutcomes table
  market: text("market").notNull(), // '1x2', 'ou', 'btts', etc. (kept for backwards compatibility)
  selection: text("selection").notNull(), // 'home', 'away', 'draw', 'over', 'under', etc. (kept for backwards compatibility)
  odds: decimal("odds", { precision: 8, scale: 4 }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'void'
  result: text("result"), // Final result that determined win/loss
}, (table) => ({
  betIdIdx: index("bet_selections_bet_id_idx").on(table.betId),
  marketIdIdx: index("bet_selections_market_id_idx").on(table.marketId),
  outcomeIdIdx: index("bet_selections_outcome_id_idx").on(table.outcomeId),
  statusIdx: index("bet_selections_status_idx").on(table.status),
  fkMarketId: foreignKey({
    columns: [table.marketId],
    foreignColumns: [markets.id],
    name: 'bet_selections_market_id_fk'
  }).onDelete('restrict').onUpdate('cascade'),
  fkOutcomeId: foreignKey({
    columns: [table.outcomeId],
    foreignColumns: [marketOutcomes.id],
    name: 'bet_selections_outcome_id_fk'
  }).onDelete('restrict').onUpdate('cascade'),
}));

// User favorites - Teams and matches favorited by users
export const userFavorites = pgTable("user_favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'team', 'league', 'fixture'
  entityId: text("entity_id").notNull(), // team_id, league_id, or fixture_id
  entityName: text("entity_name").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Transactions - Financial transactions (deposits, withdrawals, bet winnings)
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'deposit', 'withdrawal', 'bet_stake', 'bet_winnings', 'bonus'
  amount: integer("amount_cents").notNull(), // Amount in cents
  balanceBefore: integer("balance_before_cents").notNull(), // Balance before in cents
  balanceAfter: integer("balance_after_cents").notNull(), // Balance after in cents
  reference: text("reference"), // Bet ID, payment reference, etc.
  description: text("description"),
  status: text("status").notNull().default('completed'), // 'pending', 'completed', 'failed'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User sessions - Track active sessions for security
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionToken: text("session_token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Create Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  firstName: true,
  lastName: true,
});

export const insertBetSchema = createInsertSchema(bets).pick({
  type: true,
  totalStake: true,
  potentialWinnings: true,
  totalOdds: true,
}).refine(
  (data) => {
    return data.totalStake > 0 && data.totalStake <= 10000000; // Max bet £100,000 in cents
  },
  { message: "Stake must be between £0.01 and £100,000", path: ["totalStake"] }
).refine(
  (data) => {
    const odds = parseFloat(data.totalOdds);
    return odds >= 1.01 && odds <= 10000; // Reasonable odds range
  },
  { message: "Total odds must be between 1.01 and 10,000", path: ["totalOdds"] }
);

export const insertBetSelectionSchema = createInsertSchema(betSelections).omit({
  id: true,
  status: true,
  result: true,
}).refine(
  (data) => {
    const odds = parseFloat(data.odds);
    return odds >= 1.01 && odds <= 1000; // Individual selection odds range
  },
  { message: "Selection odds must be between 1.01 and 1,000", path: ["odds"] }
);

export const insertFavoriteSchema = createInsertSchema(userFavorites).pick({
  type: true,
  entityId: true,
  entityName: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  type: true,
  amount: true,
  balanceBefore: true,
  balanceAfter: true,
  reference: true,
  description: true,
}).refine(
  (data) => {
    return data.balanceAfter >= 0; // Cannot have negative balance
  },
  { message: "Balance cannot be negative", path: ["balanceAfter"] }
);

// Utility functions for currency conversion
export const currencyUtils = {
  poundsToCents: (pounds: number | string): number => {
    const amount = typeof pounds === 'string' ? parseFloat(pounds) : pounds;
    return Math.round(amount * 100);
  },
  centsToPounds: (cents: number): number => {
    return cents / 100;
  },
  formatCurrency: (cents: number): string => {
    return `£${(cents / 100).toFixed(2)}`;
  },
  parseCurrencyInput: (input: string): number => {
    // Remove £ symbol and convert to cents
    const cleaned = input.replace(/[£,\s]/g, '');
    const pounds = parseFloat(cleaned);
    if (isNaN(pounds)) throw new Error('Invalid currency format');
    return Math.round(pounds * 100);
  }
};

// Bet placement validation schema
export const betPlacementSchema = z.object({
  type: z.enum(['single', 'express', 'system']),
  totalStake: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid stake format").transform(
    (val) => currencyUtils.poundsToCents(val)
  ).refine(
    (cents) => cents >= 1 && cents <= 10000000, // £0.01 to £100,000 in cents
    { message: "Stake must be between £0.01 and £100,000" }
  ),
  selections: z.array(z.object({
    fixtureId: z.string().min(1, "Fixture ID is required"),
    homeTeam: z.string().min(1, "Home team name is required"),
    awayTeam: z.string().min(1, "Away team name is required"),
    league: z.string().min(1, "League name is required"),
    market: z.string().min(1, "Market is required"),
    selection: z.string().min(1, "Selection is required"),
    odds: z.string().regex(/^\d+(\.\d{1,4})?$/, "Invalid odds format").refine(
      (val) => {
        const odds = parseFloat(val);
        return odds >= 1.01 && odds <= 1000;
      },
      { message: "Odds must be between 1.01 and 1,000" }
    )
  })).min(1, "At least one selection is required").max(20, "Maximum 20 selections allowed")
}).refine(
  (data) => {
    // Validate selection count based on bet type
    const selectionCount = data.selections.length;
    if (data.type === 'single' && selectionCount !== 1) {
      return false;
    }
    if (data.type === 'express' && (selectionCount < 2 || selectionCount > 20)) {
      return false;
    }
    if (data.type === 'system' && (selectionCount < 3 || selectionCount > 8)) {
      return false;
    }
    return true;
  },
  {
    message: "Invalid number of selections for bet type",
    path: ["selections"]
  }
).refine(
  (data) => {
    // Ensure no duplicate fixtures in selections
    const fixtureIds = data.selections.map(s => s.fixtureId);
    return new Set(fixtureIds).size === fixtureIds.length;
  },
  {
    message: "Cannot bet on the same fixture multiple times",
    path: ["selections"]
  }
);

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type BetPlacement = z.infer<typeof betPlacementSchema>;

export type Bet = typeof bets.$inferSelect;
export type InsertBet = z.infer<typeof insertBetSchema>;

export type BetSelection = typeof betSelections.$inferSelect;
export type InsertBetSelection = z.infer<typeof insertBetSelectionSchema>;

export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type UserSession = typeof userSessions.$inferSelect;

// =====================================
// ADMIN PANEL SCHEMA EXTENSIONS
// =====================================

// Admin users table - Separate from regular users for security
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // Argon2 hashed
  role: text("role").notNull().default('support'), // superadmin, admin, risk_manager, finance, compliance, support
  totpSecret: text("totp_secret"), // AES-256 encrypted TOTP secret
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login"),
  loginAttempts: integer("login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  ipWhitelist: json("ip_whitelist").$type<string[]>(), // Optional IP restrictions
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  createdBy: varchar("created_by"),
}, (table) => ({
  usernameIdx: index("admin_username_idx").on(table.username),
  emailIdx: index("admin_email_idx").on(table.email),
  roleIdx: index("admin_role_idx").on(table.role),
  fkCreatedBy: foreignKey({
    columns: [table.createdBy],
    foreignColumns: [table.id],
    name: 'admin_users_created_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// Admin sessions - Separate from user sessions
export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  sessionTokenIdx: index("admin_session_token_idx").on(table.sessionToken),
  adminIdIdx: index("admin_session_admin_id_idx").on(table.adminId),
  expiresIdx: index("admin_session_expires_idx").on(table.expiresAt),
  fkAdminId: foreignKey({
    columns: [table.adminId],
    foreignColumns: [adminUsers.id],
    name: 'admin_sessions_admin_id_fk'
  }).onDelete('cascade').onUpdate('cascade'),
}));

// Matches table - For manually created matches and SportMonks sync
export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalId: text("external_id"), // SportMonks fixture ID
  leagueId: text("league_id").notNull(),
  leagueName: text("league_name").notNull(),
  homeTeamId: text("home_team_id").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  awayTeamId: text("away_team_id").notNull(),
  awayTeamName: text("away_team_name").notNull(),
  kickoffTime: timestamp("kickoff_time").notNull(),
  status: text("status").notNull().default('scheduled'), // scheduled, live, finished, cancelled, postponed
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isManual: boolean("is_manual").notNull().default(false), // true for manually created matches
  isDeleted: boolean("is_deleted").notNull().default(false), // soft delete
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  externalIdIdx: index("matches_external_id_idx").on(table.externalId),
  leagueIdIdx: index("matches_league_id_idx").on(table.leagueId),
  kickoffTimeIdx: index("matches_kickoff_time_idx").on(table.kickoffTime),
  statusIdx: index("matches_status_idx").on(table.status),
  isDeletedIdx: index("matches_is_deleted_idx").on(table.isDeleted),
  fkCreatedBy: foreignKey({
    columns: [table.createdBy],
    foreignColumns: [adminUsers.id],
    name: 'matches_created_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
  fkUpdatedBy: foreignKey({
    columns: [table.updatedBy],
    foreignColumns: [adminUsers.id],
    name: 'matches_updated_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// Markets table - Betting markets for matches
export const markets = pgTable("markets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").notNull().references(() => matches.id, { onDelete: 'cascade' }),
  key: text("key").notNull(), // '1x2', 'totals:2.5', 'btts', etc.
  name: text("name").notNull(),
  type: text("type").notNull(), // '1x2', 'totals', 'btts', 'handicap', 'correct_score', 'custom'
  parameter: text("parameter"), // For markets with parameters like totals (2.5), handicap (-1)
  status: text("status").notNull().default('open'), // open, closed, suspended, settled
  minStakeCents: integer("min_stake_cents").notNull().default(100), // £1 minimum
  maxStakeCents: integer("max_stake_cents").notNull().default(10000000), // £100,000 maximum
  maxLiabilityCents: integer("max_liability_cents").notNull().default(100000000), // £1M maximum liability
  displayOrder: integer("display_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  matchIdIdx: index("markets_match_id_idx").on(table.matchId),
  keyIdx: index("markets_key_idx").on(table.key),
  typeIdx: index("markets_type_idx").on(table.type),
  statusIdx: index("markets_status_idx").on(table.status),
  isPublishedIdx: index("markets_is_published_idx").on(table.isPublished),
  isDeletedIdx: index("markets_is_deleted_idx").on(table.isDeleted),
  fkCreatedBy: foreignKey({
    columns: [table.createdBy],
    foreignColumns: [adminUsers.id],
    name: 'markets_created_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
  fkUpdatedBy: foreignKey({
    columns: [table.updatedBy],
    foreignColumns: [adminUsers.id],
    name: 'markets_updated_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// Market outcomes - Individual betting options within markets
export const marketOutcomes = pgTable("market_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").notNull().references(() => markets.id, { onDelete: 'cascade' }),
  key: text("key").notNull(), // 'home', 'draw', 'away', 'over', 'under', etc.
  label: text("label").notNull(), // Display name
  odds: decimal("odds", { precision: 8, scale: 4 }).notNull(),
  previousOdds: decimal("previous_odds", { precision: 8, scale: 4 }),
  oddsSource: text("odds_source").notNull().default('manual'), // manual, sportmonks, automated
  status: text("status").notNull().default('active'), // active, inactive, won, lost
  liabilityLimitCents: integer("liability_limit_cents").notNull().default(50000000), // £500k default
  displayOrder: integer("display_order").notNull().default(0),
  isDeleted: boolean("is_deleted").notNull().default(false),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  marketIdIdx: index("market_outcomes_market_id_idx").on(table.marketId),
  keyIdx: index("market_outcomes_key_idx").on(table.key),
  statusIdx: index("market_outcomes_status_idx").on(table.status),
  oddsIdx: index("market_outcomes_odds_idx").on(table.odds),
  isDeletedIdx: index("market_outcomes_is_deleted_idx").on(table.isDeleted),
  fkUpdatedBy: foreignKey({
    columns: [table.updatedBy],
    foreignColumns: [adminUsers.id],
    name: 'market_outcomes_updated_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// Odds history - Track odds changes for audit and analysis
export const oddsHistory = pgTable("odds_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeId: varchar("outcome_id").notNull().references(() => marketOutcomes.id, { onDelete: 'cascade' }),
  previousOdds: decimal("previous_odds", { precision: 8, scale: 4 }),
  newOdds: decimal("new_odds", { precision: 8, scale: 4 }).notNull(),
  source: text("source").notNull(), // manual, sportmonks, automated
  reason: text("reason"), // Required for manual changes
  changedBy: varchar("changed_by"),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
}, (table) => ({
  outcomeIdIdx: index("odds_history_outcome_id_idx").on(table.outcomeId),
  timestampIdx: index("odds_history_timestamp_idx").on(table.timestamp),
  changedByIdx: index("odds_history_changed_by_idx").on(table.changedBy),
  fkChangedBy: foreignKey({
    columns: [table.changedBy],
    foreignColumns: [adminUsers.id],
    name: 'odds_history_changed_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// Exposure snapshots - Cached liability calculations
export const exposureSnapshots = pgTable("exposure_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").notNull().references(() => matches.id, { onDelete: 'cascade' }),
  marketId: varchar("market_id").references(() => markets.id, { onDelete: 'cascade' }),
  outcomeId: varchar("outcome_id").references(() => marketOutcomes.id, { onDelete: 'cascade' }),
  exposureAmountCents: integer("exposure_amount_cents").notNull(),
  betCount: integer("bet_count").notNull().default(0),
  calculatedAt: timestamp("calculated_at").notNull().default(sql`now()`),
}, (table) => ({
  matchIdIdx: index("exposure_snapshots_match_id_idx").on(table.matchId),
  marketIdIdx: index("exposure_snapshots_market_id_idx").on(table.marketId),
  outcomeIdIdx: index("exposure_snapshots_outcome_id_idx").on(table.outcomeId),
  calculatedAtIdx: index("exposure_snapshots_calculated_at_idx").on(table.calculatedAt),
  // Unique constraint for proper upsert behavior  
  uniqConstraint: index("exposure_snapshots_unique").on(table.matchId, table.marketId, table.outcomeId),
}));

// Audit logs - Immutable log of all admin actions
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  actionType: text("action_type").notNull(), // login, logout, create_match, edit_odds, settle_bet, etc.
  targetType: text("target_type"), // match, market, bet, user, etc.
  targetId: text("target_id"), // ID of the affected entity
  dataBefore: json("data_before"), // State before the action
  dataAfter: json("data_after"), // State after the action
  note: text("note"), // Admin reason/comment
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  adminIdIdx: index("audit_logs_admin_id_idx").on(table.adminId),
  actionTypeIdx: index("audit_logs_action_type_idx").on(table.actionType),
  targetTypeIdx: index("audit_logs_target_type_idx").on(table.targetType),
  targetIdIdx: index("audit_logs_target_id_idx").on(table.targetId),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  successIdx: index("audit_logs_success_idx").on(table.success),
  fkAdminId: foreignKey({
    columns: [table.adminId],
    foreignColumns: [adminUsers.id],
    name: 'audit_logs_admin_id_fk'
  }).onDelete('cascade').onUpdate('cascade'),
}));

// Promotions - Bonus and promotion management
export const promotions = pgTable("promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // free_bet, deposit_match, cashback, odds_boost
  params: json("params").$type<Record<string, any>>().notNull(), // Promotion-specific parameters
  promoCode: text("promo_code").unique(),
  isActive: boolean("is_active").notNull().default(true),
  maxRedemptions: integer("max_redemptions"),
  currentRedemptions: integer("current_redemptions").notNull().default(0),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  targetUserSegment: json("target_user_segment").$type<Record<string, any>>(), // User targeting criteria
  createdBy: varchar("created_by").notNull(),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  nameIdx: index("promotions_name_idx").on(table.name),
  typeIdx: index("promotions_type_idx").on(table.type),
  promoCodeIdx: index("promotions_promo_code_idx").on(table.promoCode),
  isActiveIdx: index("promotions_is_active_idx").on(table.isActive),
  startAtIdx: index("promotions_start_at_idx").on(table.startAt),
  endAtIdx: index("promotions_end_at_idx").on(table.endAt),
  fkCreatedBy: foreignKey({
    columns: [table.createdBy],
    foreignColumns: [adminUsers.id],
    name: 'promotions_created_by_fk'
  }).onDelete('restrict').onUpdate('cascade'),
  fkUpdatedBy: foreignKey({
    columns: [table.updatedBy],
    foreignColumns: [adminUsers.id],
    name: 'promotions_updated_by_fk'
  }).onDelete('set null').onUpdate('cascade'),
}));

// User promotion redemptions - Track who used which promotions
export const userPromotionRedemptions = pgTable("user_promotion_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  promotionId: varchar("promotion_id").notNull().references(() => promotions.id, { onDelete: 'cascade' }),
  bonusAmountCents: integer("bonus_amount_cents").notNull(),
  redemptionData: json("redemption_data").$type<Record<string, any>>(),
  status: text("status").notNull().default('active'), // active, used, expired, cancelled
  expiresAt: timestamp("expires_at"),
  redeemedAt: timestamp("redeemed_at").notNull().default(sql`now()`),
  usedAt: timestamp("used_at"),
}, (table) => ({
  userIdIdx: index("user_promotion_redemptions_user_id_idx").on(table.userId),
  promotionIdIdx: index("user_promotion_redemptions_promotion_id_idx").on(table.promotionId),
  statusIdx: index("user_promotion_redemptions_status_idx").on(table.status),
  redeemedAtIdx: index("user_promotion_redemptions_redeemed_at_idx").on(table.redeemedAt),
}));

// =====================================
// ADMIN SCHEMA VALIDATION
// =====================================

// Admin user schemas
export const insertAdminUserSchema = createInsertSchema(adminUsers).pick({
  username: true,
  email: true,
  passwordHash: true,
  role: true,
  totpSecret: true,
  ipWhitelist: true,
  isActive: true,
  loginAttempts: true,
  lockedUntil: true,
}).extend({
  role: z.enum(['superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(), // For creation
});

export const loginAdminSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().length(6, 'TOTP code must be 6 digits').optional(),
});

// Match schemas
export const insertMatchSchema = createInsertSchema(matches).pick({
  externalId: true,
  leagueId: true,
  leagueName: true,
  homeTeamId: true,
  homeTeamName: true,
  awayTeamId: true,
  awayTeamName: true,
  kickoffTime: true,
  isManual: true,
}).extend({
  kickoffTime: z.string().or(z.date()).transform((val) => 
    typeof val === 'string' ? new Date(val) : val
  ),
});

// Market schemas
export const insertMarketSchema = createInsertSchema(markets).pick({
  matchId: true,
  key: true,
  name: true,
  type: true,
  parameter: true,
  minStakeCents: true,
  maxStakeCents: true,
  maxLiabilityCents: true,
  displayOrder: true,
}).extend({
  type: z.enum(['1x2', 'totals', 'btts', 'handicap', 'correct_score', 'custom']),
  minStakeCents: z.number().min(1).default(100),
  maxStakeCents: z.number().min(100).default(10000000),
  maxLiabilityCents: z.number().min(1000).default(100000000),
});

// Market outcome schemas
export const insertMarketOutcomeSchema = createInsertSchema(marketOutcomes).pick({
  marketId: true,
  key: true,
  label: true,
  odds: true,
  oddsSource: true,
  liabilityLimitCents: true,
  displayOrder: true,
}).extend({
  odds: z.string().or(z.number()).transform((val) => 
    typeof val === 'string' ? val : val.toString()
  ).refine((val) => {
    const odds = parseFloat(val);
    return odds >= 1.01 && odds <= 1000;
  }, { message: 'Odds must be between 1.01 and 1000' }),
  oddsSource: z.enum(['manual', 'sportmonks', 'automated']).default('manual'),
  liabilityLimitCents: z.number().min(1000).default(50000000),
});

// Audit log schema
export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  adminId: true,
  actionType: true,
  targetType: true,
  targetId: true,
  dataBefore: true,
  dataAfter: true,
  note: true,
  ipAddress: true,
  userAgent: true,
  success: true,
  errorMessage: true,
});

// Promotion schemas
export const insertPromotionSchema = createInsertSchema(promotions).pick({
  name: true,
  description: true,
  type: true,
  params: true,
  promoCode: true,
  maxRedemptions: true,
  startAt: true,
  endAt: true,
  targetUserSegment: true,
}).extend({
  type: z.enum(['free_bet', 'deposit_match', 'cashback', 'odds_boost']),
  startAt: z.string().or(z.date()).transform((val) => 
    typeof val === 'string' ? new Date(val) : val
  ),
  endAt: z.string().or(z.date()).transform((val) => 
    typeof val === 'string' ? new Date(val) : val
  ),
});

// =====================================
// ADMIN TYPE EXPORTS
// =====================================

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type LoginAdmin = z.infer<typeof loginAdminSchema>;

export type AdminSession = typeof adminSessions.$inferSelect;

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type Market = typeof markets.$inferSelect;
export type InsertMarket = z.infer<typeof insertMarketSchema>;

export type MarketOutcome = typeof marketOutcomes.$inferSelect;
export type InsertMarketOutcome = z.infer<typeof insertMarketOutcomeSchema>;

export type OddsHistory = typeof oddsHistory.$inferSelect;

export type ExposureSnapshot = typeof exposureSnapshots.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;

export type UserPromotionRedemption = typeof userPromotionRedemptions.$inferSelect;

// Admin roles enum for TypeScript
export const AdminRoles = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin', 
  RISK_MANAGER: 'risk_manager',
  FINANCE: 'finance',
  COMPLIANCE: 'compliance',
  SUPPORT: 'support',
} as const;

export type AdminRole = typeof AdminRoles[keyof typeof AdminRoles];

// Role permissions matrix
export const rolePermissions: Record<AdminRole, string[]> = {
  superadmin: ['*'], // All permissions
  admin: [
    'dashboard:read',
    'matches:read', 'matches:create', 'matches:update', 'matches:delete',
    'markets:read', 'markets:create', 'markets:update', 'markets:delete',
    'odds:read', 'odds:update',
    'bets:read', 'bets:settle', 'bets:refund',
    'users:read', 'users:update', 'users:block',
    'exposure:read',
    'promotions:read', 'promotions:create', 'promotions:update',
    'reports:read',
    'audit:read',
  ],
  risk_manager: [
    'dashboard:read',
    'matches:read',
    'markets:read', 'markets:update',
    'odds:read', 'odds:update',
    'bets:read', 'bets:settle',
    'exposure:read',
    'reports:read',
    'audit:read',
  ],
  finance: [
    'dashboard:read',
    'bets:read',
    'users:read', 'users:wallet:adjust',
    'reports:read', 'reports:export',
    'promotions:read',
    'audit:read',
  ],
  compliance: [
    'dashboard:read',
    'bets:read',
    'users:read', 'users:block',
    'reports:read',
    'audit:read',
  ],
  support: [
    'dashboard:read',
    'bets:read',
    'users:read',
    'reports:read',
  ],
};

// Helper function to check permissions
export function hasPermission(role: AdminRole, permission: string): boolean {
  const permissions = rolePermissions[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}
