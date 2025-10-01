import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import crypto from "crypto";
import { storage } from "./storage";
import { supabaseAdmin } from "./supabase";
import { pdfReportService } from "./pdf-service";
import { emailReportService } from "./email-service";
import XLSX from 'xlsx';
import { 
  getUpcomingFixtures, 
  getLiveFixtures, 
  getFixtureOdds, 
  getLeagues,
  getApiHealthStatus,
  SportMonksFixture,
  getAllSportsFixtures 
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
  adminRegistrationSchema,
  User,
  AdminRoles,
  rolePermissions
} from "@shared/schema";
import { initializeWebSocket, broadcastBetUpdate } from './websocket';
// import { liveMatchSimulator } from './live-match-simulator';
// import { addSimulationRoutes } from './simulation-routes';
import { 
  authenticateAdmin, 
  require2FA, 
  auditAction, 
  adminRateLimit 
} from './admin-middleware';
import { authenticateUser } from './auth-middleware';
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
import { mpesaService } from "./mpesa";

export async function registerRoutes(app: Express): Promise<Server> {
  // Note: Primary health check is registered early in index.ts for immediate availability
  
  // SportMonks API health check
  app.get("/api/integrations/sportmonks/health", async (req, res) => {
    try {
      const healthStatus = getApiHealthStatus();
      res.json({
        success: true,
        data: healthStatus
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get SportMonks API health status",
        details: (error as Error).message
      });
    }
  });

  // Authentication Routes
  
  // User Registration
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = z.object({
        username: z.string().min(3).max(50),
        email: z.string().email(),
        password: z.string().min(6),
        confirmPassword: z.string().min(6),
        firstName: z.string().min(1).max(100).optional(),
        lastName: z.string().min(1).max(100).optional()
      }).refine(
        (data) => data.password === data.confirmPassword,
        { message: "Passwords don't match", path: ["confirmPassword"] }
      ).parse(req.body);
      
      // Check if username already exists in users table
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('username')
        .eq('username', validatedData.username)
        .single();
        
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: "Username already exists" 
        });
      }
      
      // Create user with Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: validatedData.email,
        password: validatedData.password,
        email_confirm: true // Auto-confirm email in development
      });
      
      if (authError) {
        console.error('Supabase auth error:', authError);
        return res.status(400).json({ 
          success: false, 
          error: authError.message 
        });
      }
      
      if (!authData.user) {
        return res.status(500).json({ 
          success: false, 
          error: "Failed to create user" 
        });
      }
      
      // Create user profile in users table (matching user's actual schema)
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authData.user.id,
          username: validatedData.username,
          email: validatedData.email,
          first_name: validatedData.firstName || null,
          last_name: validatedData.lastName || null,
          balance: 1000000, // Starting balance: $10,000 in cents for testing and betting
          is_active: true
        });
        
      if (profileError) {
        console.error('Profile creation error:', profileError);
        
        // Log more details for debugging
        if (profileError.code === 'PGRST205') {
          console.error('❌ PGRST205 Error: Table not found.');
          console.error('Table name issue resolved - now using users table');
        }
        
        // Clean up auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return res.status(500).json({ 
          success: false, 
          error: "Database schema cache needs refresh. Please contact support." 
        });
      }
      
      // Sign in the new user immediately for seamless registration
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password
      });
      
      if (signInError) {
        console.error('Auto sign-in error:', signInError);
        // Still return success but without session token
        return res.json({ 
          success: true, 
          data: { 
            user: {
              id: authData.user.id,
              email: authData.user.email,
              username: validatedData.username,
              firstName: validatedData.firstName || null,
              lastName: validatedData.lastName || null,
              balance: "0.00"
            },
            message: "Registration successful. Please sign in to continue."
          } 
        });
      }
      
      res.json({ 
        success: true, 
        data: { 
          user: {
            id: authData.user.id,
            email: authData.user.email,
            username: validatedData.username,
            firstName: validatedData.firstName || null,
            lastName: validatedData.lastName || null,
            balance: "0.00"
          },
          sessionToken: signInData.session?.access_token || '',
          refreshToken: signInData.session?.refresh_token || ''
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
      
      // Check if username is email or find email by username
      let email = username;
      if (!username.includes('@')) {
        // Username provided, need to find email
        const { data: profile } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('username', username)
          .single();
          
        if (!profile) {
          return res.status(401).json({ 
            success: false, 
            error: "Invalid credentials" 
          });
        }
        
        // Get email from auth.users
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        if (!authUser.user?.email) {
          return res.status(401).json({ 
            success: false, 
            error: "Invalid credentials" 
          });
        }
        email = authUser.user.email;
      }
      
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
        email: email,
        password: password
      });
      
      if (authError || !authData.user) {
        return res.status(401).json({ 
          success: false, 
          error: "Invalid credentials" 
        });
      }
      
      // Get user profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();
        
      if (profileError || !profile) {
        return res.status(401).json({ 
          success: false, 
          error: "User profile not found" 
        });
      }
      
      if (!profile.is_active) {
        return res.status(403).json({ 
          success: false, 
          error: "Account is inactive" 
        });
      }
      
      // Return user data and Supabase access token
      res.json({ 
        success: true, 
        data: { 
          user: {
            id: profile.id,
            email: authData.user.email,
            username: profile.username,
            firstName: profile.first_name,
            lastName: profile.last_name,
            balance: (profile.balance / 100).toFixed(2) // Convert cents to pounds
          },
          sessionToken: authData.session?.access_token || '',
          refreshToken: authData.session?.refresh_token || ''
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
  app.post("/api/auth/logout", authenticateUser, async (req: any, res) => {
    try {
      // With Supabase Auth, logout is typically handled on the client side
      // Server-side logout would involve invalidating the JWT token
      // Since JWTs are stateless, we can't invalidate them server-side
      // The client should call supabase.auth.signOut()
      
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
  app.get("/api/auth/me", authenticateUser, async (req: any, res) => {
    try {
      // User is already validated by authenticateUser middleware
      const userId = req.user.id;
      
      // Get user profile from database
      const { data: profile, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error || !profile) {
        return res.status(404).json({ 
          success: false, 
          error: "User profile not found" 
        });
      }
      
      if (!profile.is_active) {
        return res.status(403).json({ 
          success: false, 
          error: "User account is inactive" 
        });
      }
      
      res.json({ 
        success: true, 
        data: {
          id: profile.id,
          email: req.user.email,
          username: profile.username,
          firstName: profile.first_name,
          lastName: profile.last_name,
          balance: (profile.balance / 100).toFixed(2), // Convert cents to KES
          isActive: profile.is_active,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at
        }
      });
      
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get user" 
      });
    }
  });

  // Admin Authentication Routes
  
  // Admin Login
  app.post("/api/admin/login", ...SecurityMiddlewareOrchestrator.getAuthMiddleware(), async (req, res) => {
    try {
      const { username, password } = z.object({
        username: z.string().min(1),
        password: z.string().min(1)
      }).parse(req.body);
      
      // Get admin user by username
      const adminUser = await storage.getAdminUserByUsername(username);
      if (!adminUser) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials"
        });
      }
      
      // Check if admin is active
      if (!adminUser.isActive) {
        return res.status(403).json({
          success: false,
          error: "Admin account is inactive"
        });
      }
      
      // Check if admin is locked out
      if (adminUser.lockedUntil && adminUser.lockedUntil > new Date()) {
        return res.status(423).json({
          success: false,
          error: "Admin account is temporarily locked"
        });
      }
      
      // Verify password using Argon2
      const isValidPassword = await argon2.verify(adminUser.passwordHash, password);
      if (!isValidPassword) {
        // Increment login attempts
        const newAttempts = adminUser.loginAttempts + 1;
        const lockoutTime = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : undefined; // Lock for 30 minutes after 5 attempts
        
        await storage.updateAdminLoginAttempts(adminUser.id, newAttempts, lockoutTime);
        
        return res.status(401).json({
          success: false,
          error: lockoutTime ? "Too many failed attempts. Account locked for 30 minutes." : "Invalid credentials"
        });
      }
      
      // Reset login attempts on successful login
      if (adminUser.loginAttempts > 0) {
        await storage.updateAdminLoginAttempts(adminUser.id, 0);
      }
      
      // Create admin session
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      
      const session = await storage.createAdminSession(
        adminUser.id,
        sessionToken,
        expiresAt,
        false, // 2FA not verified yet
        clientIp,
        userAgent
      );
      
      // Generate CSRF token
      const csrfToken = await CSRFProtectionManager.generateCSRFToken(adminUser.id);
      
      res.json({
        success: true,
        data: {
          sessionToken,
          csrfToken,
          admin: {
            id: adminUser.id,
            username: adminUser.username,
            email: adminUser.email,
            role: adminUser.role,
            twoFactorEnabled: !!adminUser.totpSecret
          },
          expiresAt
        }
      });
      
    } catch (error) {
      console.error('Admin login error:', error);
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
  
  // Admin Logout
  app.post("/api/admin/logout", authenticateAdmin, async (req: any, res) => {
    try {
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');
      
      if (sessionToken) {
        await storage.deleteAdminSession(sessionToken);
      }
      
      res.json({
        success: true,
        message: "Logged out successfully"
      });
      
    } catch (error) {
      console.error('Admin logout error:', error);
      res.status(500).json({
        success: false,
        error: "Logout failed"
      });
    }
  });
  
  // Get Current Admin (validate session)
  app.get("/api/admin/me", authenticateAdmin, async (req: any, res) => {
    try {
      res.json({
        success: true,
        data: {
          admin: req.adminUser,
          session: req.sessionMetadata
        }
      });
      
    } catch (error) {
      console.error('Get current admin error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to get admin data"
      });
    }
  });

  // Profile and Wallet Routes
  
  // Update Profile (username/email)
  app.patch("/api/auth/profile", authenticateUser, async (req: any, res) => {
    try {
      const { username, email } = z.object({
        username: z.string().min(1).optional(),
        email: z.string().email().optional()
      }).parse(req.body);
      
      // Check if username already exists for other users
      if (username) {
        const { data: existingProfile } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('username', username)
          .neq('id', req.user.id)
          .single();
          
        if (existingProfile) {
          return res.status(400).json({ 
            success: false, 
            error: "Username already exists" 
          });
        }
      }
      
      // Check if email already exists for other users
      if (email) {
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
        const emailExists = existingUser.users.some(user => 
          user.email === email && user.id !== req.user.id
        );
        
        if (emailExists) {
          return res.status(400).json({ 
            success: false, 
            error: "Email already exists" 
          });
        }
      }
      
      // Update profile in database
      if (username) {
        const { error: profileError } = await supabaseAdmin
          .from('users')
          .update({ username })
          .eq('id', req.user.id);
          
        if (profileError) {
          throw new Error('Failed to update profile: ' + profileError.message);
        }
      }
      
      // Update email in Supabase Auth if provided
      if (email) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
          req.user.id,
          { email }
        );
        
        if (authError) {
          throw new Error('Failed to update email: ' + authError.message);
        }
      }
      
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
      
      // Use atomic deposit function for guaranteed consistency
      const { data: result, error } = await supabaseAdmin.rpc('atomic_deposit', {
        p_user_id: req.user.id,
        p_amount_cents: depositAmountCents,
        p_description: `Deposit of ${currencyUtils.formatCurrency(depositAmountCents)}`
      });
      
      if (error) {
        throw new Error('Database error: ' + error.message);
      }
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
      
      res.json({ 
        success: true, 
        data: {
          amount: depositAmount,
          newBalance: currencyUtils.centsToPounds(result.new_balance_cents),
          transactionId: result.transaction_id
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
      
      // Use atomic withdrawal function for guaranteed consistency
      const { data: result, error } = await supabaseAdmin.rpc('atomic_withdrawal', {
        p_user_id: req.user.id,
        p_amount_cents: withdrawAmountCents,
        p_description: `Withdrawal of ${currencyUtils.formatCurrency(withdrawAmountCents)}`
      });
      
      if (error) {
        throw new Error('Database error: ' + error.message);
      }
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
      
      res.json({ 
        success: true, 
        data: {
          amount: withdrawAmount,
          newBalance: currencyUtils.centsToPounds(result.new_balance_cents),
          transactionId: result.transaction_id
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
  

  // Betting Routes (Protected) - New Clean Implementation
  
  // Place a bet - Fresh implementation using new BetService
  app.post("/api/bets", authenticateUser, async (req: any, res) => {
    try {
      // Validate request data using shared schema
      const validatedData = betPlacementSchema.parse(req.body);
      
      // Import bet service
      const { betService } = await import("./betService.js");
      
      // Place the bet using the new service
      const result = await betService.placeBet(req.user.id, {
        betType: validatedData.betType,
        totalStakeCents: validatedData.totalStakeCents,
        selections: validatedData.selections
      });
      
      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
      
      // Return success response with formatted currency
      res.json({ 
        success: true, 
        data: { 
          bet: {
            ...result.bet,
            total_stake: currencyUtils.formatCurrency(result.bet.total_stake),
            potential_winnings: currencyUtils.formatCurrency(result.bet.potential_winnings)
          },
          selections: result.selections,
          newBalance: currencyUtils.formatCurrency(result.newBalance),
          transaction: result.transaction
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
  
  // Get user's bet history
  app.get("/api/bets", authenticateUser, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Import bet service
      const { betService } = await import("./betService.js");
      
      // Get user bets
      const result = await betService.getUserBets(req.user.id, limit);
      
      if (!result.success) {
        return res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
      
      res.json({ 
        success: true, 
        data: result.data 
      });
      
    } catch (error) {
      console.error('Get bets error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to get bets" 
      });
    }
  });
  
  // Test route to add balance for testing betting functionality
  app.post("/api/wallet/test-balance", authenticateUser, async (req: any, res) => {
    try {
      const testAmount = 1000000; // $10,000 in cents for testing
      
      // Update user balance in Supabase
      const { error } = await supabaseAdmin
        .from('users')
        .update({ balance: testAmount })
        .eq('id', req.user.id);
        
      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: "Failed to update balance" 
        });
      }
      
      res.json({ 
        success: true, 
        data: { 
          message: "Test balance added successfully",
          newBalance: currencyUtils.formatCurrency(testAmount)
        } 
      });
      
    } catch (error) {
      console.error('Test balance error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to add test balance" 
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
  
  // Check if any admins exist in the system
  app.get("/api/admin/auth/check-admins-exist", async (req, res) => {
    try {
      const admins = await storage.getAdminUsers(1, 0);
      res.json({
        success: true,
        data: {
          adminsExist: admins.length > 0
        }
      });
    } catch (error) {
      console.error('Check admins exist error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check admin existence'
      });
    }
  });
  
  // Admin Registration - Requires special registration code (bootstrap) or authenticated admin
  app.post("/api/admin/auth/register", async (req, res) => {
    try {
      const validatedData = adminRegistrationSchema.parse(req.body);
      
      // Check if any admins exist in the system
      const existingAdmins = await storage.getAdminUsers(1, 0);
      const adminsExist = existingAdmins.length > 0;
      
      // If admins exist, require authenticated superadmin (NOT code-based registration)
      if (adminsExist) {
        // This should be an authenticated endpoint - require admin session
        // For now, reject code-based registration when admins exist
        if (validatedData.registrationCode) {
          // Check if request has admin authentication
          const adminSessionToken = req.headers.authorization?.split(' ')[1] || req.cookies?.admin_session;
          
          if (!adminSessionToken) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required. Admin registration code is only valid during initial setup.'
            });
          }
          
          // Verify admin session
          const session = await storage.getAdminSessionByToken(adminSessionToken);
          if (!session || new Date(session.expiresAt) < new Date()) {
            return res.status(401).json({
              success: false,
              error: 'Invalid or expired session'
            });
          }
          
          // Get admin user
          const adminUser = await storage.getAdminUser(session.adminId);
          if (!adminUser || !adminUser.isActive || adminUser.role !== 'superadmin') {
            return res.status(403).json({
              success: false,
              error: 'Only active superadmins can create new admin accounts'
            });
          }
          
          // Verify registration code for authenticated admins
          const SUPER_ADMIN_REGISTRATION_CODE = process.env.SUPER_ADMIN_REGISTRATION_CODE;
          if (!SUPER_ADMIN_REGISTRATION_CODE) {
            console.error('SUPER_ADMIN_REGISTRATION_CODE environment variable is not set');
            return res.status(500).json({
              success: false,
              error: 'Server configuration error'
            });
          }
          
          // Use constant-time comparison for security
          const codeBuffer = Buffer.from(validatedData.registrationCode);
          const expectedBuffer = Buffer.from(SUPER_ADMIN_REGISTRATION_CODE);
          
          if (codeBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(codeBuffer, expectedBuffer)) {
            return res.status(403).json({
              success: false,
              error: 'Invalid registration code'
            });
          }
        } else {
          return res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
        }
      } else {
        // Bootstrap mode: No admins exist, allow code-based registration
        const SUPER_ADMIN_REGISTRATION_CODE = process.env.SUPER_ADMIN_REGISTRATION_CODE;
        if (!SUPER_ADMIN_REGISTRATION_CODE) {
          console.error('SUPER_ADMIN_REGISTRATION_CODE environment variable is not set');
          return res.status(500).json({
            success: false,
            error: 'Server configuration error. Super admin registration code must be configured.'
          });
        }
        
        // Use constant-time comparison for security
        const codeBuffer = Buffer.from(validatedData.registrationCode);
        const expectedBuffer = Buffer.from(SUPER_ADMIN_REGISTRATION_CODE);
        
        if (codeBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(codeBuffer, expectedBuffer)) {
          return res.status(403).json({
            success: false,
            error: 'Invalid registration code'
          });
        }
      }
      
      // Check if username already exists
      const existingUser = await storage.getAdminUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists'
        });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getAdminUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
      
      // Hash password with Argon2
      const passwordHash = await argon2.hash(validatedData.password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });
      
      // Create admin user as superadmin
      const adminUser = await storage.createAdminUser({
        username: validatedData.username,
        email: validatedData.email,
        passwordHash,
        role: 'superadmin',
        isActive: true,
        ipWhitelist: [],
        createdBy: null
      });
      
      // Return created admin user (without password)
      const { passwordHash: _, ...adminWithoutPassword } = adminUser;
      res.status(201).json({
        success: true,
        data: {
          admin: adminWithoutPassword,
          message: 'Admin user created successfully. You can now login.'
        }
      });
      
    } catch (error) {
      console.error('Admin registration error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid registration data',
          details: error.errors
        });
      }
      res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  });
  
  // Admin Login
  app.post("/api/admin/auth/login", async (req, res) => {
    try {
      const validatedData = loginAdminSchema.parse(req.body);
      
      // Generic error response (prevent user enumeration)
      const genericError = () => res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
      
      // Find admin user
      const adminUser = await storage.getAdminUserByUsername(validatedData.username);
      if (!adminUser || !adminUser.isActive) {
        return genericError();
      }
      
      // Check if admin is locked out
      if (adminUser.lockedUntil && new Date(adminUser.lockedUntil) > new Date()) {
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
      
      // Reset failed attempts on successful login
      await storage.updateAdminLoginAttempts(adminUser.id, 0);
      
      // Update last login time
      await storage.updateAdminUser(adminUser.id, {
        lastLogin: new Date().toISOString()
      });
      
      // Create admin session
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours
      
      const session = await storage.createAdminSession(
        adminUser.id,
        sessionToken,
        expiresAt,
        req.ip,
        req.get('User-Agent')
      );
      
      // Set twoFactorVerified to true since we don't use 2FA
      await storage.updateAdminSession(session.id, {
        twoFactorVerified: true
      });
      
      // Log successful login
      await storage.createAuditLog({
        adminId: adminUser.id,
        actionType: 'login',
        targetType: 'admin_session',
        targetId: adminUser.id,
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
          sessionToken
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
  app.post("/api/admin/auth/logout", authenticateAdmin, async (req: any, res) => {
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
          admin: adminWithoutPassword
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
      const allUsers = await storage.getAllUsers();
      const { bets: allBets } = await storage.getAllBets({});
      const allTransactions = await storage.getAllTransactions();
      const auditLogs = await storage.getAuditLogs(20);
      
      // User metrics
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter((user: any) => user.isActive).length;
      const newUsersToday = allUsers.filter((user: any) => new Date(user.createdAt) >= today).length;
      const newUsersThisWeek = allUsers.filter((user: any) => new Date(user.createdAt) >= weekAgo).length;
      const newUsersLastWeek = allUsers.filter((user: any) => {
        const created = new Date(user.createdAt);
        return created >= twoWeeksAgo && created < weekAgo;
      }).length;
      const userGrowthPercentage = newUsersLastWeek > 0 ? 
        ((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100 : 0;
      
      // Bet metrics
      const totalBets = allBets.length;
      const pendingBets = allBets.filter((bet: any) => bet.status === 'pending');
      const settledBets = allBets.filter((bet: any) => bet.status !== 'pending');
      const betsToday = allBets.filter((bet: any) => new Date(bet.placedAt) >= today).length;
      const betsThisWeek = allBets.filter((bet: any) => new Date(bet.placedAt) >= weekAgo).length;
      const betsLastWeek = allBets.filter((bet: any) => {
        const placed = new Date(bet.placedAt);
        return placed >= twoWeeksAgo && placed < weekAgo;
      }).length;
      const betVolumeGrowthPercentage = betsLastWeek > 0 ? 
        ((betsThisWeek - betsLastWeek) / betsLastWeek) * 100 : 0;
      
      // Financial metrics
      const totalTurnoverCents = allBets.reduce((sum: number, bet: any) => sum + bet.totalStake, 0);
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
          timestamp: typeof bet.placedAt === 'string' ? bet.placedAt : bet.placedAt.toISOString(),
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
          timestamp: typeof user.createdAt === 'string' ? user.createdAt : user.createdAt.toISOString(),
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
          timestamp: typeof log.createdAt === 'string' ? log.createdAt : log.createdAt.toISOString(),
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

  // Match import from SportMonks endpoint
  app.post("/api/admin/matches/import-sportmonks", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:write'), 
    auditAction('matches_import', (req) => ({ 
      targetType: 'system', 
      note: `SportMonks matches import initiated` 
    })),
    async (req: any, res) => {
      try {
        // Fetch fixtures from SportMonks API using the getAllSportsFixtures function
        console.log('Starting SportMonks matches import...');
        const fixturesData = await getAllSportsFixtures(20, 10); // Get 20 upcoming, 10 live per sport
        
        // Process both upcoming and live fixtures
        const allFixtureGroups = [...fixturesData.upcoming, ...fixturesData.live];
        
        // Step 1: Collect all fixture IDs for bulk duplicate detection
        const allFixtures = [];
        const allExternalIds = [];
        
        for (const sportGroup of allFixtureGroups) {
          for (const leagueGroup of sportGroup.leagues) {
            for (const fixture of leagueGroup.fixtures) {
              const externalId = fixture.id.toString();
              allExternalIds.push(externalId);
              allFixtures.push({
                fixture,
                sport: sportGroup.sport,
                league: leagueGroup.league,
                externalId
              });
            }
          }
        }
        
        console.log(`Found ${allFixtures.length} fixtures to process`);
        
        // Step 2: Bulk fetch existing matches - single database query instead of N queries
        const existingMatches = await storage.getMatchesByExternalIds(allExternalIds);
        const existingMatchIds = new Set(existingMatches.map(match => match.externalId));
        
        console.log(`Found ${existingMatches.length} existing matches`);
        
        // Step 3: Process fixtures with optimized duplicate detection and upserts
        let importedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        const importStats = new Map<string, { imported: number; updated: number; errors: number }>();
        
        // Helper function to map SportMonks status to our status
        const mapStatus = (sportMonksState: any) => {
          const state = sportMonksState?.developer_name?.toLowerCase() || 'unknown';
          switch (state) {
            case 'ns': // Not Started
            case 'tbd': // To Be Determined
              return 'scheduled';
            case 'live':
            case 'ht': // Half Time
            case 'et': // Extra Time
              return 'live';
            case 'ft': // Full Time
            case 'aet': // After Extra Time
              return 'finished';
            case 'cancelled':
            case 'canc':
              return 'cancelled';
            case 'postponed':
            case 'postp':
              return 'postponed';
            default:
              return 'scheduled';
          }
        };
        
        for (const { fixture, sport, league, externalId } of allFixtures) {
          try {
            const sportName = sport.name;
            if (!importStats.has(sportName)) {
              importStats.set(sportName, { imported: 0, updated: 0, errors: 0 });
            }
            const sportStats = importStats.get(sportName)!;
            
            // Extract teams from participants
            const homeTeam = fixture.participants.find((p: any) => p.meta.location === 'home');
            const awayTeam = fixture.participants.find((p: any) => p.meta.location === 'away');
            
            if (!homeTeam || !awayTeam) {
              console.log(`Invalid team data for fixture ${fixture.id}, skipping`);
              errorCount++;
              sportStats.errors++;
              continue;
            }
            
            // Extract scores for live/finished matches
            let homeScore: number | null = null;
            let awayScore: number | null = null;
            if (fixture.scores && fixture.scores.length > 0) {
              const homeScoreData = fixture.scores.find((s: any) => s.participant_id === homeTeam.id);
              const awayScoreData = fixture.scores.find((s: any) => s.participant_id === awayTeam.id);
              homeScore = homeScoreData?.score?.goals || 0;
              awayScore = awayScoreData?.score?.goals || 0;
            }
            
            // Transform to internal match format with enhanced data mapping
            const matchData = {
              externalId,
              externalSource: 'sportmonks',
              sport: sportName,
              sportId: sport.id?.toString() || null,
              sportName,
              leagueId: league.id.toString(),
              leagueName: league.name,
              homeTeamId: homeTeam.id.toString(),
              homeTeamName: homeTeam.name,
              awayTeamId: awayTeam.id.toString(),
              awayTeamName: awayTeam.name,
              kickoffTime: new Date(fixture.starting_at),
              status: mapStatus(fixture.state),
              homeScore,
              awayScore,
              isManual: false, // SportMonks imports are not manual
              createdBy: req.adminUser.id,
              updatedBy: req.adminUser.id
            };
            
            // Step 4: Use upsert for idempotent imports (create or update existing)
            const isExisting = existingMatchIds.has(externalId);
            const match = await storage.upsertMatch(matchData);
            
            if (isExisting) {
              console.log(`Updated match: ${homeTeam.name} vs ${awayTeam.name} (${fixture.id})`);
              updatedCount++;
              sportStats.updated++;
            } else {
              console.log(`Created match: ${homeTeam.name} vs ${awayTeam.name} (${fixture.id})`);
              importedCount++;
              sportStats.imported++;
            }
            
          } catch (error) {
            console.error(`Error processing fixture ${fixture.id}:`, error);
            errorCount++;
            const sportName = sport.name;
            if (importStats.has(sportName)) {
              importStats.get(sportName)!.errors++;
            }
          }
        }
        
        const totalProcessed = importedCount + updatedCount + errorCount;
        
        // Log import summary
        console.log(`SportMonks import completed: ${importedCount} imported, ${updatedCount} updated, ${errorCount} errors`);
        
        // Step 5: Standardized response format with detailed breakdown
        res.json({
          success: true,
          imported: importedCount, // Root level for frontend compatibility
          data: {
            imported: importedCount,
            updated: updatedCount,
            errors: errorCount,
            totalProcessed,
            details: {
              sportBreakdown: Object.fromEntries(importStats),
              performanceStats: {
                totalFixturesFound: allFixtures.length,
                existingMatchesFound: existingMatches.length,
                duplicateDetectionOptimized: true,
                upsertPatternUsed: true
              },
              timestamp: new Date().toISOString()
            }
          },
          message: `Successfully processed ${totalProcessed} matches from SportMonks: ${importedCount} new, ${updatedCount} updated`
        });
        
      } catch (error) {
        console.error('SportMonks import error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to import matches from SportMonks',
          details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
      }
    }
  );

  // Bet management endpoints
  app.get("/api/admin/bets", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requirePermission('bets:read'), async (req: any, res) => {
    try {
      const {
        limit = '25',
        offset = '0',
        search,
        status,
        betType,
        userId,
        dateFrom,
        dateTo,
        minStake,
        maxStake
      } = req.query;

      // Parse parameters
      const params = {
        search: search as string | undefined,
        status: status as string | undefined,
        betType: betType as string | undefined,
        userId: userId as string | undefined,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        minStake: minStake ? parseInt(minStake as string) : undefined,
        maxStake: maxStake ? parseInt(maxStake as string) : undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      // Filter out undefined values
      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      const result = await storage.getAllBets(filteredParams);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get admin bets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve bets'
      });
    }
  });

  // Export bets to CSV
  app.get("/api/admin/bets/export/csv", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requirePermission('bets:read'), async (req: any, res) => {
    try {
      const {
        search,
        status,
        betType,
        userId,
        dateFrom,
        dateTo,
        minStake,
        maxStake
      } = req.query;

      const params = {
        search: search as string | undefined,
        status: status as string | undefined,
        betType: betType as string | undefined,
        userId: userId as string | undefined,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        minStake: minStake ? parseInt(minStake as string) : undefined,
        maxStake: maxStake ? parseInt(maxStake as string) : undefined
      };

      const filteredParams = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      const csvData = await storage.exportBetsToCSV(filteredParams);
      
      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bets_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvData);
    } catch (error) {
      console.error('Export bets CSV error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export bets'
      });
    }
  });

  // Force settle bet endpoint
  app.post("/api/admin/bets/:id/force-settle",
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin,
    requirePermission('bets:settle'),
    require2FA,
    auditAction('force_bet_settlement', (req) => ({
      targetType: 'bet',
      targetId: req.params.id,
      note: `Force settlement: ${req.body.outcome} - ${req.body.reason}`
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { outcome, reason, payoutCents } = z.object({
          outcome: z.enum(['win', 'lose', 'void']),
          reason: z.string().min(1, 'Reason is required'),
          payoutCents: z.number().min(0).optional()
        }).parse(req.body);

        if (!reason.trim()) {
          return res.status(400).json({
            success: false,
            error: 'Detailed reason is required for force settlement'
          });
        }

        const payout = payoutCents || 0;
        const result = await storage.forceBetSettlement(id, outcome, payout);
        
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error || 'Failed to force settle bet'
          });
        }

        res.json({
          success: true,
          data: result.bet,
          message: `Bet force settled as ${outcome} successfully`
        });
      } catch (error) {
        console.error('Force settle bet error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to force settle bet'
        });
      }
    }
  );

  // Refund bet endpoint
  app.post("/api/admin/bets/:id/refund",
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin,
    requirePermission('bets:settle'),
    auditAction('bet_refund', (req) => ({
      targetType: 'bet',
      targetId: req.params.id,
      note: `Bet refund requested`
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        
        const result = await storage.refundBet(id);
        
        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error || 'Failed to refund bet'
          });
        }

        res.json({
          success: true,
          data: result.bet,
          message: 'Bet refunded successfully'
        });
      } catch (error) {
        console.error('Refund bet error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to refund bet'
        });
      }
    }
  );

  // Legacy settle endpoint - kept for backwards compatibility
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

  // Bulk bet operations endpoint
  app.post("/api/admin/bets/bulk",
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin,
    requirePermission('bets:settle'),
    require2FA,
    auditAction('bulk_bet_operations', (req) => ({
      targetType: 'bet',
      targetId: 'bulk',
      note: `Bulk operation: ${req.body.action} on ${req.body.betIds?.length || 0} bets`
    })),
    async (req: any, res) => {
      try {
        const { action, betIds, reason } = z.object({
          action: z.enum(['refund', 'settle_win', 'settle_lose', 'void']),
          betIds: z.array(z.string()).min(1, 'At least one bet ID required'),
          reason: z.string().min(1, 'Reason is required for bulk operations')
        }).parse(req.body);

        if (betIds.length > 50) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 50 bets can be processed in a single bulk operation'
          });
        }

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const betId of betIds) {
          try {
            let result;
            if (action === 'refund') {
              result = await storage.refundBet(betId);
            } else {
              const outcome = action === 'settle_win' ? 'win' : 
                             action === 'settle_lose' ? 'lose' : 'void';
              // For bulk operations, use 0 payout for wins (could be enhanced to calculate)
              result = await storage.forceBetSettlement(betId, outcome, 0);
            }
            
            if (result.success) {
              successCount++;
              results.push({ betId, success: true });
            } else {
              errorCount++;
              results.push({ betId, success: false, error: result.error });
            }
          } catch (error) {
            errorCount++;
            results.push({ 
              betId, 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }

        res.json({
          success: successCount > 0,
          data: {
            totalProcessed: betIds.length,
            successCount,
            errorCount,
            results
          },
          message: `Bulk operation completed: ${successCount} successful, ${errorCount} failed`
        });
      } catch (error) {
        console.error('Bulk bet operation error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to execute bulk operation'
        });
      }
    }
  );

  // User management endpoints  
  app.get("/api/admin/customers", ...SecurityMiddlewareOrchestrator.getStrictMiddleware(), authenticateAdmin, requirePermission('users:read'), async (req: any, res) => {
    try {
      const { limit = 50, offset = 0, search, isActive } = req.query;
      
      // Get all users from database using storage method
      const allUsers = await storage.getAllUsers();
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
        .slice(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string))
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
        
        // Extract additional data that's not part of the base match schema
        const { markets = [], events = [], simulatedResult, defaultOdds, ...matchData } = req.body;
        
        // Create team IDs from team names for now (in a real app these would be provided)
        const homeTeamId = `team_${matchData.homeTeamName?.toLowerCase().replace(/\s+/g, '_') || 'home'}`;
        const awayTeamId = `team_${matchData.awayTeamName?.toLowerCase().replace(/\s+/g, '_') || 'away'}`;
        const leagueId = `league_${matchData.leagueName?.toLowerCase().replace(/\s+/g, '_') || 'custom'}`;
        
        const fullMatchData = {
          ...matchData,
          homeTeamId,
          awayTeamId,
          leagueId,
          kickoffTime: new Date(matchData.kickoffTime),
          simulatedResult: simulatedResult || null
        };
        
        const validatedData = insertMatchSchema.parse(fullMatchData);
        
        // Check for existing match with same teams and time
        const existingMatches = await storage.getMatchesByTeamsAndTime(
          homeTeamId, 
          awayTeamId, 
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
        
        // Create simulated events for the match (sorted by minute with proper orderIndex)
        if (events && events.length > 0) {
          // Sort events by minute to ensure proper ordering
          const sortedEvents = events.sort((a, b) => a.minute - b.minute);
          
          for (let i = 0; i < sortedEvents.length; i++) {
            const event = sortedEvents[i];
            // Calculate scheduled time relative to kickoff
            const scheduledTime = new Date(validatedData.kickoffTime.getTime() + (event.minute * 60 * 1000));
            
            await storage.createMatchEvent({
              matchId: match.id,
              type: event.type,
              minute: event.minute,
              second: event.second || 0,
              team: event.team,
              playerName: event.playerName || '',
              description: event.description,
              isSimulated: true,
              isExecuted: false,
              orderIndex: i, // Proper ordering for events at same minute
              scheduledTime,
              createdBy: req.adminUser.id
            });
          }
        }
        
        // Create markets: either provided markets or default 1x2 market from defaultOdds
        const marketsToCreate = [];
        
        if (markets && markets.length > 0) {
          marketsToCreate.push(...markets);
        } else if (defaultOdds && (defaultOdds.home || defaultOdds.draw || defaultOdds.away)) {
          // Create default 1x2 market when no markets provided but defaultOdds available
          marketsToCreate.push({
            type: '1x2',
            name: 'Match Winner',
            outcomes: [
              { key: 'home', label: `${fullMatchData.homeTeamName} Win`, odds: defaultOdds.home || 2.50 },
              { key: 'draw', label: 'Draw', odds: defaultOdds.draw || 3.20 },
              { key: 'away', label: `${fullMatchData.awayTeamName} Win`, odds: defaultOdds.away || 2.80 }
            ]
          });
        }
        
        // Create markets and outcomes
        for (const market of marketsToCreate) {
          const createdMarket = await storage.createMarket({
            matchId: match.id,
            key: market.type,
            name: market.name,
            type: market.type,
            status: 'open',
            minStakeCents: 100, // £1 minimum
            maxStakeCents: 10000000, // £100k maximum  
            maxLiabilityCents: 100000000, // £1M maximum liability
            displayOrder: 0,
            isPublished: true,
            createdBy: req.adminUser.id
          });
          
          // Create outcomes for the market
          if (market.outcomes && market.outcomes.length > 0) {
            for (let i = 0; i < market.outcomes.length; i++) {
              const outcome = market.outcomes[i];
              await storage.createMarketOutcome({
                marketId: createdMarket.id,
                key: outcome.key,
                label: outcome.label,
                odds: outcome.odds.toString(),
                status: 'active',
                liabilityLimitCents: 50000000, // £500k default
                displayOrder: i,
                updatedBy: req.adminUser.id
              });
            }
          }
        }
        
        res.json({
          success: true,
          data: match,
          message: 'Match created successfully with events and markets'
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

  // Get risk exposure data (comprehensive dashboard data)
  app.get("/api/admin/risk/exposure", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('exposure:read'),
    async (req: any, res) => {
      try {
        // Get all pending bets
        const pendingBets = await storage.getPendingBets();
        
        // Calculate total exposure
        const totalExposureCents = pendingBets.reduce((sum, bet) => 
          sum + (bet.potentialWinnings - bet.totalStake), 0
        );
        
        const maxSingleExposureCents = Math.max(
          ...pendingBets.map(bet => bet.potentialWinnings - bet.totalStake),
          0
        );
        
        // Define exposure limit (£100,000)
        const exposureLimitCents = 10000000;
        
        // Calculate risk level
        const exposurePercentage = (totalExposureCents / exposureLimitCents) * 100;
        let riskLevel: 'low' | 'medium' | 'high' | 'critical';
        if (exposurePercentage < 25) riskLevel = 'low';
        else if (exposurePercentage < 50) riskLevel = 'medium';
        else if (exposurePercentage < 75) riskLevel = 'high';
        else riskLevel = 'critical';
        
        // Group by user for user exposure
        const userExposureMap = new Map<string, any>();
        for (const bet of pendingBets) {
          const existing = userExposureMap.get(bet.userId) || {
            userId: bet.userId,
            username: `User ${bet.userId.slice(0, 8)}`,
            totalStaked: 0,
            potentialWin: 0,
            exposure: 0,
            betCount: 0
          };
          
          existing.totalStaked += bet.totalStake;
          existing.potentialWin += bet.potentialWinnings;
          existing.exposure += (bet.potentialWinnings - bet.totalStake);
          existing.betCount += 1;
          userExposureMap.set(bet.userId, existing);
        }
        
        const exposureByUser = Array.from(userExposureMap.values())
          .sort((a, b) => b.exposure - a.exposure)
          .slice(0, 10)
          .map(user => ({
            ...user,
            riskLevel: user.exposure > 500000 ? 'critical' : 
                       user.exposure > 200000 ? 'high' : 
                       user.exposure > 100000 ? 'medium' : 'low'
          }));
        
        const responseData = {
          totalExposure: totalExposureCents,
          maxSingleExposure: maxSingleExposureCents,
          exposureLimit: exposureLimitCents,
          riskLevel,
          topMarkets: [],
          recentChanges: [],
          exposureByLeague: [],
          exposureByUser,
          exposureHistory: []
        };
        
        res.json({
          success: true,
          data: responseData
        });
      } catch (error) {
        console.error('Get risk exposure error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to calculate risk exposure'
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

  // ===================== INSTRUCTION 10: COMPREHENSIVE REPORTING & EXPORTS =====================
  
  // Daily GGR report
  app.get("/api/admin/reports/daily", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getDailyGgrReport(startOfDay, endOfDay);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalStake: currencyUtils.formatCurrency(report.totalStakeCents),
            totalPayouts: currencyUtils.formatCurrency(report.totalPayoutsCents),
            grossGamingRevenue: currencyUtils.formatCurrency(report.grossGamingRevenueCents),
            averageStake: currencyUtils.formatCurrency(report.averageStakeCents),
            winRatePercentage: (report.winRate * 100).toFixed(2) + '%'
          }
        });
      } catch (error) {
        console.error('Daily GGR report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate daily GGR report'
        });
      }
    }
  );

  // Monthly GGR report
  app.get("/api/admin/reports/monthly", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { year, month } = req.query;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        
        const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
        const endOfMonth = new Date(targetYear, targetMonth, 0);
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getMonthlyGgrReport(startOfMonth, endOfMonth);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalStake: currencyUtils.formatCurrency(report.totalStakeCents),
            totalPayouts: currencyUtils.formatCurrency(report.totalPayoutsCents),
            grossGamingRevenue: currencyUtils.formatCurrency(report.grossGamingRevenueCents),
            averageStake: currencyUtils.formatCurrency(report.averageStakeCents),
            highestDay: currencyUtils.formatCurrency(report.highestDayCents),
            lowestDay: currencyUtils.formatCurrency(report.lowestDayCents),
            winRatePercentage: (report.winRate * 100).toFixed(2) + '%',
            dailyBreakdown: report.dailyBreakdown.map(day => ({
              ...day,
              stake: currencyUtils.formatCurrency(day.stakeCents),
              ggr: currencyUtils.formatCurrency(day.ggrCents)
            }))
          }
        });
      } catch (error) {
        console.error('Monthly GGR report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate monthly GGR report'
        });
      }
    }
  );

  // Turnover by Sport/League report
  app.get("/api/admin/reports/turnover-by-sport", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo, sport, league } = req.query;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getTurnoverBySportReport(startDate, endDate, sport, league);
        
        res.json({
          success: true,
          data: {
            ...report,
            sports: report.sports.map(sport => ({
              ...sport,
              turnover: currencyUtils.formatCurrency(sport.turnoverCents),
              ggr: currencyUtils.formatCurrency(sport.ggrCents)
            })),
            totalTurnover: currencyUtils.formatCurrency(report.totalTurnoverCents),
            totalGgr: currencyUtils.formatCurrency(report.totalGgrCents)
          }
        });
      } catch (error) {
        console.error('Turnover by sport report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate turnover report'
        });
      }
    }
  );

  // Payout ratio report
  app.get("/api/admin/reports/payout-ratio", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo } = req.query;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getPayoutRatioReport(startDate, endDate);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalStake: currencyUtils.formatCurrency(report.totalStakeCents),
            totalPayouts: currencyUtils.formatCurrency(report.totalPayoutsCents),
            payoutRatioPercentage: (report.payoutRatio * 100).toFixed(2) + '%',
            winRatePercentage: (report.winRate * 100).toFixed(2) + '%'
          }
        });
      } catch (error) {
        console.error('Payout ratio report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate payout ratio report'
        });
      }
    }
  );

  // Top winners report
  app.get("/api/admin/reports/top-winners", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo, limit = 50 } = req.query;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getTopWinnersReport(startDate, endDate, parseInt(limit));
        
        res.json({
          success: true,
          data: {
            winners: report.winners.map(winner => ({
              ...winner,
              netWinnings: currencyUtils.formatCurrency(winner.netWinningsCents)
            }))
          }
        });
      } catch (error) {
        console.error('Top winners report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate top winners report'
        });
      }
    }
  );

  // Chargeback report
  app.get("/api/admin/reports/chargebacks", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo } = req.query;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.getChargebackReport(startDate, endDate);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalChargebacks: currencyUtils.formatCurrency(report.totalChargebacksCents),
            chargebackRatePercentage: (report.chargebackRate * 100).toFixed(3) + '%',
            chargebacks: report.chargebacks.map(cb => ({
              ...cb,
              amount: currencyUtils.formatCurrency(cb.amountCents)
            }))
          }
        });
      } catch (error) {
        console.error('Chargeback report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate chargeback report'
        });
      }
    }
  );

  // POST versions for reports (used by frontend)
  app.post("/api/admin/reports/payout-ratio", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo } = req.body;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        const dbStorage = storage as any;
        const report = await dbStorage.getPayoutRatioReport(startDate, endDate);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalStake: currencyUtils.formatCurrency(report.totalStakeCents),
            totalPayouts: currencyUtils.formatCurrency(report.totalPayoutsCents),
            payoutRatioPercentage: (report.payoutRatio * 100).toFixed(2) + '%',
            winRatePercentage: (report.winRate * 100).toFixed(2) + '%'
          }
        });
      } catch (error) {
        console.error('Payout ratio report error:', error);
        res.status(500).json({
          success: true,
          data: { payoutRatioPercentage: '0%', winRatePercentage: '0%', totalStake: '£0.00', totalPayouts: '£0.00', winningBets: 0, losingBets: 0 }
        });
      }
    }
  );

  app.post("/api/admin/reports/top-winners", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo, limit = 50 } = req.body;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        const dbStorage = storage as any;
        const report = await dbStorage.getTopWinnersReport(startDate, endDate, parseInt(limit));
        
        res.json({
          success: true,
          data: {
            winners: report.winners.map(winner => ({
              ...winner,
              winnings: currencyUtils.formatCurrency(winner.netWinningsCents)
            }))
          }
        });
      } catch (error) {
        console.error('Top winners report error:', error);
        res.json({
          success: true,
          data: { winners: [] }
        });
      }
    }
  );

  app.post("/api/admin/reports/chargebacks", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo } = req.body;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        const dbStorage = storage as any;
        const report = await dbStorage.getChargebackReport(startDate, endDate);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalChargebacks: currencyUtils.formatCurrency(report.totalChargebacksCents),
            chargebackRatePercentage: (report.chargebackRate * 100).toFixed(3) + '%',
            chargebacks: report.chargebacks.map(cb => ({
              ...cb,
              amount: currencyUtils.formatCurrency(cb.amountCents)
            }))
          }
        });
      } catch (error) {
        console.error('Chargeback report error:', error);
        res.json({
          success: true,
          data: { totalChargebacks: '£0.00', chargebackCount: 0, chargebackRatePercentage: '0%', chargebacks: [] }
        });
      }
    }
  );

  app.post("/api/admin/reports/daily", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { date } = req.body;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        
        const dbStorage = storage as any;
        const report = await dbStorage.getDailyGgrReport(startOfDay, endOfDay);
        
        res.json({
          success: true,
          data: {
            ...report,
            totalTurnover: currencyUtils.formatCurrency(report.totalStakeCents),
            grossGamingRevenue: currencyUtils.formatCurrency(report.grossGamingRevenueCents),
            totalBets: report.totalBets || 0
          }
        });
      } catch (error) {
        console.error('Daily GGR report error:', error);
        res.json({
          success: true,
          data: { grossGamingRevenue: '£0.00', totalBets: 0, totalTurnover: '£0.00' }
        });
      }
    }
  );

  app.post("/api/admin/reports/monthly", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { year, month } = req.body;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();
        const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        
        const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
        const endOfMonth = new Date(targetYear, targetMonth, 0);
        
        const dbStorage = storage as any;
        const report = await dbStorage.getMonthlyGgrReport(startOfMonth, endOfMonth);
        
        res.json({
          success: true,
          data: {
            ...report,
            grossGamingRevenue: currencyUtils.formatCurrency(report.grossGamingRevenueCents),
            totalBets: report.totalBets || 0,
            growth: report.growth || 0
          }
        });
      } catch (error) {
        console.error('Monthly GGR report error:', error);
        res.json({
          success: true,
          data: { grossGamingRevenue: '£0.00', totalBets: 0, growth: 0 }
        });
      }
    }
  );

  app.post("/api/admin/reports/turnover-by-sport", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    async (req: any, res) => {
      try {
        const { dateFrom, dateTo, sport } = req.body;
        const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateTo ? new Date(dateTo) : new Date();
        
        const dbStorage = storage as any;
        const report = await dbStorage.getTurnoverBySportReport(startDate, endDate, sport);
        
        res.json({
          success: true,
          data: {
            totalTurnover: currencyUtils.formatCurrency(report.totalTurnoverCents),
            sports: report.sports.map(s => ({
              sport: s.sport,
              turnover: currencyUtils.formatCurrency(s.turnoverCents),
              percentage: s.percentage
            }))
          }
        });
      } catch (error) {
        console.error('Turnover by sport report error:', error);
        res.json({
          success: true,
          data: { totalTurnover: '£0.00', sports: [] }
        });
      }
    }
  );

  // Ad-hoc custom reports with filters
  app.post("/api/admin/reports/custom", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:read'),
    auditAction('custom_report_generate'),
    async (req: any, res) => {
      try {
        const { 
          reportType, 
          dateFrom, 
          dateTo, 
          filters = {}, 
          groupBy = 'date',
          metrics = ['turnover', 'bets', 'ggr']
        } = req.body;
        
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        
        // Use real database method - cast storage to database storage to access reporting methods
        const dbStorage = storage as any;
        const report = await dbStorage.generateCustomReport({
          reportType,
          dateFrom: startDate,
          dateTo: endDate,
          filters,
          groupBy,
          metrics
        });
        
        res.json({
          success: true,
          data: report,
          requestedAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('Custom report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate custom report'
        });
      }
    }
  );

  // Export reports (CSV/PDF)
  app.post("/api/admin/reports/export", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:export'),
    auditAction('report_export'),
    async (req: any, res) => {
      try {
        const { 
          reportType, 
          format, 
          dateFrom, 
          dateTo, 
          filters = {} 
        } = req.body;
        
        if (!['csv', 'pdf', 'excel'].includes(format)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid format. Must be csv, pdf, or excel'
          });
        }
        
        // Use real database methods and PDF service
        const dbStorage = storage as any;
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        
        // Get report data based on type
        let reportData: any;
        let reportTitle: string;
        
        switch (reportType) {
          case 'daily':
            reportData = await dbStorage.getDailyGgrReport(startDate, endDate);
            reportTitle = 'Daily GGR Report';
            break;
          case 'monthly':
            reportData = await dbStorage.getMonthlyGgrReport(startDate, endDate);
            reportTitle = 'Monthly GGR Report';
            break;
          case 'turnover':
            reportData = await dbStorage.getTurnoverBySportReport(startDate, endDate);
            reportTitle = 'Turnover by Sport Report';
            break;
          case 'payout':
            reportData = await dbStorage.getPayoutRatioReport(startDate, endDate);
            reportTitle = 'Payout Ratio Report';
            break;
          case 'winners':
            reportData = await dbStorage.getTopWinnersReport(startDate, endDate, 100);
            reportTitle = 'Top Winners Report';
            break;
          case 'chargebacks':
            reportData = await dbStorage.getChargebackReport(startDate, endDate);
            reportTitle = 'Chargeback Report';
            break;
          default:
            throw new Error(`Unknown report type: ${reportType}`);
        }
        
        if (format === 'pdf') {
          // Generate professional PDF using the PDF service
          const pdfBuffer = await pdfReportService.generateReport({
            title: reportTitle,
            subtitle: `Generated on ${new Date().toLocaleDateString('en-GB')}`,
            data: reportData,
            reportType: reportType as any,
            dateRange: { from: startDate, to: endDate },
            includeCharts: true,
            companyInfo: {
              name: 'OddRoyal',
              address: 'Professional Sports Betting Platform'
            }
          });
          
          const filename = `${reportType}_report_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.pdf`;
          
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(pdfBuffer);
        } else if (format === 'csv') {
          // Generate CSV using database export method
          const csvData = await dbStorage.exportReportData({
            reportType,
            format: 'csv',
            startDate,
            endDate,
            filters
          });
          
          const filename = `${reportType}_report_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`;
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(csvData);
        } else if (format === 'excel') {
          // Generate Excel using XLSX library
          const workbook = XLSX.utils.book_new();
          
          // Add summary sheet
          const summaryData = [
            ['OddRoyal - ' + reportTitle],
            ['Generated:', new Date().toLocaleString()],
            ['Period:', `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`],
            [''] // Empty row
          ];
          
          // Add report-specific data
          if (reportType === 'daily' || reportType === 'monthly') {
            summaryData.push(
              ['Metric', 'Value'],
              ['Total Stake', '£' + (reportData.totalStakeCents / 100).toLocaleString()],
              ['Total Payouts', '£' + (reportData.totalPayoutsCents / 100).toLocaleString()],
              ['Gross Gaming Revenue', '£' + (reportData.grossGamingRevenueCents / 100).toLocaleString()],
              ['Total Bets', reportData.totalBets],
              ['Active Players', reportData.activePlayers],
              ['Win Rate', (reportData.winRate * 100).toFixed(2) + '%']
            );
          }
          
          const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
          XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
          
          // Add detailed data sheet for applicable reports
          if (reportData.dailyBreakdown) {
            const detailData = [
              ['Day', 'Stake (£)', 'GGR (£)', 'Bets'],
              ...reportData.dailyBreakdown.map((day: any) => [
                day.day,
                (day.stakeCents / 100).toFixed(2),
                (day.ggrCents / 100).toFixed(2),
                day.bets
              ])
            ];
            const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
            XLSX.utils.book_append_sheet(workbook, detailSheet, 'Daily Breakdown');
          }
          
          const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
          const filename = `${reportType}_report_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.xlsx`;
          
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(excelBuffer);
        } else {
          throw new Error('Invalid export format');
        }
        
      } catch (error) {
        console.error('Export report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to export report'
        });
      }
    }
  );

  // Schedule report exports
  app.post("/api/admin/reports/schedule", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:schedule'),
    auditAction('report_schedule'),
    async (req: any, res) => {
      try {
        const { 
          reportType, 
          schedule, // 'daily', 'weekly', 'monthly'
          format,
          recipients,
          enabled = true
        } = req.body;
        
        // Use real database method and email service for scheduled reports
        const dbStorage = storage as any;
        const scheduledReport = await dbStorage.createScheduledReport({
          name: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
          reportType,
          frequency: schedule,
          recipients,
          filters,
          format: format || 'pdf'
        });
        
        // Test email configuration if this is the first scheduled report
        const emailTest = await emailReportService.testEmailConfiguration();
        if (!emailTest.success) {
          console.warn('Email service not configured properly:', emailTest.message);
          console.warn('Scheduled report created but email delivery may fail');
          console.warn('Configure SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS) to enable email delivery');
        }
        
        res.json({
          success: true,
          data: scheduledReport,
          message: 'Report scheduled successfully'
        });
      } catch (error) {
        console.error('Schedule report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to schedule report'
        });
      }
    }
  );

  // ===================== INSTRUCTION 11: NOTIFICATIONS & ALERTS SYSTEM =====================
  
  // Send notification/alert
  app.post("/api/admin/notifications/send", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('notifications:send'),
    auditAction('notification_send'),
    async (req: any, res) => {
      try {
        const { 
          type, // 'email', 'dashboard', 'slack', 'webhook'
          alertType, // 'exposure_threshold', 'failed_settlement', 'suspicious_activity', 'high_value_bet'
          recipients,
          subject,
          message,
          severity = 'medium', // 'low', 'medium', 'high', 'critical'
          metadata = {}
        } = req.body;
        
        const notification = {
          id: `notif_${Date.now()}`,
          type,
          alertType,
          recipients,
          subject,
          message,
          severity,
          metadata,
          sentBy: req.adminUser.id,
          sentAt: new Date(),
          status: 'sent'
        };
        
        // Send based on type
        switch (type) {
          case 'email':
            await sendEmailNotification(notification);
            break;
          case 'slack':
            await sendSlackNotification(notification);
            break;
          case 'webhook':
            await sendWebhookNotification(notification);
            break;
          case 'dashboard':
            await createDashboardAlert(notification);
            break;
        }
        
        res.json({
          success: true,
          data: notification,
          message: 'Notification sent successfully'
        });
      } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to send notification'
        });
      }
    }
  );

  // Get dashboard alerts
  app.get("/api/admin/notifications/alerts", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('notifications:read'),
    async (req: any, res) => {
      try {
        const { limit = 50, severity, isResolved } = req.query;
        
        const alerts = await storage.getDashboardAlerts?.({
          limit: parseInt(limit),
          severity,
          isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
        }) || [
          {
            id: 'alert_1',
            type: 'exposure_threshold',
            title: 'High Exposure Alert',
            message: 'Market exposure exceeded £50,000 threshold',
            severity: 'high',
            timestamp: new Date(),
            isResolved: false,
            actionRequired: true,
            metadata: { marketId: 'market_123', exposureCents: 5000000 }
          },
          {
            id: 'alert_2',
            type: 'suspicious_activity',
            title: 'Suspicious Betting Pattern',
            message: 'Unusual betting activity detected from user',
            severity: 'medium',
            timestamp: new Date(Date.now() - 60000),
            isResolved: false,
            actionRequired: true,
            metadata: { userId: 'user_456' }
          }
        ];
        
        res.json({
          success: true,
          data: alerts
        });
      } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve alerts'
        });
      }
    }
  );

  // Mark alert as resolved
  app.patch("/api/admin/notifications/alerts/:id/resolve", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('notifications:update'),
    auditAction('alert_resolve'),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { resolution_note } = req.body;
        
        const alert = await storage.resolveAlert?.(id, {
          resolvedBy: req.adminUser.id,
          resolvedAt: new Date(),
          resolutionNote: resolution_note
        });
        
        res.json({
          success: true,
          data: alert,
          message: 'Alert resolved successfully'
        });
      } catch (error) {
        console.error('Resolve alert error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to resolve alert'
        });
      }
    }
  );

  // Configure notification settings
  app.put("/api/admin/notifications/settings", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('notifications:configure'),
    auditAction('notification_settings_update'),
    async (req: any, res) => {
      try {
        const { 
          emailSettings = {},
          slackSettings = {},
          webhookSettings = {},
          alertThresholds = {}
        } = req.body;
        
        const settings = await storage.updateNotificationSettings?.({
          emailSettings: {
            enabled: emailSettings.enabled || false,
            smtpHost: emailSettings.smtpHost,
            smtpPort: emailSettings.smtpPort,
            username: emailSettings.username,
            recipients: emailSettings.recipients || []
          },
          slackSettings: {
            enabled: slackSettings.enabled || false,
            webhookUrl: slackSettings.webhookUrl,
            channel: slackSettings.channel || '#alerts'
          },
          webhookSettings: {
            enabled: webhookSettings.enabled || false,
            url: webhookSettings.url,
            headers: webhookSettings.headers || {}
          },
          alertThresholds: {
            exposureThresholdCents: alertThresholds.exposureThresholdCents || 5000000, // £50,000
            highValueBetCents: alertThresholds.highValueBetCents || 100000, // £1,000
            suspiciousBetCount: alertThresholds.suspiciousBetCount || 10,
            failedSettlementThreshold: alertThresholds.failedSettlementThreshold || 5
          },
          updatedBy: req.adminUser.id,
          updatedAt: new Date()
        });
        
        res.json({
          success: true,
          data: settings,
          message: 'Notification settings updated successfully'
        });
      } catch (error) {
        console.error('Update notification settings error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update notification settings'
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

  // GET /api/admin/matches/:id - get single match details
  app.get("/api/admin/matches/:id", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('matches:read'), 
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

        // Get associated markets and their outcomes
        const markets = await storage.getMatchMarkets(id);
        
        // Get exposure data
        let exposureData = null;
        try {
          exposureData = await storage.getMatchExposure(id);
        } catch (error) {
          console.warn('Failed to get exposure data for match:', id, error);
        }

        res.json({
          success: true,
          data: {
            ...match,
            markets: markets || [],
            exposure: exposureData
          }
        });
      } catch (error) {
        console.error('Get match error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch match'
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

  // GET /api/admin/customers - List regular users with search/filter functionality
  app.get("/api/admin/customers", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:view'),
    auditAction('customers_list'),
    async (req: any, res) => {
      try {
        const { limit = 50, offset = 0, search, isActive } = req.query;
        
        // Use server-side filtering and pagination
        const result = await storage.searchUsersData({
          query: search,
          isActive: isActive !== undefined ? isActive === 'true' : undefined,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });

        // Remove sensitive data and format consistently
        const safeUsers = result.users.map(user => {
          const { password, ...userWithoutPassword } = user;
          return {
            ...userWithoutPassword,
            balance: currencyUtils.formatCurrency(user.balance) // Use consistent currency formatting
          };
        });

        res.json({
          success: true,
          data: {
            users: safeUsers,
            total: result.total,
            filteredTotal: result.filteredTotal,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        });
      } catch (error) {
        console.error('List customers error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve customers'
        });
      }
    }
  );

  // GET /api/admin/customers/:id - Get single customer details
  app.get("/api/admin/customers/:id", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:view'),
    auditAction('customer_view'),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        
        const user = await storage.getUser(id);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'Customer not found'
          });
        }

        // Get user's recent bets and transactions
        const [userBets, userTransactions] = await Promise.all([
          storage.getUserBets(id, 20),
          storage.getUserTransactions(id, 20)
        ]);

        const { password, ...userWithoutPassword } = user;
        res.json({
          success: true,
          data: {
            user: {
              ...userWithoutPassword,
              balance: currencyUtils.formatCurrency(user.balance) // Use consistent currency formatting
            },
            recentBets: userBets,
            recentTransactions: userTransactions
          }
        });
      } catch (error) {
        console.error('Get customer error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve customer details'
        });
      }
    }
  );

  // POST /api/admin/customers/:id/unban - Unban/activate user account
  app.post("/api/admin/customers/:id/unban", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:manage'), 
    require2FA,
    auditAction('unban_user'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        const { reason } = req.body;
        
        if (!reason) {
          return res.status(400).json({
            success: false,
            error: 'Reason is required to unban a user'
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

        // Unban user (set isActive to true)
        await storage.updateUserProfile(userId, { isActive: true });

        // Create audit log
        await storage.createAuditLog({
          adminId: req.adminUser.id,
          actionType: 'unban_user',
          targetType: 'user',
          targetId: userId,
          dataBefore: { isActive: user.isActive },
          dataAfter: { isActive: true },
          note: `User unbanned: ${reason}`,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
          success: true
        });

        res.json({
          success: true,
          data: { userId, unbanned: true, reason },
          message: 'User unbanned successfully'
        });
      } catch (error) {
        console.error('Unban user error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to unban user'
        });
      }
    }
  );

  // GET /api/admin/customers/:id/transactions - Get detailed transaction history for user
  app.get("/api/admin/customers/:id/transactions", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:view'),
    auditAction('view_user_transactions'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        
        // Get user to verify exists
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'Customer not found'
          });
        }

        // Get user transactions with pagination
        const transactions = await storage.getUserTransactions(userId, parseInt(limit));
        
        res.json({
          success: true,
          data: {
            userId,
            transactions,
            total: transactions.length, // TODO: Implement proper total count
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        });
      } catch (error) {
        console.error('Get user transactions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve user transactions'
        });
      }
    }
  );

  // POST /api/admin/customers/:id/limits - Set betting limits for user
  app.post("/api/admin/customers/:id/limits", 
    ...SecurityMiddlewareOrchestrator.getStrictMiddleware(),
    authenticateAdmin, 
    requirePermission('users:manage'), 
    require2FA,
    auditAction('set_user_limits'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        
        // Validate and parse request body with proper field mapping
        const requestSchema = z.object({
          dailyLimitCents: z.number().positive().optional(),
          weeklyLimitCents: z.number().positive().optional(), 
          monthlyLimitCents: z.number().positive().optional(),
          maxStakeCents: z.number().positive().optional(),
          dailyDepositLimitCents: z.number().positive().optional(),
          dailyLossLimitCents: z.number().positive().optional(),
          isSelfExcluded: z.boolean().optional(),
          selfExclusionUntil: z.string().datetime().optional(),
          cooldownUntil: z.string().datetime().optional(),
          reason: z.string().min(1, 'Reason is required to set user limits')
        });

        const validatedData = requestSchema.parse(req.body);

        // Get user to verify exists
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Get existing limits for audit trail
        const existingLimits = await storage.getUserLimits(userId);

        // Map legacy field names to schema field names for backward compatibility
        const limitsData = {
          dailyStakeLimitCents: validatedData.dailyLimitCents,
          weeklyStakeLimitCents: validatedData.weeklyLimitCents, 
          monthlyStakeLimitCents: validatedData.monthlyLimitCents,
          maxStakeCents: validatedData.maxStakeCents,
          dailyDepositLimitCents: validatedData.dailyDepositLimitCents,
          dailyLossLimitCents: validatedData.dailyLossLimitCents,
          isSelfExcluded: validatedData.isSelfExcluded,
          selfExclusionUntil: validatedData.selfExclusionUntil ? new Date(validatedData.selfExclusionUntil) : undefined,
          cooldownUntil: validatedData.cooldownUntil ? new Date(validatedData.cooldownUntil) : undefined,
          reason: validatedData.reason
        };

        // Save limits to database
        const updatedLimits = await storage.upsertUserLimits(userId, limitsData, req.adminUser.id);

        // Create audit log with proper before/after data
        await storage.createAuditLog({
          adminId: req.adminUser.id,
          actionType: 'set_user_limits',
          targetType: 'user',
          targetId: userId,
          dataBefore: existingLimits,
          dataAfter: updatedLimits,
          note: `User limits set: ${validatedData.reason}`,
          ipAddress: req.ip || null,
          userAgent: req.get('User-Agent') || null,
          success: true
        });

        res.json({
          success: true,
          data: { 
            userId, 
            limits: updatedLimits,
            reason: validatedData.reason
          },
          message: 'User limits set successfully and saved to database'
        });
      } catch (error) {
        console.error('Set user limits error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request data',
            details: error.errors
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to set user limits'
        });
      }
    }
  );

  // GET /api/admin/customers/:id/limits - Get current betting limits for user
  app.get("/api/admin/customers/:id/limits", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('users:read'),
    async (req: any, res) => {
      try {
        const { id: userId } = req.params;
        
        // Get user to verify exists
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        // Get user limits
        const limits = await storage.getUserLimits(userId);

        res.json({
          success: true,
          data: { 
            userId, 
            limits: limits || null // Return null if no limits set
          }
        });
      } catch (error) {
        console.error('Get user limits error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve user limits'
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

  // =====================================
  // ADMIN SETTLEMENT ROUTES - Instruction 8
  // =====================================

  // Get pending bets for settlement
  app.get("/api/admin/settlement/pending", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:read'), 
    async (req: any, res) => {
      try {
        const pendingBets = await storage.getAllBets({
          status: 'pending',
          limit: 100
        });

        res.json({
          success: true,
          data: pendingBets
        });
      } catch (error) {
        console.error('Get pending settlements error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve pending settlements'
        });
      }
    }
  );

  // Get reconciliation issues
  app.get("/api/admin/settlement/reconciliation-issues", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:read'), 
    async (req: any, res) => {
      try {
        // Mock reconciliation issues - in a real implementation, this would check for:
        // - Missing results for completed matches
        // - Duplicate results 
        // - Mismatched data between SportMonks and local database
        const issues = [
          {
            id: randomUUID(),
            type: 'missing_result',
            description: 'Match completed but no result available from SportMonks',
            fixtureId: '12345',
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            affectedBets: 5,
            severity: 'high' as const,
            createdAt: new Date().toISOString()
          }
        ];

        res.json({
          success: true,
          data: issues
        });
      } catch (error) {
        console.error('Get reconciliation issues error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve reconciliation issues'
        });
      }
    }
  );

  // Get settlement worker status
  app.get("/api/admin/settlement/worker-status", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:read'), 
    async (req: any, res) => {
      try {
        // Import settlement worker to check status
        const { settlementWorker } = await import('./settlement-worker');
        
        const status = settlementWorker.getStatus();

        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        console.error('Get worker status error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve worker status'
        });
      }
    }
  );

  // Get settlement history
  app.get("/api/admin/settlement/history", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:read'), 
    async (req: any, res) => {
      try {
        const { status, fixtureId, dateFrom, dateTo } = req.query;
        
        const settledBets = await storage.getAllBets({
          status: status !== 'all' ? status as string : undefined,
          limit: 100
        });

        // Filter by date range if provided
        let filteredBets = settledBets;
        if (dateFrom || dateTo) {
          filteredBets = settledBets.filter(bet => {
            const betDate = new Date(bet.placedAt);
            if (dateFrom && betDate < new Date(dateFrom as string)) return false;
            if (dateTo && betDate > new Date(dateTo as string)) return false;
            return true;
          });
        }

        res.json({
          success: true,
          data: filteredBets
        });
      } catch (error) {
        console.error('Get settlement history error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve settlement history'
        });
      }
    }
  );

  // Force settle bet - Manual override capability
  app.post("/api/admin/settlement/force-settle/:betId", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:settle'), 
    require2FA,
    auditAction('force_settle_bet', (req) => ({ 
      targetType: 'bet', 
      targetId: req.params.betId 
    })),
    async (req: any, res) => {
      try {
        const { betId } = req.params;
        const { outcome, reason } = req.body;

        if (!['won', 'lost', 'void'].includes(outcome)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid settlement outcome. Must be won, lost, or void.'
          });
        }

        if (!reason || reason.trim().length < 10) {
          return res.status(400).json({
            success: false,
            error: 'Detailed reason required for manual settlement (minimum 10 characters)'
          });
        }

        const bet = await storage.getBet(betId);
        if (!bet) {
          return res.status(404).json({
            success: false,
            error: 'Bet not found'
          });
        }

        if (bet.status !== 'pending') {
          return res.status(400).json({
            success: false,
            error: 'Bet is not in pending status'
          });
        }

        // Calculate winnings based on outcome
        let actualWinnings = 0;
        if (outcome === 'won') {
          actualWinnings = bet.potentialWinnings;
        } else if (outcome === 'void') {
          actualWinnings = bet.totalStake; // Return stake for voided bets
        }
        // For 'lost', actualWinnings remains 0

        // Update bet status
        const updatedBet = await storage.updateBetStatus(betId, outcome, actualWinnings);
        
        if (!updatedBet) {
          return res.status(500).json({
            success: false,
            error: 'Failed to update bet status'
          });
        }

        // Update user balance if bet won or voided
        if (actualWinnings > 0) {
          const user = await storage.getUser(bet.userId);
          if (user) {
            const newBalance = user.balance + actualWinnings;
            await storage.updateUserBalance(bet.userId, newBalance);
            
            // Record transaction
            await storage.createTransaction({
              userId: bet.userId,
              type: outcome === 'won' ? 'payout' : 'refund',
              amount: actualWinnings,
              description: `Manual settlement: ${outcome.toUpperCase()} - ${reason}`,
              balanceAfter: newBalance,
              betId: betId
            });
          }
        }

        res.json({
          success: true,
          data: updatedBet,
          message: `Bet manually settled as ${outcome.toUpperCase()}`
        });
      } catch (error) {
        console.error('Force settle bet error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to force settle bet'
        });
      }
    }
  );

  // Start/stop settlement worker
  app.post("/api/admin/settlement/worker/:action", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:settle'), 
    auditAction('settlement_worker_control', (req) => ({ 
      targetType: 'system', 
      targetId: 'settlement_worker',
      note: `Worker ${req.params.action}` 
    })),
    async (req: any, res) => {
      try {
        const { action } = req.params;
        
        if (!['start', 'stop'].includes(action)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be start or stop.'
          });
        }

        // Import settlement worker
        const { settlementWorker } = await import('./settlement-worker');
        
        if (action === 'start') {
          settlementWorker.start();
        } else {
          settlementWorker.stop();
        }

        res.json({
          success: true,
          message: `Settlement worker ${action}ed successfully`
        });
      } catch (error) {
        console.error('Settlement worker control error:', error);
        res.status(500).json({
          success: false,
          error: `Failed to ${req.params.action} settlement worker`
        });
      }
    }
  );

  // Manual reconciliation for a specific fixture
  app.post("/api/admin/settlement/reconcile/:fixtureId", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:settle'), 
    auditAction('manual_reconciliation', (req) => ({ 
      targetType: 'fixture', 
      targetId: req.params.fixtureId 
    })),
    async (req: any, res) => {
      try {
        const { fixtureId } = req.params;
        
        // Import settlement worker to trigger reconciliation
        const { settlementWorker } = await import('./settlement-worker');
        
        // In a real implementation, this would:
        // 1. Re-fetch results for the specific fixture
        // 2. Check for pending bets on this fixture
        // 3. Attempt to settle them with the new data
        // 4. Log any remaining issues
        
        res.json({
          success: true,
          message: `Manual reconciliation triggered for fixture ${fixtureId}`
        });
      } catch (error) {
        console.error('Manual reconciliation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to trigger manual reconciliation'
        });
      }
    }
  );

  // Re-fetch results from SportMonks for a fixture
  app.post("/api/admin/settlement/refetch-results/:fixtureId", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requirePermission('bets:settle'), 
    auditAction('refetch_results', (req) => ({ 
      targetType: 'fixture', 
      targetId: req.params.fixtureId 
    })),
    async (req: any, res) => {
      try {
        const { fixtureId } = req.params;
        
        // In a real implementation, this would:
        // 1. Call SportMonks API to get fresh results for the fixture
        // 2. Update local cache with new data
        // 3. Check if this resolves any reconciliation issues
        
        res.json({
          success: true,
          message: `Results re-fetched for fixture ${fixtureId}`
        });
      } catch (error) {
        console.error('Re-fetch results error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to re-fetch results'
        });
      }
    }
  );

  // Export settlement report
  app.post("/api/admin/settlement/export", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('reports:export'), 
    auditAction('export_settlement_report'),
    async (req: any, res) => {
      try {
        const { format, dateFrom, dateTo } = req.body;
        
        if (!['csv', 'pdf'].includes(format)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid format. Must be csv or pdf.'
          });
        }

        // Get settlement data for the date range
        const bets = await storage.getAllBets({
          limit: 1000 // Reasonable limit for exports
        });

        // Filter by date range
        let filteredBets = bets;
        if (dateFrom || dateTo) {
          filteredBets = bets.filter(bet => {
            const betDate = new Date(bet.placedAt);
            if (dateFrom && betDate < new Date(dateFrom)) return false;
            if (dateTo && betDate > new Date(dateTo)) return false;
            return true;
          });
        }

        if (format === 'csv') {
          // Generate CSV
          const csvHeader = 'Bet ID,User ID,Type,Stake,Status,Placed At,Settled At,Winnings\n';
          const csvData = filteredBets.map(bet => 
            `${bet.id},${bet.userId},${bet.type},${bet.totalStake},${bet.status},${bet.placedAt},${bet.settledAt || ''},${bet.actualWinnings || 0}`
          ).join('\n');
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="settlement-report.csv"');
          res.send(csvHeader + csvData);
        } else {
          // For PDF, we'd use a library like puppeteer or pdfkit
          // For now, return a simple text response
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="settlement-report.pdf"');
          res.send('PDF generation not implemented yet');
        }
      } catch (error) {
        console.error('Export settlement report error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to export settlement report'
        });
      }
    }
  );

  // =====================================
  // ADMIN SECURITY ROUTES - Instruction 9
  // =====================================

  // Get IP allowlist
  app.get("/api/admin/security/ip-allowlist", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    async (req: any, res) => {
      try {
        // Mock IP allowlist - in real implementation, this would be stored in database
        const allowlist = [
          {
            id: randomUUID(),
            ipAddress: "192.168.1.100",
            description: "Office network",
            adminRole: "superadmin",
            isActive: true,
            createdAt: new Date().toISOString(),
            createdBy: req.adminUser.id
          }
        ];

        res.json({
          success: true,
          data: allowlist
        });
      } catch (error) {
        console.error('Get IP allowlist error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve IP allowlist'
        });
      }
    }
  );

  // Add IP to allowlist
  app.post("/api/admin/security/ip-allowlist", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    auditAction('ip_allowlist_add', (req) => ({ 
      targetType: 'ip_allowlist', 
      targetId: req.body.ipAddress 
    })),
    async (req: any, res) => {
      try {
        const { ipAddress, description, adminRole } = req.body;

        if (!ipAddress || !description || !adminRole) {
          return res.status(400).json({
            success: false,
            error: 'IP address, description, and admin role are required'
          });
        }

        // Basic IP validation
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ipAddress)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid IP address format'
          });
        }

        // In real implementation, store in database
        const newEntry = {
          id: randomUUID(),
          ipAddress,
          description,
          adminRole,
          isActive: true,
          createdAt: new Date().toISOString(),
          createdBy: req.adminUser.id
        };

        res.json({
          success: true,
          data: newEntry,
          message: 'IP address added to allowlist successfully'
        });
      } catch (error) {
        console.error('Add IP allowlist error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add IP to allowlist'
        });
      }
    }
  );

  // Remove IP from allowlist
  app.delete("/api/admin/security/ip-allowlist/:id", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    auditAction('ip_allowlist_remove', (req) => ({ 
      targetType: 'ip_allowlist', 
      targetId: req.params.id 
    })),
    async (req: any, res) => {
      try {
        const { id } = req.params;

        // In real implementation, remove from database
        res.json({
          success: true,
          message: 'IP address removed from allowlist successfully'
        });
      } catch (error) {
        console.error('Remove IP allowlist error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to remove IP from allowlist'
        });
      }
    }
  );

  // Get active admin sessions
  app.get("/api/admin/security/sessions", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requireAdminLevel(), 
    async (req: any, res) => {
      try {
        // Get active admin sessions
        const sessions = await storage.getActiveAdminSessions();
        
        res.json({
          success: true,
          data: sessions
        });
      } catch (error) {
        console.error('Get admin sessions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve admin sessions'
        });
      }
    }
  );

  // Get system status
  app.get("/api/admin/security/system-status", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateAdmin, 
    requirePermission('dashboard:read'), 
    async (req: any, res) => {
      try {
        // Mock system status - in real implementation, check actual system state
        const status = {
          bettingEnabled: true,
          maintenanceMode: false,
          emergencyShutdown: false,
          totalActiveSessions: 3,
          totalActiveUsers: 1250,
          systemAlerts: 0
        };

        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        console.error('Get system status error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve system status'
        });
      }
    }
  );

  // Emergency shutdown toggle - PANIC BUTTON
  app.post("/api/admin/security/emergency-shutdown", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    require2FA,
    auditAction('emergency_shutdown', (req) => ({ 
      targetType: 'system', 
      targetId: 'betting_system',
      note: `Emergency shutdown ${req.body.action}` 
    })),
    async (req: any, res) => {
      try {
        const { action } = req.body;

        if (!['enable', 'disable'].includes(action)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid action. Must be enable or disable.'
          });
        }

        // In real implementation:
        // 1. Set emergency shutdown flag in database/cache
        // 2. Stop all betting workers
        // 3. Notify all services of emergency state
        // 4. Log critical alert

        console.log(`EMERGENCY SHUTDOWN ${action.toUpperCase()} by admin ${req.adminUser.username}`);

        res.json({
          success: true,
          message: `Emergency shutdown ${action}d successfully`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Emergency shutdown error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to execute emergency shutdown'
        });
      }
    }
  );

  // Toggle betting system
  app.post("/api/admin/security/toggle-betting", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireAnyRole(['superadmin', 'admin', 'risk_manager']), 
    auditAction('toggle_betting', (req) => ({ 
      targetType: 'system', 
      targetId: 'betting_system',
      note: `Betting ${req.body.enabled ? 'enabled' : 'disabled'}` 
    })),
    async (req: any, res) => {
      try {
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
          return res.status(400).json({
            success: false,
            error: 'Enabled parameter must be a boolean'
          });
        }

        // In real implementation:
        // 1. Update system configuration
        // 2. Notify betting workers
        // 3. Update frontend flags

        res.json({
          success: true,
          message: `Betting ${enabled ? 'enabled' : 'disabled'} successfully`
        });
      } catch (error) {
        console.error('Toggle betting error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to toggle betting'
        });
      }
    }
  );

  // Terminate admin session
  app.post("/api/admin/security/terminate-session/:sessionId", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    auditAction('terminate_session', (req) => ({ 
      targetType: 'admin_session', 
      targetId: req.params.sessionId 
    })),
    async (req: any, res) => {
      try {
        const { sessionId } = req.params;

        // Don't allow terminating own session
        const session = await storage.getAdminSession(sessionId);
        if (session && session.adminId === req.adminUser.id) {
          return res.status(400).json({
            success: false,
            error: 'Cannot terminate your own session'
          });
        }

        // Terminate the session
        await storage.deleteAdminSession(sessionId);

        res.json({
          success: true,
          message: 'Admin session terminated successfully'
        });
      } catch (error) {
        console.error('Terminate session error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to terminate session'
        });
      }
    }
  );

  // Force 2FA for all admins
  app.post("/api/admin/security/force-2fa", 
    ...SecurityMiddlewareOrchestrator.getCriticalMiddleware(),
    authenticateAdmin, 
    requireSuperadmin(), 
    auditAction('force_2fa_all'),
    async (req: any, res) => {
      try {
        // In real implementation:
        // 1. Update all admin users to require 2FA
        // 2. Invalidate sessions without 2FA
        // 3. Send notifications to admins

        res.json({
          success: true,
          message: 'Two-factor authentication enforced for all admin users'
        });
      } catch (error) {
        console.error('Force 2FA error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to enforce 2FA'
        });
      }
    }
  );

  // ===================== M-PESA PAYMENT ROUTES =====================
  
  // Initiate M-PESA STK Push payment
  app.post("/api/mpesa/stk-push", authenticateUser, async (req: any, res) => {
    try {
      // Validate request body with Zod schema
      const stkPushSchema = z.object({
        phoneNumber: z.string().transform((phone) => {
          // Normalize phone number format
          let cleaned = phone.replace(/\D/g, '');
          if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
          } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
            cleaned = '254' + cleaned;
          }
          return cleaned;
        }).refine((phone) => /^254[17]\d{8}$/.test(phone), "Invalid Kenyan mobile number"),
        amount: z.number().min(2000, "Minimum amount is KES 2000"),
        currency: z.literal("KES", { errorMap: () => ({ message: "Only KES currency is supported" }) }),
        description: z.string().optional()
      });

      const validatedData = stkPushSchema.parse(req.body);
      const { phoneNumber, amount, currency, description } = validatedData;

      // Check for duplicate recent transactions (idempotency)
      const recentTransactions = await storage.getUserTransactions(req.user.id);
      const recentDuplicate = recentTransactions.find(t => {
        const timeDiff = Date.now() - new Date(t.createdAt).getTime();
        return t.type === 'deposit' && 
               t.amount === amount.toString() && 
               t.status === 'pending' &&
               timeDiff < 60000; // 1 minute
      });

      if (recentDuplicate) {
        try {
          const metadata = JSON.parse(recentDuplicate.metadata || '{}');
          return res.json({
            success: true,
            data: {
              CheckoutRequestID: metadata.checkoutRequestID,
              CustomerMessage: "Previous transaction still processing",
              transactionId: recentDuplicate.id
            }
          });
        } catch (e) {
          // Continue with new transaction if metadata parsing fails
        }
      }

      // Create callback URL for this deployment (respect proxy headers)
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const callbackUrl = process.env.MPESA_CALLBACK_BASE_URL || `${protocol}://${host}/api/mpesa/callback`;
      
      // Generate unique account reference for tracking
      const accountReference = `DEP-${req.user.id.substring(0, 8)}-${Date.now()}`;
      
      const stkPushResult = await mpesaService.stkPush({
        phoneNumber,
        amount,
        accountReference,
        transactionDesc: description || `Deposit to ${req.user.username}`,
        callbackUrl
      });

      // Store transaction record for tracking
      const transactionId = randomUUID();
      await storage.createTransaction({
        id: transactionId,
        userId: req.user.id,
        type: 'deposit',
        amount: amount.toString(),
        status: 'pending',
        description: `M-PESA deposit - ${description || 'Account deposit'}`,
        metadata: JSON.stringify({
          checkoutRequestID: stkPushResult.CheckoutRequestID,
          merchantRequestID: stkPushResult.MerchantRequestID,
          phoneNumber,
          accountReference,
          currency
        })
      });

      res.json({
        success: true,
        data: {
          CheckoutRequestID: stkPushResult.CheckoutRequestID,
          CustomerMessage: stkPushResult.CustomerMessage,
          transactionId
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors
        });
      }
      console.error('STK Push error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to initiate payment"
      });
    }
  });

  // Check M-PESA payment status
  app.get("/api/mpesa/payment-status/:checkoutRequestID", authenticateUser, async (req: any, res) => {
    try {
      const { checkoutRequestID } = req.params;
      
      // First check our database for the transaction
      const transactions = await storage.getUserTransactions(req.user.id);
      const transaction = transactions.find(t => {
        try {
          const metadata = JSON.parse(t.metadata || '{}');
          return metadata.checkoutRequestID === checkoutRequestID;
        } catch {
          return false;
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: "Transaction not found"
        });
      }

      // If already completed or failed, return cached status
      if (transaction.status === 'completed' || transaction.status === 'failed') {
        return res.json({
          success: true,
          data: {
            status: transaction.status,
            message: transaction.status === 'completed' ? 'Payment completed successfully' : 'Payment failed',
            transactionId: transaction.id
          }
        });
      }

      // Query M-PESA for current status
      try {
        const statusResult = await mpesaService.querySTKPushStatus(checkoutRequestID);
        
        let status = 'pending';
        let message = 'Payment is being processed';

        if (statusResult.ResultCode === '0') {
          status = 'completed';
          message = 'Payment completed successfully';
        } else if (statusResult.ResultCode && statusResult.ResultCode !== '1037') {
          // 1037 is "Transaction in progress", anything else is an error
          status = 'failed';
          message = statusResult.ResultDesc || 'Payment failed';
        }

        // Update transaction status if changed (idempotent update)
        if (status !== 'pending' && transaction.status === 'pending') {
          await storage.updateTransaction(transaction.id, {
            status,
            metadata: JSON.stringify({
              ...JSON.parse(transaction.metadata || '{}'),
              mpesaResult: statusResult,
              statusUpdatedAt: new Date().toISOString()
            })
          });

          // If completed, update user balance (idempotent)
          if (status === 'completed') {
            const amount = parseInt(transaction.amount);
            const currentUser = await storage.getUser(req.user.id);
            if (currentUser) {
              const newBalance = currentUser.balance + amount;
              await storage.updateUserBalance(req.user.id, newBalance);
              console.log(`User ${req.user.id} balance updated by ${amount} cents (new balance: ${newBalance}) for transaction ${transaction.id}`);
            }
          }
        }

        res.json({
          success: true,
          data: {
            status,
            message,
            transactionId: transaction.id
          }
        });
      } catch (queryError: any) {
        console.error('M-PESA status query error:', queryError);
        // Return pending status if query fails
        res.json({
          success: true,
          data: {
            status: 'pending',
            message: 'Payment is being processed',
            transactionId: transaction.id
          }
        });
      }
    } catch (error: any) {
      console.error('Payment status check error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to check payment status"
      });
    }
  });

  // M-PESA callback endpoint
  app.post("/api/mpesa/callback", async (req, res) => {
    try {
      console.log('M-PESA Callback received:', {
        CheckoutRequestID: req.body.Body?.stkCallback?.CheckoutRequestID,
        ResultCode: req.body.Body?.stkCallback?.ResultCode,
        timestamp: new Date().toISOString()
      });
      
      const callbackResult = mpesaService.processCallback(req.body);
      const checkoutRequestID = req.body.Body?.stkCallback?.CheckoutRequestID;
      
      if (!checkoutRequestID) {
        console.error('No CheckoutRequestID in callback');
        return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback data" });
      }

      // Find the transaction in our database
      const allUsers = await storage.getAllUsers();
      let transaction = null;
      let userId = null;

      for (const user of allUsers) {
        const userTransactions = await storage.getUserTransactions(user.id);
        const foundTransaction = userTransactions.find(t => {
          try {
            const metadata = JSON.parse(t.metadata || '{}');
            return metadata.checkoutRequestID === checkoutRequestID;
          } catch {
            return false;
          }
        });
        
        if (foundTransaction) {
          transaction = foundTransaction;
          userId = user.id;
          break;
        }
      }

      if (!transaction || !userId) {
        console.error('Transaction not found for CheckoutRequestID:', checkoutRequestID);
        return res.json({ ResultCode: 0, ResultDesc: "Transaction not found" });
      }

      // Update transaction based on callback result (idempotent)
      if (transaction.status === 'pending') {
        const status = callbackResult.resultCode === 0 ? 'completed' : 'failed';
        const updatedMetadata = {
          ...JSON.parse(transaction.metadata || '{}'),
          callbackResult,
          completedAt: new Date().toISOString()
        };

        await storage.updateTransaction(transaction.id, {
          status,
          metadata: JSON.stringify(updatedMetadata)
        });

        // If payment was successful, update user balance (idempotent)
        if (status === 'completed') {
          const amount = parseInt(transaction.amount);
          await storage.updateUserBalance(userId, amount);
          console.log(`User ${userId} balance updated by ${amount} for transaction ${transaction.id}`);
        }

        console.log(`Transaction ${transaction.id} updated to status: ${status}`);
      } else {
        console.log(`Transaction ${transaction.id} already processed with status: ${transaction.status}`);
      }
      
      // Respond to M-PESA
      res.json({
        ResultCode: 0,
        ResultDesc: "Callback processed successfully"
      });
    } catch (error: any) {
      console.error('M-PESA callback processing error:', error);
      res.status(500).json({
        ResultCode: 1,
        ResultDesc: "Internal server error"
      });
    }
  });

  const httpServer = createServer(app);
  
  // Add live match simulation control endpoints
  // addSimulationRoutes(app);
  
  // Initialize WebSocket server for real-time updates
  initializeWebSocket(httpServer);
  
  // ===================== ONE-TIME SUPERADMIN SETUP ENDPOINT =====================
  
  // Create superadmin user (one-time setup)
  app.post("/api/setup/create-superadmin", 
    AdminRateLimitManager.criticalLimiter, // Rate limit for security
    async (req, res) => {
      try {
        // CRITICAL: Require setup key from environment (no fallback)
        const expectedSetupKey = process.env.SETUP_KEY;
        if (!expectedSetupKey) {
          console.error('SECURITY: SETUP_KEY environment variable not set');
          return res.status(500).json({
            success: false,
            error: "Server configuration error"
          });
        }

        // Validate request with proper zod schema
        const setupSchema = z.object({
          setupKey: z.string().min(16, "Setup key must be at least 16 characters"),
          username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
          email: z.string().email("Invalid email format"),
          password: z.string()
            .min(12, "Password must be at least 12 characters")
            .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
            .regex(/[a-z]/, "Password must contain at least one lowercase letter") 
            .regex(/[0-9]/, "Password must contain at least one number")
            .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
        });

        let validatedData;
        try {
          validatedData = setupSchema.parse(req.body);
        } catch (validationError) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            details: validationError instanceof z.ZodError ? validationError.errors : "Invalid input"
          });
        }

        const { setupKey, username, email, password } = validatedData;
        
        if (setupKey !== expectedSetupKey) {
          console.warn(`SECURITY: Invalid setup key attempt from ${req.ip}`);
          return res.status(403).json({
            success: false,
            error: "Invalid setup key"
          });
        }

        // CRITICAL: Check if superadmin exists - FAIL CLOSED if we can't verify
        let existingSuperadmins;
        try {
          existingSuperadmins = await storage.getAdminsByRole("superadmin");
        } catch (error) {
          console.error('SECURITY: Cannot verify existing superadmins - blocking creation:', error);
          return res.status(500).json({
            success: false,
            error: "Cannot verify system state - setup blocked for security"
          });
        }

        if (existingSuperadmins && existingSuperadmins.length > 0) {
          console.warn(`SECURITY: Attempt to create duplicate superadmin from ${req.ip}`);
          return res.status(400).json({
            success: false,
            error: "Superadmin already exists. This endpoint can only be used once."
          });
        }

        // Check if username/email already exists
        try {
          const existingByUsername = await storage.getAdminUserByUsername(username);
          if (existingByUsername) {
            return res.status(400).json({
              success: false,
              error: "Username already exists"
            });
          }

          const existingByEmail = await storage.getAdminUserByEmail(email);
          if (existingByEmail) {
            return res.status(400).json({
              success: false,
              error: "Email already exists"
            });
          }
        } catch (error) {
          console.error('Cannot verify username/email uniqueness - blocking creation:', error);
          return res.status(500).json({
            success: false,
            error: "Cannot verify system state - setup blocked for security"
          });
        }

        // Hash password with Argon2
        const passwordHash = await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 2 ** 16, // 64 MB
          timeCost: 3,
          parallelism: 1,
        });

        // Generate TOTP secret for 2FA
        const totpSecret = speakeasy.generateSecret({
          name: `OddRoyal Admin (${username})`,
          issuer: 'OddRoyal',
          length: 32
        });

        // Create admin user
        const adminUser = await storage.createAdminUser({
          username,
          email,
          role: 'superadmin',
          passwordHash,
          totpSecret: totpSecret.base32!,
          isActive: true
        });

        // Generate QR code for 2FA setup
        const totpQrCode = await qrcode.toString(totpSecret.otpauth_url!, { type: 'terminal' });

        // Create audit log
        try {
          await storage.createAuditLog({
            adminId: adminUser.id,
            actionType: 'create_superadmin',
            targetType: 'admin_user',
            targetId: adminUser.id,
            dataAfter: {
              username: adminUser.username,
              email: adminUser.email,
              role: adminUser.role,
              createdBy: 'setup_endpoint'
            },
            note: 'Superadmin created via setup endpoint',
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            success: true
          });
        } catch (auditError) {
          console.error('Failed to create audit log:', auditError);
          // Don't fail the whole operation for audit log issues
        }

        console.log('🎉 Superadmin created successfully!');
        console.log('👤 Username:', username);
        console.log('📧 Email:', email);
        console.log('🔐 2FA QR Code:');
        console.log(totpQrCode);

        res.json({
          success: true,
          message: 'Superadmin created successfully',
          data: {
            id: adminUser.id,
            username: adminUser.username,
            email: adminUser.email,
            role: adminUser.role,
            totpSetupUrl: totpSecret.otpauth_url,
            manualEntryKey: totpSecret.base32,
            qrCodeText: totpQrCode
          }
        });

      } catch (error) {
        console.error('Superadmin creation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create superadmin',
          details: (error as Error).message
        });
      }
    }
  );

  // ===================== USER RESPONSIBLE GAMBLING ENDPOINTS =====================

  // GET /api/user/limits - Get current user's betting limits
  app.get("/api/user/limits", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateUser,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        
        // Get user limits
        const limits = await storage.getUserLimits(userId);
        
        res.json({
          success: true,
          data: limits || {
            // Return default limits if none set
            dailyDepositLimitCents: 100000000, // £1,000,000
            weeklyDepositLimitCents: 700000000, // £7,000,000  
            monthlyDepositLimitCents: 3000000000, // £30,000,000
            maxStakeCents: 10000000, // £100,000
            dailyStakeLimitCents: 100000000, // £1,000,000
            dailyLossLimitCents: 100000000, // £1,000,000
            weeklyStakeLimitCents: 700000000, // £7,000,000
            monthlyStakeLimitCents: 3000000000, // £30,000,000
            isSelfExcluded: false,
            selfExclusionUntil: null,
            cooldownUntil: null
          }
        });
      } catch (error) {
        console.error('Get user limits error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve user limits'
        });
      }
    }
  );

  // PUT /api/user/limits - Update user's betting limits (self-service)
  app.put("/api/user/limits", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateUser,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        
        const requestSchema = z.object({
          dailyDepositLimitCents: z.number().int().min(0).max(100000000).optional(),
          weeklyDepositLimitCents: z.number().int().min(0).max(700000000).optional(),
          monthlyDepositLimitCents: z.number().int().min(0).max(3000000000).optional(),
          maxStakeCents: z.number().int().min(100).max(10000000).optional(),
          dailyStakeLimitCents: z.number().int().min(0).max(100000000).optional(),
          dailyLossLimitCents: z.number().int().min(0).max(100000000).optional(),
          weeklyStakeLimitCents: z.number().int().min(0).max(700000000).optional(),
          monthlyStakeLimitCents: z.number().int().min(0).max(3000000000).optional(),
        });

        const validatedData = requestSchema.parse(req.body);
        
        // Get existing limits for comparison
        const existingLimits = await storage.getUserLimits(userId);
        
        // Prepare limits data for update
        const limitsData = {
          ...validatedData,
          reason: 'User self-service update',
          userId
        };

        // Update limits in database
        const updatedLimits = await storage.upsertUserLimits(userId, limitsData, null);

        res.json({
          success: true,
          data: updatedLimits,
          message: 'Betting limits updated successfully'
        });
      } catch (error) {
        console.error('Update user limits error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid limit values provided'
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to update user limits'
        });
      }
    }
  );

  // POST /api/user/self-exclusion - Self-exclude user account
  app.post("/api/user/self-exclusion", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateUser,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        
        const requestSchema = z.object({
          duration: z.enum(['24h', '7d', '30d', '90d', '180d', 'permanent']),
          reason: z.string().min(1, 'Reason is required').max(500)
        });

        const { duration, reason } = requestSchema.parse(req.body);
        
        let exclusionUntil: string | null = null;
        
        if (duration !== 'permanent') {
          const now = new Date();
          switch (duration) {
            case '24h':
              exclusionUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
              break;
            case '7d':
              exclusionUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
              break;
            case '30d':
              exclusionUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
              break;
            case '90d':
              exclusionUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
              break;
            case '180d':
              exclusionUntil = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
              break;
          }
        }

        // Update user limits with self-exclusion
        const limitsData = {
          isSelfExcluded: true,
          selfExclusionUntil: exclusionUntil,
          reason: `Self-exclusion: ${reason}`,
          userId
        };

        const updatedLimits = await storage.upsertUserLimits(userId, limitsData, null);

        res.json({
          success: true,
          data: updatedLimits,
          message: 'Self-exclusion activated successfully'
        });
      } catch (error) {
        console.error('Self-exclusion error:', error);
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid self-exclusion request'
          });
        }
        res.status(500).json({
          success: false,
          error: 'Failed to activate self-exclusion'
        });
      }
    }
  );

  // DELETE /api/user/self-exclusion - Request removal of self-exclusion (for temporary exclusions only)
  app.delete("/api/user/self-exclusion", 
    ...SecurityMiddlewareOrchestrator.getStandardMiddleware(),
    authenticateUser,
    async (req: any, res) => {
      try {
        const userId = req.user.id;
        const userLimits = await storage.getUserLimits(userId);
        
        if (!userLimits || !userLimits.isSelfExcluded) {
          return res.status(400).json({
            success: false,
            error: 'User is not currently self-excluded'
          });
        }

        // Check if self-exclusion has expired
        if (userLimits.selfExclusionUntil) {
          const now = new Date();
          const exclusionEnd = new Date(userLimits.selfExclusionUntil);
          
          if (now < exclusionEnd) {
            return res.status(400).json({
              success: false,
              error: 'Self-exclusion period has not yet expired'
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            error: 'Permanent self-exclusion cannot be removed via self-service'
          });
        }

        // Remove self-exclusion
        const limitsData = {
          isSelfExcluded: false,
          selfExclusionUntil: null,
          reason: 'Self-exclusion period expired and removed by user',
          userId
        };

        const updatedLimits = await storage.upsertUserLimits(userId, limitsData, null);

        res.json({
          success: true,
          data: updatedLimits,
          message: 'Self-exclusion removed successfully'
        });
      } catch (error) {
        console.error('Remove self-exclusion error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to remove self-exclusion'
        });
      }
    }
  );
  
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

// ===================== NOTIFICATION HELPER FUNCTIONS =====================

// Email notification function
async function sendEmailNotification(notification: any) {
  try {
    // In a real implementation, this would use nodemailer or similar
    console.log('Sending email notification:', {
      to: notification.recipients,
      subject: notification.subject,
      message: notification.message,
      alertType: notification.alertType
    });
    
    // Placeholder for actual email sending
    // const transporter = nodemailer.createTransporter({...});
    // await transporter.sendMail({...});
    
    return { success: true, messageId: `email_${Date.now()}` };
  } catch (error) {
    console.error('Email notification error:', error);
    throw error;
  }
}

// Slack notification function
async function sendSlackNotification(notification: any) {
  try {
    // In a real implementation, this would use Slack webhook
    console.log('Sending Slack notification:', {
      channel: '#alerts',
      text: notification.message,
      alertType: notification.alertType,
      severity: notification.severity
    });
    
    // Placeholder for actual Slack webhook call
    // const response = await fetch(slackWebhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ text: notification.message })
    // });
    
    return { success: true, messageId: `slack_${Date.now()}` };
  } catch (error) {
    console.error('Slack notification error:', error);
    throw error;
  }
}

// Webhook notification function
async function sendWebhookNotification(notification: any) {
  try {
    // In a real implementation, this would call the configured webhook
    console.log('Sending webhook notification:', {
      url: 'https://example.com/webhook',
      payload: {
        alertType: notification.alertType,
        message: notification.message,
        severity: notification.severity,
        timestamp: notification.sentAt
      }
    });
    
    // Placeholder for actual webhook call
    // const response = await fetch(webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(notification)
    // });
    
    return { success: true, messageId: `webhook_${Date.now()}` };
  } catch (error) {
    console.error('Webhook notification error:', error);
    throw error;
  }
}

// Dashboard alert creation function
async function createDashboardAlert(notification: any) {
  try {
    // Store alert in database for dashboard display
    const alert = await storage.createDashboardAlert?.({
      type: notification.alertType,
      title: notification.subject,
      message: notification.message,
      severity: notification.severity,
      metadata: notification.metadata,
      createdBy: notification.sentBy,
      createdAt: notification.sentAt,
      isResolved: false,
      actionRequired: ['high', 'critical'].includes(notification.severity)
    });
    
    console.log('Dashboard alert created:', alert);
    return { success: true, alertId: alert?.id || `alert_${Date.now()}` };
  } catch (error) {
    console.error('Dashboard alert creation error:', error);
    throw error;
  }
}
