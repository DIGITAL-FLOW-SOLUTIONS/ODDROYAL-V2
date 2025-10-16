# Overview

OddRoyal is a premium sports betting web application featuring real-time sports data, live odds, and a comprehensive betting interface. The platform focuses on football (soccer) betting with live match tracking, pre-match odds, and an integrated bet slip system. Built as a modern full-stack application with React frontend and Express backend, it integrates with SportMonks API for live sports data and features a mobile-first, dark-themed design optimized for quick betting decisions.

# Recent Changes

## October 16, 2025 - Match Lookup Performance Optimization
- **Critical Performance Fix**: Resolved slow match details loading for all sports and leagues
  - Previous implementation loaded ALL matches (100s) just to find one match
  - Matches from non-EPL leagues and other sports weren't being found at all
- **Individual Match Caching**: 
  - Modified `setPrematchMatches` and `setLiveMatches` to cache each match individually with key `match:{matchId}`
  - Enables instant O(1) lookup instead of O(n) search through arrays
- **Optimized getMatchById**:
  - Now checks individual match cache (`match:{matchId}`) first for instant retrieval
  - Falls back to unified cache, then manual match database only if needed
  - Eliminated expensive getAllLiveMatches() and getAllUpcomingMatches() calls
- **Impact**: Match details now load instantly for all 7 sports (Football, Basketball, American Football, Baseball, Ice Hockey, Cricket, MMA) across all leagues

## October 16, 2025 - Dynamic Market Generator Implementation
- **API Limitation Pivot**: Discovered The Odds API only provides h2h/spreads/totals markets, not the 40+ markets needed for comprehensive football betting
- **New Approach**: Replaced API market persistence with dynamic market generation system
  - Keeps real 1x2/h2h odds from The Odds API where available
  - Generates all other markets dynamically using sport-specific templates
  - Uses deterministic seeded PRNG (Park-Miller) for consistent odds across refreshes
- **Market Coverage**: 
  - Football: 53+ markets (totals, handicaps, BTTS, correct score, half markets, corners, cards, shots, offsides, player props, etc.)
  - Basketball: 15+ markets (totals, spreads, quarter winners, half markets)
  - American Football: 12+ markets (totals, spreads, quarter winners, half markets)
  - Baseball: 7+ markets (totals, run lines, inning markets)
  - Ice Hockey: 11+ markets (totals, puck lines, period winners, BTTS)
  - Cricket: 7+ markets (totals, top batsman, top bowler)
  - MMA: 5+ markets (method of victory, total rounds, go distance)
- **Technical Implementation**:
  - Created `server/market-generator.ts` with fixed Park-Miller PRNG (Math.abs for positive state)
  - Updated `/api/match/:matchId/details` and `/api/match/:matchId/markets` to use generator
  - Removed market sync worker and database market persistence
  - Simplified MatchDetails page to directly consume generated markets
- **Benefits**: Markets always available, sport-appropriate variety, consistent odds, no API rate limits

## October 16, 2025 - Critical Real-time Flickering Fix
- **Root Cause Identified**: The `useAbly` hook was subscribing to the entire Zustand store using `useMatchStore()` without a selector, causing App component to re-render on every store update, which cascaded to Layout and all child components
- **Solution Implemented**: 
  - Changed useAbly to call store actions via `useMatchStore.getState()` instead of destructuring from `useMatchStore()`, eliminating unnecessary subscriptions
  - Restructured App.tsx so Layout wraps the Router once instead of being recreated on each route
  - Migrated all page components (Homepage, Line, Live, MatchDetails) to use BetSlipContext instead of props
  - Maintained batched Ably updates with 400ms throttling and React.memo optimizations
- **Performance Impact**: 
  - Layout now renders only 2 times on mount (React Strict Mode), then never again
  - Eliminated all visual flickering during real-time updates
  - Maintained stable 60fps performance with continuous Ably updates
  - Only affected page components re-render when data changes (as designed)
- **Architecture Pattern**: Zustand store actions should always be called via `getState()` in hooks to avoid creating subscriptions; never destructure actions from `useStore()` without a selector

## October 11, 2025 - Critical Admin Panel Bug Fixes (Session 2)
- **Delete Match Error Fix**: Resolved database enum constraint violation
  - Fixed `getActiveBetsByMatch` query that was using invalid bet_status value 'accepted'
  - Changed status filter from `['pending', 'accepted']` to `['pending']` to match database enum
  - Valid bet_status values: 'pending', 'won', 'lost', 'cashout', 'cancelled'
- **Add Market Error Fix**: Resolved null constraint violation for market outcome odds
  - Fixed `createMarketWithOutcomes` to handle both 'odds' and 'defaultOdds' properties
  - Frontend sends 'defaultOdds' from market templates, backend now falls back to it when 'odds' is missing
  - Changed from `odds: outcomeData.odds` to `odds: outcomeData.odds || outcomeData.defaultOdds`

## October 11, 2025 - Admin Panel Match & Market Management Fixes (Session 1)
- **Delete Match Functionality**: Fixed cascade deletion to properly remove all related records
  - Now deletes market_outcomes for all markets associated with the match
  - Deletes all markets linked to the match via match_id foreign key
  - Deletes all match_events for the match
  - Finally deletes the match record itself
  - All deletion steps throw errors to prevent partial deletions
- **Delete Market Functionality**: Fixed route to call correct storage method
  - Changed from non-existent `softDeleteMarket()` to `deleteMarket()`
  - Updated `deleteMarket` to cascade delete all market_outcomes before deleting the market
  - Proper error throwing ensures atomic operation
- **Add Market Functionality**: Fixed parameter field handling for market creation
  - Now properly extracts and passes `parameter` field from request body
  - Enables correct creation of markets with parameters (e.g., Over/Under 2.5, Handicap +1.5)
  - Maintains proper createdBy field assignment through the creation chain

## October 9, 2025 - M-PESA Deposit System Improvements
- **Deposit ID Consistency**: Fixed deposit ID to use frontend-generated 6-digit numeric ID as M-PESA account reference
  - Frontend and backend now use the same 6-digit deposit ID format
  - Deposit ID displayed in M-PESA notification matches frontend display
  - Recent transactions show consistent 6-digit deposit IDs
- **Minimum Deposit Validation**: Re-enabled KES 2,000 minimum deposit requirement
  - Frontend validation at `/deposit` page for M-PESA payments
  - Backend validation at `/api/mpesa/stk-push` endpoint
- **First Deposit Bonus**: Implemented 100% welcome bonus for first-time depositors
  - Automatically detects user's first completed deposit
  - Doubles the deposit amount (100% bonus) added to user balance
  - Creates separate bonus transaction record with metadata
  - Updates deposit transaction description to indicate bonus applied
  - Subsequent deposits receive no bonus (one-time offer only)

## October 9, 2025 - Professional Multi-Layer Caching System
- **Multi-Layer Cache Architecture**: Implemented Pinnacle-style caching with Memory → Redis → API fallback chain
  - Layer 1: In-memory cache with LRU eviction (1000 entry max) for microsecond-level reads
  - Layer 2: Redis persistent cache for millisecond-level reads across server instances
  - Layer 3: API fallback when cache layers miss, with automatic cache persistence
- **LRU Eviction**: Memory cache now has bounded capacity (1000 entries) with least-recently-used eviction to prevent memory exhaustion
- **Graceful Degradation**: System maintains cached data even during API failures, extending TTL of existing data
- **Cache Monitoring**: Comprehensive metrics tracking hits/misses/errors across all three cache layers
- **API Fallback Logic**: Menu and line endpoints now properly fall back to API when cache is empty, normalizing and persisting results
- **Production Ready**: Complete fallback chain ensures data is always available, performance optimized for betting platform loads

## October 1, 2025 - Admin Panel Production Fixes
- **Storage Layer**: Implemented missing SupabaseStorage methods (`getAllUsers`, `getAllBets`, `getAllMatches`, `getActiveAdminSessions`) to replace MemStorage for production use
- **API Endpoints**: Fixed `/api/admin/customers` to use `storage.getAllUsers()` instead of accessing internal MemStorage Maps
- **Frontend Response Handling**: Updated all admin pages (AdminSettlement, AdminSecurity, AdminRiskExposure, AdminReports) to properly extract `.data` property from API responses
- **Cache Invalidation**: Fixed AdminSettlement to properly invalidate both `/api/admin/settlement/pending` and `/api/admin/settlement/history` query keys after mutations
- **TypeScript Fixes**: Resolved implicit `any` type errors and optional chaining issues across admin pages
- **Production Note**: The admin panel at `/prime-admin` now uses SupabaseStorage exclusively for all operations

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing with pages for Home, Pre-match (Line), and Live betting
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom design tokens inspired by modern betting sites
- **State Management**: TanStack Query for server state, local state with React hooks
- **Animations**: Framer Motion for smooth transitions and micro-interactions

## Backend Architecture  
- **Framework**: Express.js with TypeScript, configured for both development and production
- **Data Layer**: Drizzle ORM for database operations with PostgreSQL support
- **API Structure**: RESTful endpoints for fixtures, odds, and health checks
- **Data Storage**: SupabaseStorage (PostgreSQL) used in production for all CRUD operations
- **Admin System**: Full-featured admin panel at `/prime-admin` with authentication, RBAC, and comprehensive management tools
- **Caching System**: Professional multi-layer caching (Memory → Redis → API)
  - In-memory cache with LRU eviction (max 1000 entries) for ultra-fast reads
  - Redis persistent cache for cross-instance data sharing
  - Automatic API fallback with cache persistence on miss
  - Cache monitoring for performance metrics and optimization

## Database Design
- **ORM**: Drizzle with PostgreSQL dialect
- **Schema**: User management system with UUID primary keys
- **Migrations**: Automated database migrations via drizzle-kit

## Component Architecture
- **Layout System**: Three-column responsive layout (sidebar, main content, bet slip)
- **Reusable Components**: Match cards, betting buttons, odds displays, bet slip management
- **Theme System**: Dark theme with branded color palette (deep purple, wine red, bright red, sage green)
- **Mobile Optimization**: Touch-friendly interfaces with responsive breakpoints

## Authentication & Session Management
- **User Schema**: Username/password authentication with encrypted storage
- **Session Handling**: Express sessions with PostgreSQL session store via connect-pg-simple

# External Dependencies

## Sports Data API
- **SportMonks API**: Primary data source for football fixtures, live scores, odds, and league information
- **Real-time Updates**: Polling intervals of 5-30 seconds for live data synchronization
- **Data Transformation**: Custom mapping between SportMonks format and internal application schema

## Database Services
- **Neon Database**: Serverless PostgreSQL for production deployment
- **Connection**: @neondatabase/serverless for edge-compatible database connections

## UI & Design Libraries
- **Radix UI**: Comprehensive component primitives for accessibility and functionality
- **Tailwind CSS**: Utility-first styling with custom design system variables
- **Framer Motion**: Animation library for enhanced user experience
- **Lucide React**: Icon library for consistent iconography

## Development Tools
- **TypeScript**: Full-stack type safety with shared schemas
- **ESBuild**: Fast bundling for server-side code
- **Vite**: Frontend development server with HMR and plugins
- **Drizzle Kit**: Database schema management and migrations