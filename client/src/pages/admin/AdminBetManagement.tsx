import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Eye, 
  MoreHorizontal,
  Calculator,
  XCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  Trophy,
  Target,
  FileText,
  Download,
  User,
  Calendar,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";
import { currencyUtils } from "@shared/schema";

// Types
interface AdminBet {
  id: string;
  userId: string;
  username: string;
  userEmail: string;
  betType: 'single' | 'express' | 'system';
  totalStakeCents: number;
  potentialWinCents: number;
  actualWinCents?: number;
  status: 'pending' | 'settled_win' | 'settled_lose' | 'voided' | 'refunded';
  placedAt: string;
  settledAt?: string;
  selectionsCount: number;
  selections: BetSelection[];
  totalOdds: number;
  ipAddress?: string;
}

interface BetSelection {
  id: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  selection: string;
  odds: string;
  status: 'pending' | 'win' | 'lose' | 'void' | 'push';
}

interface BetFilters {
  search: string;
  status: 'all' | 'pending' | 'settled_win' | 'settled_lose' | 'voided' | 'refunded';
  betType: 'all' | 'single' | 'express' | 'system';
  dateFrom: string;
  dateTo: string;
  minStake: string;
  maxStake: string;
  userId: string;
}

interface ForceSettleData {
  betId: string;
  outcome: 'win' | 'lose' | 'void';
  reason: string;
  payoutCents?: number;
}

const BET_STATUS_COLORS = {
  pending: 'default',
  settled_win: 'default',
  settled_lose: 'destructive',
  voided: 'secondary',
  refunded: 'outline'
} as const;

const BET_STATUS_ICONS = {
  pending: Clock,
  settled_win: CheckCircle,
  settled_lose: XCircle,
  voided: AlertTriangle,
  refunded: Calculator
} as const;

const SELECTION_STATUS_COLORS = {
  pending: 'default',
  win: 'default',
  lose: 'destructive', 
  void: 'secondary',
  push: 'outline'
} as const;

export default function AdminBetManagement() {
  const { toast } = useToast();
  
  // State management
  const [filters, setFilters] = useState<BetFilters>({
    search: '',
    status: 'all',
    betType: 'all',
    dateFrom: '',
    dateTo: '',
    minStake: '',
    maxStake: '',
    userId: ''
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBet, setSelectedBet] = useState<AdminBet | null>(null);
  const [showBetDetail, setShowBetDetail] = useState(false);
  const [showForceSettleModal, setShowForceSettleModal] = useState(false);
  
  // Force settle form data
  const [forceSettleData, setForceSettleData] = useState<ForceSettleData>({
    betId: '',
    outcome: 'win',
    reason: '',
    payoutCents: 0
  });

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0
  });

  // Fetch bets with React Query
  const { data: betsResponse, isLoading, error, refetch } = useQuery({
    queryKey: [
      '/api/admin/bets',
      pagination.page,
      pagination.limit,
      filters.search,
      filters.status,
      filters.betType,
      filters.dateFrom,
      filters.dateTo,
      filters.minStake,
      filters.maxStake,
      filters.userId
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.betType !== 'all') params.append('betType', filters.betType);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.minStake) {
        params.append('minStake', currencyUtils.poundsToCents(filters.minStake).toString());
      }
      if (filters.maxStake) {
        params.append('maxStake', currencyUtils.poundsToCents(filters.maxStake).toString());
      }
      if (filters.userId) params.append('userId', filters.userId);

      const response = await adminApiRequest('GET', `/api/admin/bets?${params.toString()}`);
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const bets = betsResponse?.data?.bets || [];
  const totalBets = betsResponse?.data?.total || 0;

  // Update pagination total when data changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, total: totalBets }));
  }, [totalBets]);

  // Mutations
  const forceSettleMutation = useMutation({
    mutationFn: async (data: ForceSettleData) => {
      const response = await adminApiRequest('POST', `/api/admin/bets/${data.betId}/force-settle`, {
        outcome: data.outcome,
        reason: data.reason,
        payoutCents: data.payoutCents
      });
      if (!response.ok) {
        throw new Error('Failed to force settle bet');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bets'] });
      toast({
        title: "Success",
        description: "Bet force settled successfully",
      });
      setShowForceSettleModal(false);
      setShowBetDetail(false);
      setForceSettleData({ betId: '', outcome: 'win', reason: '', payoutCents: 0 });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to force settle bet",
        variant: "destructive",
      });
    },
  });

  const refundBetMutation = useMutation({
    mutationFn: async (betId: string) => {
      const response = await adminApiRequest('POST', `/api/admin/bets/${betId}/refund`);
      if (!response.ok) {
        throw new Error('Failed to refund bet');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bets'] });
      toast({
        title: "Success",
        description: "Bet refunded successfully",
      });
      setShowBetDetail(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to refund bet",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handleFilterChange = (key: keyof BetFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      betType: 'all',
      dateFrom: '',
      dateTo: '',
      minStake: '',
      maxStake: '',
      userId: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const openBetDetail = (bet: AdminBet) => {
    setSelectedBet(bet);
    setShowBetDetail(true);
  };

  const openForceSettle = (bet: AdminBet) => {
    setForceSettleData({
      betId: bet.id,
      outcome: 'win',
      reason: '',
      payoutCents: bet.potentialWinCents
    });
    setShowForceSettleModal(true);
  };

  const formatDateTime = (dateTimeString: string) => {
    try {
      return format(parseISO(dateTimeString), 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = BET_STATUS_ICONS[status as keyof typeof BET_STATUS_ICONS] || Clock;
    return <IconComponent className="w-4 h-4" />;
  };

  const calculatePotentialReturn = (stakeCents: number, odds: number) => {
    return Math.round(stakeCents * odds);
  };

  const totalPages = Math.ceil(totalBets / pagination.limit);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-bets-title">
            Bet Management
          </h1>
          <p className="text-muted-foreground">
            View, filter, and manage all customer bets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-bets"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-export-bets"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Bets</p>
                <p className="text-2xl font-bold" data-testid="text-total-bets">
                  {totalBets.toLocaleString()}
                </p>
              </div>
              <Trophy className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-500" data-testid="text-pending-bets">
                  {bets.filter((b: AdminBet) => b.status === 'pending').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Won Today</p>
                <p className="text-2xl font-bold text-green-500" data-testid="text-won-bets">
                  {bets.filter((b: AdminBet) => b.status === 'settled_win').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Lost Today</p>
                <p className="text-2xl font-bold text-red-500" data-testid="text-lost-bets">
                  {bets.filter((b: AdminBet) => b.status === 'settled_lose').length}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by bet ID, username, or match..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10"
                data-testid="input-search-bets"
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="settled_win">Won</SelectItem>
                      <SelectItem value="settled_lose">Lost</SelectItem>
                      <SelectItem value="voided">Voided</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="bet-type-filter">Bet Type</Label>
                  <Select
                    value={filters.betType}
                    onValueChange={(value) => handleFilterChange('betType', value)}
                  >
                    <SelectTrigger id="bet-type-filter" data-testid="select-bet-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="express">Express/Accumulator</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="min-stake">Min Stake (£)</Label>
                  <Input
                    id="min-stake"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={filters.minStake}
                    onChange={(e) => handleFilterChange('minStake', e.target.value)}
                    data-testid="input-min-stake-filter"
                  />
                </div>

                <div>
                  <Label htmlFor="max-stake">Max Stake (£)</Label>
                  <Input
                    id="max-stake"
                    type="number"
                    step="0.01"
                    placeholder="10000.00"
                    value={filters.maxStake}
                    onChange={(e) => handleFilterChange('maxStake', e.target.value)}
                    data-testid="input-max-stake-filter"
                  />
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

      {/* Bets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Bets ({totalBets.toLocaleString()})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bet ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Stake</TableHead>
                  <TableHead>Potential Win</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Selections</TableHead>
                  <TableHead>Placed</TableHead>
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
                          Loading bets...
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : bets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="text-muted-foreground">
                        {Object.values(filters).some(v => v && v !== 'all') ? 
                          'No bets found matching your filters' : 
                          'No bets found'
                        }
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  bets.map((bet: AdminBet) => (
                    <TableRow key={bet.id} className="hover-elevate">
                      <TableCell className="font-mono text-sm">
                        <span data-testid={`text-bet-id-${bet.id}`}>
                          {bet.id.slice(-8)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-username-${bet.id}`}>
                            {bet.username}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {bet.userEmail}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-bet-type-${bet.id}`}>
                          {bet.betType.charAt(0).toUpperCase() + bet.betType.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono" data-testid={`text-stake-${bet.id}`}>
                            £{currencyUtils.centsToPounds(bet.totalStakeCents)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4 text-muted-foreground" />
                          <span className="font-mono text-green-600" data-testid={`text-potential-win-${bet.id}`}>
                            £{currencyUtils.centsToPounds(bet.potentialWinCents)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={BET_STATUS_COLORS[bet.status] as any}
                          className="flex items-center gap-1"
                          data-testid={`badge-status-${bet.id}`}
                        >
                          {getStatusIcon(bet.status)}
                          {bet.status === 'settled_win' ? 'Won' :
                           bet.status === 'settled_lose' ? 'Lost' :
                           bet.status.charAt(0).toUpperCase() + bet.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span data-testid={`text-selections-count-${bet.id}`}>
                          {bet.selectionsCount} selection{bet.selectionsCount !== 1 ? 's' : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm" data-testid={`text-placed-at-${bet.id}`}>
                            {formatDateTime(bet.placedAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-bet-actions-${bet.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openBetDetail(bet)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {bet.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => openForceSettle(bet)}>
                                  <Zap className="w-4 h-4 mr-2" />
                                  Force Settle
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => refundBetMutation.mutate(bet.id)}>
                                  <Calculator className="w-4 h-4 mr-2" />
                                  Refund Bet
                                </DropdownMenuItem>
                              </>
                            )}
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
            Showing {Math.min((pagination.page - 1) * pagination.limit + 1, totalBets)} to{' '}
            {Math.min(pagination.page * pagination.limit, totalBets)} of {totalBets} bets
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

      {/* Bet Detail Modal */}
      <Dialog open={showBetDetail} onOpenChange={setShowBetDetail}>
        <DialogContent className="max-w-4xl" data-testid="modal-bet-detail">
          <DialogHeader>
            <DialogTitle>Bet Details</DialogTitle>
            <DialogDescription>
              Detailed information about the selected bet
            </DialogDescription>
          </DialogHeader>
          {selectedBet && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="selections">Selections</TabsTrigger>
                <TabsTrigger value="customer">Customer</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Bet ID</p>
                    <p className="font-mono">{selectedBet.id}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Type</p>
                    <Badge variant="outline">
                      {selectedBet.betType.charAt(0).toUpperCase() + selectedBet.betType.slice(1)}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Stake</p>
                    <p className="font-mono text-lg">£{currencyUtils.centsToPounds(selectedBet.totalStakeCents)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Potential Winnings</p>
                    <p className="font-mono text-lg text-green-600">£{currencyUtils.centsToPounds(selectedBet.potentialWinCents)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Status</p>
                    <Badge variant={BET_STATUS_COLORS[selectedBet.status] as any} className="flex items-center gap-1 w-fit">
                      {getStatusIcon(selectedBet.status)}
                      {selectedBet.status === 'settled_win' ? 'Won' :
                       selectedBet.status === 'settled_lose' ? 'Lost' :
                       selectedBet.status.charAt(0).toUpperCase() + selectedBet.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Placed At</p>
                    <p>{formatDateTime(selectedBet.placedAt)}</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="selections" className="space-y-4">
                <div className="space-y-3">
                  {selectedBet.selections.map((selection: BetSelection, index: number) => (
                    <Card key={selection.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {selection.homeTeam} vs {selection.awayTeam}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {selection.league} • {selection.market}
                            </p>
                            <p className="text-sm font-medium">
                              Selection: {selection.selection}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-lg">{selection.odds}</p>
                            <Badge variant={SELECTION_STATUS_COLORS[selection.status] as any}>
                              {selection.status.charAt(0).toUpperCase() + selection.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="customer" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Username</p>
                    <p>{selectedBet.username}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Email</p>
                    <p>{selectedBet.userEmail}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">IP Address</p>
                    <p className="font-mono">{selectedBet.ipAddress || 'N/A'}</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBetDetail(false)}>
              Close
            </Button>
            {selectedBet?.status === 'pending' && (
              <Button onClick={() => openForceSettle(selectedBet)} data-testid="button-force-settle-from-detail">
                <Zap className="w-4 h-4 mr-2" />
                Force Settle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Settle Modal */}
      <Dialog open={showForceSettleModal} onOpenChange={setShowForceSettleModal}>
        <DialogContent data-testid="modal-force-settle">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
              Force Settle Bet
            </DialogTitle>
            <DialogDescription>
              This action will immediately settle the bet. This requires 2FA confirmation and audit logging.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                ⚠️ Force settling bets should only be done in exceptional circumstances and requires proper justification.
              </p>
            </div>
            <div>
              <Label htmlFor="outcome">Outcome</Label>
              <Select
                value={forceSettleData.outcome}
                onValueChange={(value) => setForceSettleData(prev => ({ 
                  ...prev, 
                  outcome: value as 'win' | 'lose' | 'void',
                  payoutCents: value === 'win' ? (selectedBet?.potentialWinCents || 0) : 0
                }))}
              >
                <SelectTrigger id="outcome" data-testid="select-force-settle-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="lose">Lose</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {forceSettleData.outcome === 'win' && (
              <div>
                <Label htmlFor="payout">Payout Amount (£)</Label>
                <Input
                  id="payout"
                  type="number"
                  step="0.01"
                  value={currencyUtils.centsToPounds(forceSettleData.payoutCents || 0)}
                  onChange={(e) => setForceSettleData(prev => ({ 
                    ...prev, 
                    payoutCents: currencyUtils.poundsToCents(e.target.value)
                  }))}
                  data-testid="input-force-settle-payout"
                />
              </div>
            )}
            <div>
              <Label htmlFor="reason">Reason (Required)</Label>
              <Textarea
                id="reason"
                placeholder="Provide a detailed reason for force settling this bet..."
                value={forceSettleData.reason}
                onChange={(e) => setForceSettleData(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
                data-testid="textarea-force-settle-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForceSettleModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => forceSettleMutation.mutate(forceSettleData)}
              disabled={forceSettleMutation.isPending || !forceSettleData.reason.trim()}
              data-testid="button-confirm-force-settle"
            >
              {forceSettleMutation.isPending ? 'Settling...' : 'Force Settle Bet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}