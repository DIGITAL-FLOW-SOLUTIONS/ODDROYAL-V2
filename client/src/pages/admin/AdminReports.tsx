import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, adminApiRequest, queryClient } from "@/lib/queryClient";
import { 
  FileDown, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Target,
  AlertCircle,
  Calendar,
  Filter,
  Download,
  Clock
} from "lucide-react";

// Interfaces for typed query responses
interface DailyReportData {
  grossGamingRevenue: string;
  totalBets: number;
  totalTurnover: string;
}

interface MonthlyReportData {
  grossGamingRevenue: string;
  totalBets: number;
  growth: number;
}

interface TurnoverBySportData {
  totalTurnover: string;
  sports: Array<{
    sport: string;
    turnover: string;
    percentage: number;
  }>;
}

interface PayoutRatioData {
  payoutRatioPercentage: string;
  winRatePercentage: string;
  totalStake: string;
  totalPayouts: string;
  winningBets: number;
  losingBets: number;
}

interface TopWinnersData {
  winners: Array<{
    username: string;
    winnings: string;
    betsCount: number;
  }>;
}

interface ChargebacksData {
  totalChargebacks: string;
  chargebackCount: number;
  chargebackRatePercentage: string;
  chargebacks: Array<{
    id: string;
    amount: string;
    date: string;
    reason: string;
  }>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  sport?: string;
  league?: string;
  limit?: number;
}

export default function AdminReports() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0]
  });

  // Daily GGR Report
  const { data: dailyReport, isLoading: dailyLoading } = useQuery<ApiResponse<DailyReportData>>({
    queryKey: ['/api/admin/reports/daily', filters.dateFrom],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/daily', { date: filters.dateFrom });
      return response.json();
    },
    enabled: !!filters.dateFrom
  });

  // Monthly Report
  const { data: monthlyReport, isLoading: monthlyLoading } = useQuery<ApiResponse<MonthlyReportData>>({
    queryKey: ['/api/admin/reports/monthly', new Date().getFullYear(), new Date().getMonth() + 1],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/monthly', { 
        year: new Date().getFullYear(), 
        month: new Date().getMonth() + 1 
      });
      return response.json();
    }
  });

  // Turnover by Sport Report
  const { data: turnoverBySport, isLoading: turnoverLoading } = useQuery<ApiResponse<TurnoverBySportData>>({
    queryKey: ['/api/admin/reports/turnover-by-sport', filters.dateFrom, filters.dateTo, filters.sport],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/turnover-by-sport', {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        sport: filters.sport
      });
      return response.json();
    }
  });

  // Payout Ratio Report
  const { data: payoutRatio, isLoading: payoutLoading } = useQuery<ApiResponse<PayoutRatioData>>({
    queryKey: ['/api/admin/reports/payout-ratio', filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/payout-ratio', {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      });
      return response.json();
    }
  });

  // Top Winners Report
  const { data: topWinners, isLoading: winnersLoading } = useQuery<ApiResponse<TopWinnersData>>({
    queryKey: ['/api/admin/reports/top-winners', filters.dateFrom, filters.dateTo, filters.limit || 50],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/top-winners', {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        limit: filters.limit || 50
      });
      return response.json();
    }
  });

  // Chargebacks Report
  const { data: chargebacks, isLoading: chargebacksLoading } = useQuery<ApiResponse<ChargebacksData>>({
    queryKey: ['/api/admin/reports/chargebacks', filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const response = await adminApiRequest('POST', '/api/admin/reports/chargebacks', {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      });
      return response.json();
    }
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (params: { reportType: string; format: string }) => {
      return adminApiRequest('POST', `/api/admin/reports/export`, {
        reportType: params.reportType,
        format: params.format,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filters: {
          sport: filters.sport,
          league: filters.league
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Export Successful",
        description: "Report has been exported successfully",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Failed to export report",
        variant: "destructive"
      });
    }
  });

  // Custom report mutation
  const customReportMutation = useMutation({
    mutationFn: async (params: any) => {
      return adminApiRequest('POST', `/api/admin/reports/custom`, params);
    }
  });

  // Schedule report mutation
  const scheduleReportMutation = useMutation({
    mutationFn: async (params: any) => {
      return adminApiRequest('POST', `/api/admin/reports/schedule`, params);
    },
    onSuccess: () => {
      toast({
        title: "Report Scheduled",
        description: "Report has been scheduled successfully",
      });
    }
  });

  const handleExport = (reportType: string, format: string) => {
    exportMutation.mutate({ reportType, format });
  };

  const handleCustomReport = () => {
    customReportMutation.mutate({
      reportType: 'custom',
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      filters: {
        sport: filters.sport,
        league: filters.league
      },
      groupBy: 'date',
      metrics: ['turnover', 'bets', 'ggr']
    });
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-6"
    >
      <motion.div variants={itemVariants}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-reports-title">Reports & Analytics</h1>
            <p className="text-muted-foreground">
              Comprehensive reporting system with exports and analytics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-2">
              <Clock className="h-4 w-4" />
              Live Data
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Report Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="date-from">From Date</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <Label htmlFor="date-to">To Date</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  data-testid="input-date-to"
                />
              </div>
              <div>
                <Label htmlFor="sport-filter">Sport</Label>
                <Select
                  value={filters.sport || ""}
                  onValueChange={(value) => setFilters({ ...filters, sport: value || undefined })}
                >
                  <SelectTrigger data-testid="select-sport-filter">
                    <SelectValue placeholder="All Sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Sports</SelectItem>
                    <SelectItem value="football">Football</SelectItem>
                    <SelectItem value="basketball">Basketball</SelectItem>
                    <SelectItem value="tennis">Tennis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="limit-filter">Limit</Label>
                <Select
                  value={filters.limit?.toString() || "50"}
                  onValueChange={(value) => setFilters({ ...filters, limit: parseInt(value) })}
                >
                  <SelectTrigger data-testid="select-limit-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Reports Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="turnover" data-testid="tab-turnover">Turnover</TabsTrigger>
            <TabsTrigger value="payout" data-testid="tab-payout">Payout Ratio</TabsTrigger>
            <TabsTrigger value="winners" data-testid="tab-winners">Top Winners</TabsTrigger>
            <TabsTrigger value="chargebacks" data-testid="tab-chargebacks">Chargebacks</TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">Custom</TabsTrigger>
            <TabsTrigger value="scheduled" data-testid="tab-scheduled">Scheduled</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Daily GGR</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-daily-ggr">
                    {dailyLoading ? "..." : dailyReport?.data?.grossGamingRevenue || "£0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    From {dailyReport?.data?.totalBets || 0} bets
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Turnover</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-turnover">
                    {turnoverLoading ? "..." : turnoverBySport?.data?.totalTurnover || "£0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across all sports
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Payout Ratio</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-payout-ratio">
                    {payoutLoading ? "..." : payoutRatio?.data?.payoutRatioPercentage || "0%"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Win rate: {payoutRatio?.data?.winRatePercentage || "0%"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Chargebacks</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-chargebacks">
                    {chargebacksLoading ? "..." : chargebacks?.data?.totalChargebacks || "£0.00"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Rate: {chargebacks?.data?.chargebackRatePercentage || "0%"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Export Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Exports</CardTitle>
                <CardDescription>Export commonly used reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleExport('daily-ggr', 'csv')}
                    disabled={exportMutation.isPending}
                    data-testid="button-export-daily-csv"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Daily GGR (CSV)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExport('turnover-by-sport', 'pdf')}
                    disabled={exportMutation.isPending}
                    data-testid="button-export-turnover-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Turnover Report (PDF)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExport('top-winners', 'csv')}
                    disabled={exportMutation.isPending}
                    data-testid="button-export-winners-csv"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Top Winners (CSV)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Turnover by Sport Tab */}
          <TabsContent value="turnover" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Turnover by Sport</CardTitle>
                  <CardDescription>Breakdown of betting turnover by sport and league</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleExport('turnover-by-sport', 'csv')}
                    disabled={exportMutation.isPending}
                    data-testid="button-export-turnover-csv"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {turnoverLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sport</TableHead>
                        <TableHead>Turnover</TableHead>
                        <TableHead>Bet Count</TableHead>
                        <TableHead>GGR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turnoverBySport?.data?.sports?.map((sport: any, index: number) => (
                        <TableRow key={index} data-testid={`row-sport-${index}`}>
                          <TableCell className="font-medium">{sport.sport}</TableCell>
                          <TableCell>{sport.turnover}</TableCell>
                          <TableCell>{sport.betCount}</TableCell>
                          <TableCell>{sport.ggr}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payout Ratio Tab */}
          <TabsContent value="payout" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payout Ratio Analysis</CardTitle>
                <CardDescription>Detailed payout and win rate analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {payoutLoading ? (
                  <div className="space-y-4">
                    <div className="h-24 bg-muted rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold" data-testid="text-total-stake">{payoutRatio?.data?.totalStake}</div>
                      <div className="text-sm text-muted-foreground">Total Stakes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold" data-testid="text-total-payouts">{payoutRatio?.data?.totalPayouts}</div>
                      <div className="text-sm text-muted-foreground">Total Payouts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold" data-testid="text-winning-bets">{payoutRatio?.data?.winningBets}</div>
                      <div className="text-sm text-muted-foreground">Winning Bets</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold" data-testid="text-losing-bets">{payoutRatio?.data?.losingBets}</div>
                      <div className="text-sm text-muted-foreground">Losing Bets</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Winners Tab */}
          <TabsContent value="winners" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Top Winners</CardTitle>
                  <CardDescription>Players with highest net winnings</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleExport('top-winners', 'csv')}
                  disabled={exportMutation.isPending}
                  data-testid="button-export-top-winners"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {winnersLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Net Winnings</TableHead>
                        <TableHead>Bet Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topWinners?.data?.winners?.map((winner: any, index: number) => (
                        <TableRow key={index} data-testid={`row-winner-${index}`}>
                          <TableCell className="font-medium">{winner.username}</TableCell>
                          <TableCell className="text-green-600">{winner.netWinnings}</TableCell>
                          <TableCell>{winner.betCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chargebacks Tab */}
          <TabsContent value="chargebacks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Chargeback Analysis</CardTitle>
                <CardDescription>Detailed chargeback and dispute tracking</CardDescription>
              </CardHeader>
              <CardContent>
                {chargebacksLoading ? (
                  <div className="space-y-4">
                    <div className="h-24 bg-muted rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-red-600" data-testid="text-chargeback-total">
                          {chargebacks?.data?.totalChargebacks}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Amount</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold" data-testid="text-chargeback-count">
                          {chargebacks?.data?.chargebackCount}
                        </div>
                        <div className="text-sm text-muted-foreground">Count</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold" data-testid="text-chargeback-rate">
                          {chargebacks?.data?.chargebackRatePercentage}
                        </div>
                        <div className="text-sm text-muted-foreground">Rate</div>
                      </div>
                    </div>

                    {chargebacks?.data?.chargebacks?.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User ID</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {chargebacks.data.chargebacks.map((chargeback: any, index: number) => (
                            <TableRow key={index} data-testid={`row-chargeback-${index}`}>
                              <TableCell>{chargeback.userId}</TableCell>
                              <TableCell className="text-red-600">{chargeback.amount}</TableCell>
                              <TableCell>{chargeback.reason}</TableCell>
                              <TableCell>{new Date(chargeback.date).toLocaleDateString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custom Reports Tab */}
          <TabsContent value="custom" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Custom Report Generator</CardTitle>
                <CardDescription>Generate custom reports with specific filters and metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={handleCustomReport}
                  disabled={customReportMutation.isPending}
                  data-testid="button-generate-custom"
                >
                  {customReportMutation.isPending ? "Generating..." : "Generate Custom Report"}
                </Button>

                {customReportMutation.data && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2">Custom Report Results</h4>
                    <pre className="text-sm">
                      {JSON.stringify(customReportMutation.data, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Scheduled Reports Tab */}
          <TabsContent value="scheduled" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Reports</CardTitle>
                <CardDescription>Set up automated report generation and delivery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Report Type</Label>
                    <Select>
                      <SelectTrigger data-testid="select-schedule-report-type">
                        <SelectValue placeholder="Select report type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily-ggr">Daily GGR</SelectItem>
                        <SelectItem value="turnover">Turnover by Sport</SelectItem>
                        <SelectItem value="top-winners">Top Winners</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Schedule</Label>
                    <Select>
                      <SelectTrigger data-testid="select-schedule-frequency">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Email Recipients</Label>
                  <Input 
                    placeholder="admin@example.com, finance@example.com"
                    data-testid="input-schedule-recipients"
                  />
                </div>
                <Button
                  onClick={() => scheduleReportMutation.mutate({
                    reportType: 'daily-ggr',
                    schedule: 'daily',
                    format: 'pdf',
                    recipients: ['admin@example.com']
                  })}
                  disabled={scheduleReportMutation.isPending}
                  data-testid="button-schedule-report"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}