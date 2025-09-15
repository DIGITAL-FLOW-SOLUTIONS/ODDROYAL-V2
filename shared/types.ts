// Shared types for betting functionality across frontend and backend

export interface BetSelection {
  id: string;
  matchId: string;
  fixtureId: string; // For backend compatibility
  type: string; // "home", "draw", "away", "over", "under", "yes", "no", etc.
  selection: string; // Human readable selection name
  odds: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string; // "1x2", "over_under", "btts", "correct_score", etc.
  isLive?: boolean;
  stake?: number; // Optional stake for individual selections
}

export interface BetPlacementRequest {
  type: 'single' | 'express' | 'system';
  totalStake: string; // In pounds as string (e.g., "10.50")
  selections: Array<{
    fixtureId: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    market: string;
    selection: string;
    odds: string; // As string for API
  }>;
}