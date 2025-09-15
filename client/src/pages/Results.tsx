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
  Minus
} from "lucide-react";
import { useState } from "react";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";

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
  season: string;
  round?: string;
}

interface BetResult {
  id: string;
  userId: string;
  type: string;
  totalStake: number;
  potentialWinnings: number;
  actualWinnings: number;
  status: string;
  placedAt: string;
  settledAt: string;
  selections: Array<{
    fixtureId: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    market: string;
    selection: string;
    odds: string;
    status: string;
    result?: string;
  }>;
}

function Results() {
  const [searchTerm, setSearchTerm] = useState('');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('finished');
  const [dateFilter, setDateFilter] = useState<Date | undefined>(new Date());
  
  // Mock data for match results (in a real app, this would come from an API)
  const mockResults: MatchResult[] = [
    {
      id: "1",
      homeTeam: "Manchester United",
      awayTeam: "Liverpool",
      league: "Premier League",
      homeScore: 2,
      awayScore: 1,
      status: "finished",
      startTime: "2025-09-15T15:00:00Z",
      finishedAt: "2025-09-15T16:45:00Z",
      season: "2024/25",
      round: "Matchday 4"
    },
    {
      id: "2", 
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      league: "Premier League",
      homeScore: 0,
      awayScore: 0,
      status: "finished",
      startTime: "2025-09-15T17:30:00Z",
      finishedAt: "2025-09-15T19:15:00Z",
      season: "2024/25",
      round: "Matchday 4"
    },
    {
      id: "3",
      homeTeam: "Barcelona",
      awayTeam: "Real Madrid",
      league: "La Liga",
      homeScore: 1,
      awayScore: 3,
      status: "finished",
      startTime: "2025-09-15T20:00:00Z",
      finishedAt: "2025-09-15T21:45:00Z",
      season: "2024/25",
      round: "Matchday 5"
    }
  ];

  // Mock bet results (in a real app, this would be fetched from backend)
  const mockBetResults: BetResult[] = [
    {
      id: "bet1",
      userId: "user1",
      type: "single",
      totalStake: 1000, // £10.00 in cents
      potentialWinnings: 2500, // £25.00 in cents
      actualWinnings: 2500,
      status: "won",
      placedAt: "2025-09-15T14:30:00Z",
      settledAt: "2025-09-15T16:50:00Z",
      selections: [{
        fixtureId: "1",
        homeTeam: "Manchester United",
        awayTeam: "Liverpool", 
        league: "Premier League",
        market: "1x2",
        selection: "home",
        odds: "2.50",
        status: "won",
        result: "Manchester United won 2-1"
      }]
    },
    {
      id: "bet2",
      userId: "user1",
      type: "single",
      totalStake: 500, // £5.00 in cents
      potentialWinnings: 1500, // £15.00 in cents
      actualWinnings: 0,
      status: "lost",
      placedAt: "2025-09-15T17:00:00Z",
      settledAt: "2025-09-15T19:20:00Z",
      selections: [{
        fixtureId: "2",
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        league: "Premier League",
        market: "both_teams_to_score",
        selection: "yes",
        odds: "1.80",
        status: "lost",
        result: "Match ended 0-0, both teams did not score"
      }]
    }
  ];

  // Filter match results
  const filteredResults = mockResults.filter(result => {
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

    if (statusFilter !== 'all' && result.status !== statusFilter) {
      return false;
    }

    if (dateFilter) {
      const resultDate = new Date(result.startTime);
      const filterDate = new Date(dateFilter);
      if (resultDate.toDateString() !== filterDate.toDateString()) {
        return false;
      }
    }

    return true;
  });

  // Get unique leagues for filter dropdown
  const leagues = Array.from(new Set(mockResults.map(result => result.league)));

  const getResultIcon = (homeScore: number, awayScore: number, selection: string) => {
    if (selection === 'home' && homeScore > awayScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (selection === 'away' && awayScore > homeScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (selection === 'draw' && homeScore === awayScore) return <CheckCircle className="h-4 w-4 text-green-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  const formatCurrency = (cents: number) => `£${(cents / 100).toFixed(2)}`;

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
          <Button variant="outline" data-testid="button-refresh">
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

            <div className="min-w-[150px]">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="postponed">Postponed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px]">
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(dateFilter, "LLL dd, y") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="results" className="space-y-6">
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
              <CardTitle>Match Results ({filteredResults.length} matches)</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredResults.length === 0 ? (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No match results found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredResults.map((result) => (
                    <div 
                      key={result.id} 
                      className="border rounded-lg p-4 hover-elevate transition-all duration-200" 
                      data-testid={`result-card-${result.id}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-lg font-semibold">
                            {result.homeTeam} vs {result.awayTeam}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {result.league} • {result.round}
                          </p>
                        </div>
                        <Badge variant={result.status === 'finished' ? 'default' : 'secondary'}>
                          {result.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="flex justify-between items-center">
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
              <CardTitle>Recent Bet Settlements</CardTitle>
            </CardHeader>
            <CardContent>
              {mockBetResults.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No bet settlements found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mockBetResults.map((bet) => (
                    <div 
                      key={bet.id} 
                      className="border rounded-lg p-4 hover-elevate transition-all duration-200" 
                      data-testid={`settlement-card-${bet.id}`}
                    >
                      <div className="flex justify-between items-start mb-3">
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
                            Stake: {formatCurrency(bet.totalStake)}
                          </p>
                          <p className={`text-sm ${bet.status === 'won' ? 'text-green-600' : 'text-red-600'}`}>
                            {bet.status === 'won' ? 
                              `Won: ${formatCurrency(bet.actualWinnings)}` :
                              `Lost: ${formatCurrency(bet.totalStake)}`
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {bet.selections.map((selection, index) => (
                          <div key={index} className="flex justify-between items-center text-sm">
                            <div className="flex items-center space-x-2">
                              {getResultIcon(
                                mockResults.find(r => r.id === selection.fixtureId)?.homeScore || 0,
                                mockResults.find(r => r.id === selection.fixtureId)?.awayScore || 0,
                                selection.selection
                              )}
                              <div>
                                <div className="font-medium">
                                  {selection.homeTeam} vs {selection.awayTeam}
                                </div>
                                <div className="text-muted-foreground">
                                  {selection.market}: {selection.selection} @ {selection.odds}
                                </div>
                              </div>
                            </div>
                            <Badge 
                              variant={selection.status === 'won' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {selection.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-between items-center mt-3 pt-3 border-t text-sm text-muted-foreground">
                        <div>
                          Placed: {new Date(bet.placedAt).toLocaleString()}
                        </div>
                        <div>
                          Settled: {new Date(bet.settledAt).toLocaleString()}
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
    </div>
  );
}

export default Results;