import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  History, 
  Trophy, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  CalendarIcon,
  Filter,
  Search,
  Download,
  RefreshCw,
  ArrowUpDown,
  AlertCircle,
  ChevronDown
} from "lucide-react";
import { currencyUtils, type Bet, type BetSelection } from "@shared/schema";
import { useState } from "react";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";

// Using shared types from @shared/schema
interface BetWithSelections extends Bet {
  selections: BetSelection[];
}

type SortField = 'placedAt' | 'totalStake' | 'status' | 'type';
type SortDirection = 'asc' | 'desc';

function BetHistory() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('placedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  
  const { data: response, isLoading, error, refetch } = useQuery<{ success: boolean; data: BetWithSelections[] }>({
    queryKey: ['/api/bets'],
    enabled: !!localStorage.getItem('authToken')
  });

  const betsData = response?.data || [];

  // Show error state if API call failed
  if (error && localStorage.getItem('authToken')) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Failed to load bet history</h2>
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
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Please log in to view your bet history</h2>
            <Button onClick={() => setLocation('/login')} data-testid="button-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter and sort bets
  const filteredAndSortedBets = betsData
    .filter(bet => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        bet.selections.some(sel => 
          sel.homeTeam.toLowerCase().includes(searchLower) ||
          sel.awayTeam.toLowerCase().includes(searchLower) ||
          sel.league.toLowerCase().includes(searchLower)
        ) ||
        bet.id.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter !== 'all' && bet.status !== statusFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== 'all' && bet.type !== typeFilter) {
      return false;
    }

    // Date range filter
    if (dateRange?.from && dateRange?.to) {
      const betDate = new Date(bet.placedAt);
      if (betDate < dateRange.from || betDate > dateRange.to) {
        return false;
      }
    }

    return true;
  })
  .sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case 'placedAt':
        comparison = new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
        break;
      case 'totalStake':
        comparison = a.totalStake - b.totalStake;
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      default:
        comparison = 0;
    }
    
    return sortDirection === 'desc' ? -comparison : comparison;
  });

  // Calculate statistics using proper currency handling
  const stats = {
    total: betsData.length,
    pending: betsData.filter(bet => bet.status === 'pending').length,
    won: betsData.filter(bet => bet.status === 'won').length,
    lost: betsData.filter(bet => bet.status === 'lost').length,
    totalStaked: betsData.reduce((sum, bet) => sum + bet.totalStake, 0), // Already in cents
    totalWinnings: betsData
      .filter(bet => bet.status === 'won')
      .reduce((sum, bet) => sum + (bet.actualWinnings || bet.potentialWinnings), 0), // Already in cents
    netProfit: betsData
      .filter(bet => bet.status !== 'pending')
      .reduce((sum, bet) => {
        const stake = bet.totalStake;
        const winnings = bet.status === 'won' ? (bet.actualWinnings || bet.potentialWinnings) : 0;
        return sum + (winnings - stake);
      }, 0)
  };

  // Fix win rate calculation - guard against division by zero
  const settledBets = stats.won + stats.lost;
  const winRate = settledBets > 0 ? ((stats.won / settledBets) * 100) : 0;

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-primary rounded-full flex items-center justify-center shrink-0">
            <History className="h-6 w-6 md:h-8 md:w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl md:text-3xl font-bold" data-testid="text-bet-history-title">Bet History</h1>
            <p className="text-sm md:text-base text-muted-foreground">Track all your betting activity</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh" className="flex-1 sm:flex-none">
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" data-testid="button-export" className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bets</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bets">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending} pending, {stats.won + stats.lost} settled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-win-rate">
              {winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.won} wins out of {stats.won + stats.lost} settled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Staked</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-staked">
              {currencyUtils.formatCurrency(stats.totalStaked)}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg: {currencyUtils.formatCurrency(stats.total > 0 ? Math.round(stats.totalStaked / stats.total) : 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className={`h-4 w-4 ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-net-profit">
              {stats.netProfit >= 0 ? '+' : ''}
              {currencyUtils.formatCurrency(Math.abs(stats.netProfit))}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.netProfit >= 0 ? 'Profit' : 'Loss'} to date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader 
          className="cursor-pointer hover-elevate transition-colors duration-200"
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
          data-testid="filters-header"
        >
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </div>
            <ChevronDown 
              className={`h-5 w-5 transition-transform duration-200 ${
                isFiltersExpanded ? 'rotate-180' : ''
              }`}
            />
          </CardTitle>
        </CardHeader>
        {isFiltersExpanded && (
          <CardContent className="animate-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-sm font-medium">Search</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teams, leagues, or bet ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status" className="mt-1">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Bet Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger data-testid="select-type" className="mt-1">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="express">Express</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Sort By</label>
                <Select value={`${sortField}-${sortDirection}`} onValueChange={(value) => {
                  const [field, direction] = value.split('-') as [SortField, SortDirection];
                  setSortField(field);
                  setSortDirection(direction);
                }}>
                  <SelectTrigger data-testid="select-sort" className="mt-1">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placedAt-desc">Date (Newest first)</SelectItem>
                    <SelectItem value="placedAt-asc">Date (Oldest first)</SelectItem>
                    <SelectItem value="totalStake-desc">Stake (Highest first)</SelectItem>
                    <SelectItem value="totalStake-asc">Stake (Lowest first)</SelectItem>
                    <SelectItem value="status-asc">Status (A-Z)</SelectItem>
                    <SelectItem value="status-desc">Status (Z-A)</SelectItem>
                    <SelectItem value="type-asc">Type (A-Z)</SelectItem>
                    <SelectItem value="type-desc">Type (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-sm font-medium">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal mt-1"
                      data-testid="button-date-range"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "LLL dd")} -{" "}
                              {format(dateRange.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(dateRange.from, "LLL dd, y")
                          )
                        ) : (
                          "Pick a date range"
                        )}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={window.innerWidth < 640 ? 1 : 2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bet List */}
      <Card>
        <CardHeader>
          <CardTitle>Bet History ({filteredAndSortedBets.length} results)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading bets...</span>
            </div>
          ) : filteredAndSortedBets.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {betsData.length === 0 ? "No bets placed yet" : "No bets match your filters"}
              </p>
              {betsData.length === 0 && (
                <Button 
                  onClick={() => setLocation('/line')} 
                  className="mt-4"
                  data-testid="button-place-first-bet"
                >
                  Place Your First Bet
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {filteredAndSortedBets.map((bet) => (
                <div 
                  key={bet.id} 
                  className="border rounded-lg p-3 md:p-4 hover-elevate transition-all duration-200" 
                  data-testid={`bet-card-${bet.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={
                        bet.status === 'won' ? 'default' : 
                        bet.status === 'lost' ? 'destructive' : 
                        bet.status === 'pending' ? 'secondary' :
                        'outline'
                      }>
                        {bet.status.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">
                        {bet.type.toUpperCase()}
                      </Badge>
                      <span className="text-xs md:text-sm text-muted-foreground">
                        #{bet.id.slice(-8)}
                      </span>
                    </div>
                    <div className="flex justify-between sm:block sm:text-right">
                      <div>
                        <p className="text-sm md:text-base font-medium">
                          Stake: KES {bet.totalStake.toFixed(2)}
                        </p>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          {bet.status === 'won' && bet.actualWinnings ? 
                            `Won: KES ${bet.actualWinnings.toFixed(2)}` :
                            `Potential: KES ${bet.potentialWinnings.toFixed(2)}`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 md:space-y-3">
                    {bet.selections.map((selection, index) => (
                      <div key={index} className="text-xs md:text-sm">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {selection.homeTeam} vs {selection.awayTeam}
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <div className="font-medium whitespace-nowrap">
                              @{selection.odds}
                            </div>
                            {selection.status && (
                              <Badge 
                                variant={
                                  selection.status === 'won' ? 'default' : 
                                  selection.status === 'lost' ? 'destructive' : 
                                  'secondary'
                                }
                                className="text-xs"
                              >
                                {selection.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {selection.league} • {selection.market}: {selection.selection}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-3 pt-3 border-t">
                    <div className="text-xs md:text-sm text-muted-foreground space-y-0.5">
                      <div>Placed: {new Date(bet.placedAt).toLocaleString()}</div>
                      {bet.settledAt && (
                        <div>Settled: {new Date(bet.settledAt).toLocaleString()}</div>
                      )}
                    </div>
                    <div className="flex justify-between sm:block sm:text-right">
                      <span className="text-sm md:text-base font-medium">
                        Total Odds: {bet.totalOdds}
                      </span>
                      {bet.status === 'pending' && (
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Awaiting result</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BetHistory;