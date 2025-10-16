# Overview

OddRoyal is a premium sports betting web application focused on football (soccer), offering real-time sports data, live odds, and a comprehensive betting interface. Key features include live match tracking, pre-match odds, and an integrated bet slip system. The platform aims to provide a modern, mobile-first, dark-themed experience optimized for quick betting decisions, leveraging React, Express, and integration with SportMonks API for data. The business vision is to capture a significant share of the online sports betting market by offering a superior user experience and comprehensive betting options across multiple sports.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Frameworks**: React with TypeScript, Vite, Wouter for routing.
- **UI/UX**: Radix UI components with shadcn/ui styling, Tailwind CSS, Framer Motion for animations.
- **State Management**: TanStack Query for server state, React hooks for local state.
- **Design Decisions**: Mobile-first, dark-themed design with custom tokens for betting sites.
- **Component Structure**: Three-column responsive layout (sidebar, main content, bet slip), reusable match cards, betting buttons, odds displays, bet slip.

## Backend Architecture
- **Framework**: Express.js with TypeScript.
- **Data Layer**: Drizzle ORM for PostgreSQL.
- **API**: RESTful endpoints.
- **Data Storage**: SupabaseStorage (PostgreSQL) for production, handling all CRUD.
- **Admin System**: Full-featured `/prime-admin` panel with authentication, RBAC, and management tools.
- **Caching**: Multi-layer system (In-memory LRU, Redis, API fallback) with graceful degradation and monitoring.
- **Real-time Data**: Ably aggregator for continuous API refresh, ensuring data availability and preventing blank states. Aggregator actively refetches from The Odds API when Redis cache is empty, extending TTL during API failures.
- **Market Generation**: Dynamic market generation system (`server/market-generator.ts`) replaces API market persistence, creating 50+ football markets and various markets for Basketball, American Football, Baseball, Ice Hockey, Cricket, and MMA using deterministic seeded PRNG for consistent odds.
- **Performance Optimizations**: Individual match caching (`match:{matchId}`) for O(1) lookup of match details, replacing expensive O(n) searches.

## Database Design
- **ORM**: Drizzle with PostgreSQL.
- **Schema**: User management with UUID primary keys.
- **Migrations**: Automated via drizzle-kit.

## Authentication & Session Management
- **Auth**: Username/password with encryption.
- **Sessions**: Express sessions with PostgreSQL store via `connect-pg-simple`.

# External Dependencies

- **Sports Data API**: SportMonks API (primary source for football fixtures, scores, odds), The Odds API (for base odds).
- **Database Services**: Neon Database (serverless PostgreSQL).
- **Real-time Messaging**: Ably (for live data synchronization).
- **UI & Design Libraries**: Radix UI, Tailwind CSS, Framer Motion, Lucide React.
- **Development Tools**: TypeScript, ESBuild, Vite, Drizzle Kit.