import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  RefreshCw, 
  Filter,
  Target,
  Activity,
  DollarSign,
  Shield,
  Zap,
  PauseCircle,
  PlayCircle,
  Settings,
  Download,
  BarChart3,
  LineChart,
  Eye,
  Users,
  Trophy,
  Clock,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// Types
interface ExposureData {
  totalExposure: number;
  maxSingleExposure: number;
  exposureLimit: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  topMarkets: MarketExposure[];
  recentChanges: ExposureChange[];
  exposureByLeague: LeagueExposure[];
  exposureByUser: UserExposure[];
  exposureHistory: ExposureHistoryPoint[];
}

interface MarketExposure {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  marketName: string;
  marketType: string;
  totalExposure: number;
  worstCaseExposure: number;
  bestCaseExposure: number;
  totalBets: number;
  averageStake: number;
  kickoffTime: string;
  status: 'active' | 'suspended' | 'closed';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ExposureChange {
  id: string;
  timestamp: string;
  type: 'bet_placed' | 'bet_settled' | 'market_suspended' | 'limit_changed';
  description: string;
  exposureChange: number;
  marketName: string;
  riskImpact: 'positive' | 'negative' | 'neutral';
}

interface LeagueExposure {
  leagueId: string;
  leagueName: string;
  totalExposure: number;
  marketCount: number;
  averageExposure: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface UserExposure {
  userId: string;
  username: string;
  totalStaked: number;
  potentialWin: number;
  exposure: number;
  betCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface ExposureHistoryPoint {
  timestamp: string;
  totalExposure: number;
  betCount: number;
  activeMarkets: number;
}

interface RiskLimitData {
  marketId: string;
  newLimit: number;
  reason: string;
}

const RISK_COLORS = {
  low: '#10B981',      // Green
  medium: '#F59E0B',   // Yellow
  high: '#EF4444',     // Red
  critical: '#DC2626'  // Dark Red
};

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AdminRiskExposure() {
  const { toast } = useToast();
  
  // State management
  const [refreshInterval, setRefreshInterval] = useState<number>(10000); // 10 seconds
  const [selectedMarket, setSelectedMarket] = useState<MarketExposure | null>(null);
  const [showMarketDetail, setShowMarketDetail] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [filters, setFilters] = useState({
    league: 'all',
    riskLevel: 'all',
    status: 'all'
  });

  // Risk limit form data
  const [riskLimitData, setRiskLimitData] = useState<RiskLimitData>({
    marketId: '',
    newLimit: 0,
    reason: ''
  });

  // Fetch exposure data with real-time updates
  const { data: exposureData, isLoading, error, refetch } = useQuery<ExposureData>({
    queryKey: ['/api/admin/risk/exposure', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.league !== 'all') params.append('league', filters.league);
      if (filters.riskLevel !== 'all') params.append('riskLevel', filters.riskLevel);
      if (filters.status !== 'all') params.append('status', filters.status);

      const response = await adminApiRequest('GET', `/api/admin/risk/exposure?${params.toString()}`);
      return response.json();
    },
    refetchInterval: refreshInterval,
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  // Mutations
  const suspendMarketMutation = useMutation({
    mutationFn: async (marketId: string) => {
      const response = await adminApiRequest('POST', `/api/admin/markets/${marketId}/suspend`);
      if (!response.ok) {
        throw new Error('Failed to suspend market');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/risk/exposure'] });
      toast({
        title: "Success",
        description: "Market suspended successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to suspend market",
        variant: "destructive",
      });
    },
  });

  const updateRiskLimitMutation = useMutation({
    mutationFn: async (data: RiskLimitData) => {
      const response = await adminApiRequest('PATCH', `/api/admin/markets/${data.marketId}/risk-limit`, {
        limit: data.newLimit,
        reason: data.reason
      });
      if (!response.ok) {
        throw new Error('Failed to update risk limit');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/risk/exposure'] });
      toast({
        title: "Success",
        description: "Risk limit updated successfully",
      });
      setShowLimitModal(false);
      setRiskLimitData({ marketId: '', newLimit: 0, reason: '' });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update risk limit",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const getRiskColor = (level: string) => {
    return RISK_COLORS[level as keyof typeof RISK_COLORS] || RISK_COLORS.low;
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'critical': return AlertTriangle;
      case 'high': return TrendingUp;
      case 'medium': return Activity;
      default: return Shield;
    }
  };

  const formatCurrency = (cents: number) => {
    return `KES ${(cents / 100).toLocaleString()}`;
  };

  const formatDateTime = (dateTimeString: string) => {
    try {
      return new Date(dateTimeString).toLocaleTimeString();
    } catch {
      return 'Invalid date';
    }
  };

  const openMarketDetail = (market: MarketExposure) => {
    setSelectedMarket(market);
    setShowMarketDetail(true);
  };

  const openRiskLimitModal = (market: MarketExposure) => {
    setRiskLimitData({
      marketId: market.id,
      newLimit: market.worstCaseExposure,
      reason: ''
    });
    setShowLimitModal(true);
  };

  const getExposurePercentage = (exposure: number, limit: number) => {
    return Math.min((exposure / limit) * 100, 100);
  };

  if (isLoading && !exposureData) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading risk exposure data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Risk Data</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading the risk exposure data.
            </p>
            <Button onClick={() => refetch()} data-testid="button-retry-risk-data">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = exposureData || { 
    totalExposure: 0, 
    maxSingleExposure: 0, 
    exposureLimit: 1000000, 
    riskLevel: 'low' as const,
    topMarkets: [], 
    recentChanges: [], 
    exposureByLeague: [], 
    exposureByUser: [],
    exposureHistory: []
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-risk-exposure-title">
            Risk & Exposure Management
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage real-time betting exposure and risk levels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={refreshInterval.toString()}
            onValueChange={(value) => setRefreshInterval(parseInt(value))}
          >
            <SelectTrigger className="w-40" data-testid="select-refresh-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5000">5 seconds</SelectItem>
              <SelectItem value="10000">10 seconds</SelectItem>
              <SelectItem value="30000">30 seconds</SelectItem>
              <SelectItem value="0">Manual only</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-exposure"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-export-risk-report"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Exposure</p>
                <p className="text-3xl font-bold" data-testid="text-total-exposure">
                  {formatCurrency(data.totalExposure)}
                </p>
                <div className="mt-2">
                  <Progress 
                    value={getExposurePercentage(data.totalExposure, data.exposureLimit)} 
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {getExposurePercentage(data.totalExposure, data.exposureLimit).toFixed(1)}% of limit
                  </p>
                </div>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Max Single Exposure</p>
                <p className="text-3xl font-bold" data-testid="text-max-single-exposure">
                  {formatCurrency(data.maxSingleExposure)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Highest market exposure
                </p>
              </div>
              <Target className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 border-l-${data.riskLevel === 'critical' ? 'red' : data.riskLevel === 'high' ? 'orange' : 'green'}-500`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risk Level</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant={data.riskLevel === 'critical' || data.riskLevel === 'high' ? 'destructive' : 'default'}
                    className="text-base"
                    data-testid="badge-risk-level"
                  >
                    {data.riskLevel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Current system risk
                </p>
              </div>
              {(() => {
                const IconComponent = getRiskIcon(data.riskLevel);
                return <IconComponent className="w-8 h-8" style={{ color: getRiskColor(data.riskLevel) }} />;
              })()}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Markets</p>
                <p className="text-3xl font-bold" data-testid="text-active-markets">
                  {data.topMarkets.filter(m => m.status === 'active').length}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Currently accepting bets
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="markets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="markets">Top Markets</TabsTrigger>
          <TabsTrigger value="leagues">By League</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div>
                  <Label htmlFor="league-filter">League</Label>
                  <Select
                    value={filters.league}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, league: value }))}
                  >
                    <SelectTrigger className="w-40" id="league-filter" data-testid="select-league-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Leagues</SelectItem>
                      {data.exposureByLeague.map(league => (
                        <SelectItem key={league.leagueId} value={league.leagueId}>
                          {league.leagueName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="risk-filter">Risk Level</Label>
                  <Select
                    value={filters.riskLevel}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, riskLevel: value }))}
                  >
                    <SelectTrigger className="w-32" id="risk-filter" data-testid="select-risk-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status-filter">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="w-32" id="status-filter" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Markets Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top Risk Markets</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Match</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead>Exposure</TableHead>
                      <TableHead>Worst Case</TableHead>
                      <TableHead>Bets</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topMarkets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <div className="text-muted-foreground">
                            No market data available
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.topMarkets.map((market: MarketExposure) => (
                        <TableRow key={market.id} className="hover-elevate">
                          <TableCell className="font-medium">
                            <div>
                              <div className="font-semibold" data-testid={`text-match-${market.id}`}>
                                {market.homeTeam} vs {market.awayTeam}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {market.league} • {formatDateTime(market.kickoffTime)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium" data-testid={`text-market-name-${market.id}`}>
                                {market.marketName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {market.marketType}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono" data-testid={`text-exposure-${market.id}`}>
                              {formatCurrency(market.totalExposure)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-red-600" data-testid={`text-worst-case-${market.id}`}>
                              {formatCurrency(market.worstCaseExposure)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Trophy className="w-4 h-4 text-muted-foreground" />
                              <span data-testid={`text-total-bets-${market.id}`}>
                                {market.totalBets}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={market.riskLevel === 'critical' || market.riskLevel === 'high' ? 'destructive' : 'default'}
                              className="flex items-center gap-1 w-fit"
                              data-testid={`badge-risk-level-${market.id}`}
                            >
                              {(() => {
                                const IconComponent = getRiskIcon(market.riskLevel);
                                return <IconComponent className="w-3 h-3" />;
                              })()}
                              {market.riskLevel.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={market.status === 'active' ? 'default' : market.status === 'suspended' ? 'destructive' : 'secondary'}
                              data-testid={`badge-status-${market.id}`}
                            >
                              {market.status === 'active' && <PlayCircle className="w-3 h-3 mr-1" />}
                              {market.status === 'suspended' && <PauseCircle className="w-3 h-3 mr-1" />}
                              {market.status.charAt(0).toUpperCase() + market.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openMarketDetail(market)}
                                data-testid={`button-view-market-${market.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {market.status === 'active' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => suspendMarketMutation.mutate(market.id)}
                                  disabled={suspendMarketMutation.isPending}
                                  data-testid={`button-suspend-market-${market.id}`}
                                >
                                  <PauseCircle className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openRiskLimitModal(market)}
                                data-testid={`button-set-limit-${market.id}`}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leagues" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* League Exposure Table */}
            <Card>
              <CardHeader>
                <CardTitle>Exposure by League</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.exposureByLeague.map((league: LeagueExposure) => (
                    <div key={league.leagueId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{league.leagueName}</div>
                        <div className="text-sm text-muted-foreground">
                          {league.marketCount} markets
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm">{formatCurrency(league.totalExposure)}</div>
                        <Badge 
                          variant={league.riskLevel === 'critical' || league.riskLevel === 'high' ? 'destructive' : 'default'}
                          className="text-xs"
                        >
                          {league.riskLevel.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* League Exposure Chart */}
            <Card>
              <CardHeader>
                <CardTitle>League Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.exposureByLeague}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ leagueName, percent }) => `${leagueName} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="totalExposure"
                    >
                      {data.exposureByLeague.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [formatCurrency(value as number), 'Exposure']} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top User Exposure</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Total Staked</TableHead>
                      <TableHead>Potential Win</TableHead>
                      <TableHead>Exposure</TableHead>
                      <TableHead>Bet Count</TableHead>
                      <TableHead>Risk Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.exposureByUser.map((user: UserExposure) => (
                      <TableRow key={user.userId} className="hover-elevate">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span data-testid={`text-username-${user.userId}`}>
                              {user.username}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono" data-testid={`text-staked-${user.userId}`}>
                            {formatCurrency(user.totalStaked)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-green-600" data-testid={`text-potential-win-${user.userId}`}>
                            {formatCurrency(user.potentialWin)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-orange-600" data-testid={`text-user-exposure-${user.userId}`}>
                            {formatCurrency(user.exposure)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span data-testid={`text-bet-count-${user.userId}`}>
                            {user.betCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={user.riskLevel === 'critical' || user.riskLevel === 'high' ? 'destructive' : 'default'}
                            data-testid={`badge-user-risk-${user.userId}`}
                          >
                            {user.riskLevel.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exposure History</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RechartsLineChart data={data.exposureHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value, name) => [formatCurrency(value as number), name]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="totalExposure" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    name="Total Exposure"
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Changes */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Risk Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.recentChanges.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No recent changes
              </div>
            ) : (
              data.recentChanges.map((change: ExposureChange) => (
                <motion.div
                  key={change.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                  data-testid={`change-${change.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      change.riskImpact === 'negative' ? 'bg-red-500' :
                      change.riskImpact === 'positive' ? 'bg-green-500' :
                      'bg-gray-500'
                    }`} />
                    <div>
                      <p className="font-medium">{change.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {change.marketName} • {formatDateTime(change.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className={`font-mono ${
                    change.exposureChange > 0 ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {change.exposureChange > 0 ? '+' : ''}{formatCurrency(change.exposureChange)}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Market Detail Modal */}
      <Dialog open={showMarketDetail} onOpenChange={setShowMarketDetail}>
        <DialogContent className="max-w-2xl" data-testid="modal-market-detail">
          <DialogHeader>
            <DialogTitle>Market Risk Details</DialogTitle>
            <DialogDescription>
              Detailed risk analysis for the selected market
            </DialogDescription>
          </DialogHeader>
          {selectedMarket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Match</p>
                  <p>{selectedMarket.homeTeam} vs {selectedMarket.awayTeam}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">League</p>
                  <p>{selectedMarket.league}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Market</p>
                  <p>{selectedMarket.marketName} ({selectedMarket.marketType})</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Status</p>
                  <Badge variant={selectedMarket.status === 'active' ? 'default' : 'destructive'}>
                    {selectedMarket.status.charAt(0).toUpperCase() + selectedMarket.status.slice(1)}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Total Exposure</p>
                  <p className="font-mono text-lg">{formatCurrency(selectedMarket.totalExposure)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Worst Case</p>
                  <p className="font-mono text-lg text-red-600">{formatCurrency(selectedMarket.worstCaseExposure)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Best Case</p>
                  <p className="font-mono text-lg text-green-600">{formatCurrency(selectedMarket.bestCaseExposure)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Average Stake</p>
                  <p className="font-mono">{formatCurrency(selectedMarket.averageStake)}</p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Risk Assessment</p>
                  <Badge 
                    variant={selectedMarket.riskLevel === 'critical' || selectedMarket.riskLevel === 'high' ? 'destructive' : 'default'}
                    className="mt-1"
                  >
                    {selectedMarket.riskLevel.toUpperCase()} RISK
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">Total Bets</p>
                  <p className="text-2xl font-bold">{selectedMarket.totalBets}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarketDetail(false)}>
              Close
            </Button>
            {selectedMarket && selectedMarket.status === 'active' && (
              <Button 
                onClick={() => suspendMarketMutation.mutate(selectedMarket.id)}
                disabled={suspendMarketMutation.isPending}
                data-testid="button-suspend-from-detail"
              >
                <PauseCircle className="w-4 h-4 mr-2" />
                Suspend Market
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Limit Modal */}
      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent data-testid="modal-risk-limit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Settings className="w-5 h-5" />
              Update Risk Limit
            </DialogTitle>
            <DialogDescription>
              Set a new risk limit for this market. This will affect future bet acceptance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-limit">New Limit (KES)</Label>
              <Input
                id="new-limit"
                type="number"
                step="100"
                value={riskLimitData.newLimit / 100}
                onChange={(e) => setRiskLimitData(prev => ({ 
                  ...prev, 
                  newLimit: Math.round(parseFloat(e.target.value || '0') * 100)
                }))}
                data-testid="input-risk-limit"
              />
            </div>
            <div>
              <Label htmlFor="limit-reason">Reason (Required)</Label>
              <Input
                id="limit-reason"
                placeholder="Reason for changing risk limit..."
                value={riskLimitData.reason}
                onChange={(e) => setRiskLimitData(prev => ({ ...prev, reason: e.target.value }))}
                data-testid="input-limit-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateRiskLimitMutation.mutate(riskLimitData)}
              disabled={updateRiskLimitMutation.isPending || !riskLimitData.reason.trim()}
              data-testid="button-confirm-risk-limit"
            >
              {updateRiskLimitMutation.isPending ? 'Updating...' : 'Update Limit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}