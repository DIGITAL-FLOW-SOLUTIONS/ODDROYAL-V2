import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Target,
  Trophy,
  Calendar,
  PieChart,
  Clock,
  Zap,
  Star,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { currencyUtils, type Bet, type BetSelection } from "@shared/schema";
import { useState, useMemo } from "react";
import { addDays, format, startOfWeek, endOfWeek, subWeeks, subMonths } from "date-fns";

interface BetWithSelections extends Bet {
  selections: BetSelection[];
}

interface MarketStats {
  market: string;
  totalBets: number;
  wonBets: number;
  winRate: number;
  totalStaked: number;
  netProfit: number;
  averageOdds: number;
}

interface TimeStats {
  period: string;
  bets: number;
  profit: number;
  winRate: number;
}

function Analytics() {
  const [timeFilter, setTimeFilter] = useState<string>('all');
  
  const { data: response, isLoading, error, refetch } = useQuery<{ success: boolean; data: BetWithSelections[] }>({
    queryKey: ['/api/bets'],
    enabled: !!localStorage.getItem('authToken')
  });

  const betsData = response?.data || [];

  // Filter bets by time period
  const filteredBets = useMemo(() => {
    if (timeFilter === 'all') return betsData;
    
    const now = new Date();
    let cutoffDate: Date;
    
    switch (timeFilter) {
      case '7d':
        cutoffDate = addDays(now, -7);
        break;
      case '30d':
        cutoffDate = addDays(now, -30);
        break;
      case '90d':
        cutoffDate = addDays(now, -90);
        break;
      default:
        return betsData;
    }
    
    return betsData.filter(bet => new Date(bet.placedAt) >= cutoffDate);
  }, [betsData, timeFilter]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const settled = filteredBets.filter(bet => bet.status !== 'pending');
    const won = settled.filter(bet => bet.status === 'won');
    
    const totalStaked = filteredBets.reduce((sum, bet) => sum + bet.totalStake, 0);
    const totalWinnings = won.reduce((sum, bet) => sum + (bet.actualWinnings ?? bet.potentialWinnings), 0);
    const netProfit = totalWinnings - settled.reduce((sum, bet) => sum + bet.totalStake, 0);
    
    return {
      totalBets: filteredBets.length,
      settledBets: settled.length,
      pendingBets: filteredBets.filter(bet => bet.status === 'pending').length,
      wonBets: won.length,
      lostBets: settled.filter(bet => bet.status === 'lost').length,
      winRate: settled.length > 0 ? (won.length / settled.length) * 100 : 0,
      totalStaked,
      totalWinnings,
      netProfit,
      averageStake: filteredBets.length > 0 ? totalStaked / filteredBets.length : 0,
      biggestWin: Math.max(0, ...won.map(bet => (bet.actualWinnings ?? bet.potentialWinnings) - bet.totalStake)),
      biggestLoss: Math.max(0, ...settled.filter(bet => bet.status === 'lost').map(bet => bet.totalStake)),
    };
  }, [filteredBets]);

  // Calculate market performance
  const marketStats = useMemo((): MarketStats[] => {
    const marketMap = new Map<string, {
      selections: BetSelection[];
      bets: BetWithSelections[];
    }>();

    // Group selections and bets by market
    filteredBets.forEach(bet => {
      bet.selections.forEach(selection => {
        const market = selection.market;
        if (!marketMap.has(market)) {
          marketMap.set(market, { selections: [], bets: [] });
        }
        marketMap.get(market)!.selections.push(selection);
        if (!marketMap.get(market)!.bets.find(b => b.id === bet.id)) {
          marketMap.get(market)!.bets.push(bet);
        }
      });
    });

    return Array.from(marketMap.entries()).map(([market, data]) => {
      const settledSelections = data.selections.filter(s => s.status !== 'pending');
      const wonSelections = settledSelections.filter(s => s.status === 'won');
      const settledBets = data.bets.filter(bet => bet.status !== 'pending');
      const wonBets = settledBets.filter(bet => bet.status === 'won');
      
      const totalStaked = settledBets.reduce((sum, bet) => sum + bet.totalStake, 0);
      const totalWinnings = wonBets.reduce((sum, bet) => sum + (bet.actualWinnings ?? bet.potentialWinnings), 0);
      
      return {
        market,
        totalBets: settledBets.length,
        wonBets: wonBets.length,
        winRate: settledBets.length > 0 ? (wonBets.length / settledBets.length) * 100 : 0,
        totalStaked,
        netProfit: totalWinnings - totalStaked,
        averageOdds: data.selections.length > 0 
          ? data.selections.reduce((sum, s) => sum + parseFloat(s.odds), 0) / data.selections.length 
          : 0,
      };
    }).sort((a, b) => b.totalBets - a.totalBets);
  }, [filteredBets]);

  // Calculate bet type performance
  const betTypeStats = useMemo(() => {
    const types = ['single', 'express', 'system'] as const;
    
    return types.map(type => {
      const bets = filteredBets.filter(bet => bet.type === type);
      const settled = bets.filter(bet => bet.status !== 'pending');
      const won = settled.filter(bet => bet.status === 'won');
      
      const totalStaked = settled.reduce((sum, bet) => sum + bet.totalStake, 0);
      const totalWinnings = won.reduce((sum, bet) => sum + (bet.actualWinnings ?? bet.potentialWinnings), 0);
      
      return {
        type,
        totalBets: bets.length,
        settledBets: settled.length,
        wonBets: won.length,
        winRate: settled.length > 0 ? (won.length / settled.length) * 100 : 0,
        totalStaked,
        netProfit: totalWinnings - totalStaked,
        averageStake: bets.length > 0 ? bets.reduce((sum, bet) => sum + bet.totalStake, 0) / bets.length : 0,
      };
    });
  }, [filteredBets]);

  // Calculate weekly performance
  const weeklyStats = useMemo((): TimeStats[] => {
    const weeks: TimeStats[] = [];
    const now = new Date();
    
    for (let i = 0; i < 8; i++) {
      const weekStart = startOfWeek(subWeeks(now, i));
      const weekEnd = endOfWeek(weekStart);
      
      const weekBets = filteredBets.filter(bet => {
        const betDate = new Date(bet.placedAt);
        return betDate >= weekStart && betDate <= weekEnd;
      });
      
      const settled = weekBets.filter(bet => bet.status !== 'pending');
      const won = settled.filter(bet => bet.status === 'won');
      
      const totalStaked = settled.reduce((sum, bet) => sum + bet.totalStake, 0);
      const totalWinnings = won.reduce((sum, bet) => sum + (bet.actualWinnings ?? bet.potentialWinnings), 0);
      
      weeks.unshift({
        period: format(weekStart, 'MMM dd'),
        bets: weekBets.length,
        profit: totalWinnings - totalStaked,
        winRate: settled.length > 0 ? (won.length / settled.length) * 100 : 0,
      });
    }
    
    return weeks;
  }, [filteredBets]);

  // Show error state if API call failed
  if (error && localStorage.getItem('authToken')) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Failed to load analytics</h2>
            <p className="text-muted-foreground mb-4">There was an error loading your betting data.</p>
            <Button onClick={() => refetch()} data-testid="button-retry">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!localStorage.getItem('authToken')) {
    return (
      <div className="container mx-auto p-6 text-center">
        <div className="max-w-md mx-auto">
          <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Betting Analytics</h2>
          <p className="text-muted-foreground mb-6">
            Sign in to view your detailed betting statistics and performance insights.
          </p>
          <Button onClick={() => window.location.href = '/login'} data-testid="button-login">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-analytics-title">Betting Analytics</h1>
            <p className="text-muted-foreground">Detailed insights into your betting performance</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-32" data-testid="select-time-filter">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Overview Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-bets">{overallStats.totalBets}</div>
                <p className="text-xs text-muted-foreground">
                  {overallStats.pendingBets} pending • {overallStats.settledBets} settled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${overallStats.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-win-rate">
                  {overallStats.winRate.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {overallStats.wonBets} wins • {overallStats.lostBets} losses
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                {overallStats.netProfit >= 0 ? 
                  <TrendingUp className="h-4 w-4 text-green-600" /> :
                  <TrendingDown className="h-4 w-4 text-red-600" />
                }
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${overallStats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-net-profit">
                  {currencyUtils.formatCurrency(overallStats.netProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total staked: {currencyUtils.formatCurrency(overallStats.totalStaked)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Stake</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-average-stake">
                  {currencyUtils.formatCurrency(overallStats.averageStake)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Biggest win: {currencyUtils.formatCurrency(overallStats.biggestWin)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics Tabs */}
          <Tabs defaultValue="markets" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="markets" data-testid="tab-markets">Markets</TabsTrigger>
              <TabsTrigger value="types" data-testid="tab-types">Bet Types</TabsTrigger>
              <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="markets" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Market Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {marketStats.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No market data available for the selected period.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {marketStats.slice(0, 10).map((market, index) => (
                        <div key={market.market} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`market-stats-${index}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{market.market}</h3>
                              <Badge variant={market.winRate >= 50 ? "default" : "secondary"}>
                                {market.winRate.toFixed(1)}%
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {market.totalBets} bets • Avg odds: {market.averageOdds.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-medium ${market.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {currencyUtils.formatCurrency(market.netProfit)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {market.wonBets}/{market.totalBets} wins
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="types" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {betTypeStats.map((type) => (
                  <Card key={type.type}>
                    <CardHeader>
                      <CardTitle className="text-lg capitalize">{type.type} Bets</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total Bets</span>
                        <span className="font-medium" data-testid={`${type.type}-total-bets`}>{type.totalBets}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Win Rate</span>
                        <span className={`font-medium ${type.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                          {type.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Net Profit</span>
                        <span className={`font-medium ${type.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {currencyUtils.formatCurrency(type.netProfit)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Avg Stake</span>
                        <span className="font-medium">{currencyUtils.formatCurrency(type.averageStake)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Weekly Performance Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {weeklyStats.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No trend data available for the selected period.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {weeklyStats.map((week, index) => (
                        <div key={week.period} className="flex items-center justify-between p-3 bg-muted rounded-lg" data-testid={`week-stats-${index}`}>
                          <div className="flex-1">
                            <div className="font-medium">Week of {week.period}</div>
                            <div className="text-sm text-muted-foreground">
                              {week.bets} bets placed
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">Win Rate</div>
                              <div className={`font-medium ${week.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                                {week.winRate.toFixed(1)}%
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">Profit</div>
                              <div className={`font-medium ${week.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {currencyUtils.formatCurrency(week.profit)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

export default Analytics;