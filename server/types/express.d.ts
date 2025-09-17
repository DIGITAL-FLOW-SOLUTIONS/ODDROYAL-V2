import type { AdminRole } from "@shared/schema";

// Extend Express Request type to include admin user and session information
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
      session?: {
        id: string;
        adminId: string;
        expiresAt: Date;
        ipAddress: string | null;
        userAgent: string | null;
        twoFactorVerified: boolean;
      };
    }

    interface Locals {
      adminUser?: {
        id: string;
        username: string;
        email: string;
        role: AdminRole;
        twoFactorVerified: boolean;
      };
    }
  }
}