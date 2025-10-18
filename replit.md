# Overview

OddRoyal is a premium sports betting web application focused on football (soccer), offering real-time sports data, live odds, and a comprehensive betting interface. It features live match tracking, pre-match odds, and an integrated bet slip system. Built with a React frontend and Express backend, it integrates with SportMonks API for live sports data and emphasizes a mobile-first, dark-themed design optimized for quick betting decisions. The platform aims to provide a robust and engaging betting experience.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript (Vite build tool)
- **Routing**: Wouter for client-side navigation
- **UI/Styling**: Radix UI components with shadcn/ui and Tailwind CSS for a modern, dark-themed, mobile-first design.
- **State Management**: TanStack Query for server state; React hooks for local state.
- **Animations**: Framer Motion for smooth UI transitions.
- **Layout**: Three-column responsive layout (sidebar, main content, bet slip).
- **Theming**: Dark theme with a branded color palette (deep purple, wine red, bright red, sage green).

## Backend Architecture
- **Framework**: Express.js with TypeScript.
- **Data Layer**: Drizzle ORM for PostgreSQL database interactions.
- **API Structure**: RESTful endpoints for fixtures, odds, and health checks.
- **Data Storage**: SupabaseStorage (PostgreSQL) for all production CRUD operations.
- **Admin System**: Comprehensive admin panel at `/prime-admin` with authentication, RBAC, and management tools.
- **Caching**: Multi-layer caching system (In-memory LRU → Redis → API fallback) with monitoring for performance optimization and data availability.
- **Market Generation**: Dynamic market generation system for 50+ football markets, and sport-specific markets for Basketball, American Football, Baseball, Ice Hockey, Cricket, and MMA. This replaces API market persistence by generating markets dynamically using deterministic seeded PRNG.

## Database Design
- **ORM**: Drizzle with PostgreSQL dialect.
- **Schema**: User management with UUID primary keys.
- **Migrations**: Automated migrations via drizzle-kit.

## Authentication & Session Management
- **User Authentication**: Username/password with encrypted storage.
- **Session Handling**: Express sessions with PostgreSQL session store (connect-pg-simple).

# External Dependencies

## Sports Data API
- **SportMonks API**: Primary source for football fixtures, live scores, odds, and league information. Utilizes varying polling intervals (5-30 seconds) for real-time data synchronization and custom data transformation.

## Database Services
- **Neon Database**: Serverless PostgreSQL for production deployment, using `@neondatabase/serverless` for edge-compatible connections.

## UI & Design Libraries
- **Radix UI**: Component primitives for accessibility and functionality.
- **Tailwind CSS**: Utility-first styling.
- **Framer Motion**: Animation library.
- **Lucide React**: Icon library.

## Development Tools
- **TypeScript**: Full-stack type safety.
- **ESBuild**: Fast bundling for server-side code.
- **Vite**: Frontend development server.
- **Drizzle Kit**: Database schema management.