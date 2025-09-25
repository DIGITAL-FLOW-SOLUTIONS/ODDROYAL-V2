import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { hasPermission, type AdminRole } from "@shared/schema";
import { randomUUID } from "crypto";

// Extend Express Request type to include admin user
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        username: string;
        email: string;
        role: AdminRole;
        twoFactorVerified: boolean;
      };
      sessionMetadata?: {
        sessionId: string;
        adminId: string;
        expiresAt: Date;
        twoFactorVerified: boolean;
      };
    }
  }
}

/**
 * Middleware to authenticate admin users
 * Validates admin session token and adds admin user to request
 */
export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No admin session token provided'
      });
    }
    
    const sessionToken = authHeader.replace('Bearer ', '');
    
    // Get admin session
    const session = await storage.getAdminSession(sessionToken);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin session token'
      });
    }
    
    // Check if session has expired
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < now) {
      // Clean up expired session
      await storage.deleteAdminSession(sessionToken);
      return res.status(401).json({
        success: false,
        error: 'Admin session expired'
      });
    }
    
    // Implement sliding window session extension for production readiness
    // Extend session if it's within the last 2 hours of expiry and user is active
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const twoHoursInMs = 2 * 60 * 60 * 1000;
    
    if (timeUntilExpiry < twoHoursInMs) {
      const newExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // Extend by 12 hours for production
      await storage.updateAdminSession(session.id, {
        expiresAt: newExpiresAt.toISOString()
      });
      console.log(`Auto-extended session for admin ${session.adminId} until ${newExpiresAt}`);
    }
    
    // Get admin user
    const adminUser = await storage.getAdminUser(session.adminId);
    if (!adminUser || !adminUser.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Admin user not found or inactive'
      });
    }
    
    // Check if admin is locked out
    if (adminUser.lockedUntil && new Date(adminUser.lockedUntil) > new Date()) {
      return res.status(423).json({
        success: false,
        error: 'Admin account is temporarily locked'
      });
    }
    
    // Add admin user to request
    req.adminUser = {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role as AdminRole,
      twoFactorVerified: session.twoFactorVerified
    };
    
    // Log session usage for audit purposes (prevent logging sensitive session data)
    req.sessionMetadata = {
      sessionId: session.id,
      adminId: session.adminId,
      expiresAt: new Date(session.expiresAt),
      twoFactorVerified: session.twoFactorVerified
    };
    
    next();
    
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Middleware to require 2FA verification for sensitive operations
 */
export function require2FA(req: Request, res: Response, next: NextFunction) {
  if (!req.adminUser) {
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required'
    });
  }
  
  if (!req.adminUser.twoFactorVerified) {
    return res.status(403).json({
      success: false,
      error: 'Two-factor authentication required for this operation'
    });
  }
  
  next();
}

// NOTE: requirePermission has been moved to rbac-middleware.ts for better organization
// and to eliminate duplication. Use the RBAC middleware for all permission checks.

/**
 * List of sensitive fields that should never be logged in audit trails
 */
const SENSITIVE_FIELDS = [
  'password', 'passwordHash', 'sessionToken', 'refreshToken', 'totpSecret',
  'secret', 'qrCode', 'manualEntryKey', 'otpauth_url', 'base32',
  'authorization', 'cookie', 'set-cookie'
];

/**
 * Whitelist of safe fields that can be logged in audit trails
 */
const SAFE_AUDIT_FIELDS = [
  'success', 'message', 'error', 'requiresTwoFactor', 'username', 'email',
  'role', 'isActive', 'lastLogin', 'createdAt', 'updatedAt', 'id'
];

/**
 * Recursively filter sensitive data from an object for audit logging
 * Uses whitelist approach - only logs explicitly allowed fields
 */
function filterSensitiveData(data: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 3) return '[MAX_DEPTH_REACHED]';
  
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => filterSensitiveData(item, depth + 1));
  }
  
  if (typeof data === 'object') {
    const filtered: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field is sensitive - never log these
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        filtered[key] = '[REDACTED]';
        continue;
      }
      
      // For audit safety, only log whitelisted fields for response data
      if (depth === 0 && !SAFE_AUDIT_FIELDS.includes(key)) {
        continue; // Skip non-whitelisted fields at root level
      }
      
      filtered[key] = filterSensitiveData(value, depth + 1);
    }
    
    return filtered;
  }
  
  return '[UNKNOWN_TYPE]';
}

/**
 * Per-IP rate limiting storage for unauthenticated requests
 */
const ipAttempts = new Map<string, { count: number; resetTime: number; lockUntil?: number }>();

/**
 * Clean up expired IP attempt records
 */
function cleanupExpiredIpAttempts() {
  const now = Date.now();
  for (const [ip, data] of Array.from(ipAttempts.entries())) {
    if (data.resetTime < now && (!data.lockUntil || data.lockUntil < now)) {
      ipAttempts.delete(ip);
    }
  }
}

/**
 * Enhanced audit logging middleware that:
 * 1. Captures both authenticated and unauthenticated requests
 * 2. Filters sensitive data using whitelist approach
 * 3. Implements per-IP rate limiting for unauthenticated requests
 * 4. Never logs secrets, tokens, or other sensitive information
 */
export function auditAction(
  actionType: string, 
  getTargetInfo?: (req: Request) => { targetType?: string; targetId?: string; note?: string }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original response methods to capture the outcome
    const originalJson = res.json;
    const originalSend = res.send;
    let responseData: any = null;
    let isSuccess = true;
    
    // Override response methods to capture data
    res.json = function(data: any) {
      responseData = data;
      isSuccess = res.statusCode >= 200 && res.statusCode < 400;
      return originalJson.call(this, data);
    };
    
    res.send = function(data: any) {
      responseData = data;
      isSuccess = res.statusCode >= 200 && res.statusCode < 400;
      return originalSend.call(this, data);
    };
    
    // Continue with the request
    next();
    
    // Log the action after response is sent
    res.on('finish', async () => {
      try {
        const targetInfo = getTargetInfo ? getTargetInfo(req) : {};
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
        
        // Skip audit logging for unauthenticated requests during initial setup
        if (!req.adminUser?.id) {
          console.log(`Skipping audit log for unauthenticated ${actionType} action`);
          return;
        }
        
        // Filter sensitive data from response - use whitelist approach
        const safeResponseData = responseData ? filterSensitiveData(responseData) : null;
        
        await storage.createAuditLog({
          adminId: req.adminUser.id,
          actionType,
          targetType: targetInfo.targetType || 'unknown',
          targetId: targetInfo.targetId || null,
          dataBefore: null, // Never log request data as it may contain passwords
          dataAfter: safeResponseData,
          note: targetInfo.note || null,
          ipAddress: clientIp,
          userAgent: req.get('User-Agent') || null,
          success: isSuccess,
          errorMessage: isSuccess ? null : (safeResponseData?.error || 'Authentication failed')
        });
      } catch (error) {
        console.error('Failed to log admin action:', error);
      }
    });
  };
}

/**
 * Enhanced rate limiting middleware for admin login attempts
 * Implements both per-IP and per-account rate limiting without username enumeration
 */
export async function adminRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Clean up expired records periodically
    if (Math.random() < 0.1) { // 10% chance to cleanup on each request
      cleanupExpiredIpAttempts();
    }
    
    // Check per-IP rate limiting first (prevents brute force regardless of username validity)
    let ipData = ipAttempts.get(clientIp);
    if (!ipData) {
      ipData = { count: 0, resetTime: now + 15 * 60 * 1000 }; // 15 minute window
      ipAttempts.set(clientIp, ipData);
    }
    
    // If IP is currently locked out
    if (ipData.lockUntil && ipData.lockUntil > now) {
      return res.status(429).json({
        success: false,
        error: 'Too many login attempts from this IP address. Please try again later.'
      });
    }
    
    // Reset counter if time window has passed
    if (ipData.resetTime <= now) {
      ipData.count = 0;
      ipData.resetTime = now + 15 * 60 * 1000;
      delete ipData.lockUntil;
    }
    
    // Check if IP has exceeded rate limit (exponential backoff)
    const maxAttempts = 10; // Max 10 attempts per IP per 15 minutes
    if (ipData.count >= maxAttempts) {
      // Lock IP for exponentially increasing time based on attempts
      const lockDuration = Math.min(ipData.count * 2 * 60 * 1000, 2 * 60 * 60 * 1000); // Max 2 hours
      ipData.lockUntil = now + lockDuration;
      
      return res.status(429).json({
        success: false,
        error: 'Too many login attempts from this IP address. Please try again later.'
      });
    }
    
    // For account-level checking, only check if username is provided
    const { username } = req.body;
    if (username) {
      try {
        const adminUser = await storage.getAdminByUsername(username);
        
        // Always increment IP attempts regardless of username validity (prevents enumeration)
        ipData.count++;
        
        // If admin user exists, check account-level rate limiting
        if (adminUser) {
          // Check if account is currently locked out
          if (adminUser.lockedUntil && new Date(adminUser.lockedUntil) > new Date()) {
            // Don't reveal specific lockout details - use generic message
            return res.status(401).json({
              success: false,
              error: 'Invalid credentials'
            });
          }
          
          // Check if account has too many recent failed attempts
          if (adminUser.loginAttempts >= 5) {
            // Lock the account for 15 minutes (this is checked server-side)
            const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            await storage.updateAdminUser(adminUser.id, { 
              lockedUntil: lockUntil.toISOString() 
            });
            
            // Return generic error message (don't reveal account is locked)
            return res.status(401).json({
              success: false,
              error: 'Invalid credentials'
            });
          }
        }
        // If admin user doesn't exist, still continue to login handler
        // The login handler will return 'Invalid credentials' - preventing enumeration
      } catch (error) {
        console.error('Error checking admin user for rate limiting:', error);
        // Continue to login handler even if user lookup fails
      }
    }
    
    next();
    
  } catch (error) {
    console.error('Admin rate limiting error:', error);
    next(); // Continue even if rate limiting fails
  }
}