#!/usr/bin/env tsx

/**
 * Script to create a new admin user for OddRoyal Admin Panel
 * 
 * Usage: npm run admin:create
 * 
 * This script will:
 * 1. Prompt for admin user details
 * 2. Validate input and check for existing users
 * 3. Generate secure password hash
 * 4. Set up 2FA TOTP secret
 * 5. Create admin user in database
 * 6. Display setup instructions
 */

import { createInterface } from 'readline';
import * as argon2 from 'argon2';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { DatabaseStorage } from '../server/database-storage';

interface AdminUserInput {
  username: string;
  email: string;
  password: string;
  role: 'superadmin' | 'admin' | 'risk_manager' | 'finance' | 'compliance' | 'support';
  firstName?: string;
  lastName?: string;
}

class AdminUserCreator {
  private rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  private storage: DatabaseStorage;

  constructor() {
    this.storage = new DatabaseStorage();
  }

  /**
   * Main execution function
   */
  async run(): Promise<void> {
    try {
      console.log('🔐 OddRoyal Admin User Creation Tool');
      console.log('=====================================\n');

      // Validate environment
      await this.validateEnvironment();

      // Collect user input
      const adminData = await this.collectUserData();

      // Validate input
      await this.validateInput(adminData);

      // Generate secure credentials
      const credentials = await this.generateCredentials(adminData);

      // Create admin user
      const adminUser = await this.createAdminUser(adminData, credentials);

      // Display success and setup instructions
      await this.displaySuccess(adminUser, credentials);

    } catch (error) {
      console.error('❌ Error creating admin user:', error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  /**
   * Validate that all required environment variables are set
   */
  private async validateEnvironment(): Promise<void> {
    const required = ['DATABASE_URL'];
    const missing = required.filter(env => !process.env[env]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Test database connection
    try {
      await this.storage.testConnection();
      console.log('✅ Database connection verified\n');
    } catch (error) {
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  /**
   * Collect admin user data from user input
   */
  private async collectUserData(): Promise<AdminUserInput> {
    const username = await this.prompt('Username (3-50 characters): ');
    const email = await this.prompt('Email address: ');
    const password = await this.promptPassword('Password (minimum 12 characters): ');
    const confirmPassword = await this.promptPassword('Confirm password: ');

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const firstName = await this.prompt('First name (optional): ');
    const lastName = await this.prompt('Last name (optional): ');

    console.log('\nAvailable roles:');
    console.log('1. superadmin - Full system access');
    console.log('2. admin - General admin operations');
    console.log('3. risk_manager - Risk and exposure management');
    console.log('4. finance - Financial reporting and transactions');
    console.log('5. compliance - Audit logs and user management');
    console.log('6. support - Limited support operations');

    const roleChoice = await this.prompt('Select role (1-6): ');
    const roles = ['superadmin', 'admin', 'risk_manager', 'finance', 'compliance', 'support'] as const;
    const role = roles[parseInt(roleChoice) - 1];

    if (!role) {
      throw new Error('Invalid role selection');
    }

    return {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined
    };
  }

  /**
   * Validate user input
   */
  private async validateInput(data: AdminUserInput): Promise<void> {
    // Username validation
    if (data.username.length < 3 || data.username.length > 50) {
      throw new Error('Username must be 3-50 characters long');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
      throw new Error('Username can only contain letters, numbers, hyphens, and underscores');
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error('Invalid email address format');
    }

    // Password validation
    if (data.password.length < 12) {
      throw new Error('Password must be at least 12 characters long');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(data.password)) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }

    // Check if username already exists
    const existingUsername = await this.storage.getAdminUserByUsername(data.username);
    if (existingUsername) {
      throw new Error(`Username '${data.username}' already exists`);
    }

    // Check if email already exists
    const existingEmail = await this.storage.getAdminUserByEmail(data.email);
    if (existingEmail) {
      throw new Error(`Email '${data.email}' already exists`);
    }
  }

  /**
   * Generate secure credentials (password hash and TOTP secret)
   */
  private async generateCredentials(data: AdminUserInput): Promise<{
    passwordHash: string;
    totpSecret: string;
    totpQrCode: string;
  }> {
    console.log('\n🔒 Generating secure credentials...');

    // Hash password with Argon2
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    // Generate TOTP secret for 2FA
    const totpSecret = speakeasy.generateSecret({
      name: `OddRoyal Admin (${data.username})`,
      issuer: 'OddRoyal',
      length: 32
    });

    // Generate QR code for 2FA setup
    const totpQrCode = await qrcode.toString(totpSecret.otpauth_url!, { type: 'terminal' });

    return {
      passwordHash,
      totpSecret: totpSecret.base32!,
      totpQrCode
    };
  }

  /**
   * Create admin user in database
   */
  private async createAdminUser(data: AdminUserInput, credentials: {
    passwordHash: string;
    totpSecret: string;
  }): Promise<any> {
    console.log('💾 Creating admin user in database...');

    const adminUser = await this.storage.createAdminUser({
      username: data.username,
      email: data.email,
      passwordHash: credentials.passwordHash,
      role: data.role,
      totpSecret: credentials.totpSecret,
      firstName: data.firstName,
      lastName: data.lastName
    });

    // Create audit log entry
    await this.storage.createAuditLog({
      adminId: adminUser.id,
      actionType: 'create_admin_user',
      targetType: 'admin_user',
      targetId: adminUser.id,
      dataAfter: {
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
        createdBy: 'system_script'
      },
      note: `Admin user created via create-admin script`,
      ipAddress: 'localhost',
      userAgent: 'create-admin-script',
      success: true
    });

    return adminUser;
  }

  /**
   * Display success message and setup instructions
   */
  private async displaySuccess(adminUser: any, credentials: {
    totpSecret: string;
    totpQrCode: string;
  }): Promise<void> {
    console.log('\n🎉 Admin user created successfully!');
    console.log('=====================================');
    console.log(`Username: ${adminUser.username}`);
    console.log(`Email: ${adminUser.email}`);
    console.log(`Role: ${adminUser.role}`);
    console.log(`User ID: ${adminUser.id}`);
    console.log(`Created: ${adminUser.createdAt}`);

    console.log('\n📱 2FA Setup Instructions:');
    console.log('===========================');
    console.log('1. Install a 2FA app on your phone (Google Authenticator, Authy, etc.)');
    console.log('2. Scan the QR code below with your 2FA app:');
    console.log('\n' + credentials.totpQrCode);
    console.log('\n3. Or manually enter this secret in your 2FA app:');
    console.log(`   Secret: ${credentials.totpSecret}`);

    console.log('\n🔐 First Login Instructions:');
    console.log('=============================');
    console.log('1. Navigate to your admin panel: http://localhost:3000/prime-admin');
    console.log(`2. Login with username: ${adminUser.username}`);
    console.log('3. Enter your password (the one you just created)');
    console.log('4. Enter the 6-digit code from your 2FA app');
    console.log('5. You will be prompted to complete your 2FA setup');

    console.log('\n⚠️  Security Reminders:');
    console.log('=======================');
    console.log('• Never share your credentials or 2FA codes');
    console.log('• Use a strong, unique password');
    console.log('• Keep your 2FA device secure');
    console.log('• Regularly review audit logs');
    console.log('• Only access admin panel from secure networks');

    if (adminUser.role === 'superadmin') {
      console.log('\n👑 Superadmin Privileges:');
      console.log('=========================');
      console.log('• Full system access');
      console.log('• Can create/modify/delete other admin users');
      console.log('• Access to all financial and audit data');
      console.log('• Emergency system controls');
      console.log('• IP whitelist management');
    }

    console.log('\n✅ Setup Complete! The admin user is ready to use.');
  }

  /**
   * Utility function to prompt for user input
   */
  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Utility function to prompt for password input (hidden)
   */
  private promptPassword(question: string): Promise<string> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      const stdout = process.stdout;

      stdout.write(question);

      stdin.resume();
      stdin.setEncoding('utf8');
      stdin.setRawMode!(true);

      let password = '';
      
      const onData = (ch: string) => {
        const char = ch.toString();

        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode!(false);
            stdin.removeListener('data', onData);
            stdout.write('\n');
            resolve(password);
            break;
          case '\u0003': // Ctrl+C
            process.exit(1);
            break;
          case '\u007f': // Backspace
          case '\b':
            if (password.length > 0) {
              password = password.slice(0, -1);
              stdout.write('\b \b');
            }
            break;
          default:
            password += char;
            stdout.write('*');
            break;
        }
      };

      stdin.on('data', onData);
    });
  }
}

// Run the script if called directly
if (require.main === module) {
  const creator = new AdminUserCreator();
  creator.run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { AdminUserCreator };