import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Plus, 
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Calendar,
  MapPin,
  Target,
  Activity,
  Download,
  Upload,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Zap,
  Globe,
  Timer,
  Settings,
  DollarSign,
  AlertCircle,
  TrendingUp,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

// Types
interface Match {
  id: string;
  externalId?: string;
  sport: string;
  sportId?: string;
  sportName?: string;
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
  marketsCount: number;
  totalExposure: number;
  simulatedResult?: {
    homeScore: number;
    awayScore: number;
    winner: 'home' | 'away' | 'draw';
  };
  createdAt: string;
  updatedAt: string;
}

interface MatchEvent {
  id?: string;
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty';
  minute: number;
  team: 'home' | 'away';
  playerName?: string;
  description: string;
}

interface MarketSetup {
  type: '1x2' | 'totals' | 'btts' | 'handicap' | 'correct_score';
  name: string;
  outcomes: {
    key: string;
    label: string;
    odds: number;
  }[];
}

interface Sport {
  id: number;
  name: string;
  displayName: string;
}

interface League {
  id: string;
  name: string;
  sport: string;
  matches: Match[];
}

interface GroupedMatches {
  sport: Sport;
  leagues: League[];
  liveCount: number;
  upcomingCount: number;
}

interface MatchFilters {
  search: string;
  sport: string;
  status: 'all' | 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  source: 'all' | 'manual' | 'sportmonks';
  dateFrom: string;
  dateTo: string;
  league: string;
}

interface CreateMatchData {
  sport: string;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffTime: string;
  markets: MarketSetup[];
  events: MatchEvent[];
  simulatedResult: {
    homeScore: number;
    awayScore: number;
    winner: 'home' | 'away' | 'draw';
  };
}

const MATCH_STATUS_COLORS = {
  scheduled: 'default',
  live: 'destructive', 
  finished: 'secondary',
  cancelled: 'outline',
  postponed: 'outline'
} as const;

const MATCH_STATUS_ICONS = {
  scheduled: Clock,
  live: PlayCircle,
  finished: CheckCircle,
  cancelled: XCircle,
  postponed: PauseCircle
} as const;

export default function AdminMatchesMarkets() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // State management
  const [filters, setFilters] = useState<MatchFilters>({
    search: '',
    sport: 'all',
    status: 'all',
    source: 'all',
    dateFrom: '',
    dateTo: '',
    league: ''
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped');
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [createStep, setCreateStep] = useState(1);
  
  // Create match form data
  const [createMatchData, setCreateMatchData] = useState<CreateMatchData>({
    sport: '',
    leagueName: '',
    homeTeamName: '',
    awayTeamName: '',
    kickoffTime: '',
    markets: [],
    events: [],
    simulatedResult: {
      homeScore: 0,
      awayScore: 0,
      winner: 'draw'
    }
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0
  });

  // Sports data - mock data for now, can be replaced with API call
  const sportsData = [
    { id: 1, name: 'football', displayName: 'Football' },
    { id: 2, name: 'basketball', displayName: 'Basketball' },
    { id: 3, name: 'tennis', displayName: 'Tennis' },
    { id: 4, name: 'soccer', displayName: 'Soccer' },
    { id: 5, name: 'baseball', displayName: 'Baseball' },
    { id: 6, name: 'hockey', displayName: 'Hockey' },
    { id: 7, name: 'rugby', displayName: 'Rugby' },
    { id: 8, name: 'cricket', displayName: 'Cricket' }
  ];

  // Fetch sports from API
  const { data: sportsResponse } = useQuery({
    queryKey: ['/api/sports'],
    queryFn: async () => {
      const response = await adminApiRequest('GET', '/api/sports');
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const availableSports = sportsResponse?.data || sportsData;

  // Fetch matches with React Query
  const { data: matchesResponse, isLoading, error, refetch } = useQuery({
    queryKey: [
      '/api/admin/matches',
      pagination.page,
      pagination.limit,
      filters.search,
      filters.status,
      filters.source,
      filters.dateFrom,
      filters.dateTo,
      filters.league
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.source !== 'all') params.append('source', filters.source);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.league) params.append('league', filters.league);

      const response = await adminApiRequest('GET', `/api/admin/matches?${params.toString()}`);
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds for live matches
  });

  const matches = matchesResponse?.data?.matches || [];
  const totalMatches = matchesResponse?.data?.total || 0;

  // Update pagination total when data changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, total: totalMatches }));
  }, [totalMatches]);

  // Mutations
  const createMatchMutation = useMutation({
    mutationFn: async (data: CreateMatchData) => {
      const response = await adminApiRequest('POST', '/api/admin/matches', data);
      if (!response.ok) {
        throw new Error('Failed to create match');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: "Match created successfully",
      });
      setShowCreateModal(false);
      setCreateMatchData({
        sport: '',
        leagueName: '',
        homeTeamName: '',
        awayTeamName: '',
        kickoffTime: '',
        markets: [],
        events: [],
        simulatedResult: {
          homeScore: 0,
          awayScore: 0,
          winner: 'draw'
        }
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create match",
        variant: "destructive",
      });
    },
  });

  const deleteMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await adminApiRequest('DELETE', `/api/admin/matches/${matchId}`);
      if (!response.ok) {
        throw new Error('Failed to delete match');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: "Match deleted successfully",
      });
      setShowDeleteModal(false);
      setSelectedMatch(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete match",
        variant: "destructive",
      });
    },
  });

  const importSportMonksMutation = useMutation({
    mutationFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/matches/import-sportmonks');
      if (!response.ok) {
        throw new Error('Failed to import from SportMonks');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches'] });
      toast({
        title: "Success",
        description: `Imported ${data.imported || 0} matches from SportMonks`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error", 
        description: "Failed to import from SportMonks",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handleFilterChange = (key: keyof MatchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      sport: 'all',
      status: 'all',
      source: 'all',
      dateFrom: '',
      dateTo: '',
      league: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const openMarketEditor = (match: Match) => {
    setLocation(`/prime-admin/matches/${match.id}/markets`);
  };

  const openDeleteModal = (match: Match) => {
    setSelectedMatch(match);
    setShowDeleteModal(true);
  };

  const formatMatchTime = (kickoffTime: string) => {
    try {
      return format(parseISO(kickoffTime), 'dd/MM/yyyy HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = MATCH_STATUS_ICONS[status as keyof typeof MATCH_STATUS_ICONS] || Clock;
    return <IconComponent className="w-4 h-4" />;
  };

  // Group matches by sport and league
  const groupMatchesBySportAndLeague = (matches: Match[]): GroupedMatches[] => {
    const grouped = matches.reduce((acc, match) => {
      const sportKey = match.sport || 'Football';
      const leagueKey = match.leagueName;

      if (!acc[sportKey]) {
        const sport = availableSports.find((s: Sport) => s.name.toLowerCase() === sportKey.toLowerCase()) || 
                     { id: 0, name: sportKey, displayName: sportKey };
        acc[sportKey] = {
          sport,
          leagues: {},
          liveCount: 0,
          upcomingCount: 0
        };
      }

      if (!acc[sportKey].leagues[leagueKey]) {
        acc[sportKey].leagues[leagueKey] = {
          id: match.leagueId,
          name: leagueKey,
          sport: sportKey,
          matches: []
        };
      }

      acc[sportKey].leagues[leagueKey].matches.push(match);

      if (match.status === 'live') {
        acc[sportKey].liveCount++;
      } else if (match.status === 'scheduled') {
        acc[sportKey].upcomingCount++;
      }

      return acc;
    }, {} as Record<string, { sport: Sport; leagues: Record<string, League>; liveCount: number; upcomingCount: number; }>);

    return Object.values(grouped).map(item => ({
      ...item,
      leagues: Object.values(item.leagues)
    }));
  };

  const toggleSportExpansion = (sportName: string) => {
    setExpandedSports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sportName)) {
        newSet.delete(sportName);
      } else {
        newSet.add(sportName);
      }
      return newSet;
    });
  };

  const totalPages = Math.ceil(totalMatches / pagination.limit);
  const groupedMatches = groupMatchesBySportAndLeague(matches);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-matches-title">
            <Globe className="w-8 h-8 text-primary" />
            Matches & Markets
          </h1>
          <p className="text-muted-foreground">
            Manage matches, markets, and betting options across all sports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grouped' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grouped')}
              data-testid="button-grouped-view"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Grouped
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              data-testid="button-table-view"
            >
              <Target className="w-4 h-4 mr-2" />
              Table
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-matches"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importSportMonksMutation.mutate()}
            disabled={importSportMonksMutation.isPending}
            data-testid="button-import-sportmonks"
          >
            <Download className="w-4 h-4 mr-2" />
            Import SportMonks
          </Button>
          <Button
            onClick={() => setShowCreateModal(true)}
            data-testid="button-create-match"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Match
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by team names, league, or match ID..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10"
                data-testid="input-search-matches"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {Object.values(filters).some(v => v && v !== 'all') && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t pt-4 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="sport-filter">Sport</Label>
                  <Select
                    value={filters.sport}
                    onValueChange={(value) => handleFilterChange('sport', value)}
                  >
                    <SelectTrigger id="sport-filter" data-testid="select-sport-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {availableSports.map((sport: Sport) => (
                        <SelectItem key={sport.id} value={sport.name.toLowerCase()}>
                          {sport.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status-filter">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) => handleFilterChange('status', value)}
                  >
                    <SelectTrigger id="status-filter" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="postponed">Postponed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="source-filter">Source</Label>
                  <Select
                    value={filters.source}
                    onValueChange={(value) => handleFilterChange('source', value)}
                  >
                    <SelectTrigger id="source-filter" data-testid="select-source-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="sportmonks">SportMonks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="date-from">From Date</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    data-testid="input-date-from-filter"
                  />
                </div>

                <div>
                  <Label htmlFor="date-to">To Date</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    data-testid="input-date-to-filter"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Matches Display */}
      {viewMode === 'grouped' ? (
        /* Grouped View - Matches organized by Sport and League */
        <div className="space-y-6">
          {isLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                  <span>Loading matches from all sports...</span>
                </div>
              </CardContent>
            </Card>
          ) : groupedMatches.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No matches found</h3>
                <p className="text-muted-foreground mb-4">
                  {Object.values(filters).some(v => v && v !== 'all') ? 
                    'No matches found matching your current filters.' : 
                    'No matches are currently available.'
                  }
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Match
                </Button>
              </CardContent>
            </Card>
          ) : (
            groupedMatches.map((sportGroup) => (
              <Card key={sportGroup.sport.name} className="overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover-elevate transition-colors"
                  onClick={() => toggleSportExpansion(sportGroup.sport.name)}
                >
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedSports.has(sportGroup.sport.name) ? 
                        <ChevronDown className="w-5 h-5" /> : 
                        <ChevronRight className="w-5 h-5" />
                      }
                      <Globe className="w-6 h-6 text-primary" />
                      <span className="text-xl">{sportGroup.sport.displayName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {sportGroup.liveCount > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {sportGroup.liveCount} Live
                        </Badge>
                      )}
                      {sportGroup.upcomingCount > 0 && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {sportGroup.upcomingCount} Upcoming
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {sportGroup.leagues.reduce((total, league) => total + league.matches.length, 0)} matches
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                
                <AnimatePresence>
                  {expandedSports.has(sportGroup.sport.name) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CardContent className="pt-0">
                        <div className="space-y-6">
                          {sportGroup.leagues.map((league) => (
                            <div key={league.id} className="space-y-2">
                              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                                <Trophy className="w-4 h-4 text-primary" />
                                <span className="font-semibold">{league.name}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {league.matches.length} matches
                                </Badge>
                              </div>
                              
                              <div className="grid gap-2">
                                {league.matches
                                  .sort((a, b) => {
                                    // Sort: live first, then by kickoff time
                                    if (a.status === 'live' && b.status !== 'live') return -1;
                                    if (b.status === 'live' && a.status !== 'live') return 1;
                                    return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
                                  })
                                  .map((match) => (
                                    <div
                                      key={match.id}
                                      className={`p-4 rounded-lg border hover-elevate transition-all ${
                                        match.status === 'live' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' :
                                        match.status === 'scheduled' ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' :
                                        'border-muted bg-background'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-3">
                                            <div className="font-semibold text-lg">
                                              {match.homeTeamName} vs {match.awayTeamName}
                                            </div>
                                            <Badge 
                                              variant={MATCH_STATUS_COLORS[match.status] as any}
                                              className="flex items-center gap-1"
                                            >
                                              {getStatusIcon(match.status)}
                                              {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                                            </Badge>
                                            {match.isManual && (
                                              <Badge variant="secondary">
                                                Manual
                                              </Badge>
                                            )}
                                          </div>
                                          
                                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <Calendar className="w-3 h-3" />
                                              {formatMatchTime(match.kickoffTime)}
                                            </div>
                                            {(match.status === 'finished' || match.status === 'live') && (
                                              <div className="flex items-center gap-1 font-mono font-bold">
                                                <span>Score:</span>
                                                <span>{match.homeScore} - {match.awayScore}</span>
                                              </div>
                                            )}
                                            <div className="flex items-center gap-1">
                                              <Target className="w-3 h-3" />
                                              {match.marketsCount} markets
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <DollarSign className="w-3 h-3" />
                                              £{(match.totalExposure / 100).toLocaleString()} exposure
                                            </div>
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openMarketEditor(match)}
                                            data-testid={`button-manage-markets-${match.id}`}
                                          >
                                            <Target className="w-4 h-4 mr-2" />
                                            Markets
                                          </Button>
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="w-4 h-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem onClick={() => setLocation(`/prime-admin/matches/${match.id}/exposure`)}>
                                                <Activity className="w-4 h-4 mr-2" />
                                                View Exposure
                                              </DropdownMenuItem>
                                              <DropdownMenuItem onClick={() => openDeleteModal(match)}>
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete Match
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))
          )}
        </div>
      ) : (
        /* Table View - Traditional table layout */
        <Card>
          <CardHeader>
            <CardTitle>Matches ({totalMatches.toLocaleString()})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sport</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>League</TableHead>
                    <TableHead>Kickoff Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Markets</TableHead>
                    <TableHead>Exposure</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={10} className="h-12">
                          <div className="flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            Loading matches...
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : matches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <div className="text-muted-foreground">
                          {Object.values(filters).some(v => v && v !== 'all') ? 
                            'No matches found matching your filters' : 
                            'No matches found'
                          }
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    matches.map((match: Match) => (
                      <TableRow key={match.id} className="hover-elevate">
                        <TableCell>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {match.sport || 'Football'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-semibold" data-testid={`text-match-${match.id}`}>
                              {match.homeTeamName} vs {match.awayTeamName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID: {match.id.slice(-8)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span data-testid={`text-league-${match.id}`}>
                              {match.leagueName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm" data-testid={`text-kickoff-${match.id}`}>
                              {formatMatchTime(match.kickoffTime)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={MATCH_STATUS_COLORS[match.status] as any}
                            className="flex items-center gap-1"
                            data-testid={`badge-status-${match.id}`}
                          >
                            {getStatusIcon(match.status)}
                            {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {match.status === 'finished' || match.status === 'live' ? (
                            <span className="font-mono" data-testid={`text-score-${match.id}`}>
                              {match.homeScore} - {match.awayScore}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-muted-foreground" />
                            <span data-testid={`text-markets-count-${match.id}`}>
                              {match.marketsCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span 
                            className={`font-mono ${match.totalExposure > 100000 ? 'text-red-500' : 'text-green-500'}`}
                            data-testid={`text-exposure-${match.id}`}
                          >
                            £{(match.totalExposure / 100).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={match.isManual ? 'default' : 'secondary'}>
                            {match.isManual ? 'Manual' : 'SportMonks'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                data-testid={`button-match-actions-${match.id}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openMarketEditor(match)}>
                                <Target className="w-4 h-4 mr-2" />
                                Manage Markets
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/prime-admin/matches/${match.id}/exposure`)}>
                                <Activity className="w-4 h-4 mr-2" />
                                View Exposure
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openDeleteModal(match)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Match
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min((pagination.page - 1) * pagination.limit + 1, totalMatches)} to{' '}
            {Math.min(pagination.page * pagination.limit, totalMatches)} of {totalMatches} matches
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Enhanced Create Match Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => {
        setShowCreateModal(open);
        if (!open) {
          setCreateStep(1);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="modal-create-match">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Create New Match
            </DialogTitle>
            <DialogDescription>
              Create a new match with comprehensive settings for any sport
            </DialogDescription>
            
            {/* Progress Indicator */}
            <div className="flex items-center gap-2 mt-4">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    createStep === step ? 'bg-primary text-primary-foreground' :
                    createStep > step ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {createStep > step ? <CheckCircle className="w-4 h-4" /> : step}
                  </div>
                  {step < 3 && (
                    <div className={`w-12 h-0.5 mx-2 transition-colors ${
                      createStep > step ? 'bg-green-400' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            
            <div className="text-sm text-muted-foreground">
              {createStep === 1 && 'Step 1: Basic Match Information'}
              {createStep === 2 && 'Step 2: Markets & Odds Configuration'}
              {createStep === 3 && 'Step 3: Match Simulation Settings'}
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Step 1: Basic Information */}
            {createStep === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sport-select">Sport</Label>
                  <Select
                    value={createMatchData.sport}
                    onValueChange={(value) => setCreateMatchData(prev => ({ ...prev, sport: value }))}
                  >
                    <SelectTrigger id="sport-select" data-testid="select-create-sport">
                      <SelectValue placeholder="Choose a sport" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSports.map((sport: Sport) => (
                        <SelectItem key={sport.id} value={sport.name.toLowerCase()}>
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            {sport.displayName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="league-name">League Name</Label>
                  <Input
                    id="league-name"
                    value={createMatchData.leagueName}
                    onChange={(e) => setCreateMatchData(prev => ({ ...prev, leagueName: e.target.value }))}
                    placeholder="e.g., Premier League, NBA, ATP Tour"
                    data-testid="input-create-league"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="home-team">Home Team/Player</Label>
                    <Input
                      id="home-team"
                      value={createMatchData.homeTeamName}
                      onChange={(e) => setCreateMatchData(prev => ({ ...prev, homeTeamName: e.target.value }))}
                      placeholder="Home team or player"
                      data-testid="input-create-home-team"
                    />
                  </div>
                  <div>
                    <Label htmlFor="away-team">Away Team/Player</Label>
                    <Input
                      id="away-team"
                      value={createMatchData.awayTeamName}
                      onChange={(e) => setCreateMatchData(prev => ({ ...prev, awayTeamName: e.target.value }))}
                      placeholder="Away team or player"
                      data-testid="input-create-away-team"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="kickoff-time">Match Start Time</Label>
                  <Input
                    id="kickoff-time"
                    type="datetime-local"
                    value={createMatchData.kickoffTime}
                    onChange={(e) => setCreateMatchData(prev => ({ ...prev, kickoffTime: e.target.value }))}
                    data-testid="input-create-kickoff"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set the date and time when the match will begin
                  </p>
                </div>
              </div>
            )}
            
            {/* Step 2: Markets & Odds */}
            {createStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Markets & Odds Configuration</h3>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">Match Winner Market</span>
                    <Badge variant="default">Default</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Home Win Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="2.50"
                        className="mt-1"
                        data-testid="input-home-odds"
                      />
                    </div>
                    <div>
                      <Label>Draw Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="3.20"
                        className="mt-1"
                        data-testid="input-draw-odds"
                      />
                    </div>
                    <div>
                      <Label>Away Win Odds</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="2.80"
                        className="mt-1"
                        data-testid="input-away-odds"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="p-4 border-2 border-dashed border-muted rounded-lg text-center">
                  <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">Additional Markets</p>
                  <Button variant="outline" size="sm" data-testid="button-add-market">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Market (Over/Under, Asian Handicap, etc.)
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Info className="w-4 h-4 text-blue-500" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Default markets will be created automatically. You can add more markets after match creation.
                  </p>
                </div>
              </div>
            )}
            
            {/* Step 3: Simulation Settings */}
            {createStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Match Simulation Settings</h3>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4" />
                    <span className="font-medium">Predicted Result (for simulation)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Home Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={createMatchData.simulatedResult.homeScore}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            homeScore: parseInt(e.target.value) || 0
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-home-score"
                      />
                    </div>
                    <div>
                      <Label>Away Score</Label>
                      <Input
                        type="number"
                        min="0"
                        value={createMatchData.simulatedResult.awayScore}
                        onChange={(e) => setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            awayScore: parseInt(e.target.value) || 0
                          }
                        }))}
                        className="mt-1"
                        data-testid="input-away-score"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <Label>Match Winner</Label>
                    <Select
                      value={createMatchData.simulatedResult.winner}
                      onValueChange={(value: 'home' | 'away' | 'draw') => 
                        setCreateMatchData(prev => ({
                          ...prev,
                          simulatedResult: {
                            ...prev.simulatedResult,
                            winner: value
                          }
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1" data-testid="select-winner">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">Home Team Win</SelectItem>
                        <SelectItem value="away">Away Team Win</SelectItem>
                        <SelectItem value="draw">Draw</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="p-4 border-2 border-dashed border-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Match Events (Goals, Cards, etc.)</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add specific match events with timing for realistic simulation
                  </p>
                  <Button variant="outline" size="sm" data-testid="button-add-event">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Match Event
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    These settings help create realistic live match simulations for testing betting scenarios.
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {createStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setCreateStep(prev => prev - 1)}
                    data-testid="button-previous-step"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                
                {createStep < 3 ? (
                  <Button
                    onClick={() => setCreateStep(prev => prev + 1)}
                    disabled={
                      createStep === 1 && (
                        !createMatchData.sport ||
                        !createMatchData.leagueName ||
                        !createMatchData.homeTeamName ||
                        !createMatchData.awayTeamName ||
                        !createMatchData.kickoffTime
                      )
                    }
                    data-testid="button-next-step"
                  >
                    Next Step
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      createMatchMutation.mutate({
                        sport: createMatchData.sport,
                        leagueName: createMatchData.leagueName,
                        homeTeamName: createMatchData.homeTeamName,
                        awayTeamName: createMatchData.awayTeamName,
                        kickoffTime: createMatchData.kickoffTime,
                        markets: createMatchData.markets,
                        events: createMatchData.events,
                        simulatedResult: createMatchData.simulatedResult
                      });
                    }}
                    disabled={createMatchMutation.isPending}
                    data-testid="button-confirm-create-match"
                  >
                    {createMatchMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Creating Match...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Match
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Match Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent data-testid="modal-delete-match">
          <DialogHeader>
            <DialogTitle>Delete Match</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this match? This action cannot be undone and will also delete all associated markets and bets.
            </DialogDescription>
          </DialogHeader>
          {selectedMatch && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="font-semibold">
                {selectedMatch.homeTeamName} vs {selectedMatch.awayTeamName}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedMatch.leagueName} • {formatMatchTime(selectedMatch.kickoffTime)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedMatch && deleteMatchMutation.mutate(selectedMatch.id)}
              disabled={deleteMatchMutation.isPending}
              data-testid="button-confirm-delete-match"
            >
              {deleteMatchMutation.isPending ? 'Deleting...' : 'Delete Match'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}