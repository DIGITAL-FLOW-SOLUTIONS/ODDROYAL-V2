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
  currencyUtils
} from "@shared/schema";
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
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
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

  // Get live football fixtures
  app.get("/api/fixtures/live", async (req, res) => {
    try {
      const fixtures = await getLiveFixtures();
      
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
            actualWinnings: currencyUtils.formatCurrency(result.bet!.actualWinnings)
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

  const httpServer = createServer(app);
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
    odds: {
      home: 2.10 + Math.random() * 0.5, // Mock odds - would need separate API call
      draw: 3.20 + Math.random() * 0.5,
      away: 3.50 + Math.random() * 0.5
    },
    markets: {
      "1x2": { 
        home: 2.10 + Math.random() * 0.5, 
        draw: 3.20 + Math.random() * 0.5, 
        away: 3.50 + Math.random() * 0.5 
      },
      "ou": { 
        over25: 1.85 + Math.random() * 0.3, 
        under25: 1.95 + Math.random() * 0.3 
      },
      "btts": { 
        yes: 1.80 + Math.random() * 0.3, 
        no: 2.00 + Math.random() * 0.3 
      },
      "handicap": { 
        home: 1.90 + Math.random() * 0.3, 
        away: 1.90 + Math.random() * 0.3 
      },
      "correctscore": { 
        "1-0": 8.50 + Math.random() * 2, 
        "2-1": 9.00 + Math.random() * 2, 
        "0-0": 12.00 + Math.random() * 3 
      }
    }
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
    homeTeam: homeTeam?.name || 'Home Team',
    awayTeam: awayTeam?.name || 'Away Team',
    league: fixture.league?.name || 'Unknown League',
    homeScore,
    awayScore,
    minute: minute > 0 ? minute : 1,
    status: minute > 45 && minute <= 60 ? 'HT' : minute > 90 ? 'FT' : '1st Half',
    venue: 'Stadium',
    possession: { 
      home: 45 + Math.floor(Math.random() * 20), 
      away: 35 + Math.floor(Math.random() * 20) 
    },
    corners: { 
      home: Math.floor(Math.random() * 8), 
      away: Math.floor(Math.random() * 8) 
    },
    shots: { 
      home: Math.floor(Math.random() * 15) + 1, 
      away: Math.floor(Math.random() * 15) + 1 
    },
    odds: {
      "1x2": { 
        home: 1.75 + Math.random() * 0.5, 
        draw: 3.50 + Math.random() * 1, 
        away: 4.20 + Math.random() * 1.5 
      },
      "nextgoal": { 
        home: 2.10 + Math.random() * 0.5, 
        away: 3.20 + Math.random() * 0.8, 
        none: 4.50 + Math.random() * 1 
      },
      "totalgoals": { 
        over35: 2.40 + Math.random() * 0.3, 
        under35: 1.55 + Math.random() * 0.3 
      }
    }
  };
}
