import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Save,
  X,
  Lock,
  Unlock,
  AlertTriangle,
  Activity,
  Clock,
  ChevronDown,
  ChevronRight,
  Target,
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, adminApiRequest } from "@/lib/queryClient";

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

interface Match {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  kickoffTime: string;
  status: string;
  markets: Market[];
}

interface MarketTemplate {
  key: string;
  name: string;
  type: string;
  category: string;
  hasParameter?: boolean;
  defaultParameter?: string;
  outcomes: Array<{
    key: string;
    label: string;
    defaultOdds: number;
  }>;
}

const MARKET_TEMPLATES: MarketTemplate[] = [
  {
    category: "Main Markets",
    key: "1x2",
    name: "Match Winner (1X2)",
    type: "1x2",
    outcomes: [
      { key: "home", label: "Home Win", defaultOdds: 2.10 },
      { key: "draw", label: "Draw", defaultOdds: 3.40 },
      { key: "away", label: "Away Win", defaultOdds: 3.20 }
    ]
  },
  {
    category: "Main Markets",
    key: "double_chance",
    name: "Double Chance",
    type: "double_chance",
    outcomes: [
      { key: "home_draw", label: "Home or Draw", defaultOdds: 1.30 },
      { key: "home_away", label: "Home or Away", defaultOdds: 1.35 },
      { key: "draw_away", label: "Draw or Away", defaultOdds: 1.65 }
    ]
  },
  {
    category: "Main Markets",
    key: "draw_no_bet",
    name: "Draw No Bet",
    type: "draw_no_bet",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 1.55 },
      { key: "away", label: "Away", defaultOdds: 2.40 }
    ]
  },
  {
    category: "Goal Markets",
    key: "totals_0_5",
    name: "Total Goals O/U 0.5",
    type: "totals",
    hasParameter: true,
    defaultParameter: "0.5",
    outcomes: [
      { key: "over", label: "Over 0.5", defaultOdds: 1.15 },
      { key: "under", label: "Under 0.5", defaultOdds: 5.50 }
    ]
  },
  {
    category: "Goal Markets",
    key: "totals_1_5",
    name: "Total Goals O/U 1.5",
    type: "totals",
    hasParameter: true,
    defaultParameter: "1.5",
    outcomes: [
      { key: "over", label: "Over 1.5", defaultOdds: 1.40 },
      { key: "under", label: "Under 1.5", defaultOdds: 2.90 }
    ]
  },
  {
    category: "Goal Markets",
    key: "totals_2_5",
    name: "Total Goals O/U 2.5",
    type: "totals",
    hasParameter: true,
    defaultParameter: "2.5",
    outcomes: [
      { key: "over", label: "Over 2.5", defaultOdds: 1.80 },
      { key: "under", label: "Under 2.5", defaultOdds: 2.00 }
    ]
  },
  {
    category: "Goal Markets",
    key: "totals_3_5",
    name: "Total Goals O/U 3.5",
    type: "totals",
    hasParameter: true,
    defaultParameter: "3.5",
    outcomes: [
      { key: "over", label: "Over 3.5", defaultOdds: 2.75 },
      { key: "under", label: "Under 3.5", defaultOdds: 1.44 }
    ]
  },
  {
    category: "Goal Markets",
    key: "totals_4_5",
    name: "Total Goals O/U 4.5",
    type: "totals",
    hasParameter: true,
    defaultParameter: "4.5",
    outcomes: [
      { key: "over", label: "Over 4.5", defaultOdds: 4.50 },
      { key: "under", label: "Under 4.5", defaultOdds: 1.18 }
    ]
  },
  {
    category: "Goal Markets",
    key: "btts",
    name: "Both Teams to Score",
    type: "btts",
    outcomes: [
      { key: "yes", label: "Yes", defaultOdds: 1.70 },
      { key: "no", label: "No", defaultOdds: 2.10 }
    ]
  },
  {
    category: "Goal Markets",
    key: "exact_goals",
    name: "Exact Number of Goals",
    type: "exact_goals",
    outcomes: [
      { key: "0", label: "0 Goals", defaultOdds: 9.00 },
      { key: "1", label: "1 Goal", defaultOdds: 6.00 },
      { key: "2", label: "2 Goals", defaultOdds: 4.00 },
      { key: "3", label: "3 Goals", defaultOdds: 4.50 },
      { key: "4+", label: "4+ Goals", defaultOdds: 3.20 }
    ]
  },
  {
    category: "Goal Markets",
    key: "odd_even",
    name: "Odd/Even Goals",
    type: "odd_even",
    outcomes: [
      { key: "odd", label: "Odd", defaultOdds: 1.95 },
      { key: "even", label: "Even", defaultOdds: 1.95 }
    ]
  },
  {
    category: "Goal Markets",
    key: "both_halves_over_1_5",
    name: "Both Halves Over 1.5",
    type: "both_halves",
    outcomes: [
      { key: "yes", label: "Yes", defaultOdds: 8.50 },
      { key: "no", label: "No", defaultOdds: 1.08 }
    ]
  },
  {
    category: "Half Markets",
    key: "first_half_1x2",
    name: "First Half 1X2",
    type: "first_half_1x2",
    outcomes: [
      { key: "home", label: "Home Win", defaultOdds: 3.20 },
      { key: "draw", label: "Draw", defaultOdds: 2.10 },
      { key: "away", label: "Away Win", defaultOdds: 4.50 }
    ]
  },
  {
    category: "Half Markets",
    key: "first_half_totals",
    name: "First Half Goals O/U",
    type: "first_half_totals",
    hasParameter: true,
    defaultParameter: "0.5",
    outcomes: [
      { key: "over", label: "Over 0.5", defaultOdds: 1.60 },
      { key: "under", label: "Under 0.5", defaultOdds: 2.30 }
    ]
  },
  {
    category: "Half Markets",
    key: "second_half_1x2",
    name: "Second Half 1X2",
    type: "second_half_1x2",
    outcomes: [
      { key: "home", label: "Home Win", defaultOdds: 3.50 },
      { key: "draw", label: "Draw", defaultOdds: 2.00 },
      { key: "away", label: "Away Win", defaultOdds: 4.20 }
    ]
  },
  {
    category: "Half Markets",
    key: "second_half_totals",
    name: "Second Half Goals O/U",
    type: "second_half_totals",
    hasParameter: true,
    defaultParameter: "0.5",
    outcomes: [
      { key: "over", label: "Over 0.5", defaultOdds: 1.55 },
      { key: "under", label: "Under 0.5", defaultOdds: 2.40 }
    ]
  },
  {
    category: "Half Markets",
    key: "highest_scoring_half",
    name: "Highest Scoring Half",
    type: "highest_scoring_half",
    outcomes: [
      { key: "first", label: "First Half", defaultOdds: 2.80 },
      { key: "equal", label: "Equal", defaultOdds: 3.00 },
      { key: "second", label: "Second Half", defaultOdds: 2.20 }
    ]
  },
  {
    category: "Team Performance",
    key: "team_to_score_first",
    name: "Team to Score First",
    type: "team_to_score_first",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 1.85 },
      { key: "away", label: "Away", defaultOdds: 2.10 },
      { key: "no_goals", label: "No Goals", defaultOdds: 15.00 }
    ]
  },
  {
    category: "Team Performance",
    key: "team_to_score_last",
    name: "Team to Score Last",
    type: "team_to_score_last",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 1.90 },
      { key: "away", label: "Away", defaultOdds: 2.05 }
    ]
  },
  {
    category: "Team Performance",
    key: "clean_sheet",
    name: "Clean Sheet",
    type: "clean_sheet",
    outcomes: [
      { key: "home", label: "Home Clean Sheet", defaultOdds: 2.50 },
      { key: "away", label: "Away Clean Sheet", defaultOdds: 3.20 },
      { key: "neither", label: "Neither", defaultOdds: 1.80 }
    ]
  },
  {
    category: "Team Performance",
    key: "to_win_either_half",
    name: "To Win Either Half",
    type: "to_win_either_half",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 1.35 },
      { key: "away", label: "Away", defaultOdds: 1.75 }
    ]
  },
  {
    category: "Team Performance",
    key: "to_win_both_halves",
    name: "To Win Both Halves",
    type: "to_win_both_halves",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 4.50 },
      { key: "away", label: "Away", defaultOdds: 6.50 },
      { key: "neither", label: "Neither", defaultOdds: 1.30 }
    ]
  },
  {
    category: "Team Performance",
    key: "to_score_both_halves",
    name: "To Score in Both Halves",
    type: "to_score_both_halves",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 2.75 },
      { key: "away", label: "Away", defaultOdds: 3.40 },
      { key: "both", label: "Both Teams", defaultOdds: 4.20 }
    ]
  },
  {
    category: "Special Markets",
    key: "correct_score",
    name: "Correct Score",
    type: "correct_score",
    outcomes: [
      { key: "1-0", label: "1-0", defaultOdds: 7.50 },
      { key: "2-0", label: "2-0", defaultOdds: 9.00 },
      { key: "2-1", label: "2-1", defaultOdds: 8.50 },
      { key: "3-0", label: "3-0", defaultOdds: 16.00 },
      { key: "3-1", label: "3-1", defaultOdds: 15.00 },
      { key: "0-0", label: "0-0", defaultOdds: 9.00 },
      { key: "1-1", label: "1-1", defaultOdds: 6.50 },
      { key: "2-2", label: "2-2", defaultOdds: 14.00 },
      { key: "0-1", label: "0-1", defaultOdds: 10.00 },
      { key: "0-2", label: "0-2", defaultOdds: 14.00 },
      { key: "1-2", label: "1-2", defaultOdds: 10.00 },
      { key: "other", label: "Any Other", defaultOdds: 6.00 }
    ]
  },
  {
    category: "Special Markets",
    key: "ht_ft",
    name: "Half Time/Full Time",
    type: "ht_ft",
    outcomes: [
      { key: "hh", label: "Home/Home", defaultOdds: 3.60 },
      { key: "hd", label: "Home/Draw", defaultOdds: 8.00 },
      { key: "ha", label: "Home/Away", defaultOdds: 15.00 },
      { key: "dh", label: "Draw/Home", defaultOdds: 5.00 },
      { key: "dd", label: "Draw/Draw", defaultOdds: 6.50 },
      { key: "da", label: "Draw/Away", defaultOdds: 7.50 },
      { key: "ah", label: "Away/Home", defaultOdds: 20.00 },
      { key: "ad", label: "Away/Draw", defaultOdds: 12.00 },
      { key: "aa", label: "Away/Away", defaultOdds: 6.00 }
    ]
  },
  {
    category: "Special Markets",
    key: "winning_margin",
    name: "Winning Margin",
    type: "winning_margin",
    outcomes: [
      { key: "home_1", label: "Home by 1", defaultOdds: 5.50 },
      { key: "home_2", label: "Home by 2", defaultOdds: 6.50 },
      { key: "home_3+", label: "Home by 3+", defaultOdds: 9.00 },
      { key: "away_1", label: "Away by 1", defaultOdds: 7.00 },
      { key: "away_2", label: "Away by 2", defaultOdds: 9.50 },
      { key: "away_3+", label: "Away by 3+", defaultOdds: 15.00 },
      { key: "draw", label: "Draw", defaultOdds: 3.40 }
    ]
  },
  {
    category: "Special Markets",
    key: "handicap_-2",
    name: "Asian Handicap -2",
    type: "handicap",
    hasParameter: true,
    defaultParameter: "-2",
    outcomes: [
      { key: "home", label: "Home -2", defaultOdds: 3.20 },
      { key: "away", label: "Away +2", defaultOdds: 1.35 }
    ]
  },
  {
    category: "Special Markets",
    key: "handicap_-1",
    name: "Asian Handicap -1",
    type: "handicap",
    hasParameter: true,
    defaultParameter: "-1",
    outcomes: [
      { key: "home", label: "Home -1", defaultOdds: 2.10 },
      { key: "away", label: "Away +1", defaultOdds: 1.75 }
    ]
  },
  {
    category: "Special Markets",
    key: "handicap_0",
    name: "Asian Handicap 0",
    type: "handicap",
    hasParameter: true,
    defaultParameter: "0",
    outcomes: [
      { key: "home", label: "Home", defaultOdds: 1.55 },
      { key: "away", label: "Away", defaultOdds: 2.40 }
    ]
  },
  {
    category: "Special Markets",
    key: "handicap_+1",
    name: "Asian Handicap +1",
    type: "handicap",
    hasParameter: true,
    defaultParameter: "+1",
    outcomes: [
      { key: "home", label: "Home +1", defaultOdds: 1.75 },
      { key: "away", label: "Away -1", defaultOdds: 2.10 }
    ]
  },
  {
    category: "Special Markets",
    key: "handicap_+2",
    name: "Asian Handicap +2",
    type: "handicap",
    hasParameter: true,
    defaultParameter: "+2",
    outcomes: [
      { key: "home", label: "Home +2", defaultOdds: 1.35 },
      { key: "away", label: "Away -2", defaultOdds: 3.20 }
    ]
  },
  {
    category: "Special Markets",
    key: "first_goal_interval",
    name: "First Goal Interval",
    type: "first_goal_interval",
    outcomes: [
      { key: "0-15", label: "0-15 min", defaultOdds: 4.50 },
      { key: "16-30", label: "16-30 min", defaultOdds: 3.80 },
      { key: "31-45", label: "31-45 min", defaultOdds: 4.20 },
      { key: "46-60", label: "46-60 min", defaultOdds: 4.50 },
      { key: "61-75", label: "61-75 min", defaultOdds: 5.50 },
      { key: "76-90", label: "76-90 min", defaultOdds: 6.50 },
      { key: "no_goal", label: "No Goal", defaultOdds: 15.00 }
    ]
  },
  {
    category: "Special Markets",
    key: "penalty_awarded",
    name: "Penalty Awarded",
    type: "penalty_awarded",
    outcomes: [
      { key: "yes", label: "Yes", defaultOdds: 3.20 },
      { key: "no", label: "No", defaultOdds: 1.35 }
    ]
  },
  {
    category: "Special Markets",
    key: "own_goal",
    name: "Own Goal",
    type: "own_goal",
    outcomes: [
      { key: "yes", label: "Yes", defaultOdds: 8.00 },
      { key: "no", label: "No", defaultOdds: 1.08 }
    ]
  }
];

export default function AdminMarketEditor() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "Main Markets": true,
    "Goal Markets": true,
    "Half Markets": false,
    "Team Performance": false,
    "Special Markets": false
  });
  const [selectedMarketKey, setSelectedMarketKey] = useState<string | null>(null);
  const [marketParameter, setMarketParameter] = useState<string>("");
  const [showParameterDialog, setShowParameterDialog] = useState(false);

  const { data: matchData, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/matches', matchId, 'markets'],
    queryFn: async () => {
      const response = await adminApiRequest('GET', `/api/admin/matches/${matchId}/markets`);
      return response.json();
    },
    enabled: !!matchId
  });

  const markets = matchData?.data?.markets || [];
  const match = matchData?.data;
  const defaultMarket = markets.find((m: Market) => m.key === "1x2");
  const addedMarkets = markets.filter((m: Market) => m.key !== "1x2");

  const createMarketMutation = useMutation({
    mutationFn: async (data: { template: MarketTemplate; parameter?: string }) => {
      const { template, parameter } = data;
      const response = await adminApiRequest('POST', `/api/admin/matches/${matchId}/markets`, {
        key: template.key,
        name: template.name,
        type: template.type,
        parameter: parameter || template.defaultParameter,
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
        description: "Market added successfully",
      });
      setShowParameterDialog(false);
      setSelectedMarketKey(null);
      setMarketParameter("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add market",
        variant: "destructive",
      });
    },
  });

  const updateOddsMutation = useMutation({
    mutationFn: async (data: { outcomeId: string; odds: number }) => {
      const response = await adminApiRequest('PATCH', `/api/admin/outcomes/${data.outcomeId}/odds`, {
        odds: data.odds,
        reason: "Manual odds adjustment"
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
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update odds",
        variant: "destructive",
      });
    },
  });

  const toggleMarketMutation = useMutation({
    mutationFn: async (data: { marketId: string; isPublished: boolean }) => {
      const response = await adminApiRequest('PATCH', `/api/admin/markets/${data.marketId}/status`, {
        action: data.isPublished ? 'unpublish' : 'publish'
      });
      if (!response.ok) {
        throw new Error('Failed to toggle market');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to toggle market status",
        variant: "destructive",
      });
    },
  });

  const deleteMarketMutation = useMutation({
    mutationFn: async (marketId: string) => {
      const response = await adminApiRequest('DELETE', `/api/admin/markets/${marketId}`);
      if (!response.ok) {
        throw new Error('Failed to delete market');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/matches', matchId, 'markets'] });
      toast({
        title: "Success",
        description: "Market removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove market",
        variant: "destructive",
      });
    },
  });

  const handleAddMarket = (template: MarketTemplate) => {
    const alreadyAdded = markets.some((m: Market) => m.key === template.key);
    if (alreadyAdded) {
      toast({
        title: "Market Already Added",
        description: `${template.name} is already added to this match`,
        variant: "destructive",
      });
      return;
    }

    if (template.hasParameter) {
      setSelectedMarketKey(template.key);
      setMarketParameter(template.defaultParameter || "");
      setShowParameterDialog(true);
    } else {
      createMarketMutation.mutate({ template });
    }
  };

  const handleConfirmParameter = () => {
    const template = MARKET_TEMPLATES.find(t => t.key === selectedMarketKey);
    if (template) {
      createMarketMutation.mutate({ template, parameter: marketParameter });
    }
  };

  const handleOddsChange = (outcomeId: string, newOdds: string) => {
    const odds = parseFloat(newOdds);
    if (isNaN(odds) || odds < 1.01) {
      toast({
        title: "Invalid Odds",
        description: "Odds must be at least 1.01",
        variant: "destructive",
      });
      return;
    }
    updateOddsMutation.mutate({ outcomeId, odds });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const marketsByCategory = MARKET_TEMPLATES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, MarketTemplate[]>);

  const isMarketAdded = (key: string) => markets.some((m: Market) => m.key === key);

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
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Match Data</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading the match data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/prime-admin/matches')}
            data-testid="button-back-to-matches"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-market-editor-title">
              Market Editor
            </h1>
            <p className="text-sm text-muted-foreground">
              {match?.homeTeamName} vs {match?.awayTeamName}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Default Markets</CardTitle>
          </CardHeader>
          <CardContent>
            {defaultMarket ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{defaultMarket.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    <Lock className="w-3 h-3 mr-1" />
                    Default
                  </Badge>
                </div>
                <div className="space-y-2">
                  {defaultMarket.outcomes.map((outcome: MarketOutcome) => (
                    <div
                      key={outcome.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded"
                      data-testid={`default-outcome-${outcome.key}`}
                    >
                      <span className="text-sm">{outcome.label}</span>
                      <span className="font-mono text-sm font-semibold">
                        {outcome.odds.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No default market set</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Added Markets ({addedMarkets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {addedMarkets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No markets added yet</p>
                  <p className="text-xs mt-1">Add markets from the library</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {addedMarkets.map((market: Market) => (
                    <div
                      key={market.id}
                      className="border rounded-lg p-3 space-y-3"
                      data-testid={`added-market-${market.key}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-sm">{market.name}</h3>
                          {market.parameter && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              Line: {market.parameter}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={market.isPublished}
                            onCheckedChange={() =>
                              toggleMarketMutation.mutate({
                                marketId: market.id,
                                isPublished: market.isPublished
                              })
                            }
                            data-testid={`toggle-market-${market.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteMarketMutation.mutate(market.id)}
                            data-testid={`remove-market-${market.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {market.outcomes.map((outcome: MarketOutcome) => (
                          <div
                            key={outcome.id}
                            className="flex items-center gap-2"
                            data-testid={`outcome-${outcome.id}`}
                          >
                            <Label className="text-xs flex-1">{outcome.label}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="1.01"
                              defaultValue={outcome.odds.toFixed(2)}
                              onBlur={(e) => handleOddsChange(outcome.id, e.target.value)}
                              className="w-20 h-7 text-xs text-right font-mono"
                              data-testid={`input-odds-${outcome.id}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Market Library</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-1">
                {Object.entries(marketsByCategory).map(([category, templates]) => (
                  <div key={category} className="space-y-1">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="flex items-center gap-2 w-full p-2 hover-elevate rounded text-left"
                      data-testid={`category-${category}`}
                    >
                      {expandedCategories[category] ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-semibold text-sm">{category}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {templates.length}
                      </Badge>
                    </button>
                    {expandedCategories[category] && (
                      <div className="ml-6 space-y-1">
                        {templates.map((template) => {
                          const added = isMarketAdded(template.key);
                          return (
                            <div
                              key={template.key}
                              className={`flex items-center justify-between p-2 rounded text-sm ${
                                added
                                  ? 'bg-primary/10 border border-primary/20'
                                  : 'hover-elevate'
                              }`}
                              data-testid={`market-template-${template.key}`}
                            >
                              <span className={added ? 'text-primary font-medium' : ''}>
                                {template.name}
                              </span>
                              <Button
                                variant={added ? "outline" : "default"}
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleAddMarket(template)}
                                disabled={added || createMarketMutation.isPending}
                                data-testid={`add-market-${template.key}`}
                              >
                                {added ? (
                                  <>
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Added
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showParameterDialog} onOpenChange={setShowParameterDialog}>
        <DialogContent data-testid="dialog-market-parameter">
          <DialogHeader>
            <DialogTitle>Set Market Parameter</DialogTitle>
            <DialogDescription>
              Enter the line/parameter for this market
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="parameter">Parameter/Line</Label>
              <Input
                id="parameter"
                type="text"
                value={marketParameter}
                onChange={(e) => setMarketParameter(e.target.value)}
                placeholder="e.g., 2.5, -1, +2"
                data-testid="input-market-parameter"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowParameterDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmParameter}
              disabled={!marketParameter || createMarketMutation.isPending}
              data-testid="button-confirm-parameter"
            >
              Add Market
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
