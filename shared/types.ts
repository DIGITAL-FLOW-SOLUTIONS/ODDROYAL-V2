// Shared types for betting functionality and admin dashboard across frontend and backend

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

// Admin Dashboard Interfaces
export interface DashboardMetrics {
  // User metrics
  totalUsers: number;
  activeUsers: number; // Users with activity in last 30 days
  newUsersToday: number;
  newUsersThisWeek: number;
  userGrowthPercentage: number; // Week over week growth
  
  // Bet metrics
  totalBets: number;
  pendingBets: number;
  settledBets: number;
  betsToday: number;
  betsThisWeek: number;
  betVolumeGrowthPercentage: number; // Week over week growth
  
  // Financial metrics
  totalTurnoverCents: number; // Total stakes placed (in cents)
  turnoverTodayCents: number;
  turnoverThisWeekCents: number;
  totalGgrCents: number; // Gross Gaming Revenue (stakes - winnings)
  ggrTodayCents: number;
  ggrThisWeekCents: number;
  revenueGrowthPercentage: number; // Week over week GGR growth
  
  // Balance metrics
  totalPlayerBalanceCents: number;
  averagePlayerBalanceCents: number;
  
  // Risk metrics
  totalExposureCents: number; // Potential liability on pending bets
  highRiskBetsCount: number; // Bets with high potential payouts
  
  // System metrics
  systemStatus: 'operational' | 'degraded' | 'maintenance' | 'down';
  lastUpdated: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface TrendData {
  betVolume: ChartDataPoint[];
  userRegistrations: ChartDataPoint[];
  revenue: ChartDataPoint[];
  turnover: ChartDataPoint[];
}

export interface ActivityLogEntry {
  id: string;
  type: 'bet_placed' | 'user_registered' | 'bet_settled' | 'admin_action' | 'system_alert';
  title: string;
  description: string;
  timestamp: string;
  userId?: string;
  adminId?: string;
  betId?: string;
  amount?: number; // In cents if applicable
  severity?: 'info' | 'warning' | 'error' | 'success';
}

export interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  action: string;
  icon: string;
  count?: number;
  enabled: boolean;
}

export interface SystemAlert {
  id: string;
  type: 'high_exposure' | 'suspicious_betting' | 'system_performance' | 'security' | 'maintenance';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  isResolved: boolean;
  actionRequired: boolean;
}

export interface AdminDashboardData {
  metrics: DashboardMetrics;
  trends: TrendData;
  recentActivity: ActivityLogEntry[];
  quickActions: QuickActionItem[];
  systemAlerts: SystemAlert[];
  connectedClients: number; // WebSocket connections
  lastRefresh: string;
}

// Matches and Markets Management Interfaces
export interface Match {
  id: string;
  externalId?: string;
  leagueId: string;
  leagueName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoffTime: string;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  homeScore?: number;
  awayScore?: number;
  isManual: boolean;
  isDeleted: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  markets?: Market[];
  marketCount?: number;
}

export interface Market {
  id: string;
  matchId: string;
  key: string;
  name: string;
  type: '1x2' | 'totals' | 'btts' | 'handicap' | 'correct_score' | 'custom';
  parameter?: string;
  status: 'open' | 'closed' | 'suspended' | 'settled';
  minStakeCents: number;
  maxStakeCents: number;
  maxLiabilityCents: number;
  displayOrder: number;
  isPublished: boolean;
  isDeleted: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  outcomes?: MarketOutcome[];
  margin?: number;
  totalLiabilityCents?: number;
}

export interface MarketOutcome {
  id: string;
  marketId: string;
  key: string;
  label: string;
  odds: number;
  previousOdds?: number;
  oddsSource: 'manual' | 'sportmonks' | 'automated';
  status: 'active' | 'inactive' | 'won' | 'lost';
  liabilityLimitCents: number;
  displayOrder: number;
  isDeleted: boolean;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  stakingVolumeCents?: number;
  liabilityExposureCents?: number;
}

export interface OddsHistoryEntry {
  id: string;
  outcomeId: string;
  previousOdds?: number;
  newOdds: number;
  source: 'manual' | 'sportmonks' | 'automated';
  reason?: string;
  changedBy?: string;
  timestamp: string;
  changedByUsername?: string;
}

export interface MatchFilters {
  search: string;
  sport: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  leagueId: string;
}

export interface MarketTemplate {
  type: string;
  name: string;
  key: string;
  parameter?: string;
  outcomes: Array<{
    key: string;
    label: string;
    defaultOdds: number;
  }>;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  additionalInfo?: {
    totalGoals?: number;
    bothTeamsScored?: boolean;
    winner?: 'home' | 'away' | 'draw';
  };
}

export interface BulkOperationResult {
  success: boolean;
  processedCount: number;
  errorCount: number;
  errors?: string[];
  message: string;
}

export interface MarketMargin {
  percentage: number;
  isValid: boolean;
  recommendedAdjustment?: number;
}

export interface League {
  id: string;
  name: string;
  sportType: string;
  country: string;
  season: string;
  isActive: boolean;
}

export interface Team {
  id: string;
  name: string;
  country: string;
  leagueId: string;
  logoUrl?: string;
}