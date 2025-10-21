import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Trophy, 
  Clock, 
  CalendarIcon,
  Filter,
  Search,
  RefreshCw,
  Target,
  CheckCircle,
  XCircle,
  Minus,
  AlertCircle
} from "lucide-react";
import { currencyUtils, type Bet, type BetSelection } from "@shared/schema";
import { useState } from "react";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";

// Using shared types from @shared/schema
interface BetWithSelections extends Bet {
  selections: BetSelection[];
}

interface MatchResult {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeScore: number;
  awayScore: number;
  status: string;
  startTime: string;
  finishedAt: string;
  season?: string;
  round?: string;
}

function Results() {
  const [searchTerm, setSearchTerm] = useState('');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('won');
  const [activeTab, setActiveTab] = useState<'results' | 'settlements'>('settlements');
  
  // Fetch match results data
  const { data: resultsResponse, isLoading: resultsLoading, error: resultsError, refetch: refetchResults } = useQuery<{ success: boolean; data: MatchResult[] }>({
    queryKey: ['/api/results'],
    enabled: activeTab === 'results'
  });

  // Fetch bet settlements data  
  const { data: settlementsResponse, isLoading: settlementsLoading, error: settlementsError, refetch: refetchSettlements } = useQuery<{ success: boolean; data: BetWithSelections[] }>({
    queryKey: [`/api/settlements?status=${statusFilter}`],
    enabled: activeTab === 'settlements' && !!localStorage.getItem('authToken')
  });

  const matchResults = resultsResponse?.data || [];
  const betSettlements = settlementsResponse?.data || [];

  // Filter data based on active tab
  const filteredData = activeTab === 'results' 
    ? matchResults.filter(result => {
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          if (!result.homeTeam.toLowerCase().includes(searchLower) &&
              !result.awayTeam.toLowerCase().includes(searchLower) &&
              !result.league.toLowerCase().includes(searchLower)) {
            return false;
          }
        }
        if (leagueFilter !== 'all' && result.league !== leagueFilter) {
          return false;
        }
        return true;
      })
    : betSettlements.filter(bet => {
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
        return true;
      });

  // Get unique leagues for filter dropdown
  const leagues = activeTab === 'results' 
    ? Array.from(new Set(matchResults.map(result => result.league)))
    : Array.from(new Set(betSettlements.flatMap(bet => bet.selections.map(sel => sel.league))));

  const getResultIcon = (homeScore: number, awayScore: number, selection: string) => {
    if (selection === 'home' && homeScore > awayScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (selection === 'away' && awayScore > homeScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (selection === 'draw' && homeScore === awayScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  // Handle authentication check for settlements
  if (activeTab === 'settlements' && !localStorage.getItem('authToken')) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Please log in to view your bet settlements</h2>
            <Button onClick={() => window.location.href = '/login'} data-testid="button-login">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle error states
  const hasError = (activeTab === 'results' && resultsError) || (activeTab === 'settlements' && settlementsError);
  if (hasError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Failed to load data</h2>
            <p className="text-muted-foreground mb-4">There was an error loading the {activeTab} data.</p>
            <Button 
              onClick={() => activeTab === 'results' ? refetchResults() : refetchSettlements()} 
              data-testid="button-retry"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Target className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-results-title">Match Results</h1>
            <p className="text-muted-foreground">View match outcomes and bet settlements</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={() => activeTab === 'results' ? refetchResults() : refetchSettlements()}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search teams or leagues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="min-w-[150px]">
              <label className="text-sm font-medium">League</label>
              <Select value={leagueFilter} onValueChange={setLeagueFilter}>
                <SelectTrigger data-testid="select-league">
                  <SelectValue placeholder="All Leagues" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leagues</SelectItem>
                  {leagues.map(league => (
                    <SelectItem key={league} value={league}>{league}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeTab === 'settlements' && (
              <div className="min-w-[150px]">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'results' | 'settlements')} className="space-y-6">
        <TabsList>
          <TabsTrigger value="results" data-testid="tab-results">
            <Trophy className="h-4 w-4 mr-2" />
            Match Results
          </TabsTrigger>
          <TabsTrigger value="settlements" data-testid="tab-settlements">
            <CheckCircle className="h-4 w-4 mr-2" />
            Bet Settlements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Match Results ({filteredData.length} matches)</CardTitle>
            </CardHeader>
            <CardContent>
              {resultsLoading ? (
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading results...</span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No match results found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(filteredData as MatchResult[]).map((result) => (
                    <div 
                      key={result.id} 
                      className="border rounded-lg p-4 hover-elevate transition-all duration-200" 
                      data-testid={`result-card-${result.id}`}
                    >
                      <div className="flex justify-between items-start mb-3 gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">
                            {result.homeTeam} vs {result.awayTeam}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {result.league} {result.round && `• ${result.round}`}
                          </p>
                        </div>
                        <Badge variant={result.status === 'finished' ? 'default' : 'secondary'}>
                          {result.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <div className="text-3xl font-bold">
                          {result.homeScore} - {result.awayScore}
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <div>Started: {new Date(result.startTime).toLocaleString()}</div>
                          {result.finishedAt && (
                            <div>Finished: {new Date(result.finishedAt).toLocaleString()}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Bet Settlements ({filteredData.length} bets)</CardTitle>
            </CardHeader>
            <CardContent>
              {settlementsLoading ? (
                <div className="flex justify-center items-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading settlements...</span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No bet settlements found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(filteredData as BetWithSelections[]).map((bet) => {
                    // Type guard to ensure we have valid bet data
                    if (!bet.type || !bet.selections) return null;
                    
                    return (
                      <div 
                        key={bet.id} 
                        className="border rounded-lg p-4 hover-elevate transition-all duration-200" 
                        data-testid={`settlement-card-${bet.id}`}
                      >
                        <div className="flex justify-between items-start mb-3 gap-4">
                          <div className="flex items-center space-x-2">
                            <Badge variant={bet.status === 'won' ? 'default' : 'destructive'}>
                              {bet.status.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">
                              {bet.type.toUpperCase()}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{bet.id.slice(-4)}
                            </span>
                          </div>
                        <div className="text-right">
                          <p className="font-medium">
                            Stake: {currencyUtils.formatCurrency(bet.totalStake)}
                          </p>
                          <p className={`text-sm ${bet.status === 'won' ? 'text-green-600' : 'text-red-600'}`}>
                            {bet.status === 'won' ? 
                              `Won: ${currencyUtils.formatCurrency(bet.actualWinnings || bet.potentialWinnings)}` :
                              `Lost: ${currencyUtils.formatCurrency(bet.totalStake)}`
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {bet.selections.map((selection, index) => (
                          <div key={selection.id || index} className="flex justify-between items-center text-sm gap-2">
                            <div className="flex items-center space-x-2">
                              <div className="flex-shrink-0">
                                {selection.status === 'won' ? 
                                  <CheckCircle className="h-4 w-4 text-green-600" /> :
                                  selection.status === 'lost' ?
                                  <XCircle className="h-4 w-4 text-red-600" /> :
                                  <Minus className="h-4 w-4 text-muted-foreground" />
                                }
                              </div>
                              <div className="flex-1">
                                <div className="font-medium">
                                  {selection.homeTeam} vs {selection.awayTeam}
                                </div>
                                <div className="text-muted-foreground">
                                  {selection.market}: {selection.selection} @ {selection.odds}
                                </div>
                                {selection.result && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {selection.result}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Badge 
                              variant={selection.status === 'won' ? 'default' : selection.status === 'lost' ? 'destructive' : 'secondary'}
                              className="text-xs flex-shrink-0"
                            >
                              {selection.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-between items-center mt-3 pt-3 border-t text-sm text-muted-foreground gap-4">
                        <div>
                          Placed: {new Date(bet.placedAt).toLocaleString()}
                        </div>
                        {bet.settledAt && (
                          <div>
                            Settled: {new Date(bet.settledAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Results;