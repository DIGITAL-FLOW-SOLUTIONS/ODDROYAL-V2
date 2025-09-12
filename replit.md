# Overview

PRIMESTAKE is a premium sports betting web application featuring real-time sports data, live odds, and a comprehensive betting interface. The platform focuses on football (soccer) betting with live match tracking, pre-match odds, and an integrated bet slip system. Built as a modern full-stack application with React frontend and Express backend, it integrates with SportMonks API for live sports data and features a mobile-first, dark-themed design optimized for quick betting decisions.

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
- **Data Storage**: In-memory storage implementation with interface for future database integration

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