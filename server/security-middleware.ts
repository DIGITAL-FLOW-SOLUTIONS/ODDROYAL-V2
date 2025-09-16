import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import slowDown from "express-slow-down";
import { body, validationResult } from "express-validator";
import DOMPurify from "isomorphic-dompurify";
import csrf from "csrf";
import { randomUUID } from "crypto";
import { storage } from "./storage";

/**
 * HTTP Security Headers Middleware using Helmet
 * Configures comprehensive security headers for admin routes
 */
export function createSecurityHeadersMiddleware() {
  return helmet({
    // Content Security Policy - strict for admin panel
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Vite in development
          "'unsafe-eval'", // Required for Vite in development
          "data:", // For inline scripts
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for styled components and Tailwind
          "https://fonts.googleapis.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
        ],
        connectSrc: [
          "'self'",
          "ws://localhost:*", // WebSocket for development
          "wss://localhost:*", // Secure WebSocket
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
      reportOnly: process.env.NODE_ENV === 'development', // Report-only in dev
    },

    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // X-Frame-Options - prevent clickjacking
    frameguard: {
      action: 'deny',
    },

    // X-Content-Type-Options - prevent MIME sniffing
    noSniff: true,

    // X-XSS-Protection - legacy XSS protection
    xssFilter: true,

    // Referrer Policy - control referrer information
    referrerPolicy: {
      policy: ["no-referrer-when-downgrade"],
    },

    // Cross-Origin Policies
    crossOriginEmbedderPolicy: false, // Disable to avoid issues with third-party resources
    crossOriginOpenerPolicy: {
      policy: "same-origin",
    },
    crossOriginResourcePolicy: {
      policy: "same-origin",
    },

    // Remove X-Powered-By header
    hidePoweredBy: true,

    // Permissions Policy (formerly Feature Policy)
    permittedCrossDomainPolicies: false,
  });
}

/**
 * Enhanced rate limiting middleware for different admin operations
 * Provides granular rate limiting based on operation sensitivity
 */
export class AdminRateLimitManager {
  // Standard rate limiting for regular admin operations
  static readonly standardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per window per IP
    message: {
      success: false,
      error: 'Too many admin requests from this IP. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key generator to include admin user ID
    keyGenerator: (req: Request) => {
      const adminId = req.adminUser?.id || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `admin:${adminId}:${ip}`;
    },
    skip: (req) => {
      // Skip rate limiting for read-only operations
      return req.method === 'GET' || req.method === 'HEAD';
    },
  });

  // Strict rate limiting for sensitive operations
  static readonly strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Max 20 sensitive operations per hour
    message: {
      success: false,
      error: 'Too many sensitive admin operations. Please wait before trying again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const adminId = req.adminUser?.id || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `admin-strict:${adminId}:${ip}`;
    },
  });

  // Critical operations rate limiting (role changes, admin creation)
  static readonly criticalLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 5, // Max 5 critical operations per day
    message: {
      success: false,
      error: 'Daily limit for critical admin operations exceeded.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const adminId = req.adminUser?.id || 'anonymous';
      return `admin-critical:${adminId}`;
    },
  });

  // Progressive delay middleware for repeated requests
  static readonly progressiveDelay = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 10, // Allow first 10 requests without delay
    delayMs: (used) => used * 100, // Add 100ms delay for each request after delayAfter
    maxDelayMs: 5000, // Maximum delay of 5 seconds
    keyGenerator: (req: Request) => {
      const adminId = req.adminUser?.id || 'anonymous';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `admin-delay:${adminId}:${ip}`;
    },
  });
}

/**
 * Request validation and sanitization middleware
 * Provides input validation, sanitization, and size limits
 */
export class RequestValidationManager {
  // Maximum request body size for admin operations
  static readonly MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Middleware to validate and sanitize request body
   */
  static validateAndSanitize() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check request body size
        const contentLength = req.get('content-length');
        if (contentLength && parseInt(contentLength) > RequestValidationManager.MAX_BODY_SIZE) {
          return res.status(413).json({
            success: false,
            error: 'Request body too large',
          });
        }

        // Skip validation for GET requests
        if (req.method === 'GET' || req.method === 'HEAD') {
          return next();
        }

        // Sanitize request body if present
        if (req.body && typeof req.body === 'object') {
          req.body = RequestValidationManager.sanitizeObject(req.body);
        }

        next();
      } catch (error) {
        console.error('Request validation error:', error);
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
        });
      }
    };
  }

  /**
   * Recursively sanitize object properties
   */
  private static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      // Sanitize HTML content and remove potentially dangerous scripts
      return DOMPurify.sanitize(obj, {
        ALLOWED_TAGS: [], // No HTML tags allowed
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
      }).trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => RequestValidationManager.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key as well
        const sanitizedKey = DOMPurify.sanitize(key, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: [],
          KEEP_CONTENT: true,
        });
        sanitized[sanitizedKey] = RequestValidationManager.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Validation rules for common admin operations
   */
  static readonly commonValidationRules = {
    username: body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-50 characters, alphanumeric, underscore, or dash only'),
    
    email: body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email address required'),
    
    password: body('password')
      .isLength({ min: 8, max: 128 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be 8-128 characters with uppercase, lowercase, number, and special character'),
    
    role: body('role')
      .isIn(['superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support'])
      .withMessage('Invalid admin role'),
  };

  /**
   * Middleware to handle validation results
   */
  static handleValidationErrors() {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    };
  }
}

/**
 * Enhanced security monitoring and logging middleware
 * Provides comprehensive security event logging and anomaly detection
 */
export class SecurityMonitoringManager {
  // Security event types for enhanced monitoring
  private static readonly SECURITY_EVENTS = {
    SUSPICIOUS_LOGIN: 'suspicious_login',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    INVALID_CSRF_TOKEN: 'invalid_csrf_token',
    PERMISSION_DENIED: 'permission_denied',
    UNUSUAL_USER_AGENT: 'unusual_user_agent',
    MULTIPLE_FAILED_2FA: 'multiple_failed_2fa',
    ADMIN_LOCKOUT: 'admin_lockout',
    CRITICAL_OPERATION: 'critical_operation',
  } as const;

  /**
   * Middleware to monitor and log security events
   */
  static securityEventLogger(eventType: string, threshold?: number) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      const adminId = req.adminUser?.id || 'unauthenticated';

      // Store original response methods
      const originalJson = res.json;
      let responseData: any = null;
      let statusCode = 200;

      // Override response method to capture outcome
      res.json = function(data: any) {
        responseData = data;
        statusCode = res.statusCode;
        return originalJson.call(this, data);
      };

      // Continue with request
      next();

      // Log security event after response
      res.on('finish', async () => {
        try {
          const duration = Date.now() - startTime;
          const isSuccess = statusCode >= 200 && statusCode < 400;

          // Check for security concerns
          const securityConcerns = SecurityMonitoringManager.analyzeRequest(
            req,
            res,
            responseData,
            duration
          );

          // Log enhanced security event
          await SecurityMonitoringManager.logSecurityEvent({
            eventType,
            adminId,
            ipAddress: clientIp,
            userAgent,
            endpoint: req.path,
            method: req.method,
            statusCode,
            duration,
            success: isSuccess,
            securityConcerns,
            requestFingerprint: SecurityMonitoringManager.generateRequestFingerprint(req),
            timestamp: new Date(),
          });

          // Alert on critical security events
          if (securityConcerns.length > 0) {
            await SecurityMonitoringManager.handleSecurityAlert(eventType, securityConcerns, {
              adminId,
              ipAddress: clientIp,
              endpoint: req.path,
            });
          }

        } catch (error) {
          console.error('Security monitoring error:', error);
        }
      });
    };
  }

  /**
   * Analyze request for security concerns
   */
  private static analyzeRequest(
    req: Request,
    res: Response,
    responseData: any,
    duration: number
  ): string[] {
    const concerns: string[] = [];

    // Check for unusually long response times (potential DoS)
    if (duration > 10000) {
      concerns.push('slow_response');
    }

    // Check for unusual user agents
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent || userAgent.length < 10 || /bot|crawler|spider|scraper/i.test(userAgent)) {
      concerns.push('suspicious_user_agent');
    }

    // Check for potential injection attempts in query parameters
    const queryString = req.url.split('?')[1] || '';
    if (/[<>'"(){}[\]\\\/]/.test(queryString)) {
      concerns.push('potential_injection');
    }

    // Check for authentication failures
    if (res.statusCode === 401 || res.statusCode === 403) {
      concerns.push('authentication_failure');
    }

    // Check for rate limiting
    if (res.statusCode === 429) {
      concerns.push('rate_limit_exceeded');
    }

    return concerns;
  }

  /**
   * Generate request fingerprint for anomaly detection
   */
  private static generateRequestFingerprint(req: Request): string {
    const elements = [
      req.get('User-Agent') || '',
      req.get('Accept') || '',
      req.get('Accept-Language') || '',
      req.get('Accept-Encoding') || '',
      req.ip || '',
    ];
    
    // Create a simple hash-like fingerprint
    return Buffer.from(elements.join('|')).toString('base64').slice(0, 16);
  }

  /**
   * Log enhanced security event
   */
  private static async logSecurityEvent(event: {
    eventType: string;
    adminId: string;
    ipAddress: string;
    userAgent: string;
    endpoint: string;
    method: string;
    statusCode: number;
    duration: number;
    success: boolean;
    securityConcerns: string[];
    requestFingerprint: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      // Log to audit system with security-specific information
      await storage.createAuditLog({
        adminId: event.adminId,
        actionType: `security_${event.eventType}`,
        targetType: 'security_event',
        targetId: null,
        dataBefore: null,
        dataAfter: {
          endpoint: event.endpoint,
          method: event.method,
          statusCode: event.statusCode,
          duration: event.duration,
          securityConcerns: event.securityConcerns,
          requestFingerprint: event.requestFingerprint,
        },
        note: event.securityConcerns.length > 0 ? 
          `Security concerns: ${event.securityConcerns.join(', ')}` : null,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        success: event.success,
        errorMessage: event.success ? null : 'Security event detected',
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Handle security alerts for critical events
   */
  private static async handleSecurityAlert(
    eventType: string,
    concerns: string[],
    context: { adminId: string; ipAddress: string; endpoint: string }
  ): Promise<void> {
    try {
      // In production, this would integrate with alerting systems
      // For now, we'll log critical security events with high visibility
      const alertLevel = concerns.includes('potential_injection') || 
                       concerns.includes('authentication_failure') ? 'HIGH' : 'MEDIUM';

      console.warn(`[SECURITY ALERT - ${alertLevel}] ${eventType}:`, {
        concerns,
        context,
        timestamp: new Date().toISOString(),
      });

      // TODO: In production, integrate with:
      // - Email/SMS alerting for high-priority events
      // - Security Information and Event Management (SIEM) systems
      // - Automated response systems (temporary IP blocking, etc.)

    } catch (error) {
      console.error('Failed to handle security alert:', error);
    }
  }
}

/**
 * CSRF Protection Manager
 * Provides Cross-Site Request Forgery protection for admin operations
 */
export class CSRFProtectionManager {
  private static csrfTokens = new Map<string, { token: string; expires: number }>();
  private static csrfInstance = new csrf();

  /**
   * Generate CSRF token for admin session
   */
  static async generateCSRFToken(adminId: string): Promise<string> {
    try {
      const secret = await CSRFProtectionManager.csrfInstance.secret();
      const token = CSRFProtectionManager.csrfInstance.create(secret);
      const expires = Date.now() + (60 * 60 * 1000); // 1 hour expiration

      // Store token associated with admin session
      CSRFProtectionManager.csrfTokens.set(adminId, { token: secret, expires });

      // Clean up expired tokens periodically
      CSRFProtectionManager.cleanupExpiredTokens();

      return token;
    } catch (error) {
      console.error('CSRF token generation error:', error);
      throw new Error('Failed to generate CSRF token');
    }
  }

  /**
   * Verify CSRF token for admin request
   */
  static async verifyCSRFToken(adminId: string, token: string): Promise<boolean> {
    try {
      const storedTokenData = CSRFProtectionManager.csrfTokens.get(adminId);
      
      if (!storedTokenData) {
        return false;
      }

      // Check if token has expired
      if (storedTokenData.expires < Date.now()) {
        CSRFProtectionManager.csrfTokens.delete(adminId);
        return false;
      }

      // Verify the token
      return CSRFProtectionManager.csrfInstance.verify(storedTokenData.token, token);
    } catch (error) {
      console.error('CSRF token verification error:', error);
      return false;
    }
  }

  /**
   * Clean up expired CSRF tokens
   */
  private static cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [adminId, tokenData] of CSRFProtectionManager.csrfTokens.entries()) {
      if (tokenData.expires < now) {
        CSRFProtectionManager.csrfTokens.delete(adminId);
      }
    }
  }

  /**
   * Middleware to provide CSRF token to authenticated admin users
   */
  static provideCSRFToken() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Only provide CSRF token for authenticated admin users
        if (!req.adminUser) {
          return next();
        }

        // Generate CSRF token for the admin user
        const csrfToken = await CSRFProtectionManager.generateCSRFToken(req.adminUser.id);

        // Add CSRF token to response headers (safe for CORS)
        res.setHeader('X-CSRF-Token', csrfToken);

        // Also make it available in response body for certain endpoints
        if (req.path === '/api/admin/auth/me' || req.path === '/api/admin/csrf-token') {
          const originalJson = res.json;
          res.json = function(data: any) {
            if (data && typeof data === 'object' && data.success) {
              data.csrfToken = csrfToken;
            }
            return originalJson.call(this, data);
          };
        }

        next();
      } catch (error) {
        console.error('CSRF token provision error:', error);
        // Don't fail the request if CSRF token generation fails
        next();
      }
    };
  }

  /**
   * Middleware to validate CSRF token for state-changing operations
   */
  static validateCSRFToken() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Skip CSRF validation for read-only methods
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
          return next();
        }

        // Skip CSRF validation for login endpoints (they have their own protection)
        if (req.path === '/api/admin/auth/login' || req.path === '/api/admin/auth/logout') {
          return next();
        }

        // Require authenticated admin user
        if (!req.adminUser) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required for CSRF validation',
          });
        }

        // Get CSRF token from various possible locations
        const csrfToken = req.get('X-CSRF-Token') || 
                         req.body?.csrfToken || 
                         req.query?.csrfToken;

        if (!csrfToken) {
          await SecurityMonitoringManager.logSecurityEvent({
            eventType: 'csrf_token_missing',
            adminId: req.adminUser.id,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            endpoint: req.path,
            method: req.method,
            statusCode: 403,
            duration: 0,
            success: false,
            securityConcerns: ['csrf_token_missing'],
            requestFingerprint: '',
            timestamp: new Date(),
          });

          return res.status(403).json({
            success: false,
            error: 'CSRF token required for this operation',
          });
        }

        // Verify CSRF token
        const isValidToken = await CSRFProtectionManager.verifyCSRFToken(req.adminUser.id, csrfToken);

        if (!isValidToken) {
          await SecurityMonitoringManager.logSecurityEvent({
            eventType: 'csrf_token_invalid',
            adminId: req.adminUser.id,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            endpoint: req.path,
            method: req.method,
            statusCode: 403,
            duration: 0,
            success: false,
            securityConcerns: ['csrf_token_invalid'],
            requestFingerprint: '',
            timestamp: new Date(),
          });

          return res.status(403).json({
            success: false,
            error: 'Invalid CSRF token',
          });
        }

        // CSRF token is valid, continue with request
        next();
      } catch (error) {
        console.error('CSRF validation error:', error);
        res.status(500).json({
          success: false,
          error: 'CSRF validation failed',
        });
      }
    };
  }

  /**
   * Clear CSRF token for admin (e.g., on logout)
   */
  static clearCSRFToken(adminId: string): void {
    CSRFProtectionManager.csrfTokens.delete(adminId);
  }
}

/**
 * Security middleware orchestrator
 * Combines all security middleware components
 */
export class SecurityMiddlewareOrchestrator {
  /**
   * Get standard security middleware stack for admin routes
   */
  static getStandardMiddleware() {
    return [
      createSecurityHeadersMiddleware(),
      AdminRateLimitManager.progressiveDelay,
      AdminRateLimitManager.standardLimiter,
      RequestValidationManager.validateAndSanitize(),
      CSRFProtectionManager.provideCSRFToken(),
      CSRFProtectionManager.validateCSRFToken(),
      SecurityMonitoringManager.securityEventLogger('admin_operation'),
    ];
  }

  /**
   * Get strict security middleware stack for sensitive operations
   */
  static getStrictMiddleware() {
    return [
      createSecurityHeadersMiddleware(),
      AdminRateLimitManager.progressiveDelay,
      AdminRateLimitManager.strictLimiter,
      RequestValidationManager.validateAndSanitize(),
      CSRFProtectionManager.provideCSRFToken(),
      CSRFProtectionManager.validateCSRFToken(),
      SecurityMonitoringManager.securityEventLogger('sensitive_operation'),
    ];
  }

  /**
   * Get critical security middleware stack for high-risk operations
   */
  static getCriticalMiddleware() {
    return [
      createSecurityHeadersMiddleware(),
      AdminRateLimitManager.criticalLimiter,
      RequestValidationManager.validateAndSanitize(),
      CSRFProtectionManager.provideCSRFToken(),
      CSRFProtectionManager.validateCSRFToken(),
      SecurityMonitoringManager.securityEventLogger('critical_operation'),
    ];
  }

  /**
   * Get authentication-only middleware (for login/logout endpoints)
   */
  static getAuthMiddleware() {
    return [
      createSecurityHeadersMiddleware(),
      AdminRateLimitManager.progressiveDelay,
      RequestValidationManager.validateAndSanitize(),
      SecurityMonitoringManager.securityEventLogger('admin_auth'),
    ];
  }

  /**
   * Get CSRF token provision middleware (for authenticated routes that need tokens)
   */
  static getCSRFProvisionMiddleware() {
    return [
      createSecurityHeadersMiddleware(),
      CSRFProtectionManager.provideCSRFToken(),
      SecurityMonitoringManager.securityEventLogger('csrf_provision'),
    ];
  }
}