import { MemStorage } from '../../server/storage';
import { ExposureCalculationEngine } from '../../server/exposure-engine';
import type { User } from '@shared/schema';

/**
 * Load testing script to simulate heavy betting on a single match
 * Tests exposure calculation and database performance under load
 */
class BettingLoadTest {
  private storage: MemStorage;
  private exposureEngine: ExposureCalculationEngine;
  private testUsers: User[] = [];
  private results: {
    totalBets: number;
    successfulBets: number;
    failedBets: number;
    totalStakesCents: number;
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    exposureCalculationTime: number;
    errors: string[];
  };

  constructor() {
    this.storage = new MemStorage();
    this.exposureEngine = new ExposureCalculationEngine();
    this.results = {
      totalBets: 0,
      successfulBets: 0,
      failedBets: 0,
      totalStakesCents: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity,
      exposureCalculationTime: 0,
      errors: []
    };
  }

  /**
   * Initialize test environment with users and balance
   */
  async initialize(userCount: number = 100): Promise<void> {
    console.log(`Initializing load test with ${userCount} users...`);
    
    for (let i = 0; i < userCount; i++) {
      const user = await this.storage.createUser({
        username: `loadtest_user_${i}`,
        email: `loadtest${i}@example.com`,
        password: 'hashedpassword',
        firstName: 'Load',
        lastName: `Test${i}`
      });

      // Give each user £1,000 balance
      await this.storage.updateUserBalance(user.id, 100000);
      this.testUsers.push(user);
    }

    console.log(`✓ Created ${userCount} test users with £1,000 each`);
  }

  /**
   * Generate random bet parameters for load testing
   */
  private generateRandomBet(userId: string) {
    const betTypes = ['single', 'express'] as const;
    const markets = ['1x2', 'totals', 'btts', 'handicap'];
    const selections = ['home', 'away', 'draw', 'over', 'under', 'yes', 'no'];
    
    const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
    const selectionCount = betType === 'single' ? 1 : Math.floor(Math.random() * 4) + 2; // 2-5 selections for express
    
    const betSelections = [];
    for (let i = 0; i < selectionCount; i++) {
      betSelections.push({
        fixtureId: `load_fixture_${Math.floor(Math.random() * 10) + 1}`, // 10 different fixtures
        homeTeam: `Team_${Math.floor(Math.random() * 20) + 1}`,
        awayTeam: `Team_${Math.floor(Math.random() * 20) + 21}`,
        league: 'Load Test League',
        market: markets[Math.floor(Math.random() * markets.length)],
        selection: selections[Math.floor(Math.random() * selections.length)],
        odds: (1.2 + Math.random() * 8.8).toFixed(2) // Odds between 1.20 and 10.00
      });
    }

    return {
      userId,
      betType,
      totalStakeCents: Math.floor(Math.random() * 5000) + 100, // £1 to £50
      selections: betSelections
    };
  }

  /**
   * Simulate concurrent betting load
   */
  async simulateConcurrentBetting(
    concurrentUsers: number = 50,
    betsPerUser: number = 10,
    delayBetweenBets: number = 100 // milliseconds
  ): Promise<void> {
    console.log(`\nStarting load test:`);
    console.log(`- ${concurrentUsers} concurrent users`);
    console.log(`- ${betsPerUser} bets per user`);
    console.log(`- ${delayBetweenBets}ms delay between bets`);
    console.log(`- Total expected bets: ${concurrentUsers * betsPerUser}`);

    const startTime = Date.now();
    const promises: Promise<void>[] = [];
    const responseTimes: number[] = [];

    // Create concurrent user sessions
    for (let i = 0; i < concurrentUsers; i++) {
      const user = this.testUsers[i % this.testUsers.length];
      
      const userPromise = this.simulateUserBettingSession(
        user,
        betsPerUser,
        delayBetweenBets,
        responseTimes
      );
      
      promises.push(userPromise);
    }

    // Wait for all concurrent betting to complete
    await Promise.all(promises);

    const totalTime = Date.now() - startTime;

    // Calculate statistics
    this.results.averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    this.results.maxResponseTime = responseTimes.length > 0 
      ? Math.max(...responseTimes) 
      : 0;
    
    this.results.minResponseTime = responseTimes.length > 0 
      ? Math.min(...responseTimes) 
      : 0;

    console.log(`\n✓ Load test completed in ${totalTime}ms`);
    this.printResults();
  }

  /**
   * Simulate a single user's betting session
   */
  private async simulateUserBettingSession(
    user: User,
    betCount: number,
    delay: number,
    responseTimes: number[]
  ): Promise<void> {
    for (let i = 0; i < betCount; i++) {
      const betStartTime = Date.now();
      
      try {
        const betParams = this.generateRandomBet(user.id);
        const result = await this.storage.placeBetAtomic(betParams);
        
        const responseTime = Date.now() - betStartTime;
        responseTimes.push(responseTime);
        
        this.results.totalBets++;
        
        if (result.success) {
          this.results.successfulBets++;
          this.results.totalStakesCents += betParams.totalStakeCents;
        } else {
          this.results.failedBets++;
          this.results.errors.push(result.error || 'Unknown error');
        }
        
        // Delay between bets to simulate realistic usage
        if (delay > 0 && i < betCount - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        const responseTime = Date.now() - betStartTime;
        responseTimes.push(responseTime);
        
        this.results.totalBets++;
        this.results.failedBets++;
        this.results.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Test exposure calculation performance under load
   */
  async testExposureCalculationLoad(): Promise<void> {
    console.log('\nTesting exposure calculation performance...');
    
    const startTime = Date.now();
    
    // Start exposure engine
    this.exposureEngine.start(0.05); // Update every 3 seconds for testing
    
    // Simulate exposure calculations for different scenarios
    const exposurePromises = [];
    
    // Test 100 outcome exposure calculations
    for (let i = 0; i < 100; i++) {
      exposurePromises.push(
        this.exposureEngine.calculateOutcomeExposure(`test_outcome_${i}`)
      );
    }
    
    // Test 20 market exposure calculations
    for (let i = 0; i < 20; i++) {
      exposurePromises.push(
        this.exposureEngine.calculateMarketExposure(`test_market_${i}`)
      );
    }
    
    // Test 5 match exposure calculations
    for (let i = 0; i < 5; i++) {
      exposurePromises.push(
        this.exposureEngine.calculateMatchExposure(`test_match_${i}`)
      );
    }
    
    await Promise.all(exposurePromises);
    
    this.results.exposureCalculationTime = Date.now() - startTime;
    
    // Stop exposure engine
    this.exposureEngine.stop();
    
    console.log(`✓ Exposure calculations completed in ${this.results.exposureCalculationTime}ms`);
  }

  /**
   * Simulate high-frequency betting on a single popular match
   */
  async simulatePopularMatchLoad(): Promise<void> {
    console.log('\nSimulating high-frequency betting on popular match...');
    
    const popularFixtureId = 'popular_match_001';
    const highFrequencyPromises: Promise<void>[] = [];
    
    // 200 users betting on the same match within 10 seconds
    for (let i = 0; i < 200; i++) {
      const user = this.testUsers[i % this.testUsers.length];
      
      const promise = (async () => {
        // Random delay up to 10 seconds
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10000));
        
        const betParams = {
          userId: user.id,
          betType: 'single' as const,
          totalStakeCents: Math.floor(Math.random() * 2000) + 500, // £5-£25
          selections: [{
            fixtureId: popularFixtureId,
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            league: 'La Liga',
            market: '1x2',
            selection: ['home', 'away', 'draw'][Math.floor(Math.random() * 3)],
            odds: (1.5 + Math.random() * 4).toFixed(2)
          }]
        };
        
        try {
          const result = await this.storage.placeBetAtomic(betParams);
          this.results.totalBets++;
          
          if (result.success) {
            this.results.successfulBets++;
            this.results.totalStakesCents += betParams.totalStakeCents;
          } else {
            this.results.failedBets++;
            this.results.errors.push(result.error || 'Unknown error');
          }
        } catch (error) {
          this.results.totalBets++;
          this.results.failedBets++;
          this.results.errors.push(error instanceof Error ? error.message : 'Unknown error');
        }
      })();
      
      highFrequencyPromises.push(promise);
    }
    
    await Promise.all(highFrequencyPromises);
    
    console.log('✓ Popular match load test completed');
  }

  /**
   * Print load test results
   */
  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('LOAD TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Bets Attempted: ${this.results.totalBets}`);
    console.log(`Successful Bets: ${this.results.successfulBets}`);
    console.log(`Failed Bets: ${this.results.failedBets}`);
    console.log(`Success Rate: ${(this.results.successfulBets / this.results.totalBets * 100).toFixed(2)}%`);
    console.log(`Total Stakes: £${(this.results.totalStakesCents / 100).toFixed(2)}`);
    console.log(`Average Response Time: ${this.results.averageResponseTime.toFixed(2)}ms`);
    console.log(`Min Response Time: ${this.results.minResponseTime.toFixed(2)}ms`);
    console.log(`Max Response Time: ${this.results.maxResponseTime.toFixed(2)}ms`);
    console.log(`Exposure Calculation Time: ${this.results.exposureCalculationTime}ms`);
    
    if (this.results.errors.length > 0) {
      console.log('\nErrors:');
      const errorCounts = this.results.errors.reduce((acc, error) => {
        acc[error] = (acc[error] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`  ${error}: ${count} times`);
      });
    }
    
    console.log('='.repeat(60));
  }

  /**
   * Run complete load test suite
   */
  async runCompleteLoadTest(): Promise<void> {
    try {
      // Initialize test environment
      await this.initialize(100);
      
      // Test 1: Concurrent betting
      await this.simulateConcurrentBetting(50, 10, 50);
      
      // Test 2: Exposure calculation load
      await this.testExposureCalculationLoad();
      
      // Test 3: Popular match simulation
      await this.simulatePopularMatchLoad();
      
      console.log('\n🎉 All load tests completed successfully!');
      
    } catch (error) {
      console.error('Load test failed:', error);
      throw error;
    }
  }

  /**
   * Clean up test environment
   */
  async cleanup(): Promise<void> {
    this.exposureEngine.stop();
    this.testUsers = [];
    console.log('✓ Load test cleanup completed');
  }
}

// Export for use in tests or standalone execution
export { BettingLoadTest };

// Allow script to be run directly
if (require.main === module) {
  const loadTest = new BettingLoadTest();
  
  loadTest.runCompleteLoadTest()
    .then(() => loadTest.cleanup())
    .catch((error) => {
      console.error('Load test failed:', error);
      process.exit(1);
    });
}