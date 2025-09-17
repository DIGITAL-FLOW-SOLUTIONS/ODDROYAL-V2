import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, adminApiRequest, queryClient } from "@/lib/queryClient";
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Pause, 
  FileDown, 
  Search,
  Clock,
  TrendingUp,
  Activity,
  Shield
} from "lucide-react";

interface SettlementBet {
  id: string;
  userId: string;
  type: string;
  totalStake: number;
  potentialWinnings: number;
  totalOdds: string;
  status: string;
  placedAt: string;
  settledAt?: string;
  actualWinnings?: number;
  selections: SettlementSelection[];
}

interface SettlementSelection {
  id: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  selection: string;
  odds: string;
  result?: string;
  status: string;
}

interface ReconciliationIssue {
  id: string;
  type: 'missing_result' | 'duplicate_result' | 'mismatch';
  description: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  affectedBets: number;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
}

interface SettlementWorkerStatus {
  isRunning: boolean;
  lastRun: string;
  nextRun: string;
  processedBets: number;
  errors: number;
}

export default function AdminSettlement() {
  const { toast } = useToast();
  const [selectedBet, setSelectedBet] = useState<SettlementBet | null>(null);
  const [forceSettleDialogOpen, setForceSettleDialogOpen] = useState(false);
  const [settlementReason, setSettlementReason] = useState("");
  const [settlementOutcome, setSettlementOutcome] = useState<"won" | "lost" | "void">("won");
  const [searchFilters, setSearchFilters] = useState({
    status: "all",
    fixtureId: "",
    dateFrom: "",
    dateTo: ""
  });

  // Fetch pending bets for settlement
  const { data: pendingBets = [], refetch: refetchPendingBets } = useQuery<SettlementBet[]>({
    queryKey: ['/api/admin/settlement/pending'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch reconciliation issues
  const { data: reconciliationIssues = [], refetch: refetchIssues } = useQuery<ReconciliationIssue[]>({
    queryKey: ['/api/admin/settlement/reconciliation-issues']
  });

  // Fetch settlement worker status
  const { data: workerStatus, refetch: refetchWorkerStatus } = useQuery<SettlementWorkerStatus>({
    queryKey: ['/api/admin/settlement/worker-status'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch settlement history
  const { data: settlementHistory = [] } = useQuery<SettlementBet[]>({
    queryKey: ['/api/admin/settlement/history', searchFilters],
  });

  // Force settle bet mutation
  const forceSettleMutation = useMutation({
    mutationFn: async (params: { betId: string; outcome: string; reason: string }) => {
      const response = await adminApiRequest('POST', `/api/admin/settlement/force-settle/${params.betId}`, {
        outcome: params.outcome,
        reason: params.reason
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settlement Forced",
        description: "Bet has been manually settled successfully.",
      });
      setForceSettleDialogOpen(false);
      setSelectedBet(null);
      setSettlementReason("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settlement'] });
    },
    onError: (error) => {
      toast({
        title: "Settlement Failed",
        description: "Failed to force settle bet. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Start/stop settlement worker mutations
  const toggleWorkerMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      const response = await adminApiRequest('POST', `/api/admin/settlement/worker/${action}`);
      return response.json();
    },
    onSuccess: (data, action) => {
      toast({
        title: `Settlement Worker ${action === 'start' ? 'Started' : 'Stopped'}`,
        description: `Auto-settlement has been ${action === 'start' ? 'enabled' : 'disabled'}.`,
      });
      refetchWorkerStatus();
    }
  });

  // Manual reconciliation mutation
  const reconcileMutation = useMutation({
    mutationFn: async (fixtureId: string) => {
      const response = await adminApiRequest('POST', `/api/admin/settlement/reconcile/${fixtureId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reconciliation Triggered",
        description: "Manual reconciliation has been initiated for this fixture.",
      });
      refetchIssues();
      refetchPendingBets();
    }
  });

  // Re-fetch results mutation
  const refetchResultsMutation = useMutation({
    mutationFn: async (fixtureId: string) => {
      const response = await adminApiRequest('POST', `/api/admin/settlement/refetch-results/${fixtureId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Results Re-fetched",
        description: "Fresh results have been fetched from SportMonks.",
      });
      refetchIssues();
    }
  });

  // Export settlement report mutation
  const exportReportMutation = useMutation({
    mutationFn: async (params: { format: 'csv' | 'pdf'; dateFrom: string; dateTo: string }) => {
      const response = await adminApiRequest('POST', `/api/admin/settlement/export`, params);
      const blob = await response.blob();
      return { blob, format: params.format };
    },
    onSuccess: (data) => {
      // Handle file download
      const url = window.URL.createObjectURL(data.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement-report-${new Date().toISOString().split('T')[0]}.${data.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  });

  const handleForceSettle = () => {
    if (!selectedBet || !settlementReason.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a reason for manual settlement.",
        variant: "destructive",
      });
      return;
    }

    forceSettleMutation.mutate({
      betId: selectedBet.id,
      outcome: settlementOutcome,
      reason: settlementReason
    });
  };

  const formatCurrency = (amountCents: number) => {
    return `$${(amountCents / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const statusStyles = {
      pending: "bg-yellow-500",
      won: "bg-green-500",
      lost: "bg-red-500",
      void: "bg-gray-500",
      cancelled: "bg-orange-500"
    };
    return <Badge className={statusStyles[status as keyof typeof statusStyles] || "bg-gray-500"}>{status}</Badge>;
  };

  const getSeverityBadge = (severity: 'low' | 'medium' | 'high') => {
    const severityStyles = {
      low: "bg-green-500",
      medium: "bg-yellow-500",
      high: "bg-red-500"
    };
    return <Badge className={severityStyles[severity]}>{severity}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settlement Control & Reconciliation</h1>
          <p className="text-muted-foreground">
            Manage bet settlements, reconcile mismatches, and control auto-settlement worker
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetchPendingBets()}
            data-testid="button-refresh-settlements"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Button
            variant={workerStatus?.isRunning ? "destructive" : "default"}
            onClick={() => toggleWorkerMutation.mutate(workerStatus?.isRunning ? 'stop' : 'start')}
            data-testid="button-toggle-worker"
          >
            {workerStatus?.isRunning ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Stop Worker
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Worker
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Worker Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Settlement Worker Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-medium">Status</p>
              <Badge className={workerStatus?.isRunning ? "bg-green-500" : "bg-red-500"}>
                {workerStatus?.isRunning ? "Running" : "Stopped"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Last Run</p>
              <p className="text-sm text-muted-foreground">
                {workerStatus?.lastRun ? new Date(workerStatus.lastRun).toLocaleString() : "Never"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Processed Bets</p>
              <p className="text-sm font-semibold">{workerStatus?.processedBets || 0}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Errors</p>
              <p className="text-sm font-semibold text-red-500">{workerStatus?.errors || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Pending Bets</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="history">Settlement History</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* Pending Bets Tab */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Settlements ({pendingBets.length})</CardTitle>
              <CardDescription>
                Bets waiting for match results or manual intervention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bet ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stake</TableHead>
                    <TableHead>Potential Win</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingBets.map((bet: SettlementBet) => (
                    <TableRow key={bet.id}>
                      <TableCell className="font-mono text-sm">{bet.id.slice(0, 8)}...</TableCell>
                      <TableCell>{bet.userId.slice(0, 8)}...</TableCell>
                      <TableCell>{bet.type}</TableCell>
                      <TableCell>{formatCurrency(bet.totalStake)}</TableCell>
                      <TableCell>{formatCurrency(bet.potentialWinnings)}</TableCell>
                      <TableCell>{new Date(bet.placedAt).toLocaleDateString()}</TableCell>
                      <TableCell>{getStatusBadge(bet.status)}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedBet(bet)}
                              data-testid={`button-force-settle-${bet.id}`}
                            >
                              Force Settle
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Force Settlement</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action will manually settle the bet. Please provide a reason and outcome.
                                This action requires 2FA verification.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="outcome">Settlement Outcome</Label>
                                <Select value={settlementOutcome} onValueChange={(value: "won" | "lost" | "void") => setSettlementOutcome(value)}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="won">Won</SelectItem>
                                    <SelectItem value="lost">Lost</SelectItem>
                                    <SelectItem value="void">Void</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div>
                                <Label htmlFor="reason">Reason for Manual Settlement</Label>
                                <Textarea
                                  id="reason"
                                  placeholder="Explain why this bet is being manually settled..."
                                  value={settlementReason}
                                  onChange={(e) => setSettlementReason(e.target.value)}
                                  data-testid="textarea-settlement-reason"
                                />
                              </div>
                            </div>
                            
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setSettlementReason("")}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleForceSettle}
                                disabled={!settlementReason.trim() || forceSettleMutation.isPending}
                                data-testid="button-confirm-force-settle"
                              >
                                {forceSettleMutation.isPending ? "Settling..." : "Force Settle"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Issues ({reconciliationIssues.length})</CardTitle>
              <CardDescription>
                Identified mismatches, missing results, and data inconsistencies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Fixture</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Affected Bets</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliationIssues.map((issue: ReconciliationIssue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <Badge variant="outline">{issue.type.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{issue.homeTeam} vs {issue.awayTeam}</p>
                          <p className="text-sm text-muted-foreground">{issue.fixtureId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm">{issue.description}</p>
                      </TableCell>
                      <TableCell>{issue.affectedBets}</TableCell>
                      <TableCell>{getSeverityBadge(issue.severity)}</TableCell>
                      <TableCell>{new Date(issue.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reconcileMutation.mutate(issue.fixtureId)}
                            disabled={reconcileMutation.isPending}
                            data-testid={`button-reconcile-${issue.id}`}
                          >
                            Auto-retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetchResultsMutation.mutate(issue.fixtureId)}
                            disabled={refetchResultsMutation.isPending}
                            data-testid={`button-refetch-${issue.id}`}
                          >
                            Re-fetch
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settlement History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Settlement History</CardTitle>
              <CardDescription>View past settlements and their details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <Label htmlFor="status-filter">Status</Label>
                  <Select 
                    value={searchFilters.status} 
                    onValueChange={(value) => setSearchFilters({...searchFilters, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="fixture-filter">Fixture ID</Label>
                  <Input
                    id="fixture-filter"
                    placeholder="Search by fixture ID"
                    value={searchFilters.fixtureId}
                    onChange={(e) => setSearchFilters({...searchFilters, fixtureId: e.target.value})}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="date-from">Date From</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={searchFilters.dateFrom}
                    onChange={(e) => setSearchFilters({...searchFilters, dateFrom: e.target.value})}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="date-to">Date To</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={searchFilters.dateTo}
                    onChange={(e) => setSearchFilters({...searchFilters, dateTo: e.target.value})}
                  />
                </div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bet ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stake</TableHead>
                    <TableHead>Winnings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Settled</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementHistory.map((bet: SettlementBet) => (
                    <TableRow key={bet.id}>
                      <TableCell className="font-mono text-sm">{bet.id.slice(0, 8)}...</TableCell>
                      <TableCell>{bet.type}</TableCell>
                      <TableCell>{formatCurrency(bet.totalStake)}</TableCell>
                      <TableCell>{formatCurrency(bet.actualWinnings || 0)}</TableCell>
                      <TableCell>{getStatusBadge(bet.status)}</TableCell>
                      <TableCell>{bet.settledAt ? new Date(bet.settledAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Auto</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Settlement Reports</CardTitle>
              <CardDescription>Export settlement data and reconciliation reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="export-from">From Date</Label>
                    <Input
                      id="export-from"
                      type="date"
                      data-testid="input-export-from"
                    />
                  </div>
                  <div>
                    <Label htmlFor="export-to">To Date</Label>
                    <Input
                      id="export-to"
                      type="date"
                      data-testid="input-export-to"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => exportReportMutation.mutate({
                      format: 'csv',
                      dateFrom: (document.getElementById('export-from') as HTMLInputElement)?.value || '',
                      dateTo: (document.getElementById('export-to') as HTMLInputElement)?.value || ''
                    })}
                    disabled={exportReportMutation.isPending}
                    data-testid="button-export-csv"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => exportReportMutation.mutate({
                      format: 'pdf',
                      dateFrom: (document.getElementById('export-from') as HTMLInputElement)?.value || '',
                      dateTo: (document.getElementById('export-to') as HTMLInputElement)?.value || ''
                    })}
                    disabled={exportReportMutation.isPending}
                    data-testid="button-export-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}