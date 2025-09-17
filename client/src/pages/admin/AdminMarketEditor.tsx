import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, Reorder } from "framer-motion";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Save,
  Eye,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle,
  GripVertical,
  DollarSign,
  Target,
  Activity,
  Settings,
  FileText,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";

// Types for Market Editor
interface Market {
  id: string;
  key: string;
  name: string;
  type: string;
  parameter?: string;
  status: 'open' | 'closed' | 'suspended' | 'settled';
  minStakeCents: number;
  maxStakeCents: number;
  maxLiabilityCents: number;
  displayOrder: number;
  isPublished: boolean;
  outcomes: MarketOutcome[];
  createdAt: string;
  updatedAt: string;
}

interface MarketOutcome {
  id: string;
  key: string;
  label: string;
  odds: number;
  previousOdds?: number;
  oddsSource: 'manual' | 'sportmonks' | 'automated';
  status: 'active' | 'inactive' | 'won' | 'lost';
  liabilityLimitCents: number;
  displayOrder: number;
  updatedAt: string;
}

interface Match {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  kickoffTime: string;
  status: string;
  markets: Market[];
}

interface OddsChangeRequest {
  outcomeId: string;
  newOdds: number;
  reason: string;
}

interface MarketTemplate {
  key: string;
  name: string;
  type: string;
  outcomes: Array<{
    key: string;
    label: string;
    defaultOdds: number;
  }>;
}

const MARKET_TEMPLATES: MarketTemplate[] = [
  {
    key: "1x2",
    name: "Match Winner",
    type: "1x2",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 2.00 },
      { key: "draw", label: "Draw", defaultOdds: 3.20 },
      { key: "away", label: "Away", defaultOdds: 2.80 }
    ]
  },
  {
    key: "totals_2_5",
    name: "Total Goals O/U 2.5",
    type: "totals",
    outcomes: [
      { key: "over", label: "Over 2.5", defaultOdds: 1.80 },
      { key: "under", label: "Under 2.5", defaultOdds: 2.00 }
    ]
  },
  {
    key: "btts",
    name: "Both Teams To Score",
    type: "btts",
    outcomes: [
      { key: "yes", label: "Yes", defaultOdds: 1.70 },
      { key: "no", label: "No", defaultOdds: 2.10 }
    ]
  }
];

export default function AdminMarketEditor() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // State management
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [editingOutcome, setEditingOutcome] = useState<string | null>(null);
  const [editingOdds, setEditingOdds] = useState<string>("");
  const [showOddsChangeModal, setShowOddsChangeModal] = useState(false);
  const [showAddMarketModal, setShowAddMarketModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [oddsChangeRequest, setOddsChangeRequest] = useState<OddsChangeRequest | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Form states
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customMarketName, setCustomMarketName] = useState<string>("");

  // Fetch match and markets data
  const { data: matchData, isLoading, error, refetch } = useQuery<Match>({
    queryKey: ['/api/admin/matches', matchId, 'markets'],
    queryFn: async () => {
      const response = await adminApiRequest('GET', `/api/admin/matches/${matchId}/markets`);
      return response.json();
    },
    enabled: !!matchId
  });

  // Sort markets by display order
  const [markets, setMarkets] = useState<Market[]>([]);
  
  useEffect(() => {
    if (matchData?.data?.markets) {
      setMarkets([...matchData.data.markets].sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }, [matchData]);

  // Auto-select first market
  useEffect(() => {
    if (markets.length > 0 && !selectedMarket) {
      setSelectedMarket(markets[0]);
    }
  }, [markets, selectedMarket]);

  // Mutations
  const updateOddsMutation = useMutation({
    mutationFn: async (data: OddsChangeRequest) => {
      const response = await adminApiRequest('PATCH', `/api/admin/outcomes/${data.outcomeId}/odds`, {
        odds: data.newOdds,
        reason: data.reason
      });
      if (!response.ok) {
        throw new Error('Failed to update odds');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
      toast({
        title: "Success",
        description: "Odds updated successfully",
      });
      setShowOddsChangeModal(false);
      setOddsChangeRequest(null);
      setEditingOutcome(null);
      setEditingOdds("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update odds",
        variant: "destructive",
      });
    },
  });

  const createMarketMutation = useMutation({
    mutationFn: async (templateKey: string) => {
      const template = MARKET_TEMPLATES.find(t => t.key === templateKey);
      if (!template) throw new Error('Template not found');

      const response = await adminApiRequest('POST', `/api/admin/matches/${matchId}/markets`, {
        key: template.key,
        name: customMarketName || template.name,
        type: template.type,
        outcomes: template.outcomes
      });
      if (!response.ok) {
        throw new Error('Failed to create market');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
      toast({
        title: "Success",
        description: "Market created successfully",
      });
      setShowAddMarketModal(false);
      setSelectedTemplate("");
      setCustomMarketName("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create market",
        variant: "destructive",
      });
    },
  });

  const toggleMarketStatusMutation = useMutation({
    mutationFn: async (data: { marketId: string; action: 'publish' | 'unpublish' | 'suspend' | 'reopen' | 'lock' }) => {
      const response = await adminApiRequest('PATCH', `/api/admin/markets/${data.marketId}/status`, {
        action: data.action
      });
      if (!response.ok) {
        throw new Error(`Failed to ${data.action} market`);
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
      toast({
        title: "Success",
        description: `Market ${variables.action}ed successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update market status",
        variant: "destructive",
      });
    },
  });

  const updateMarketOrderMutation = useMutation({
    mutationFn: async (reorderedMarkets: Market[]) => {
      const updates = reorderedMarkets.map((market, index) => ({
        id: market.id,
        displayOrder: index + 1
      }));

      const response = await adminApiRequest('PATCH', `/api/admin/matches/${matchId}/markets/reorder`, {
        markets: updates
      });
      if (!response.ok) {
        throw new Error('Failed to update market order');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
      toast({
        title: "Success",
        description: "Market order updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update market order",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const handleOddsEdit = (outcomeId: string, currentOdds: number) => {
    setEditingOutcome(outcomeId);
    setEditingOdds(currentOdds.toString());
  };

  const handleOddsChange = (outcomeId: string) => {
    const newOdds = parseFloat(editingOdds);
    const currentOutcome = selectedMarket?.outcomes.find(o => o.id === outcomeId);
    
    if (isNaN(newOdds) || newOdds < 1.01) {
      toast({
        title: "Invalid Odds",
        description: "Odds must be at least 1.01",
        variant: "destructive",
      });
      return;
    }

    const currentOdds = currentOutcome?.odds || 0;
    const threshold = 0.5; // 50% change threshold
    const changePercent = Math.abs((newOdds - currentOdds) / currentOdds);

    if (changePercent > threshold) {
      // Show audit reason modal for significant changes
      setOddsChangeRequest({
        outcomeId,
        newOdds,
        reason: ""
      });
      setShowOddsChangeModal(true);
    } else {
      // Update directly for small changes
      updateOddsMutation.mutate({
        outcomeId,
        newOdds,
        reason: "Minor odds adjustment"
      });
    }
  };

  const handleMarketReorder = (newOrder: Market[]) => {
    setMarkets(newOrder);
    setHasUnsavedChanges(true);
  };

  const saveMarketOrder = () => {
    updateMarketOrderMutation.mutate(markets);
    setHasUnsavedChanges(false);
  };

  const formatCurrency = (cents: number) => {
    return `£${(cents / 100).toLocaleString()}`;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'open': return 'default';
      case 'suspended': return 'secondary';
      case 'closed': return 'outline';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Activity className="w-3 h-3" />;
      case 'suspended': return <Clock className="w-3 h-3" />;
      case 'closed': return <Lock className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Activity className="w-8 h-8 animate-pulse mx-auto mb-4" />
            <p>Loading market editor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !matchData) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Match Data</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading the match data.
            </p>
            <Button onClick={() => refetch()} data-testid="button-retry-match-data">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/prime-admin/matches')}
            data-testid="button-back-to-matches"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Matches
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-market-editor-title">
              Market Editor
            </h1>
            <p className="text-muted-foreground">
              {matchData?.data?.homeTeamName} vs {matchData?.data?.awayTeamName} • {matchData?.data?.leagueName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreviewModal(true)}
            data-testid="button-preview-markets"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddMarketModal(true)}
            data-testid="button-add-market"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Market
          </Button>
          {hasUnsavedChanges && (
            <Button
              onClick={saveMarketOrder}
              data-testid="button-save-changes"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Order
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Markets List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Markets ({markets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <Reorder.Group
                axis="y"
                onReorder={handleMarketReorder}
                values={markets}
                className="space-y-2"
              >
                {markets.map((market) => (
                  <Reorder.Item
                    key={market.id}
                    value={market}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors hover-elevate ${
                      selectedMarket?.id === market.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setSelectedMarket(market)}
                    data-testid={`market-item-${market.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-grab" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">{market.name}</h4>
                          <Badge variant={getStatusBadgeVariant(market.status)} className="text-xs">
                            {getStatusIcon(market.status)}
                            {market.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {market.outcomes.length} outcomes • {market.type}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {market.isPublished ? (
                            <Badge variant="default" className="text-xs">Published</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Draft</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Column: Market Details & Outcomes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                {selectedMarket ? selectedMarket.name : "Select a Market"}
              </CardTitle>
              {selectedMarket && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMarketStatusMutation.mutate({
                      marketId: selectedMarket.id,
                      action: selectedMarket.status === 'suspended' ? 'reopen' : 'suspend'
                    })}
                    data-testid="button-toggle-market-status"
                  >
                    {selectedMarket.status === 'suspended' ? (
                      <>
                        <Unlock className="w-4 h-4 mr-2" />
                        Reopen
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Suspend
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMarketStatusMutation.mutate({
                      marketId: selectedMarket.id,
                      action: selectedMarket.isPublished ? 'unpublish' : 'publish'
                    })}
                    data-testid="button-toggle-publish"
                  >
                    {selectedMarket.isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedMarket ? (
              <div className="space-y-6">
                {/* Market Info */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Stake</Label>
                    <p className="text-sm font-mono">{formatCurrency(selectedMarket.minStakeCents)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Stake</Label>
                    <p className="text-sm font-mono">{formatCurrency(selectedMarket.maxStakeCents)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Liability</Label>
                    <p className="text-sm font-mono">{formatCurrency(selectedMarket.maxLiabilityCents)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Badge variant={getStatusBadgeVariant(selectedMarket.status)} className="text-xs">
                      {getStatusIcon(selectedMarket.status)}
                      {selectedMarket.status}
                    </Badge>
                  </div>
                </div>

                {/* Outcomes Grid */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Market Outcomes</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Outcome</TableHead>
                          <TableHead>Current Odds</TableHead>
                          <TableHead>Previous</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Liability Limit</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedMarket.outcomes.map((outcome) => (
                          <TableRow key={outcome.id} className="hover-elevate">
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-semibold" data-testid={`outcome-label-${outcome.id}`}>
                                  {outcome.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {outcome.key}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {editingOutcome === outcome.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="1.01"
                                    max="1000"
                                    value={editingOdds}
                                    onChange={(e) => setEditingOdds(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleOddsChange(outcome.id);
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingOutcome(null);
                                        setEditingOdds("");
                                      }
                                    }}
                                    className="w-20 h-8 text-sm"
                                    autoFocus
                                    data-testid={`input-odds-${outcome.id}`}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleOddsChange(outcome.id)}
                                    data-testid={`button-save-odds-${outcome.id}`}
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div
                                  className="font-mono cursor-pointer hover:bg-accent hover:text-accent-foreground p-2 rounded transition-colors"
                                  onClick={() => handleOddsEdit(outcome.id, outcome.odds)}
                                  data-testid={`odds-display-${outcome.id}`}
                                >
                                  {outcome.odds.toFixed(2)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {outcome.previousOdds ? (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {outcome.previousOdds.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={outcome.oddsSource === 'manual' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {outcome.oddsSource}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono">
                                {formatCurrency(outcome.liabilityLimitCents)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={outcome.status === 'active' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {outcome.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-center text-muted-foreground">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a market from the left to edit outcomes and odds</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Market Modal */}
      <Dialog open={showAddMarketModal} onOpenChange={setShowAddMarketModal}>
        <DialogContent data-testid="modal-add-market">
          <DialogHeader>
            <DialogTitle>Add Market</DialogTitle>
            <DialogDescription>
              Choose a market template to add to this match
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="market-template">Market Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger id="market-template" data-testid="select-market-template">
                  <SelectValue placeholder="Select a market template" />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_TEMPLATES.map(template => (
                    <SelectItem key={template.key} value={template.key}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="market-name">Custom Market Name (optional)</Label>
              <Input
                id="market-name"
                placeholder="Leave empty to use template name"
                value={customMarketName}
                onChange={(e) => setCustomMarketName(e.target.value)}
                data-testid="input-custom-market-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddMarketModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMarketMutation.mutate(selectedTemplate)}
              disabled={!selectedTemplate || createMarketMutation.isPending}
              data-testid="button-create-market"
            >
              Create Market
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Odds Change Audit Modal */}
      <Dialog open={showOddsChangeModal} onOpenChange={setShowOddsChangeModal}>
        <DialogContent data-testid="modal-odds-change-audit">
          <DialogHeader>
            <DialogTitle>Significant Odds Change</DialogTitle>
            <DialogDescription>
              This odds change is significant and requires an audit reason.
            </DialogDescription>
          </DialogHeader>
          {oddsChangeRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm">
                  <p><strong>Current Odds:</strong> {selectedMarket?.outcomes.find(o => o.id === oddsChangeRequest.outcomeId)?.odds.toFixed(2)}</p>
                  <p><strong>New Odds:</strong> {oddsChangeRequest.newOdds.toFixed(2)}</p>
                </div>
              </div>
              <div>
                <Label htmlFor="change-reason">Reason for Change</Label>
                <Textarea
                  id="change-reason"
                  placeholder="Explain why you're making this odds change..."
                  value={oddsChangeRequest.reason}
                  onChange={(e) => setOddsChangeRequest(prev => 
                    prev ? { ...prev, reason: e.target.value } : null
                  )}
                  data-testid="textarea-change-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOddsChangeModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => oddsChangeRequest && updateOddsMutation.mutate(oddsChangeRequest)}
              disabled={!oddsChangeRequest?.reason.trim() || updateOddsMutation.isPending}
              data-testid="button-confirm-odds-change"
            >
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl" data-testid="modal-preview-markets">
          <DialogHeader>
            <DialogTitle>Market Preview</DialogTitle>
            <DialogDescription>
              This is how the markets will appear to customers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {markets.filter(m => m.isPublished && m.status === 'open').map((market) => (
              <Card key={market.id} className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{market.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {market.outcomes.filter(o => o.status === 'active').map((outcome) => (
                      <Button
                        key={outcome.id}
                        variant="outline"
                        className="h-16 flex flex-col items-center justify-center"
                        data-testid={`preview-outcome-${outcome.id}`}
                      >
                        <span className="text-sm font-medium">{outcome.label}</span>
                        <span className="text-lg font-bold">{outcome.odds.toFixed(2)}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPreviewModal(false)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}