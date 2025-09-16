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