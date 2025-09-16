import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { 
  getUpcomingFixtures, 
  getLiveFixtures, 
  getFixtureOdds, 
  getLeagues,
  SportMonksFixture 
} from "./sportmonks";
import { 
  insertUserSchema, 
  insertBetSchema, 
  insertBetSelectionSchema, 
  insertFavoriteSchema,
  betPlacementSchema,
  currencyUtils,
  loginAdminSchema,
  insertAdminUserSchema
} from "@shared/schema";
import { initializeWebSocket, broadcastBetUpdate } from './websocket';
import { 
  authenticateAdmin, 
  require2FA, 
  requirePermission, 
  auditAction, 
  adminRateLimit 
} from './admin-middleware';
import argon2 from "argon2";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // Authentication Routes
  
  // User Registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.extend({
        confirmPassword: z.string().min(6)
      }).refine(
        (data) => data.password === data.confirmPassword,
        { message: "Passwords don't match", path: ["confirmPassword"] }
      ).parse(req.body);
      
      // Check if user already exists
      const existingUserByUsername = await storage.getUserByUsername(validatedData.username);
      const existingUserByEmail = await storage.getUserByEmail(validatedData.email);
      
      if (existingUserByUsername) {
        return res.status(400).json({ 
          success: false, 
          error: "Username already exists" 
        });
      }
      
      if (existingUserByEmail) {
        return res.status(400).json({ 
          success: false, 
          error: "Email already exists" 
        });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 12);
      
      // Create user
      const user = await storage.createUser({
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName
      });
      
      // Create session
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await storage.createSession(
        user.id, 
        sessionToken, 
        expiresAt, 
        req.ip,
        req.get('User-Agent')
      );
      
      // Return user (without password) and session
      const { password: _, ...userWithoutPassword } = user;
      res.json({ 
        success: true, 
        data: { 
          user: userWithoutPassword, 
          sessionToken 
        } 
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Validation failed",
          details: error.errors 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Registration failed" 
      });
    }
  });
  
  // User Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = z.object({
        username: z.string().min(1),
        password: z.string().min(1)
      }).parse(req.body);
      
      // Find user by username or email
      const user = await storage.getUserByUsername(username) || 
                   await storage.getUserByEmail(username);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid credentials" 
        });
      }
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid credentials" 
        });
      }
      
      // Create session
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await storage.createSession(
        user.id, 
        sessionToken, 
        expiresAt, 
        req.ip,
        req.get('User-Agent')
      );
      
      // Return user (without password) and session
      const { password: _, ...userWithoutPassword } = user;
      res.json({ 
        success: true, 
        data: { 
          user: userWithoutPassword, 
          sessionToken 
        } 
      });
      
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid request data" 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Login failed" 
      });
    }
  });
  
  // User Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const { sessionToken } = z.object({
        sessionToken: z.string()
      }).parse(req.body);
      
      await storage.deleteSession(sessionToken);
      
      res.json({ 
        success: true, 
        message: "Logged out successfully" 
      });
      
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Logout failed" 
      });
    }
  });
  
  // Get Current User (validate session)
  app.get("/api/auth/me", async (req, res) => {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        return res.status(401).json({ 
          success: false, 
          error: "No session token provided" 
        });
      }
      
      const session = await storage.getSession(sessionToken);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid or expired session" 
        });
      }
      
      const user = await storage.getUser(session.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          success: false, 
          error: "User not found or inactive" 
        });
      }
      
      // Return user without password and convert balance to pounds
      const { password: _, balance, ...userRest } = user;
      const userWithoutPassword = {
        ...userRest,
        balance: currencyUtils.centsToPounds(balance).toString() // Convert cents to pounds for frontend
      };
      res.json({ 
        success: true, 
        data: userWithoutPassword 
      });
      
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get user" 
      });
    }
  });

  // Profile and Wallet Routes
  
  // Update Profile (username/email)
  app.patch("/api/auth/profile", async (req, res) => {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        return res.status(401).json({ 
          success: false, 
          error: "No session token provided" 
        });
      }
      
      const session = await storage.getSession(sessionToken);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid or expired session" 
        });
      }
      
      const { username, email } = z.object({
        username: z.string().min(1).optional(),
        email: z.string().email().optional()
      }).parse(req.body);
      
      // Check if username/email already exists for other users
      if (username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== session.userId) {
          return res.status(400).json({ 
            success: false, 
            error: "Username already exists" 
          });
        }
      }
      
      if (email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== session.userId) {
          return res.status(400).json({ 
            success: false, 
            error: "Email already exists" 
          });
        }
      }
      
      // Update user profile
      await storage.updateUserProfile(session.userId, { username, email });
      
      res.json({ 
        success: true, 
        message: "Profile updated successfully" 
      });
      
    } catch (error) {
      console.error('Profile update error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid request data" 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to update profile" 
      });
    }
  });
  
  // Deposit funds
  app.post("/api/wallet/deposit", authenticateUser, async (req: any, res) => {
    try {
      const { amount } = z.object({
        amount: z.string().refine(val => {
          const num = parseFloat(val);
          return !isNaN(num) && num > 0 && num <= 100000; // Max £100,000 per deposit
        }, "Amount must be a positive number up to £100,000")
      }).parse(req.body);
      
      const depositAmount = parseFloat(amount);
      const depositAmountCents = currencyUtils.poundsToCents(depositAmount);
      
      const oldBalanceCents = req.user.balance;
      const newBalanceCents = oldBalanceCents + depositAmountCents;
      
      // Update user balance
      await storage.updateUserBalance(req.user.id, newBalanceCents);
      
      // Create transaction record
      await storage.createTransaction({
        userId: req.user.id,
        type: 'deposit',
        amount: depositAmountCents,
        balanceBefore: oldBalanceCents,
        balanceAfter: newBalanceCents,
        description: `Deposit of ${currencyUtils.formatCurrency(depositAmountCents)}`
      });
      
      res.json({ 
        success: true, 
        data: {
          amount: depositAmount,
          newBalance: currencyUtils.centsToPounds(newBalanceCents)
        }
      });
      
    } catch (error) {
      console.error('Deposit error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid request data",
          details: error.errors
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to process deposit" 
      });
    }
  });
  
  // Withdraw funds
  app.post("/api/wallet/withdraw", authenticateUser, async (req: any, res) => {
    try {
      const { amount } = z.object({
        amount: z.string().refine(val => {
          const num = parseFloat(val);
          return !isNaN(num) && num > 0 && num <= 100000; // Max £100,000 per withdrawal
        }, "Amount must be a positive number up to £100,000")
      }).parse(req.body);
      
      const withdrawAmount = parseFloat(amount);
      const withdrawAmountCents = currencyUtils.poundsToCents(withdrawAmount);
      
      const oldBalanceCents = req.user.balance;
      
      // Check if user has sufficient funds
      if (oldBalanceCents < withdrawAmountCents) {
        return res.status(400).json({ 
          success: false, 
          error: "Insufficient funds" 
        });
      }
      
      const newBalanceCents = oldBalanceCents - withdrawAmountCents;
      
      // Update user balance
      await storage.updateUserBalance(req.user.id, newBalanceCents);
      
      // Create transaction record
      await storage.createTransaction({
        userId: req.user.id,
        type: 'withdrawal',
        amount: -withdrawAmountCents,
        balanceBefore: oldBalanceCents,
        balanceAfter: newBalanceCents,
        description: `Withdrawal of ${currencyUtils.formatCurrency(withdrawAmountCents)}`
      });
      
      res.json({ 
        success: true, 
        data: {
          amount: withdrawAmount,
          newBalance: currencyUtils.centsToPounds(newBalanceCents)
        }
      });
      
    } catch (error) {
      console.error('Withdrawal error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid request data",
          details: error.errors
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to process withdrawal" 
      });
    }
  });

  // Get upcoming football fixtures
  app.get("/api/fixtures/upcoming", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const fixtures = await getUpcomingFixtures(limit);
      
      // Transform SportMonks data to our format
      const transformedFixtures = fixtures.map(transformFixture);
      
      res.json({ 
        success: true, 
        data: transformedFixtures,
        count: transformedFixtures.length 
      });
    } catch (error) {
      console.error('Error fetching upcoming fixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch upcoming fixtures' 
      });
    }
  });

  // Get live fixtures (by sport)
  app.get("/api/fixtures/live", async (req, res) => {
    try {
      const sportId = req.query.sportId ? parseInt(req.query.sportId as string) : undefined;
      const fixtures = await getLiveFixtures(sportId);
      
      // Transform SportMonks data to our format
      const transformedFixtures = fixtures.map(transformLiveFixture);
      
      res.json({ 
        success: true, 
        data: transformedFixtures,
        count: transformedFixtures.length 
      });
    } catch (error) {
      console.error('Error fetching live fixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch live fixtures' 
      });
    }
  });

  // Get live Football fixtures only (no mock data)
  app.get("/api/fixtures/live/football", async (req, res) => {
    try {
      const { getLiveFootballFixtures } = await import("./sportmonks");
      const fixtures = await getLiveFootballFixtures();
      
      // Transform SportMonks data to our format
      const transformedFixtures = fixtures.map(transformLiveFixture);
      
      res.json({ 
        success: true, 
        data: transformedFixtures,
        count: transformedFixtures.length 
      });
    } catch (error) {
      console.error('Error fetching live football fixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch live football fixtures' 
      });
    }
  });

  // Get sports list
  app.get("/api/sports", async (req, res) => {
    try {
      const { getSports } = await import("./sportmonks");
      const sports = await getSports();
      
      res.json({ 
        success: true, 
        data: sports 
      });
    } catch (error) {
      console.error('Error fetching sports:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch sports' 
      });
    }
  });

  // Get individual fixture details
  app.get("/api/fixtures/:id", async (req, res) => {
    try {
      const fixtureId = req.params.id;
      if (!fixtureId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Fixture ID is required' 
        });
      }

      // First check if fixture exists in upcoming fixtures
      const upcomingFixtures = await getUpcomingFixtures(100); // Get more to ensure we find it
      const fixture = upcomingFixtures.find((f: SportMonksFixture) => f.id.toString() === fixtureId);
      
      if (!fixture) {
        // If not in upcoming, check live fixtures
        const { getLiveFootballFixtures } = await import("./sportmonks");
        const liveFixtures = await getLiveFootballFixtures();
        const liveFixture = liveFixtures.find((f: SportMonksFixture) => f.id.toString() === fixtureId);
        
        if (!liveFixture) {
          return res.status(404).json({ 
            success: false, 
            error: 'Match not found' 
          });
        }
        
        // Transform live fixture data
        const transformedLiveFixture = transformLiveFixture(liveFixture);
        return res.json({ success: true, data: transformedLiveFixture });
      }
      
      // Transform upcoming fixture data
      const transformedFixture = transformFixture(fixture);
      res.json({ success: true, data: transformedFixture });
      
    } catch (error) {
      console.error('Error fetching fixture details:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch fixture details' 
      });
    }
  });

  // Get odds for a specific fixture
  app.get("/api/fixtures/:id/odds", async (req, res) => {
    try {
      const fixtureId = parseInt(req.params.id);
      if (isNaN(fixtureId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid fixture ID' 
        });
      }

      const odds = await getFixtureOdds(fixtureId);
      
      res.json({ 
        success: true, 
        data: odds 
      });
    } catch (error) {
      console.error('Error fetching fixture odds:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch fixture odds' 
      });
    }
  });

  // Get football leagues
  app.get("/api/leagues", async (req, res) => {
    try {
      const leagues = await getLeagues();
      
      res.json({ 
        success: true, 
        data: leagues 
      });
    } catch (error) {
      console.error('Error fetching leagues:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch leagues' 
      });
    }
  });
  
  // Helper middleware to authenticate requests
  async function authenticateUser(req: any, res: any, next: any) {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        return res.status(401).json({ 
          success: false, 
          error: "Authentication required" 
        });
      }
      
      const session = await storage.getSession(sessionToken);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid or expired session" 
        });
      }
      
      const user = await storage.getUser(session.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          success: false, 
          error: "User not found or inactive" 
        });
      }
      
      req.user = user;
      next();
      
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Authentication failed" 
      });
    }
  }

  // Betting Routes (Protected)
  
  // Place a bet with atomic transaction integrity
  app.post("/api/bets", authenticateUser, async (req: any, res) => {
    try {
      // Validate request data using shared schema with comprehensive business rules
      const validatedData = betPlacementSchema.parse(req.body);
      
      const user = req.user;
      
      // Validate user account status
      if (!user || !user.isActive) {
        return res.status(403).json({ 
          success: false, 
          error: "Account is not active" 
        });
      }

      // Use atomic bet placement to ensure transaction integrity
      const result = await storage.placeBetAtomic({
        userId: user.id,
        betType: validatedData.type,
        totalStakeCents: validatedData.totalStake, // Already converted to cents by schema
        selections: validatedData.selections
      });
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
      
      // Return formatted response with currency conversion
      res.json({ 
        success: true, 
        data: { 
          bet: {
            ...result.bet!,
            totalStake: currencyUtils.formatCurrency(result.bet!.totalStake),
            potentialWinnings: currencyUtils.formatCurrency(result.bet!.potentialWinnings),
            actualWinnings: result.bet!.actualWinnings ? currencyUtils.formatCurrency(result.bet!.actualWinnings) : null
          },
          selections: result.selections,
          user: {
            ...result.user!,
            balance: currencyUtils.formatCurrency(result.user!.balance)
          },
          transaction: {
            ...result.transaction!,
            amount: currencyUtils.formatCurrency(Math.abs(result.transaction!.amount)),
            balanceBefore: currencyUtils.formatCurrency(result.transaction!.balanceBefore),
            balanceAfter: currencyUtils.formatCurrency(result.transaction!.balanceAfter)
          }
        } 
      });
      
    } catch (error) {
      console.error('Place bet error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid bet data",
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to place bet" 
      });
    }
  });
  
  // Get user's bets
  app.get("/api/bets", authenticateUser, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const bets = await storage.getUserBets(req.user.id, limit);
      
      // Get selections for each bet
      const betsWithSelections = [];
      for (const bet of bets) {
        const selections = await storage.getBetSelections(bet.id);
        betsWithSelections.push({ ...bet, selections });
      }
      
      res.json({ 
        success: true, 
        data: betsWithSelections 
      });
      
    } catch (error) {
      console.error('Get bets error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get bets" 
      });
    }
  });
  
  // Get specific bet details
  app.get("/api/bets/:id", authenticateUser, async (req: any, res) => {
    try {
      const bet = await storage.getBet(req.params.id);
      
      if (!bet || bet.userId !== req.user.id) {
        return res.status(404).json({ 
          success: false, 
          error: "Bet not found" 
        });
      }
      
      const selections = await storage.getBetSelections(bet.id);
      
      res.json({ 
        success: true, 
        data: { ...bet, selections } 
      });
      
    } catch (error) {
      console.error('Get bet error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get bet" 
      });
    }
  });
  
  // Favorites Routes (Protected)
  
  // Add favorite
  app.post("/api/favorites", authenticateUser, async (req: any, res) => {
    try {
      const validatedData = insertFavoriteSchema.parse(req.body);
      
      const favorite = await storage.addFavorite({
        userId: req.user.id,
        ...validatedData
      });
      
      res.json({ 
        success: true, 
        data: favorite 
      });
      
    } catch (error) {
      console.error('Add favorite error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid favorite data",
          details: error.errors 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to add favorite" 
      });
    }
  });
  
  // Get user favorites
  app.get("/api/favorites", authenticateUser, async (req: any, res) => {
    try {
      const favorites = await storage.getUserFavorites(req.user.id);
      
      res.json({ 
        success: true, 
        data: favorites 
      });
      
    } catch (error) {
      console.error('Get favorites error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get favorites" 
      });
    }
  });
  
  // Remove favorite
  app.delete("/api/favorites/:entityId", authenticateUser, async (req: any, res) => {
    try {
      const success = await storage.removeFavorite(req.user.id, req.params.entityId);
      
      if (!success) {
        return res.status(404).json({ 
          success: false, 
          error: "Favorite not found" 
        });
      }
      
      res.json({ 
        success: true, 
        message: "Favorite removed successfully" 
      });
      
    } catch (error) {
      console.error('Remove favorite error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to remove favorite" 
      });
    }
  });
  
  // User Account Routes (Protected)
  
  // Get user transactions
  app.get("/api/transactions", authenticateUser, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const transactions = await storage.getUserTransactions(req.user.id, limit);
      
      res.json({ 
        success: true, 
        data: transactions 
      });
      
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get transactions" 
      });
    }
  });

  // Results and Settlement endpoints
  
  // Get finished match results 
  app.get("/api/results", async (req, res) => {
    try {
      // Since we don't have getFinishedFixtures function, we'll return empty for now
      // In a real implementation, this would fetch from SportMonks API
      res.json({ 
        success: true, 
        data: [],
        count: 0 
      });
      
    } catch (error) {
      console.error('Error fetching match results:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch match results' 
      });
    }
  });
  
  // Get settled bet results for a user
  app.get("/api/settlements", authenticateUser, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string;
      
      // Get user's settled bets (won, lost, or cancelled)
      const settledBets = await storage.getUserBets(req.user.id, limit);
      const filteredBets = settledBets.filter(bet => {
        if (status && status !== 'all') {
          return bet.status === status;
        }
        return bet.status !== 'pending'; // Only settled bets
      });
      
      // Get selections for each bet
      const betsWithSelections = [];
      for (const bet of filteredBets) {
        const selections = await storage.getBetSelections(bet.id);
        betsWithSelections.push({ ...bet, selections });
      }
      
      res.json({ 
        success: true, 
        data: betsWithSelections 
      });
      
    } catch (error) {
      console.error('Get settlements error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get settlements" 
      });
    }
  });

  // =====================================
  // ADMIN AUTHENTICATION ROUTES
  // =====================================
  
  // Admin Login
  app.post("/api/admin/auth/login", adminRateLimit, auditAction('admin_login_attempt'), async (req, res) => {
    try {
      const validatedData = loginAdminSchema.parse(req.body);
      
      // Generic error response for all authentication failures (security: prevent user enumeration)
      const genericError = () => res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
      
      // Find admin user
      const adminUser = await storage.getAdminUserByUsername(validatedData.username);
      if (!adminUser || !adminUser.isActive) {
        return genericError();
      }
      
      // Check if admin is locked out (enforce internally but don't expose status)
      if (adminUser.lockedUntil && adminUser.lockedUntil > new Date()) {
        return genericError();
      }
      
      // Verify password
      const isPasswordValid = await argon2.verify(adminUser.passwordHash, validatedData.password);
      if (!isPasswordValid) {
        // Increment failed attempts
        const attempts = adminUser.loginAttempts + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : undefined;
        await storage.updateAdminLoginAttempts(adminUser.id, attempts, lockedUntil);
        
        return genericError();
      }
      
      // Check 2FA if enabled
      if (adminUser.totpSecret) {
        if (!validatedData.totpCode) {
          return res.status(200).json({
            success: true,
            requiresTwoFactor: true,
            message: 'TOTP code required'
          });
        }
        
        // Verify TOTP code
        const isTotpValid = speakeasy.totp.verify({
          secret: adminUser.totpSecret,
          encoding: 'base32',
          token: validatedData.totpCode,
          window: 2 // Allow 2-step window for clock drift
        });
        
        if (!isTotpValid) {
          // Increment failed attempts for invalid TOTP
          const attempts = adminUser.loginAttempts + 1;
          const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : undefined;
          await storage.updateAdminLoginAttempts(adminUser.id, attempts, lockedUntil);
          
          return genericError();
        }
      }
      
      // Successful login - reset failed attempts
      await storage.updateAdminLoginAttempts(adminUser.id, 0);
      
      // Update last login time
      await storage.updateAdminUser(adminUser.id, { 
        lastLogin: new Date() 
      });
      
      // Create admin session (no refresh token for security - use session token only)
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours
      
      const session = await storage.createAdminSession(
        adminUser.id,
        sessionToken,
        expiresAt,
        req.ip,
        req.get('User-Agent')
      );
      
      // Update session 2FA status
      await storage.updateAdminSession(session.id, {
        twoFactorVerified: !!adminUser.totpSecret
      });
      
      // Log successful login
      await storage.createAuditLog({
        adminId: adminUser.id,
        actionType: 'login',
        targetType: null,
        targetId: null,
        dataBefore: null,
        dataAfter: null,
        note: 'Admin logged in successfully',
        ipAddress: req.ip || null,
        userAgent: req.get('User-Agent') || null,
        success: true,
        errorMessage: null
      });
      
      // Return admin user (without password) and session
      const { passwordHash: _, ...adminWithoutPassword } = adminUser;
      res.json({
        success: true,
        data: {
          admin: adminWithoutPassword,
          sessionToken,
          requiresTwoFactor: false
        }
      });
      
    } catch (error) {
      console.error('Admin login error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }
      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  });
  
  // Admin Logout
  app.post("/api/admin/auth/logout", authenticateAdmin, auditAction('admin_logout'), async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.replace('Bearer ', '');
      
      if (sessionToken) {
        await storage.deleteAdminSession(sessionToken);
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
      
    } catch (error) {
      console.error('Admin logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  });
  
  // Get Current Admin User
  app.get("/api/admin/auth/me", authenticateAdmin, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminUser(req.adminUser.id);
      if (!adminUser) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }
      
      // Return admin without password
      const { passwordHash: _, ...adminWithoutPassword } = adminUser;
      res.json({
        success: true,
        data: {
          admin: adminWithoutPassword,
          twoFactorVerified: req.adminUser.twoFactorVerified
        }
      });
      
    } catch (error) {
      console.error('Get admin user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get admin user'
      });
    }
  });
  
  // Setup 2FA (requires password verification for security)
  app.post("/api/admin/auth/setup-2fa", authenticateAdmin, auditAction('admin_2fa_setup'), async (req: any, res) => {
    try {
      const { currentPassword } = z.object({
        currentPassword: z.string().min(1, 'Current password is required')
      }).parse(req.body);
      
      const adminUser = await storage.getAdminUser(req.adminUser.id);
      if (!adminUser) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }
      
      // Require current password verification before allowing 2FA setup
      const isPasswordValid = await argon2.verify(adminUser.passwordHash, currentPassword);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }
      
      // Check if 2FA is already enabled
      if (adminUser.totpSecret) {
        return res.status(400).json({
          success: false,
          error: '2FA is already enabled. Disable it first to set up a new secret.'
        });
      }
      
      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `PRIMESTAKE Admin (${adminUser.username})`,
        issuer: 'PRIMESTAKE'
      });
      
      // Generate QR code
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);
      
      // Return masked secret for security - only show first and last 4 chars
      const maskedSecret = secret.base32.substring(0, 4) + '*'.repeat(secret.base32.length - 8) + secret.base32.substring(secret.base32.length - 4);
      
      // Store temporary secret (not yet enabled)
      // We'll enable it when the user verifies it
      res.json({
        success: true,
        data: {
          secret: secret.base32, // Full secret needed for initial setup only
          qrCode: qrCodeUrl,
          manualEntryKey: secret.base32,
          maskedSecret // For display purposes
        }
      });
      
    } catch (error) {
      console.error('Setup 2FA error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Current password is required',
          details: error.errors
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to setup 2FA'
      });
    }
  });
  
  // Verify and Enable 2FA
  app.post("/api/admin/auth/verify-2fa", authenticateAdmin, auditAction('admin_2fa_enable'), async (req: any, res) => {
    try {
      const { secret, totpCode } = z.object({
        secret: z.string().min(1),
        totpCode: z.string().length(6)
      }).parse(req.body);
      
      // Verify TOTP code with the provided secret
      const isValid = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid TOTP code'
        });
      }
      
      // Enable 2FA for the admin
      await storage.enableAdmin2FA(req.adminUser.id, secret);
      
      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      });
      
    } catch (error) {
      console.error('Verify 2FA error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to verify 2FA'
      });
    }
  });
  
  // Disable 2FA
  app.post("/api/admin/auth/disable-2fa", authenticateAdmin, require2FA, auditAction('admin_2fa_disable'), async (req: any, res) => {
    try {
      const { totpCode } = z.object({
        totpCode: z.string().length(6)
      }).parse(req.body);
      
      const adminUser = await storage.getAdminUser(req.adminUser.id);
      if (!adminUser || !adminUser.totpSecret) {
        return res.status(400).json({
          success: false,
          error: '2FA is not enabled'
        });
      }
      
      // Verify current TOTP code before disabling
      const isValid = speakeasy.totp.verify({
        secret: adminUser.totpSecret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid TOTP code'
        });
      }
      
      // Disable 2FA
      await storage.disableAdmin2FA(req.adminUser.id);
      
      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });
      
    } catch (error) {
      console.error('Disable 2FA error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data'
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to disable 2FA'
      });
    }
  });

  const httpServer = createServer(app);
  
  // Initialize WebSocket server for real-time updates
  initializeWebSocket(httpServer);
  
  return httpServer;
}

// Transform SportMonks fixture data to our app format
function transformFixture(fixture: SportMonksFixture) {
  const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
  const awayTeam = fixture.participants.find(p => p.meta.location === 'away');
  
  return {
    id: fixture.id.toString(),
    homeTeam: {
      id: homeTeam?.id.toString() || '1',
      name: homeTeam?.name || 'Home Team'
    },
    awayTeam: {
      id: awayTeam?.id.toString() || '2', 
      name: awayTeam?.name || 'Away Team'
    },
    kickoffTime: fixture.starting_at,
    status: 'upcoming' as const,
    league: fixture.league?.name || 'Unknown League',
    venue: 'Stadium', // SportMonks doesn't include venue in basic fixture data
    // Add default odds that match frontend expectations
    odds: {
      home: 2.25,
      draw: 3.10,
      away: 2.85
    },
    additionalMarkets: 12
  };
}

// Transform SportMonks live fixture data to our app format
function transformLiveFixture(fixture: SportMonksFixture) {
  const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
  const awayTeam = fixture.participants.find(p => p.meta.location === 'away');
  
  const homeScore = fixture.scores.find(s => s.participant_id === homeTeam?.id)?.score.goals || 0;
  const awayScore = fixture.scores.find(s => s.participant_id === awayTeam?.id)?.score.goals || 0;
  
  // Calculate elapsed time (basic estimation)
  const startTime = new Date(fixture.starting_at);
  const now = new Date();
  const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
  const minute = Math.min(elapsedMinutes, 90);
  
  return {
    id: fixture.id.toString(),
    homeTeam: {
      id: homeTeam?.id.toString() || '1',
      name: homeTeam?.name || 'Home Team',
      score: homeScore
    },
    awayTeam: {
      id: awayTeam?.id.toString() || '2',
      name: awayTeam?.name || 'Away Team',
      score: awayScore
    },
    league: fixture.league?.name || 'Unknown League',
    kickoffTime: fixture.starting_at,
    status: 'live' as const,
    minute: minute > 0 ? minute : 1,
    venue: 'Stadium',
    // Add default odds for live matches
    odds: {
      home: 1.95,
      draw: 3.25,
      away: 3.10
    },
    additionalMarkets: 15
  };
}
