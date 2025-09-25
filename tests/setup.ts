import { jest } from '@jest/globals';

// Global test setup
beforeEach(() => {
  // Reset all environment variables to test state
  process.env.NODE_ENV = 'test';
  // Note: Using Supabase for database, no separate DATABASE_URL needed for tests
  process.env.DEMO_MODE = 'true';
  
  // Reset console to avoid noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
});