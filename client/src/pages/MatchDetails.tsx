import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  MapPin
} from "lucide-react";

interface MatchDetailsProps {
  onAddToBetSlip?: (selection: any) => void;
}

interface Market {
  id: string;
  name: string;
  category: string;
  outcomes: {
    id: string;
    name: string;
    odds: number;
  }[];
}

interface MatchDetails {
  id: string;
  homeTeam: { name: string; logo?: string };
  awayTeam: { name: string; logo?: string };
  league: string;
  kickoffTime: string;
  venue: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
}

interface SportMonksOdds {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  handicap: string | null;
  total: string | null;
  winning: boolean;
  stopped: boolean;
  last_update: {
    date: string;
    timezone_type: number;
    timezone: string;
  };
  market: {
    id: number;
    name: string;
    developer_name: string;
    has_winning_calculations: boolean;
  };
}

// Transform SportMonks odds data into our Market format
const transformOddsToMarkets = (oddsData: SportMonksOdds[]): Market[] => {
  if (!oddsData || oddsData.length === 0) {
    // Return comprehensive mock markets similar to Playwin
    return [
      {
        id: "1x2",
        name: "Match Winner",
        category: "main",
        outcomes: [
          { id: "home", name: "1", odds: 2.25 },
          { id: "draw", name: "X", odds: 3.10 },
          { id: "away", name: "2", odds: 2.85 }
        ]
      },
      {
        id: "double-chance",
        name: "Double Chance",
        category: "main",
        outcomes: [
          { id: "1x", name: "1X", odds: 1.44 },
          { id: "12", name: "12", odds: 1.28 },
          { id: "x2", name: "X2", odds: 1.53 }
        ]
      },
      {
        id: "over-under-25",
        name: "Total Goals O/U 2.5",
        category: "goals",
        outcomes: [
          { id: "over-25", name: "Over 2.5", odds: 1.85 },
          { id: "under-25", name: "Under 2.5", odds: 1.95 }
        ]
      },
      {
        id: "over-under-15",
        name: "Total Goals O/U 1.5",
        category: "goals",
        outcomes: [
          { id: "over-15", name: "Over 1.5", odds: 1.33 },
          { id: "under-15", name: "Under 1.5", odds: 3.20 }
        ]
      },
      {
        id: "both-teams-score",
        name: "Both Teams to Score",
        category: "goals",
        outcomes: [
          { id: "yes", name: "Yes", odds: 1.70 },
          { id: "no", name: "No", odds: 2.15 }
        ]
      },
      {
        id: "handicap-0",
        name: "Handicap (0)",
        category: "handicap",
        outcomes: [
          { id: "home-hcp", name: "1", odds: 1.95 },
          { id: "draw-hcp", name: "X", odds: 2.20 },
          { id: "away-hcp", name: "2", odds: 3.40 }
        ]
      },
      {
        id: "handicap-1",
        name: "Handicap (-1)",
        category: "handicap", 
        outcomes: [
          { id: "home-hcp-1", name: "1", odds: 3.20 },
          { id: "draw-hcp-1", name: "X", odds: 3.10 },
          { id: "away-hcp-1", name: "2", odds: 2.05 }
        ]
      },
      {
        id: "correct-score-1",
        name: "Correct Score - Popular",
        category: "correct-score",
        outcomes: [
          { id: "1-0", name: "1-0", odds: 7.50 },
          { id: "2-0", name: "2-0", odds: 9.00 },
          { id: "2-1", name: "2-1", odds: 8.50 },
          { id: "1-1", name: "1-1", odds: 5.50 },
          { id: "0-0", name: "0-0", odds: 8.00 },
          { id: "0-1", name: "0-1", odds: 11.00 }
        ]
      },
      {
        id: "first-goal",
        name: "First Goal Scorer",
        category: "player",
        outcomes: [
          { id: "any-player", name: "Any Time", odds: 4.50 },
          { id: "no-goal", name: "No Goal", odds: 12.00 }
        ]
      }
    ];
  }

  // Transform real SportMonks data if available
  const groupedByMarket = oddsData.reduce((acc, odd) => {
    const marketName = odd.market.name;
    if (!acc[marketName]) {
      acc[marketName] = {
        id: marketName.toLowerCase().replace(/\s+/g, '-'),
        name: marketName,
        category: categorizeMarket(marketName),
        outcomes: []
      };
    }
    
    acc[marketName].outcomes.push({
      id: odd.id.toString(),
      name: odd.label,
      odds: parseFloat(odd.value)
    });
    
    return acc;
  }, {} as Record<string, Market>);

  return Object.values(groupedByMarket);
};

const categorizeMarket = (marketName: string): string => {
  const name = marketName.toLowerCase();
  if (name.includes('winner') || name.includes('1x2')) return 'main';
  if (name.includes('goal') || name.includes('total') || name.includes('btts')) return 'goals';
  if (name.includes('score')) return 'correct-score';
  if (name.includes('handicap')) return 'handicap';
  if (name.includes('player') || name.includes('scorer')) return 'player';
  return 'other';
};

export default function MatchDetails({ onAddToBetSlip }: MatchDetailsProps) {
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({
    'main': true,
    'goals': true
  });

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ['/api/fixtures', matchId],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}`);
      if (!response.ok) throw new Error('Failed to fetch match details');
      return response.json();
    },
    enabled: !!matchId,
  });

  const { data: oddsData, isLoading: oddsLoading } = useQuery({
    queryKey: ['/api/fixtures', matchId, 'odds'],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}/odds`);
      if (!response.ok) throw new Error('Failed to fetch match odds');
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (matchLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading match details...</p>
        </div>
      </div>
    );
  }

  if (!matchData?.success || !matchData?.data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Match not found</h2>
          <p className="text-muted-foreground">The requested match could not be found.</p>
        </div>
      </div>
    );
  }

  const match: MatchDetails = matchData.data;
  const markets = transformOddsToMarkets(oddsData?.data || []);
  
  const marketsByCategory = markets.reduce((acc, market) => {
    if (!acc[market.category]) acc[market.category] = [];
    acc[market.category].push(market);
    return acc;
  }, {} as Record<string, Market[]>);

  const toggleMarketCategory = (category: string) => {
    setExpandedMarkets(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const formatKickoffTime = (kickoffTime: string) => {
    const date = new Date(kickoffTime);
    return {
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    };
  };

  const getCategoryName = (category: string) => {
    const names: Record<string, string> = {
      'main': 'Main Markets',
      'goals': 'Goals',
      'handicap': 'Handicap',
      'correct-score': 'Correct Score',
      'player': 'Player Markets',
      'other': 'Other Markets'
    };
    return names[category] || category;
  };

  const kickoff = formatKickoffTime(match.kickoffTime);

  return (
    <div className="min-h-screen bg-background">
      {/* Match Header */}
      <div className="bg-card border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Badge variant="outline" className="text-xs">
              {match.league}
            </Badge>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{kickoff.time}</span>
              <span>•</span>
              <span>{kickoff.date}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center flex-1">
              <h1 className="text-xl font-bold">{match.homeTeam.name}</h1>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold mb-1">
                {match.status === 'LIVE' && match.homeScore !== undefined && match.awayScore !== undefined ? (
                  `${match.homeScore} - ${match.awayScore}`
                ) : (
                  `${kickoff.time}`
                )}
              </div>
              {match.status === 'LIVE' && match.minute && (
                <div className="text-sm text-green-600 font-medium">
                  {match.minute}'
                </div>
              )}
              {match.status === 'SCHEDULED' && (
                <div className="text-sm text-muted-foreground">
                  Kick-off
                </div>
              )}
            </div>
            
            <div className="text-center flex-1">
              <h1 className="text-xl font-bold">{match.awayTeam.name}</h1>
            </div>
          </div>

          {match.venue && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{match.venue}</span>
            </div>
          )}
        </div>
      </div>

      {/* Betting Markets */}
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {Object.entries(marketsByCategory).map(([category, categoryMarkets]) => (
            <Card key={category} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleMarketCategory(category)}
                data-testid={`header-market-${category}`}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{getCategoryName(category)}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {categoryMarkets.length} markets
                    </Badge>
                    {expandedMarkets[category] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <AnimatePresence>
                {expandedMarkets[category] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        {categoryMarkets.map((market) => (
                          <div key={market.id} className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/30 px-4 py-2 border-b">
                              <h4 className="font-medium text-sm">{market.name}</h4>
                            </div>
                            <div className="p-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                {market.outcomes.map((outcome) => (
                                  <Button
                                    key={outcome.id}
                                    variant="outline"
                                    className="h-12 flex flex-col justify-center text-center hover:bg-primary hover:text-primary-foreground transition-colors"
                                    onClick={() => onAddToBetSlip?.({
                                      matchId: match.id,
                                      marketId: market.id,
                                      outcomeId: outcome.id,
                                      selection: outcome.name,
                                      odds: outcome.odds,
                                      match: `${match.homeTeam.name} vs ${match.awayTeam.name}`
                                    })}
                                    data-testid={`button-odds-${outcome.id}`}
                                  >
                                    <div className="text-xs font-medium mb-1">
                                      {outcome.name}
                                    </div>
                                    <div className="text-sm font-bold">
                                      {outcome.odds.toFixed(2)}
                                    </div>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          ))}
        </div>

        {oddsLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Updating odds...</p>
          </div>
        )}
      </div>
    </div>
  );
}