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
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull().default('0.00'),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Bets table - Main bet records
export const bets = pgTable("bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'single', 'express', 'system'
  totalStake: decimal("total_stake", { precision: 12, scale: 2 }).notNull(),
  potentialWinnings: decimal("potential_winnings", { precision: 12, scale: 2 }).notNull(),
  totalOdds: decimal("total_odds", { precision: 8, scale: 4 }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'cashout', 'cancelled'
  placedAt: timestamp("placed_at").notNull().default(sql`now()`),
  settledAt: timestamp("settled_at"),
  actualWinnings: decimal("actual_winnings", { precision: 12, scale: 2 }).default('0.00'),
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
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
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
});

export const insertBetSelectionSchema = createInsertSchema(betSelections).omit({
  id: true,
  status: true,
  result: true,
});

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
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Bet = typeof bets.$inferSelect;
export type InsertBet = z.infer<typeof insertBetSchema>;

export type BetSelection = typeof betSelections.$inferSelect;
export type InsertBetSelection = z.infer<typeof insertBetSelectionSchema>;

export type UserFavorite = typeof userFavorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type UserSession = typeof userSessions.$inferSelect;
