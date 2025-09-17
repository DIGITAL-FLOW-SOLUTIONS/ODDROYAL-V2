import { db } from "./db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import speakeasy from "speakeasy";
import { randomUUID } from "crypto";

export class AdminSeeder {
  static async seedDefaultAdmin(): Promise<{ success: boolean; admin?: any; error?: string }> {
    try {
      console.log("🔐 Checking for existing superadmin account...");
      
      // Check if superadmin already exists
      const existingSuperadmin = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.role, 'superadmin'))
        .limit(1);
      
      if (existingSuperadmin.length > 0) {
        console.log("✅ Superadmin account already exists");
        return { success: true, admin: existingSuperadmin[0] };
      }
      
      // Generate secure default credentials
      const defaultUsername = process.env.ADMIN_USERNAME || 'superadmin';
      const defaultPassword = process.env.ADMIN_PASSWORD || this.generateSecurePassword();
      const defaultEmail = process.env.ADMIN_EMAIL || 'admin@primestake.com';
      
      // Check if username/email already exists
      const existingUser = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.username, defaultUsername))
        .limit(1);
      
      if (existingUser.length > 0) {
        return { 
          success: false, 
          error: `Admin user with username '${defaultUsername}' already exists` 
        };
      }
      
      const existingEmail = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, defaultEmail))
        .limit(1);
      
      if (existingEmail.length > 0) {
        return { 
          success: false, 
          error: `Admin user with email '${defaultEmail}' already exists` 
        };
      }
      
      // Hash password with Argon2
      const passwordHash = await argon2.hash(defaultPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16, // 64 MB
        timeCost: 3,
        parallelism: 1,
      });
      
      // Generate 2FA secret for superadmin (optional setup)
      const totpSecret = speakeasy.generateSecret({
        name: `PrimeStake Admin (${defaultUsername})`,
        issuer: 'PrimeStake',
        length: 32
      });
      
      // Create superadmin account
      const [newAdmin] = await db
        .insert(adminUsers)
        .values({
          id: randomUUID(),
          username: defaultUsername,
          email: defaultEmail,
          passwordHash,
          role: 'superadmin',
          totpSecret: totpSecret.base32, // Store encrypted in production
          isActive: true,
          lastLogin: null,
          loginAttempts: 0,
          lockedUntil: null,
          ipWhitelist: null, // No IP restrictions for superadmin by default
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null // Self-created
        })
        .returning();
      
      console.log("🚀 Superadmin account created successfully!");
      console.log(`📧 Email: ${defaultEmail}`);
      console.log(`👤 Username: ${defaultUsername}`);
      
      // Only log password in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔑 Password: ${defaultPassword}`);
        console.log(`📱 2FA Secret: ${totpSecret.base32}`);
        console.log(`📱 2FA QR Code URL: ${totpSecret.otpauth_url}`);
      } else {
        console.log("🔑 Password and 2FA secret have been set. Check environment variables for details.");
      }
      
      return { success: true, admin: newAdmin };
      
    } catch (error) {
      console.error("❌ Failed to seed admin user:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  static async seedDemoAdmin(): Promise<{ success: boolean; admin?: any; error?: string }> {
    // Only create demo admin in development mode
    if (process.env.NODE_ENV !== 'development') {
      return { success: false, error: 'Demo admin only available in development mode' };
    }
    
    try {
      console.log("🧪 Creating demo admin account...");
      
      const demoUsername = 'demo-admin';
      const demoPassword = 'demo123';
      const demoEmail = 'demo-admin@primestake.com';
      
      // Check if demo admin already exists
      const existingDemo = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.username, demoUsername))
        .limit(1);
      
      if (existingDemo.length > 0) {
        console.log("✅ Demo admin already exists");
        return { success: true, admin: existingDemo[0] };
      }
      
      // Hash password
      const passwordHash = await argon2.hash(demoPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 14, // 16 MB for demo (less memory)
        timeCost: 2,
        parallelism: 1,
      });
      
      // Create demo admin account (no 2FA for simplicity)
      const [demoAdmin] = await db
        .insert(adminUsers)
        .values({
          id: randomUUID(),
          username: demoUsername,
          email: demoEmail,
          passwordHash,
          role: 'admin',
          totpSecret: null, // No 2FA for demo
          isActive: true,
          lastLogin: null,
          loginAttempts: 0,
          lockedUntil: null,
          ipWhitelist: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null
        })
        .returning();
      
      console.log("🧪 Demo admin created successfully!");
      console.log(`👤 Username: ${demoUsername}`);
      console.log(`🔑 Password: ${demoPassword}`);
      
      return { success: true, admin: demoAdmin };
      
    } catch (error) {
      console.error("❌ Failed to seed demo admin:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  static async createRole(role: 'admin' | 'risk_manager' | 'finance' | 'compliance' | 'support', username: string, email: string, password: string): Promise<{ success: boolean; admin?: any; error?: string }> {
    try {
      // Check if user already exists
      const existingUser = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.username, username))
        .limit(1);
      
      if (existingUser.length > 0) {
        return { success: false, error: `User with username '${username}' already exists` };
      }
      
      // Hash password
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });
      
      // Create admin user
      const [newAdmin] = await db
        .insert(adminUsers)
        .values({
          id: randomUUID(),
          username,
          email,
          passwordHash,
          role,
          totpSecret: null, // 2FA setup will be done separately
          isActive: true,
          lastLogin: null,
          loginAttempts: 0,
          lockedUntil: null,
          ipWhitelist: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: null
        })
        .returning();
      
      console.log(`✅ ${role} account created: ${username}`);
      return { success: true, admin: newAdmin };
      
    } catch (error) {
      console.error(`❌ Failed to create ${role} account:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  private static generateSecurePassword(): string {
    // Generate a secure random password for production
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
  
  static async listAdmins(): Promise<any[]> {
    try {
      const admins = await db
        .select({
          id: adminUsers.id,
          username: adminUsers.username,
          email: adminUsers.email,
          role: adminUsers.role,
          isActive: adminUsers.isActive,
          lastLogin: adminUsers.lastLogin,
          createdAt: adminUsers.createdAt
        })
        .from(adminUsers)
        .orderBy(adminUsers.createdAt);
      
      return admins;
    } catch (error) {
      console.error("❌ Failed to list admins:", error);
      return [];
    }
  }
}