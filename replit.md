# Overview

OddRoyal is a premium sports betting web application featuring real-time sports data, live odds, and a comprehensive betting interface. The platform focuses on football (soccer) betting with live match tracking, pre-match odds, and an integrated bet slip system. Built as a modern full-stack application with React frontend and Express backend, it integrates with SportMonks API for live sports data and features a mobile-first, dark-themed design optimized for quick betting decisions.

# Recent Changes

## October 11, 2025 - Admin Panel Match & Market Management Fixes
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