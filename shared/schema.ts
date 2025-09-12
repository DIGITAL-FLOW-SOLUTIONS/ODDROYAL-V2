import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, json, uuid, primaryKey } from "drizzle-orm/pg-core";
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
  betId: varchar("bet_id").notNull().references(() => bets.id),
  fixtureId: text("fixture_id").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league").notNull(),
  market: text("market").notNull(), // '1x2', 'ou', 'btts', etc.
  selection: text("selection").notNull(), // 'home', 'away', 'draw', 'over', 'under', etc.
  odds: decimal("odds", { precision: 8, scale: 4 }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'void'
  result: text("result"), // Final result that determined win/loss
});

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
