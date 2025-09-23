#!/usr/bin/env tsx

/**
 * Demo Setup Script for OddRoyal Admin Panel
 * 
 * This script sets up a complete demo environment with:
 * - Demo admin user with known credentials
 * - Sample match data with markets and outcomes
 * - Demo user accounts with initial balances
 * - Sample bets and transactions
 * 
 * ⚠️ WARNING: FOR DEVELOPMENT/DEMO ONLY
 * Never run this in production!
 */

import { DatabaseStorage } from '../server/database-storage';
import { ExposureCalculationEngine } from '../server/exposure-engine';
import * as argon2 from 'argon2';
import * as speakeasy from 'speakeasy';

interface DemoConfig {
  createAdminUsers: boolean;
  createMatches: boolean;
  createDemoUsers: boolean;
  createSampleBets: boolean;
  userCount: number;
  matchCount: number;
  betCount: number;
}

class DemoSetup {
  private storage: DatabaseStorage;
  private exposureEngine: ExposureCalculationEngine;

  constructor() {
    this.storage = new DatabaseStorage();
    this.exposureEngine = new ExposureCalculationEngine();
  }

  /**
   * Main setup function
   */
  async run(config: DemoConfig = {
    createAdminUsers: true,
    createMatches: true,
    createDemoUsers: true,
    createSampleBets: true,
    userCount: 50,
    matchCount: 10,
    betCount: 100
  }): Promise<void> {
    try {
      console.log('🎮 OddRoyal Demo Environment Setup');
      console.log('====================================\n');

      // Validate environment
      if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ Demo setup cannot be run in production environment!');
      }

      if (process.env.DEMO_MODE !== 'true') {
        console.log('⚠️  Warning: DEMO_MODE is not enabled. Setting DEMO_MODE=true');
        process.env.DEMO_MODE = 'true';
      }

      // Test database connection
      await this.storage.testConnection();
      console.log('✅ Database connection verified');

      // Setup demo data
      if (config.createAdminUsers) {
        await this.createDemoAdminUsers();
      }

      if (config.createMatches) {
        await this.createDemoMatches(config.matchCount);
      }

      if (config.createDemoUsers) {
        await this.createDemoUsers(config.userCount);
      }

      if (config.createSampleBets) {
        await this.createSampleBets(config.betCount);
      }

      // Start exposure calculation engine
      console.log('🔄 Starting exposure calculation engine...');
      this.exposureEngine.start();

      console.log('\n🎉 Demo environment setup complete!');
      this.displayLoginInstructions();

    } catch (error) {
      console.error('❌ Demo setup failed:', error);
      process.exit(1);
    }
  }

  /**
   * Create demo admin users with known credentials
   */
  private async createDemoAdminUsers(): Promise<void> {
    console.log('\n👤 Creating demo admin users...');

    const adminUsers = [
      {
        username: 'admin',
        email: 'admin@oddroyal.demo',
        password: 'admin123456',
        role: 'admin' as const,
        firstName: 'Admin',
        lastName: 'User'
      },
      {
        username: 'superadmin',
        email: 'superadmin@oddroyal.demo',
        password: 'superadmin123456',
        role: 'superadmin' as const,
        firstName: 'Super',
        lastName: 'Admin'
      },
      {
        username: 'riskmanager',
        email: 'risk@oddroyal.demo',
        password: 'risk123456',
        role: 'risk_manager' as const,
        firstName: 'Risk',
        lastName: 'Manager'
      },
      {
        username: 'finance',
        email: 'finance@oddroyal.demo',
        password: 'finance123456',
        role: 'finance' as const,
        firstName: 'Finance',
        lastName: 'User'
      }
    ];

    for (const userData of adminUsers) {
      // Check if user already exists
      const existing = await this.storage.getAdminUserByUsername(userData.username);
      if (existing) {
        console.log(`   • ${userData.username} (${userData.role}) - already exists`);
        continue;
      }

      // Hash password
      const passwordHash = await argon2.hash(userData.password);

      // Generate TOTP secret (demo mode - simplified)
      const totpSecret = speakeasy.generateSecret({
        name: `OddRoyal Demo (${userData.username})`,
        issuer: 'OddRoyal Demo'
      }).base32!;

      // Create admin user
      const adminUser = await this.storage.createAdminUser({
        username: userData.username,
        email: userData.email,
        passwordHash,
        role: userData.role,
        totpSecret,
        firstName: userData.firstName,
        lastName: userData.lastName
      });

      console.log(`   ✅ ${userData.username} (${userData.role}) - created`);

      // Create audit log
      await this.storage.createAuditLog({
        adminId: adminUser.id,
        actionType: 'create_admin_user',
        targetType: 'admin_user',
        targetId: adminUser.id,
        dataAfter: {
          username: adminUser.username,
          role: adminUser.role,
          createdBy: 'demo_setup_script'
        },
        note: 'Demo admin user created by setup script',
        ipAddress: 'localhost',
        userAgent: 'demo-setup-script',
        success: true
      });
    }
  }

  /**
   * Create demo matches with markets and outcomes
   */
  private async createDemoMatches(count: number): Promise<void> {
    console.log(`\n⚽ Creating ${count} demo matches...`);

    const leagues = [
      'Premier League',
      'La Liga',
      'Serie A',
      'Bundesliga',
      'Ligue 1',
      'Champions League',
      'Europa League'
    ];

    const teams = [
      'Arsenal', 'Chelsea', 'Liverpool', 'Man City', 'Man United', 'Tottenham',
      'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla',
      'Juventus', 'AC Milan', 'Inter Milan', 'Napoli',
      'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig',
      'PSG', 'Marseille', 'Lyon'
    ];

    for (let i = 0; i < count; i++) {
      const homeTeam = teams[Math.floor(Math.random() * teams.length)];
      let awayTeam = teams[Math.floor(Math.random() * teams.length)];
      while (awayTeam === homeTeam) {
        awayTeam = teams[Math.floor(Math.random() * teams.length)];
      }

      const league = leagues[Math.floor(Math.random() * leagues.length)];
      const kickoffTime = new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000); // Next 7 days

      const match = await this.storage.createMatch({
        externalId: `demo_${i + 1}`,
        leagueId: `league_${leagues.indexOf(league) + 1}`,
        leagueName: league,
        homeTeamId: `team_${teams.indexOf(homeTeam) + 1}`,
        homeTeamName: homeTeam,
        awayTeamId: `team_${teams.indexOf(awayTeam) + 1}`,
        awayTeamName: awayTeam,
        kickoffTime,
        status: 'scheduled',
        isManual: true
      });

      // Create markets for this match
      await this.createMarketsForMatch(match.id, homeTeam, awayTeam);

      console.log(`   ✅ ${homeTeam} vs ${awayTeam} (${league})`);
    }
  }

  /**
   * Create markets and outcomes for a match
   */
  private async createMarketsForMatch(matchId: string, homeTeam: string, awayTeam: string): Promise<void> {
    // 1X2 Market
    const match1x2 = await this.storage.createMarket({
      matchId,
      key: '1x2',
      name: 'Match Result',
      type: '1x2',
      status: 'open',
      minStakeCents: 100, // £1
      maxStakeCents: 100000, // £1000
      maxLiabilityCents: 1000000, // £10k
      isPublished: true
    });

    // Create outcomes for 1X2
    await this.createOutcome(match1x2.id, 'home', homeTeam + ' Win', this.randomOdds(1.5, 4.0));
    await this.createOutcome(match1x2.id, 'draw', 'Draw', this.randomOdds(3.0, 4.5));
    await this.createOutcome(match1x2.id, 'away', awayTeam + ' Win', this.randomOdds(1.5, 4.0));

    // Over/Under 2.5 Goals
    const totalsMarket = await this.storage.createMarket({
      matchId,
      key: 'totals:2.5',
      name: 'Total Goals Over/Under 2.5',
      type: 'totals',
      parameter: '2.5',
      status: 'open',
      minStakeCents: 100,
      maxStakeCents: 100000,
      maxLiabilityCents: 1000000,
      isPublished: true
    });

    await this.createOutcome(totalsMarket.id, 'over', 'Over 2.5 Goals', this.randomOdds(1.7, 2.2));
    await this.createOutcome(totalsMarket.id, 'under', 'Under 2.5 Goals', this.randomOdds(1.7, 2.2));

    // Both Teams to Score
    const bttsMarket = await this.storage.createMarket({
      matchId,
      key: 'btts',
      name: 'Both Teams to Score',
      type: 'btts',
      status: 'open',
      minStakeCents: 100,
      maxStakeCents: 100000,
      maxLiabilityCents: 1000000,
      isPublished: true
    });

    await this.createOutcome(bttsMarket.id, 'yes', 'Yes', this.randomOdds(1.6, 2.0));
    await this.createOutcome(bttsMarket.id, 'no', 'No', this.randomOdds(1.8, 2.4));
  }

  /**
   * Create market outcome
   */
  private async createOutcome(marketId: string, key: string, label: string, odds: number): Promise<void> {
    await this.storage.createOutcome({
      marketId,
      key,
      label,
      odds: odds.toFixed(2),
      oddsSource: 'manual',
      status: 'active',
      liabilityLimitCents: 500000 // £5k per outcome
    });
  }

  /**
   * Generate random odds within range
   */
  private randomOdds(min: number, max: number): number {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  }

  /**
   * Create demo users with balances
   */
  private async createDemoUsers(count: number): Promise<void> {
    console.log(`\n👥 Creating ${count} demo users...`);

    for (let i = 1; i <= count; i++) {
      const username = `demouser${i}`;
      const email = `user${i}@demo.oddroyal.com`;

      // Check if user exists
      const existing = await this.storage.getUserByUsername(username);
      if (existing) {
        continue;
      }

      // Create user
      const user = await this.storage.createUser({
        username,
        email,
        password: await argon2.hash('demo123'), // Simple demo password
        firstName: `Demo`,
        lastName: `User ${i}`
      });

      // Give random balance between £10-£1000
      const balanceCents = Math.floor(Math.random() * 99000) + 1000; // £10-£1000
      await this.storage.updateUserBalance(user.id, balanceCents);

      // Create initial deposit transaction
      await this.storage.createTransaction({
        userId: user.id,
        type: 'deposit',
        amount: balanceCents,
        balanceBefore: 0,
        balanceAfter: balanceCents,
        description: 'Demo account initial deposit'
      });

      if (i % 10 === 0) {
        console.log(`   ✅ Created ${i} users...`);
      }
    }

    console.log(`   ✅ All ${count} demo users created`);
  }

  /**
   * Create sample bets for demo data
   */
  private async createSampleBets(count: number): Promise<void> {
    console.log(`\n🎯 Creating ${count} sample bets...`);

    // Get all users and matches
    const users = await this.storage.getUsers({ limit: 50 });
    const matches = await this.storage.getMatches({ limit: 10 });

    if (users.length === 0 || matches.length === 0) {
      console.log('   ⚠️  No users or matches available for creating bets');
      return;
    }

    let successfulBets = 0;

    for (let i = 0; i < count; i++) {
      try {
        // Random user and match
        const user = users[Math.floor(Math.random() * users.length)];
        const match = matches[Math.floor(Math.random() * matches.length)];

        // Get markets for this match
        const markets = await this.storage.getMatchMarkets(match.id);
        if (markets.length === 0) continue;

        const market = markets[Math.floor(Math.random() * markets.length)];
        const outcomes = await this.storage.getMarketOutcomes(market.id);
        if (outcomes.length === 0) continue;

        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

        // Random stake between £1-£50
        const stakeCents = Math.floor(Math.random() * 4900) + 100;

        // Check user balance
        const currentUser = await this.storage.getUser(user.id);
        if (!currentUser || currentUser.balance < stakeCents) {
          continue;
        }

        // Place bet
        const betResult = await this.storage.placeBetAtomic({
          userId: user.id,
          betType: 'single',
          totalStakeCents: stakeCents,
          selections: [{
            fixtureId: match.externalId || match.id,
            homeTeam: match.homeTeamName,
            awayTeam: match.awayTeamName,
            league: match.leagueName,
            market: market.name,
            selection: outcome.label,
            odds: outcome.odds.toString()
          }]
        });

        if (betResult.success) {
          successfulBets++;

          // Randomly settle some bets for demo purposes
          if (Math.random() < 0.3) { // 30% chance to settle
            const isWin = Math.random() < 0.4; // 40% win rate
            const status = isWin ? 'won' : 'lost';
            const winnings = isWin ? Math.round(stakeCents * parseFloat(outcome.odds)) : 0;

            await this.storage.updateBetStatus(betResult.bet!.id, status, winnings);

            if (isWin) {
              // Add winnings to user balance
              const updatedUser = await this.storage.getUser(user.id);
              if (updatedUser) {
                await this.storage.updateUserBalance(user.id, updatedUser.balance + winnings);
                await this.storage.createTransaction({
                  userId: user.id,
                  type: 'bet_winnings',
                  amount: winnings,
                  balanceBefore: updatedUser.balance,
                  balanceAfter: updatedUser.balance + winnings,
                  reference: betResult.bet!.id,
                  description: 'Bet winnings payout'
                });
              }
            }
          }
        }

      } catch (error) {
        // Ignore individual bet errors in demo setup
        continue;
      }
    }

    console.log(`   ✅ Created ${successfulBets} successful bets out of ${count} attempts`);
  }

  /**
   * Display login instructions for demo environment
   */
  private displayLoginInstructions(): void {
    console.log('\n🔐 Demo Login Credentials');
    console.log('=========================');
    console.log('Admin Panel: http://localhost:3000/prime-admin\n');

    console.log('Demo Admin Users:');
    console.log('• Username: admin       | Password: admin123456       | Role: admin');
    console.log('• Username: superadmin  | Password: superadmin123456  | Role: superadmin');
    console.log('• Username: riskmanager | Password: risk123456        | Role: risk_manager');
    console.log('• Username: finance     | Password: finance123456     | Role: finance');

    console.log('\n📱 2FA Setup for Demo:');
    console.log('======================');
    console.log('• Demo accounts have simplified 2FA');
    console.log('• Use any TOTP app (Google Authenticator, Authy)');
    console.log('• QR code will be displayed on first login');
    console.log('• Or use manual secret provided during login');

    console.log('\n🎮 Demo Data Summary:');
    console.log('====================');
    console.log('• Multiple demo matches with live markets');
    console.log('• 50 demo users with random balances');
    console.log('• Sample bets and transactions');
    console.log('• Real-time exposure calculations');
    console.log('• Complete audit trail');

    console.log('\n⚠️  Demo Environment Warnings:');
    console.log('==============================');
    console.log('• FOR DEVELOPMENT/TESTING ONLY');
    console.log('• Do not use in production');
    console.log('• All credentials are well-known');
    console.log('• Data is for demonstration purposes');
    console.log('• Reset demo data with: npm run demo:reset');

    console.log('\n🚀 Quick Start:');
    console.log('===============');
    console.log('1. Start the application: npm run dev');
    console.log('2. Visit: http://localhost:3000/prime-admin');
    console.log('3. Login with any demo admin account above');
    console.log('4. Complete 2FA setup when prompted');
    console.log('5. Explore the admin panel features!');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.exposureEngine.stop();
  }
}

// Run the script if called directly
if (require.main === module) {
  const setup = new DemoSetup();
  
  setup.run().then(() => {
    console.log('\n✅ Demo setup completed successfully!');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Demo setup failed:', error);
    process.exit(1);
  });
}

export { DemoSetup };