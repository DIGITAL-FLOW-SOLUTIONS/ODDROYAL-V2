import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  Clock
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
  createdAt: string;
  updatedAt: string;
}

interface MatchFilters {
  search: string;
  status: 'all' | 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
  source: 'all' | 'manual' | 'sportmonks';
  dateFrom: string;
  dateTo: string;
  league: string;
}

interface CreateMatchData {
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffTime: string;
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
  
  // Create match form data
  const [createMatchData, setCreateMatchData] = useState<CreateMatchData>({
    leagueName: '',
    homeTeamName: '',
    awayTeamName: '',
    kickoffTime: ''
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0
  });

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
        leagueName: '',
        homeTeamName: '',
        awayTeamName: '',
        kickoffTime: ''
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

  const totalPages = Math.ceil(totalMatches / pagination.limit);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-matches-title">
            Matches & Markets
          </h1>
          <p className="text-muted-foreground">
            Manage matches, markets, and betting options
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Matches Table */}
      <Card>
        <CardHeader>
          <CardTitle>Matches ({totalMatches.toLocaleString()})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                      <TableCell colSpan={9} className="h-12">
                        <div className="flex items-center justify-center">
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          Loading matches...
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : matches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
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

      {/* Create Match Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent data-testid="modal-create-match">
          <DialogHeader>
            <DialogTitle>Create New Match</DialogTitle>
            <DialogDescription>
              Create a new match manually. You can also import matches from SportMonks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="league-name">League Name</Label>
              <Input
                id="league-name"
                placeholder="e.g., Premier League"
                value={createMatchData.leagueName}
                onChange={(e) => setCreateMatchData(prev => ({ ...prev, leagueName: e.target.value }))}
                data-testid="input-create-league"
              />
            </div>
            <div>
              <Label htmlFor="home-team">Home Team</Label>
              <Input
                id="home-team"
                placeholder="e.g., Manchester United"
                value={createMatchData.homeTeamName}
                onChange={(e) => setCreateMatchData(prev => ({ ...prev, homeTeamName: e.target.value }))}
                data-testid="input-create-home-team"
              />
            </div>
            <div>
              <Label htmlFor="away-team">Away Team</Label>
              <Input
                id="away-team"
                placeholder="e.g., Liverpool"
                value={createMatchData.awayTeamName}
                onChange={(e) => setCreateMatchData(prev => ({ ...prev, awayTeamName: e.target.value }))}
                data-testid="input-create-away-team"
              />
            </div>
            <div>
              <Label htmlFor="kickoff-time">Kickoff Time</Label>
              <Input
                id="kickoff-time"
                type="datetime-local"
                value={createMatchData.kickoffTime}
                onChange={(e) => setCreateMatchData(prev => ({ ...prev, kickoffTime: e.target.value }))}
                data-testid="input-create-kickoff"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMatchMutation.mutate(createMatchData)}
              disabled={createMatchMutation.isPending}
              data-testid="button-confirm-create-match"
            >
              {createMatchMutation.isPending ? 'Creating...' : 'Create Match'}
            </Button>
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