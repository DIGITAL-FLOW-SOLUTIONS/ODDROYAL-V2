import type { Request, Response, NextFunction } from "express";
import { hasPermission, type AdminRole } from "@shared/schema";

/**
 * Middleware to require a specific permission
 * @param permission - The permission to check (e.g., 'bets:settle', 'users:read')
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminUser) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }

    if (!hasPermission(req.adminUser.role, permission)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${permission}`
      });
    }

    next();
  };
}

/**
 * Middleware to require a specific admin role
 * @param role - The exact role required
 */
export function requireRole(role: AdminRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminUser) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }

    if (req.adminUser.role !== role) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${role}`
      });
    }

    next();
  };
}

/**
 * Middleware to require any of the specified admin roles
 * @param roles - Array of roles, user must have at least one
 */
export function requireAnyRole(roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.adminUser) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }

    if (!roles.includes(req.adminUser.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Middleware to require superadmin role
 * Convenience function for the most restrictive access
 */
export function requireSuperadmin() {
  return requireRole('superadmin');
}

/**
 * Middleware to require admin level access or higher
 * Allows both superadmin and admin roles
 */
export function requireAdminLevel() {
  return requireAnyRole(['superadmin', 'admin']);
}

/**
 * Check if current admin user has a specific permission
 * Utility function for conditional logic within route handlers
 * @param req - Express request object with adminUser
 * @param permission - Permission to check
 * @returns boolean indicating if user has permission
 */
export function adminHasPermission(req: Request, permission: string): boolean {
  if (!req.adminUser) {
    return false;
  }
  return hasPermission(req.adminUser.role, permission);
}

/**
 * Check if current admin user has any of the specified roles
 * Utility function for conditional logic within route handlers
 * @param req - Express request object with adminUser
 * @param roles - Array of roles to check against
 * @returns boolean indicating if user has any of the roles
 */
export function adminHasAnyRole(req: Request, roles: AdminRole[]): boolean {
  if (!req.adminUser) {
    return false;
  }
  return roles.includes(req.adminUser.role);
}

/**
 * Get permissions array for the current admin user
 * @param req - Express request object with adminUser
 * @returns Array of permissions or empty array if not authenticated
 */
export function getAdminPermissions(req: Request): string[] {
  if (!req.adminUser) {
    return [];
  }

  // Import rolePermissions dynamically to avoid circular dependencies
  const { rolePermissions } = require('@shared/schema');
  return rolePermissions[req.adminUser.role] || [];
}

/**
 * Middleware to log permission-based actions for audit trail
 * Should be used in combination with permission checking middleware
 * @param action - Description of the action being performed
 */
export function auditPermissionAction(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store audit info in request for later logging
    req.auditInfo = {
      action,
      role: req.adminUser?.role,
      userId: req.adminUser?.id,
      timestamp: new Date()
    };
    next();
  };
}

// Extend Express Request type to include audit info
declare global {
  namespace Express {
    interface Request {
      auditInfo?: {
        action: string;
        role?: AdminRole;
        userId?: string;
        timestamp: Date;
      };
    }
  }
}