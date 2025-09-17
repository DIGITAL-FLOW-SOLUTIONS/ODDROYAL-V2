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
  insertAdminUserSchema,
  User,
  AdminRoles,
  rolePermissions
} from "@shared/schema";
import { initializeWebSocket, broadcastBetUpdate } from './websocket';
import { 
  authenticateAdmin, 
  require2FA, 
  auditAction, 
  adminRateLimit 
} from './admin-middleware';
import {
  requirePermission,
  requireRole,
  requireAnyRole,
  requireSuperadmin,
  requireAdminLevel
} from './rbac-middleware';
import {
  SecurityMiddlewareOrchestrator,
  CSRFProtectionManager,
  AdminRateLimitManager,
  RequestValidationManager,
  SecurityMonitoringManager,
  createSecurityHeadersMiddleware
} from './security-middleware';
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
  
  // CSRF Token endpoint for admin users
  app.get("/api/admin/csrf-token", ...SecurityMiddlewareOrchestrator.getCSRFProvisionMiddleware(), authenticateAdmin, async (req: any, res) => {
    try {
      // CSRF token is automatically added to response by CSRFProtectionManager.provideCSRFToken middleware
      res.json({
        success: true,
        message: 'CSRF token provided in response'
      });
    } catch (error) {
      console.error('CSRF token error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate CSRF token'
      });
    }
  });
  
  // Admin Login
  app.post("/api/admin/auth/login", ...SecurityMiddlewareOrchestrator.getAuthMiddleware(), adminRateLimit, auditAction('admin_login_attempt'), async (req, res) => {
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
      
      // Update last login time and reset failed attempts
      await storage.updateAdminLoginAttempts(adminUser.id, 0);
      
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
  app.post("/api/admin/auth/logout", ...SecurityMiddlewareOrchestrator.getAuthMiddleware(), authenticateAdmin, auditAction('admin_logout'), async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.replace('Bearer ', '');
      
      if (sessionToken) {
        await storage.deleteAdminSession(sessionToken);
        
        // Clear CSRF token for the admin user
        if (req.adminUser?.id) {
          CSRFProtectionManager.clearCSRFToken(req.adminUser.id);
        }
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
  app.get("/api/admin/auth/me", ...SecurityMiddlewareOrchestrator.getCSRFProvisionMiddleware(), authenticateAdmin, async (req: any, res) => {
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

  // ===================== RBAC API ENDPOINTS =====================
  
  // Helper function to get role descriptions
  function getRoleDescription(role: string): string {
    const descriptions = {
      'superadmin': 'Full system access with all permissions',
      'admin': 'Full operational access to matches, bets, users, and reports',
      'risk_manager': 'Risk management and exposure monitoring',
      'finance': 'Financial operations and wallet management',
      'compliance': 'Compliance monitoring and user oversight', 
      'support': 'Customer support with read-only access'
    };
    return descriptions[role as keyof typeof descriptions] || 'No description available';
  }
  
  // Get current admin's permissions
  app.get("/api/admin/rbac/permissions", ...SecurityMiddlewareOrchestrator.getStandardMiddleware(), authenticateAdmin, async (req: any, res) => {
    try {
      const adminRole = req.adminUser.role as keyof typeof rolePermissions;
      const permissions = rolePermissions[adminRole] || [];
      
      res.json({
        success: true,
        data: {
          role: adminRole,
          permissions,
          isSuperadmin: adminRole === 'superadmin'
        }
      });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve permissions'
      });
    }
  });

  // Get all available roles and their permissions (superadmin only)
  app.get("/api/admin/rbac/roles", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requireSuperadmin(), auditAction('rbac_roles_view'), async (req: any, res) => {
    try {
      const { rolePermissions, AdminRoles } = await import('@shared/schema');
      
      const rolesData = Object.values(AdminRoles).map(role => ({
        role,
        permissions: rolePermissions[role] || [],
        description: getRoleDescription(role)
      }));
      
      res.json({
        success: true,
        data: rolesData
      });
    } catch (error) {
      console.error('Get roles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve roles'
      });
    }
  });

  // List admin users with roles (admin+ only)
  app.get("/api/admin/users", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requireAdminLevel(), auditAction('admin_users_view'), async (req: any, res) => {
    try {
      const { limit = 50, offset = 0, role, search, isActive } = req.query;
      
      const result = await storage.searchAdminUsers({
        query: search,
        role,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      // Remove sensitive data from response
      const safeUsers = result.users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        // Admin users don't have firstName/lastName fields
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        totpEnabled: !!user.totpSecret
      }));
      
      res.json({
        success: true,
        data: {
          users: safeUsers,
          total: result.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('List admin users error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve admin users'
      });
    }
  });

  // Update admin user role (superadmin only)
  app.patch("/api/admin/users/:id/role", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    require2FA, 
    auditAction('admin_role_change', (req) => ({ 
      targetType: 'admin_user', 
      targetId: req.params.id, 
      note: `Role change request for admin ${req.params.id}` 
    })), 
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { role } = z.object({
          role: z.enum(['superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support'])
        }).parse(req.body);
        
        // Prevent self-role modification
        if (id === req.adminUser.id) {
          return res.status(400).json({
            success: false,
            error: 'Cannot modify your own role for security reasons'
          });
        }
        
        const result = await storage.updateAdminRole(id, role, req.adminUser.id);
        
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error
          });
        }
        
        // Remove sensitive data from response
        const safeAdmin = result.admin ? {
          id: result.admin.id,
          username: result.admin.username,
          email: result.admin.email,
          // Admin users don't have firstName/lastName fields
          role: result.admin.role,
          isActive: result.admin.isActive,
          updatedAt: result.admin.updatedAt
        } : null;
        
        res.json({
          success: true,
          data: {
            admin: safeAdmin,
            auditLogId: result.auditLog?.id
          },
          message: `Admin role updated successfully to ${role}`
        });
      } catch (error) {
        console.error('Update admin role error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to update admin role'
        });
      }
    }
  );

  // Get admin users by role (admin+ only)
  app.get("/api/admin/users/role/:role", authenticateAdmin, requireAdminLevel(), async (req: any, res) => {
    try {
      const { role } = req.params;
      const admins = await storage.getAdminsByRole(role);
      
      // Remove sensitive data from response
      const safeAdmins = admins.map(admin => ({
        id: admin.id,
        username: admin.username,
        email: admin.email,
        // Admin users don't have firstName/lastName fields
        role: admin.role,
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt
      }));
      
      res.json({
        success: true,
        data: safeAdmins
      });
    } catch (error) {
      console.error('Get admins by role error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve admins by role'
      });
    }
  });

  // ===================== PROTECTED ADMIN BUSINESS ENDPOINTS =====================
  
  // Dashboard data (all authenticated admins)
  app.get("/api/admin/dashboard", ...SecurityMiddlewareOrchestrator.getStandardMiddleware(), authenticateAdmin, requirePermission('dashboard:read'), async (req: any, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      // Get all data from storage
      const allUsers = Array.from((storage as any).users.values());
      const allBets = Array.from((storage as any).bets.values());
      const allTransactions = Array.from((storage as any).transactions.values());
      const auditLogs = await storage.getAuditLogs(20);
      
      // User metrics
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter(user => user.isActive).length;
      const newUsersToday = allUsers.filter(user => new Date(user.createdAt) >= today).length;
      const newUsersThisWeek = allUsers.filter(user => new Date(user.createdAt) >= weekAgo).length;
      const newUsersLastWeek = allUsers.filter(user => {
        const created = new Date(user.createdAt);
        return created >= twoWeeksAgo && created < weekAgo;
      }).length;
      const userGrowthPercentage = newUsersLastWeek > 0 ? 
        ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100 : 0;
      
      // Bet metrics
      const totalBets = allBets.length;
      const pendingBets = allBets.filter(bet => bet.status === 'pending');
      const settledBets = allBets.filter(bet => bet.status !== 'pending');
      const betsToday = allBets.filter(bet => new Date(bet.placedAt) >= today).length;
      const betsThisWeek = allBets.filter(bet => new Date(bet.placedAt) >= weekAgo).length;
      const betsLastWeek = allBets.filter(bet => {
        const placed = new Date(bet.placedAt);
        return placed >= twoWeeksAgo && placed < weekAgo;
      }).length;
      const betVolumeGrowthPercentage = betsLastWeek > 0 ? 
        ((betsThisWeek - betsLastWeek) / betsLastWeek) * 100 : 0;
      
      // Financial metrics
      const totalTurnoverCents = allBets.reduce((sum, bet) => sum + bet.totalStake, 0);
      const turnoverTodayCents = allBets
        .filter(bet => new Date(bet.placedAt) >= today)
        .reduce((sum, bet) => sum + bet.totalStake, 0);
      const turnoverThisWeekCents = allBets
        .filter(bet => new Date(bet.placedAt) >= weekAgo)
        .reduce((sum, bet) => sum + bet.totalStake, 0);
      const turnoverLastWeekCents = allBets
        .filter(bet => {
          const placed = new Date(bet.placedAt);
          return placed >= twoWeeksAgo && placed < weekAgo;
        })
        .reduce((sum, bet) => sum + bet.totalStake, 0);
      
      const totalWinningsCents = settledBets
        .filter(bet => bet.status === 'won')
        .reduce((sum, bet) => sum + (bet.actualWinnings || 0), 0);
      const totalGgrCents = totalTurnoverCents - totalWinningsCents;
      
      const ggrTodayCents = allBets
        .filter(bet => new Date(bet.placedAt) >= today && bet.status !== 'pending')
        .reduce((sum, bet) => {
          const stake = bet.totalStake;
          const winnings = bet.status === 'won' ? (bet.actualWinnings || 0) : 0;
          return sum + (stake - winnings);
        }, 0);
      
      const ggrThisWeekCents = allBets
        .filter(bet => new Date(bet.placedAt) >= weekAgo && bet.status !== 'pending')
        .reduce((sum, bet) => {
          const stake = bet.totalStake;
          const winnings = bet.status === 'won' ? (bet.actualWinnings || 0) : 0;
          return sum + (stake - winnings);
        }, 0);
      
      const ggrLastWeekCents = allBets
        .filter(bet => {
          const placed = new Date(bet.placedAt);
          return placed >= twoWeeksAgo && placed < weekAgo && bet.status !== 'pending';
        })
        .reduce((sum, bet) => {
          const stake = bet.totalStake;
          const winnings = bet.status === 'won' ? (bet.actualWinnings || 0) : 0;
          return sum + (stake - winnings);
        }, 0);
      
      const revenueGrowthPercentage = ggrLastWeekCents > 0 ? 
        ((ggrThisWeekCents - ggrLastWeekCents) / ggrLastWeekCents) * 100 : 0;
      
      // Balance metrics
      const totalPlayerBalanceCents = allUsers.reduce((sum, user) => sum + user.balance, 0);
      const averagePlayerBalanceCents = totalUsers > 0 ? totalPlayerBalanceCents / totalUsers : 0;
      
      // Risk metrics
      const totalExposureCents = pendingBets.reduce((sum, bet) => sum + bet.potentialWinnings, 0);
      const highRiskBetsCount = pendingBets.filter(bet => bet.potentialWinnings > 100000).length; // > £1000
      
      // Generate trend data for charts (last 7 days)
      const trendData = {
        betVolume: [],
        userRegistrations: [],
        revenue: [],
        turnover: []
      };
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayBets = allBets.filter(bet => {
          const placed = new Date(bet.placedAt);
          return placed >= date && placed < nextDate;
        });
        
        const dayUsers = allUsers.filter(user => {
          const created = new Date(user.createdAt);
          return created >= date && created < nextDate;
        });
        
        const dayTurnover = dayBets.reduce((sum, bet) => sum + bet.totalStake, 0);
        const dayRevenue = dayBets
          .filter(bet => bet.status !== 'pending')
          .reduce((sum, bet) => {
            const stake = bet.totalStake;
            const winnings = bet.status === 'won' ? (bet.actualWinnings || 0) : 0;
            return sum + (stake - winnings);
          }, 0);
        
        trendData.betVolume.push({ date: dateStr, value: dayBets.length });
        trendData.userRegistrations.push({ date: dateStr, value: dayUsers.length });
        trendData.revenue.push({ date: dateStr, value: dayRevenue });
        trendData.turnover.push({ date: dateStr, value: dayTurnover });
      }
      
      // Recent activity from audit logs and recent bets
      const recentActivity = [];
      
      // Add recent bets
      const recentBets = allBets
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .slice(0, 5);
      
      recentBets.forEach(bet => {
        recentActivity.push({
          id: `bet-${bet.id}`,
          type: 'bet_placed',
          title: 'New Bet Placed',
          description: `${bet.type} bet for £${(bet.totalStake / 100).toFixed(2)}`,
          timestamp: bet.placedAt.toISOString(),
          userId: bet.userId,
          betId: bet.id,
          amount: bet.totalStake,
          severity: 'info'
        });
      });
      
      // Add recent user registrations
      const recentUsers = allUsers
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);
      
      recentUsers.forEach(user => {
        recentActivity.push({
          id: `user-${user.id}`,
          type: 'user_registered',
          title: 'New User Registration',
          description: `User ${user.username} registered`,
          timestamp: user.createdAt.toISOString(),
          userId: user.id,
          severity: 'success'
        });
      });
      
      // Add audit log entries
      auditLogs.forEach(log => {
        recentActivity.push({
          id: `audit-${log.id}`,
          type: 'admin_action',
          title: 'Admin Action',
          description: log.actionType.replace('_', ' ').toUpperCase(),
          timestamp: log.timestamp.toISOString(),
          adminId: log.adminId,
          severity: 'info'
        });
      });
      
      // Sort all activity by timestamp
      recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Quick actions
      const quickActions = [
        {
          id: 'view-pending-bets',
          title: 'Pending Bets',
          description: 'Review and settle pending bets',
          action: 'navigate:/admin/bets?status=pending',
          icon: 'Trophy',
          count: pendingBets.length,
          enabled: true
        },
        {
          id: 'view-users',
          title: 'User Management',
          description: 'Manage user accounts and permissions',
          action: 'navigate:/admin/users',
          icon: 'Users',
          count: totalUsers,
          enabled: true
        },
        {
          id: 'view-reports',
          title: 'Financial Reports',
          description: 'Generate financial and activity reports',
          action: 'navigate:/admin/reports',
          icon: 'DollarSign',
          enabled: true
        },
        {
          id: 'system-health',
          title: 'System Health',
          description: 'Monitor system performance and alerts',
          action: 'navigate:/admin/system',
          icon: 'Activity',
          enabled: true
        }
      ];
      
      // System alerts
      const systemAlerts = [];
      
      if (highRiskBetsCount > 0) {
        systemAlerts.push({
          id: 'high-risk-bets',
          type: 'high_exposure',
          title: 'High Risk Bets Detected',
          message: `${highRiskBetsCount} bets with potential payouts over £1,000`,
          severity: 'medium',
          timestamp: now.toISOString(),
          isResolved: false,
          actionRequired: true
        });
      }
      
      if (totalExposureCents > 10000000) { // > £100,000
        systemAlerts.push({
          id: 'high-exposure',
          type: 'high_exposure',
          title: 'High Total Exposure',
          message: `Total exposure: £${(totalExposureCents / 100).toLocaleString()}`,
          severity: 'high',
          timestamp: now.toISOString(),
          isResolved: false,
          actionRequired: true
        });
      }
      
      const dashboardData = {
        metrics: {
          totalUsers,
          activeUsers,
          newUsersToday,
          newUsersThisWeek,
          userGrowthPercentage: Math.round(userGrowthPercentage * 100) / 100,
          totalBets,
          pendingBets: pendingBets.length,
          settledBets: settledBets.length,
          betsToday,
          betsThisWeek,
          betVolumeGrowthPercentage: Math.round(betVolumeGrowthPercentage * 100) / 100,
          totalTurnoverCents,
          turnoverTodayCents,
          turnoverThisWeekCents,
          totalGgrCents,
          ggrTodayCents,
          ggrThisWeekCents,
          revenueGrowthPercentage: Math.round(revenueGrowthPercentage * 100) / 100,
          totalPlayerBalanceCents,
          averagePlayerBalanceCents: Math.round(averagePlayerBalanceCents),
          totalExposureCents,
          highRiskBetsCount,
          systemStatus: 'operational',
          lastUpdated: now.toISOString()
        },
        trends: trendData,
        recentActivity: recentActivity.slice(0, 10),
        quickActions,
        systemAlerts,
        connectedClients: (global as any).connectedClients?.size || 0,
        lastRefresh: now.toISOString()
      };
      
      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load dashboard data'
      });
    }
  });

  // Bet management endpoints
  app.get("/api/admin/bets", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requirePermission('bets:read'), async (req: any, res) => {
    try {
      const { limit = 50, offset = 0, status, userId } = req.query;
      const pendingBets = await storage.getPendingBets();
      
      // For now, return pending bets - in a real system this would have more filtering
      res.json({
        success: true,
        data: {
          bets: pendingBets.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
          total: pendingBets.length
        }
      });
    } catch (error) {
      console.error('Get admin bets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bets'
      });
    }
  });

  app.patch("/api/admin/bets/:id/settle", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:settle'), 
    auditAction('bet_settlement', (req) => ({ 
      targetType: 'bet', 
      targetId: req.params.id, 
      note: `Bet settlement attempt` 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { status, actualWinnings } = z.object({
          status: z.enum(['won', 'lost', 'void']),
          actualWinnings: z.number().optional()
        }).parse(req.body);

        const result = await storage.updateBetStatus(id, status, actualWinnings);
        if (!result) {
          return res.status(404).json({
            success: false,
            error: 'Bet not found'
          });
        }

        res.json({
          success: true,
          data: result,
          message: `Bet ${status} successfully`
        });
      } catch (error) {
        console.error('Settle bet error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to settle bet'
        });
      }
    }
  );

  // User management endpoints  
  app.get("/api/admin/customers", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requirePermission('users:read'), async (req: any, res) => {
    try {
      const { limit = 50, offset = 0, search, isActive } = req.query;
      
      // Get all users from storage
      const allUsers = Array.from(((await storage as any).users as Map<string, User>).values());
      let filteredUsers = allUsers;
      
      // Apply filters
      if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter(user => 
          user.username.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        );
      }
      
      if (isActive !== undefined) {
        filteredUsers = filteredUsers.filter(user => user.isActive === (isActive === 'true'));
      }
      
      const total = filteredUsers.length;
      const users = filteredUsers
        .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
        .map(user => ({
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          balance: user.balance,
          isActive: user.isActive,
          createdAt: user.createdAt
        }));
      
      res.json({
        success: true,
        data: { users, total }
      });
    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve customers'
      });
    }
  });

  app.patch("/api/admin/customers/:id/status", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:block'),
    auditAction('user_status_change', (req) => ({ 
      targetType: 'user', 
      targetId: req.params.id, 
      note: `User status change attempt` 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { isActive } = z.object({
          isActive: z.boolean()
        }).parse(req.body);

        const user = await storage.getUser(id);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Update user status (simplified - in real implementation would need updateUserStatus method)
        const updatedUser = await storage.updateUserProfile(id, { isActive } as any);
        
        res.json({
          success: true,
          data: updatedUser,
          message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });
      } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update user status'
        });
      }
    }
  );

  // Financial operations
  app.patch("/api/admin/customers/:id/balance", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('users:wallet:adjust'),
    require2FA,
    auditAction('balance_adjustment', (req) => ({ 
      targetType: 'user', 
      targetId: req.params.id, 
      note: `Balance adjustment attempt` 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { amount, reason } = z.object({
          amount: z.number(),
          reason: z.string().min(1, 'Reason is required')
        }).parse(req.body);

        const user = await storage.getUser(id);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        const newBalance = user.balance + Math.round(amount * 100); // Convert to cents
        if (newBalance < 0) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient balance for adjustment'
          });
        }

        const updatedUser = await storage.updateUserBalance(id, newBalance);
        
        // Create transaction record
        await storage.createTransaction({
          userId: id,
          type: amount > 0 ? 'bonus' : 'adjustment',
          amount: Math.round(amount * 100),
          balanceBefore: user.balance,
          balanceAfter: newBalance,
          reference: `Admin adjustment by ${req.adminUser.username}`,
          description: reason
        });
        
        res.json({
          success: true,
          data: updatedUser,
          message: 'Balance adjusted successfully'
        });
      } catch (error) {
        console.error('Adjust balance error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to adjust balance'
        });
      }
    }
  );

  // Audit logs endpoint
  app.get("/api/admin/audit", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('audit:read'),
    async (req: any, res) => {
      try {
        const { limit = 50, offset = 0 } = req.query;
        const auditLogs = await storage.getAuditLogs(parseInt(limit), parseInt(offset));
        
        res.json({
          success: true,
          data: auditLogs
        });
      } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve audit logs'
        });
      }
    }
  );

  // ===================== MATCH MANAGEMENT ENDPOINTS =====================
  
  // Create manual match
  app.post("/api/admin/matches", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:create'), 
    auditAction('match_create'),
    async (req: any, res) => {
      try {
        const { insertMatchSchema } = await import('@shared/schema');
        const validatedData = insertMatchSchema.parse(req.body);
        
        // Check for existing match with same teams and time
        const existingMatches = await storage.getMatchesByTeamsAndTime(
          validatedData.homeTeamId, 
          validatedData.awayTeamId, 
          validatedData.kickoffTime
        );
        
        if (existingMatches.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'A match with these teams at this time already exists'
          });
        }
        
        const match = await storage.createMatch({
          ...validatedData,
          isManual: true,
          createdBy: req.adminUser.id
        });
        
        res.json({
          success: true,
          data: match,
          message: 'Match created successfully'
        });
      } catch (error) {
        console.error('Create match error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to create match'
        });
      }
    }
  );
  
  // Update match
  app.put("/api/admin/matches/:id", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:update'), 
    auditAction('match_update', (req) => ({ 
      targetType: 'match', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { insertMatchSchema } = await import('@shared/schema');
        const validatedData = insertMatchSchema.partial().parse(req.body);
        
        const existingMatch = await storage.getMatch(id);
        if (!existingMatch) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        const updatedMatch = await storage.updateMatch(id, {
          ...validatedData,
          updatedBy: req.adminUser.id
        });
        
        res.json({
          success: true,
          data: updatedMatch,
          message: 'Match updated successfully'
        });
      } catch (error) {
        console.error('Update match error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update match'
        });
      }
    }
  );
  
  // Delete match (soft delete)
  app.delete("/api/admin/matches/:id", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:delete'), 
    require2FA,
    auditAction('match_delete', (req) => ({ 
      targetType: 'match', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        
        const match = await storage.getMatch(id);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        // Check if match has active bets
        const activeBets = await storage.getActiveBetsByMatch(id);
        if (activeBets.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Cannot delete match with active bets. Settle all bets first.'
          });
        }
        
        await storage.softDeleteMatch(id, req.adminUser.id);
        
        res.json({
          success: true,
          message: 'Match deleted successfully'
        });
      } catch (error) {
        console.error('Delete match error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete match'
        });
      }
    }
  );
  
  // ===================== MARKET MANAGEMENT ENDPOINTS =====================
  
  // Create market for match
  app.post("/api/admin/markets", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:create'), 
    auditAction('market_create'),
    async (req: any, res) => {
      try {
        const { insertMarketSchema } = await import('@shared/schema');
        const validatedData = insertMarketSchema.parse(req.body);
        
        // Verify match exists
        const match = await storage.getMatch(validatedData.matchId);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        const market = await storage.createMarket({
          ...validatedData,
          createdBy: req.adminUser.id
        });
        
        res.json({
          success: true,
          data: market,
          message: 'Market created successfully'
        });
      } catch (error) {
        console.error('Create market error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to create market'
        });
      }
    }
  );
  
  // Update market
  app.put("/api/admin/markets/:id", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:update'), 
    auditAction('market_update', (req) => ({ 
      targetType: 'market', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { insertMarketSchema } = await import('@shared/schema');
        const validatedData = insertMarketSchema.partial().parse(req.body);
        
        const market = await storage.updateMarket(id, {
          ...validatedData,
          updatedBy: req.adminUser.id
        });
        
        if (!market) {
          return res.status(404).json({
            success: false,
            error: 'Market not found'
          });
        }
        
        res.json({
          success: true,
          data: market,
          message: 'Market updated successfully'
        });
      } catch (error) {
        console.error('Update market error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update market'
        });
      }
    }
  );
  
  // ===================== EXPOSURE CALCULATION ENDPOINT =====================
  
  // Get exposure data
  app.get("/api/admin/exposure", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('exposure:read'),
    async (req: any, res) => {
      try {
        const { matchId, marketId, limit = 50 } = req.query;
        
        let exposureData;
        
        if (matchId) {
          // Get exposure for specific match
          exposureData = await storage.getMatchExposure(matchId);
        } else if (marketId) {
          // Get exposure for specific market
          exposureData = await storage.getMarketExposure(marketId);
        } else {
          // Get overall exposure summary
          exposureData = await storage.getOverallExposure(parseInt(limit));
        }
        
        // Convert to readable format
        const formattedExposure = {
          totalExposure: currencyUtils.formatCurrency(exposureData.totalExposureCents || 0),
          matchExposures: exposureData.matches?.map((match: any) => ({
            ...match,
            exposureAmount: currencyUtils.formatCurrency(match.exposureAmountCents),
            maxLiability: currencyUtils.formatCurrency(match.maxLiabilityCents)
          })) || [],
          lastCalculated: exposureData.lastCalculated || new Date()
        };
        
        res.json({
          success: true,
          data: formattedExposure
        });
      } catch (error) {
        console.error('Get exposure error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to calculate exposure'
        });
      }
    }
  );
  
  // ===================== PROMOTIONS MANAGEMENT ENDPOINTS =====================
  
  // Get promotions
  app.get("/api/admin/promotions", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('promotions:read'),
    async (req: any, res) => {
      try {
        const { limit = 50, offset = 0, type, isActive } = req.query;
        
        const promotions = await storage.getPromotions({
          limit: parseInt(limit),
          offset: parseInt(offset),
          type,
          isActive: isActive !== undefined ? isActive === 'true' : undefined
        });
        
        res.json({
          success: true,
          data: promotions
        });
      } catch (error) {
        console.error('Get promotions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve promotions'
        });
      }
    }
  );
  
  // Create promotion
  app.post("/api/admin/promotions", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('promotions:create'), 
    auditAction('promotion_create'),
    async (req: any, res) => {
      try {
        const { insertPromotionSchema } = await import('@shared/schema');
        const validatedData = insertPromotionSchema.parse(req.body);
        
        // Check for duplicate promo code
        if (validatedData.promoCode) {
          const existing = await storage.getPromotionByCode(validatedData.promoCode);
          if (existing) {
            return res.status(400).json({
              success: false,
              error: 'Promo code already exists'
            });
          }
        }
        
        const promotion = await storage.createPromotion({
          ...validatedData,
          createdBy: req.adminUser.id
        });
        
        res.json({
          success: true,
          data: promotion,
          message: 'Promotion created successfully'
        });
      } catch (error) {
        console.error('Create promotion error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to create promotion'
        });
      }
    }
  );
  
  // Update promotion
  app.put("/api/admin/promotions/:id", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('promotions:update'), 
    auditAction('promotion_update', (req) => ({ 
      targetType: 'promotion', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { insertPromotionSchema } = await import('@shared/schema');
        const validatedData = insertPromotionSchema.partial().parse(req.body);
        
        const promotion = await storage.updatePromotion(id, {
          ...validatedData,
          updatedBy: req.adminUser.id
        });
        
        if (!promotion) {
          return res.status(404).json({
            success: false,
            error: 'Promotion not found'
          });
        }
        
        res.json({
          success: true,
          data: promotion,
          message: 'Promotion updated successfully'
        });
      } catch (error) {
        console.error('Update promotion error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update promotion'
        });
      }
    }
  );
  
  // ===================== FINANCIAL REPORTING ENDPOINTS =====================
  
  // Daily financial report
  app.get("/api/admin/reports/daily", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { date } = req.query;
        const reportDate = date ? new Date(date) : new Date();
        
        const report = await storage.getDailyFinancialReport(reportDate);
        
        // Format currency values
        const formattedReport = {
          ...report,
          totalBetsAmount: currencyUtils.formatCurrency(report.totalBetsAmountCents || 0),
          totalWinnings: currencyUtils.formatCurrency(report.totalWinningsCents || 0),
          grossGamingRevenue: currencyUtils.formatCurrency(report.ggrCents || 0),
          deposits: currencyUtils.formatCurrency(report.depositsCents || 0),
          withdrawals: currencyUtils.formatCurrency(report.withdrawalsCents || 0)
        };
        
        res.json({
          success: true,
          data: formattedReport
        });
      } catch (error) {
        console.error('Daily report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate daily report'
        });
      }
    }
  );
  
  // Monthly financial report
  app.get("/api/admin/reports/monthly", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { year, month } = req.query;
        const reportYear = year ? parseInt(year) : new Date().getFullYear();
        const reportMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        
        const report = await storage.getMonthlyFinancialReport(reportYear, reportMonth);
        
        // Format currency values
        const formattedReport = {
          ...report,
          totalBetsAmount: currencyUtils.formatCurrency(report.totalBetsAmountCents || 0),
          totalWinnings: currencyUtils.formatCurrency(report.totalWinningsCents || 0),
          grossGamingRevenue: currencyUtils.formatCurrency(report.ggrCents || 0),
          dailyBreakdown: report.dailyBreakdown?.map((day: any) => ({
            ...day,
            amount: currencyUtils.formatCurrency(day.amountCents || 0)
          })) || []
        };
        
        res.json({
          success: true,
          data: formattedReport
        });
      } catch (error) {
        console.error('Monthly report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate monthly report'
        });
      }
    }
  );
  
  // Player activity report
  app.get("/api/admin/reports/players", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { limit = 100, period = '30d' } = req.query;
        
        const report = await storage.getPlayerActivityReport({
          limit: parseInt(limit),
          period: period as string
        });
        
        // Format currency values for each player
        const formattedPlayers = report.players?.map((player: any) => ({
          ...player,
          totalBetsAmount: currencyUtils.formatCurrency(player.totalBetsAmountCents || 0),
          totalWinnings: currencyUtils.formatCurrency(player.totalWinningsCents || 0),
          netPosition: currencyUtils.formatCurrency((player.totalBetsAmountCents || 0) - (player.totalWinningsCents || 0)),
          balance: currencyUtils.formatCurrency(player.balanceCents || 0)
        })) || [];
        
        res.json({
          success: true,
          data: {
            ...report,
            players: formattedPlayers
          }
        });
      } catch (error) {
        console.error('Player report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate player report'
        });
      }
    }
  );
  
  // Admin Dashboard - Comprehensive metrics and data aggregation
  app.get("/api/admin/dashboard", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('dashboard:read'),
    auditAction('dashboard_view'),
    async (req: any, res) => {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Calculate all dashboard metrics in parallel for performance
        const [
          totalUsers,
          newUsersToday, 
          newUsersThisWeek,
          totalBets,
          pendingBets,
          betsToday,
          betsThisWeek,
          turnoverData,
          exposureData,
          recentActivity,
          systemAlerts
        ] = await Promise.all([
          // User metrics
          storage.getTotalUsers?.() || 0,
          storage.getNewUsersCount?.(todayStart) || 0,
          storage.getNewUsersCount?.(weekStart) || 0,
          
          // Bet metrics  
          storage.getTotalBets?.() || 0,
          storage.getPendingBetsCount?.() || 0,
          storage.getBetsCount?.(todayStart) || 0,
          storage.getBetsCount?.(weekStart) || 0,
          
          // Financial metrics
          storage.getTurnoverMetrics?.(todayStart, weekStart) || { todayCents: 0, weekCents: 0, totalCents: 0 },
          
          // Risk metrics
          storage.getExposureMetrics?.() || { totalCents: 0, highRiskCount: 0 },
          
          // Recent activity (last 50 entries)
          storage.getRecentActivity?.(50) || [],
          
          // System alerts
          storage.getSystemAlerts?.() || []
        ]);

        // Calculate derived metrics
        const activeUsers = Math.floor(totalUsers * 0.3); // Estimate 30% active users
        const settledBets = totalBets - pendingBets;
        const userGrowthPercentage = newUsersThisWeek > 0 ? 
          ((newUsersToday * 7 - newUsersThisWeek) / newUsersThisWeek) * 100 : 0;
        const betVolumeGrowthPercentage = betsThisWeek > 0 ? 
          ((betsToday * 7 - betsThisWeek) / betsThisWeek) * 100 : 0;
          
        // Calculate GGR (simplified - assuming 5% house edge)
        const ggrTodayCents = Math.floor(turnoverData.todayCents * 0.05);
        const ggrThisWeekCents = Math.floor(turnoverData.weekCents * 0.05);
        const totalGgrCents = Math.floor(turnoverData.totalCents * 0.05);
        const revenueGrowthPercentage = ggrThisWeekCents > 0 ? 
          ((ggrTodayCents * 7 - ggrThisWeekCents) / ggrThisWeekCents) * 100 : 0;
        
        // Build comprehensive dashboard data
        const dashboardData = {
          metrics: {
            // User metrics
            totalUsers,
            activeUsers,
            newUsersToday,
            newUsersThisWeek,
            userGrowthPercentage,
            
            // Bet metrics
            totalBets,
            pendingBets,
            settledBets,
            betsToday,
            betsThisWeek,
            betVolumeGrowthPercentage,
            
            // Financial metrics (all in cents)
            totalTurnoverCents: turnoverData.totalCents,
            turnoverTodayCents: turnoverData.todayCents,
            turnoverThisWeekCents: turnoverData.weekCents,
            totalGgrCents,
            ggrTodayCents,
            ggrThisWeekCents,
            revenueGrowthPercentage,
            
            // Balance metrics (placeholders)
            totalPlayerBalanceCents: 50000000, // £500,000 placeholder
            averagePlayerBalanceCents: totalUsers > 0 ? Math.floor(50000000 / totalUsers) : 0,
            
            // Risk metrics
            totalExposureCents: exposureData.totalCents,
            highRiskBetsCount: exposureData.highRiskCount,
            
            // System metrics
            systemStatus: 'operational' as const,
            lastUpdated: now.toISOString()
          },
          
          trends: {
            // Generate trend data for the last 7 days
            betVolume: Array.from({ length: 7 }, (_, i) => ({
              date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              value: Math.floor(Math.random() * 100) + 50 // Mock data
            })),
            userRegistrations: Array.from({ length: 7 }, (_, i) => ({
              date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              value: Math.floor(Math.random() * 20) + 5 // Mock data
            })),
            revenue: Array.from({ length: 7 }, (_, i) => ({
              date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              value: Math.floor(Math.random() * 5000) + 1000 // Mock data
            })),
            turnover: Array.from({ length: 7 }, (_, i) => ({
              date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              value: Math.floor(Math.random() * 20000) + 5000 // Mock data
            }))
          },
          
          recentActivity: recentActivity.map((activity: any) => ({
            id: activity.id || Math.random().toString(),
            type: activity.type || 'admin_action',
            title: activity.title || activity.action || 'Admin Action',
            description: activity.description || activity.details || 'System activity',
            timestamp: activity.timestamp || activity.createdAt || now.toISOString(),
            userId: activity.userId,
            adminId: activity.adminId,
            betId: activity.betId,
            amount: activity.amount,
            severity: activity.severity || 'info'
          })),
          
          quickActions: [
            {
              id: 'pending-settlements',
              title: 'Pending Settlements',
              description: 'Review and settle pending bets',
              action: 'navigate:/prime-admin/bets?status=pending',
              icon: 'clock',
              count: pendingBets,
              enabled: pendingBets > 0
            },
            {
              id: 'high-exposure',
              title: 'High Exposure Markets',
              description: 'Monitor markets with high liability',
              action: 'navigate:/prime-admin/exposure',
              icon: 'alert-triangle',
              count: exposureData.highRiskCount,
              enabled: exposureData.highRiskCount > 0
            },
            {
              id: 'user-management',
              title: 'User Management',
              description: 'Manage user accounts and permissions',
              action: 'navigate:/prime-admin/users',
              icon: 'users',
              enabled: true
            },
            {
              id: 'financial-reports',
              title: 'Financial Reports',
              description: 'View detailed financial analytics',
              action: 'navigate:/prime-admin/reports',
              icon: 'bar-chart',
              enabled: true
            }
          ],
          
          systemAlerts: systemAlerts.map((alert: any) => ({
            id: alert.id || Math.random().toString(),
            type: alert.type || 'system_performance',
            title: alert.title || 'System Alert',
            message: alert.message || alert.description || 'System notification',
            severity: alert.severity || 'medium',
            timestamp: alert.timestamp || alert.createdAt || now.toISOString(),
            isResolved: alert.isResolved || false,
            actionRequired: alert.actionRequired || false
          })),
          
          connectedClients: 1, // Mock WebSocket connection count
          lastRefresh: now.toISOString()
        };
        
        res.json({
          success: true,
          data: dashboardData
        });
        
      } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to load dashboard data'
        });
      }
    }
  );

  // Export financial data (finance role only)
  app.get("/api/admin/reports/export", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:export'), 
    require2FA,
    auditAction('financial_export'),
    async (req: any, res) => {
      try {
        const { type, startDate, endDate, format = 'json' } = req.query;
        
        if (!type || !startDate || !endDate) {
          return res.status(400).json({
            success: false,
            error: 'Export type, start date, and end date are required'
          });
        }
        
        const exportData = await storage.exportFinancialData({
          type: type as string,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          format: format as string
        });
        
        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="financial-export-${type}-${Date.now()}.csv"`);
          res.send(exportData.csv);
        } else {
          res.json({
            success: true,
            data: exportData,
            message: 'Financial data exported successfully'
          });
        }
      } catch (error) {
        console.error('Export financial data error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to export financial data'
        });
      }
    }
  );

  // GET /api/admin/matches/:matchId/markets - get markets for a specific match
  app.get("/api/admin/matches/:matchId/markets", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:read'), 
    async (req: any, res) => {
      try {
        const { matchId } = req.params;
        
        // Verify match exists
        const match = await storage.getMatch(matchId);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        // Get markets with outcomes for the match
        const markets = await storage.getMatchMarkets(matchId);
        
        res.json({
          success: true,
          data: {
            ...match,
            markets
          }
        });
      } catch (error) {
        console.error('Get match markets error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get match markets'
        });
      }
    }
  );

  // POST /api/admin/matches/:id/markets - create market for specific match
  app.post("/api/admin/matches/:id/markets", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:create'), 
    auditAction('market_create_for_match'),
    async (req: any, res) => {
      try {
        const { id: matchId } = req.params;
        const { key, name, type, outcomes } = req.body;
        
        if (!key || !name || !type || !outcomes || !Array.isArray(outcomes)) {
          return res.status(400).json({
            success: false,
            error: 'Market key, name, type, and outcomes array are required'
          });
        }
        
        // Verify match exists
        const match = await storage.getMatch(matchId);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        // Create market with outcomes
        const market = await storage.createMarketWithOutcomes({
          matchId,
          key,
          name,
          type,
          outcomes,
          createdBy: req.adminUser.id
        });
        
        res.json({
          success: true,
          data: market,
          message: 'Market created successfully'
        });
      } catch (error) {
        console.error('Create market for match error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create market'
        });
      }
    }
  );

  // PATCH /api/admin/markets/:id/status - update market status
  app.patch("/api/admin/markets/:id/status", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:update'), 
    auditAction('market_status_change', (req) => ({ 
      targetType: 'market', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { action } = req.body;
        
        if (!action || !['publish', 'unpublish', 'suspend', 'reopen', 'lock'].includes(action)) {
          return res.status(400).json({
            success: false,
            error: 'Valid action is required (publish, unpublish, suspend, reopen, lock)'
          });
        }
        
        const market = await storage.updateMarketStatus(id, action, req.adminUser.id);
        
        if (!market) {
          return res.status(404).json({
            success: false,
            error: 'Market not found'
          });
        }
        
        res.json({
          success: true,
          data: market,
          message: `Market ${action}ed successfully`
        });
      } catch (error) {
        console.error('Update market status error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update market status'
        });
      }
    }
  );

  // PATCH /api/admin/outcomes/:id/odds - update outcome odds
  app.patch("/api/admin/outcomes/:id/odds", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('odds:manage'), 
    require2FA,
    auditAction('odds_change', (req) => ({ 
      targetType: 'outcome', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { odds, reason } = req.body;
        
        if (!odds || !reason) {
          return res.status(400).json({
            success: false,
            error: 'Odds value and reason are required'
          });
        }
        
        const oddsValue = parseFloat(odds);
        if (isNaN(oddsValue) || oddsValue < 1.01 || oddsValue > 1000) {
          return res.status(400).json({
            success: false,
            error: 'Odds must be between 1.01 and 1000'
          });
        }
        
        const outcome = await storage.updateOutcomeOdds(id, oddsValue, reason, req.adminUser.id);
        
        if (!outcome) {
          return res.status(404).json({
            success: false,
            error: 'Outcome not found'
          });
        }
        
        res.json({
          success: true,
          data: outcome,
          message: 'Odds updated successfully'
        });
      } catch (error) {
        console.error('Update outcome odds error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update odds'
        });
      }
    }
  );

  // PATCH /api/admin/matches/:id/markets/reorder - reorder markets for match
  app.patch("/api/admin/matches/:id/markets/reorder", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:update'), 
    auditAction('markets_reorder', (req) => ({ 
      targetType: 'match', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id: matchId } = req.params;
        const { markets } = req.body;
        
        if (!markets || !Array.isArray(markets)) {
          return res.status(400).json({
            success: false,
            error: 'Markets array is required'
          });
        }
        
        // Verify match exists
        const match = await storage.getMatch(matchId);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }
        
        // Update market display order
        const updatedMarkets = await storage.reorderMarkets(matchId, markets, req.adminUser.id);
        
        res.json({
          success: true,
          data: updatedMarkets,
          message: 'Markets reordered successfully'
        });
      } catch (error) {
        console.error('Reorder markets error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to reorder markets'
        });
      }
    }
  );

  // =====================================
  // MISSING ADMIN ENDPOINTS FROM INSTRUCTION 4
  // =====================================

  // GET /api/admin/matches - list matches (filterable)
  app.get("/api/admin/matches", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:read'), 
    async (req: any, res) => {
      try {
        const { limit = 50, offset = 0, status, isManual, leagueName } = req.query;
        
        // Get all matches with optional filters
        let matches = await storage.getAllMatches();
        
        // Apply filters
        if (status && status !== 'all') {
          matches = matches.filter(match => match.status === status);
        }
        if (isManual === 'true') {
          matches = matches.filter(match => match.isManual === true);
        }
        if (isManual === 'false') {
          matches = matches.filter(match => match.isManual === false);
        }
        if (leagueName) {
          matches = matches.filter(match => 
            match.leagueName.toLowerCase().includes(leagueName.toLowerCase())
          );
        }
        
        // Apply pagination
        const totalMatches = matches.length;
        const paginatedMatches = matches.slice(
          parseInt(offset), 
          parseInt(offset) + parseInt(limit)
        );
        
        res.json({
          success: true,
          data: {
            matches: paginatedMatches,
            total: totalMatches,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        });
      } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch matches'
        });
      }
    }
  );

  // POST /api/admin/matches/:id/markets - create market for a match
  app.post("/api/admin/matches/:id/markets", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('markets:create'), 
    auditAction('create_market'),
    async (req: any, res) => {
      try {
        const { id: matchId } = req.params;
        const { key, name, type, parameter, minStakeCents, maxStakeCents, outcomes } = req.body;
        
        if (!key || !name || !type || !outcomes || !Array.isArray(outcomes)) {
          return res.status(400).json({
            success: false,
            error: 'Market key, name, type, and outcomes are required'
          });
        }

        // Verify match exists
        const match = await storage.getMatch(matchId);
        if (!match) {
          return res.status(404).json({
            success: false,
            error: 'Match not found'
          });
        }

        // Create market
        const market = await storage.createMarket({
          matchId,
          key,
          name,
          type,
          parameter,
          minStakeCents: minStakeCents || 100, // £1 default
          maxStakeCents: maxStakeCents || 10000000, // £100k default
          createdBy: req.adminUser.id,
          isPublished: false
        });

        // Create market outcomes
        for (const outcome of outcomes) {
          await storage.createMarketOutcome({
            marketId: market.id,
            key: outcome.key,
            label: outcome.label,
            odds: outcome.odds,
            oddsSource: 'manual',
            updatedBy: req.adminUser.id
          });
        }

        res.json({
          success: true,
          data: market,
          message: 'Market created successfully'
        });
      } catch (error) {
        console.error('Create market error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create market'
        });
      }
    }
  );

  // POST /api/admin/markets/:id/odds/bulk - bulk upload odds
  app.post("/api/admin/markets/:id/odds/bulk", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('odds:manage'), 
    require2FA,
    auditAction('bulk_odds_update'),
    async (req: any, res) => {
      try {
        const { id: marketId } = req.params;
        const { odds, reason } = req.body;
        
        if (!odds || !Array.isArray(odds)) {
          return res.status(400).json({
            success: false,
            error: 'Odds array is required'
          });
        }

        // Validate odds format
        for (const oddUpdate of odds) {
          if (!oddUpdate.outcomeKey || !oddUpdate.newOdds) {
            return res.status(400).json({
              success: false,
              error: 'Each odds update must have outcomeKey and newOdds'
            });
          }
          if (parseFloat(oddUpdate.newOdds) < 1.01 || parseFloat(oddUpdate.newOdds) > 1000) {
            return res.status(400).json({
              success: false,
              error: 'Odds must be between 1.01 and 1000'
            });
          }
        }

        // Update odds in bulk
        const updatedOutcomes = [];
        for (const oddUpdate of odds) {
          const outcome = await storage.updateMarketOutcomeOdds(
            marketId,
            oddUpdate.outcomeKey,
            oddUpdate.newOdds,
            req.adminUser.id,
            reason || 'Bulk odds update'
          );
          if (outcome) {
            updatedOutcomes.push(outcome);
          }
        }

        res.json({
          success: true,
          data: {
            marketId,
            updatedOutcomes,
            updatedCount: updatedOutcomes.length
          },
          message: 'Bulk odds update completed successfully'
        });
      } catch (error) {
        console.error('Bulk odds update error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update odds'
        });
      }
    }
  );

  // POST /api/admin/users/:id/block - block user
  app.post("/api/admin/users/:id/block", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:manage'), 
    require2FA,
    auditAction('block_user'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        const { reason, permanent = false } = req.body;
        
        if (!reason) {
          return res.status(400).json({
            success: false,
            error: 'Reason is required to block a user'
          });
        }

        // Get user to verify exists
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Block user
        await storage.updateUserProfile(userId, { isActive: false });

        // Create audit log with reason
        await storage.createAuditLog({
          adminId: req.adminUser.id,
          actionType: 'block_user',
          targetType: 'user',
          targetId: userId,
          dataBefore: { isActive: user.isActive },
          dataAfter: { isActive: false },
          note: `User blocked: ${reason}${permanent ? ' (permanent)' : ''}`,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
          success: true
        });

        res.json({
          success: true,
          data: { userId, blocked: true, reason },
          message: 'User blocked successfully'
        });
      } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to block user'
        });
      }
    }
  );

  // POST /api/admin/users/:id/wallet/adjust - credit/debit user wallet
  app.post("/api/admin/users/:id/wallet/adjust", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('wallets:manage'), 
    require2FA,
    auditAction('wallet_adjustment'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        const { type, amount, reason } = req.body;
        
        if (!type || !amount || !reason) {
          return res.status(400).json({
            success: false,
            error: 'Type (credit/debit), amount, and reason are required'
          });
        }

        if (!['credit', 'debit'].includes(type)) {
          return res.status(400).json({
            success: false,
            error: 'Type must be either credit or debit'
          });
        }

        const amountCents = Math.round(parseFloat(amount) * 100);
        if (amountCents <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Amount must be positive'
          });
        }

        // Get user current balance
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        const oldBalanceCents = user.balance;
        const adjustment = type === 'credit' ? amountCents : -amountCents;
        const newBalanceCents = oldBalanceCents + adjustment;

        if (newBalanceCents < 0) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient balance for debit'
          });
        }

        // Update user balance
        await storage.updateUserBalance(userId, newBalanceCents);

        // Create transaction record
        await storage.createTransaction({
          userId,
          type: 'manual_adjustment',
          amount: adjustment,
          balanceBefore: oldBalanceCents,
          balanceAfter: newBalanceCents,
          reference: `admin_${req.adminUser.id}`,
          description: `Admin ${type}: ${reason}`
        });

        // Create audit log
        await storage.createAuditLog({
          adminId: req.adminUser.id,
          actionType: 'wallet_adjustment',
          targetType: 'user',
          targetId: userId,
          dataBefore: { balance: oldBalanceCents },
          dataAfter: { balance: newBalanceCents },
          note: `Wallet ${type} of £${amount}: ${reason}`,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
          success: true
        });

        res.json({
          success: true,
          data: {
            userId,
            type,
            amount: parseFloat(amount),
            oldBalance: oldBalanceCents / 100,
            newBalance: newBalanceCents / 100,
            reason
          },
          message: `Wallet ${type} completed successfully`
        });
      } catch (error) {
        console.error('Wallet adjustment error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to adjust wallet'
        });
      }
    }
  );

  // GET /api/admin/reports/ggr - GGR (Gross Gaming Revenue) reports
  app.get("/api/admin/reports/ggr", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'), 
    async (req: any, res) => {
      try {
        const { from, to, groupBy = 'day' } = req.query;
        
        if (!from || !to) {
          return res.status(400).json({
            success: false,
            error: 'From and to date parameters are required'
          });
        }

        const fromDate = new Date(from as string);
        const toDate = new Date(to as string);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid date format'
          });
        }

        // Calculate GGR (stakes minus payouts)
        const ggrReport = await storage.calculateGGRReport({
          startDate: fromDate,
          endDate: toDate,
          groupBy: groupBy as string
        });

        res.json({
          success: true,
          data: {
            period: {
              from: fromDate.toISOString(),
              to: toDate.toISOString(),
              groupBy
            },
            ...ggrReport
          },
          message: 'GGR report generated successfully'
        });
      } catch (error) {
        console.error('GGR report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate GGR report'
        });
      }
    }
  );

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
