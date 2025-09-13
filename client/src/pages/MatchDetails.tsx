import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronDown,
  ChevronUp,
  Calendar,
  MapPin,
  Clock,
  Users,
  TrendingUp,
  BarChart3
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

interface WinProbability {
  home: number;
  draw: number;
  away: number;
}

interface HeadToHeadMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
}

const MARKET_CATEGORIES = {
  main: "Main Markets",
  goals: "Goals",
  correctScore: "Correct Score", 
  teamSpecials: "Team Specials",
  combination: "Combination Markets",
  player: "Player Specials"
};

export default function MatchDetails({ onAddToBetSlip }: MatchDetailsProps) {
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["main"]) // Main markets always expanded
  );

  // Fetch match details
  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ['/api/fixtures', matchId],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}`);
      if (!response.ok) throw new Error('Failed to fetch match details');
      return response.json();
    },
    enabled: !!matchId,
  });

  // Fetch match odds and markets
  const { data: oddsData, isLoading: oddsLoading } = useQuery({
    queryKey: ['/api/fixtures', matchId, 'odds'],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}/odds`);
      if (!response.ok) throw new Error('Failed to fetch match odds');
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const match: MatchDetails | null = matchData?.data || null;
  const markets: Market[] = oddsData?.data || [];

  // Mock data for development - will be replaced with real API data
  const mockWinProbability: WinProbability = {
    home: 45,
    draw: 25,
    away: 30
  };

  const mockHeadToHead: HeadToHeadMatch[] = [
    {
      date: "2024-01-15",
      homeTeam: "Brentford",
      awayTeam: "Chelsea", 
      homeScore: 2,
      awayScore: 0,
      competition: "Premier League"
    },
    {
      date: "2023-10-28",
      homeTeam: "Chelsea",
      awayTeam: "Brentford",
      homeScore: 2,
      awayScore: 1,
      competition: "Premier League"
    },
    {
      date: "2023-04-26",
      homeTeam: "Brentford", 
      awayTeam: "Chelsea",
      homeScore: 0,
      awayScore: 1,
      competition: "Premier League"
    }
  ];

  // Group markets by category
  const marketsByCategory = markets.reduce((acc, market) => {
    const category = market.category || 'main';
    if (!acc[category]) acc[category] = [];
    acc[category].push(market);
    return acc;
  }, {} as Record<string, Market[]>);

  // Calculate win probability from odds (for main 1x2 market)
  const calculateWinProbability = (odds: { home: number; draw: number; away: number }): WinProbability => {
    const homeProb = 1 / odds.home;
    const drawProb = 1 / odds.draw;
    const awayProb = 1 / odds.away;
    const total = homeProb + drawProb + awayProb;
    
    return {
      home: Math.round((homeProb / total) * 100),
      draw: Math.round((drawProb / total) * 100),
      away: Math.round((awayProb / total) * 100)
    };
  };

  const toggleCategory = (category: string) => {
    if (category === 'main') return; // Main markets always expanded
    
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleOddsClick = (matchId: string, market: string, outcome: string, odds: number) => {
    if (!onAddToBetSlip || !match) return;

    const selection = {
      id: `${matchId}-${market}-${outcome}`,
      matchId,
      market,
      type: outcome,
      odds,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      league: match.league
    };
    
    onAddToBetSlip(selection);
  };

  if (matchLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <BarChart3 className="h-8 w-8 text-primary animate-pulse mx-auto mb-2" />
          <p className="text-muted-foreground">Loading match details...</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground">Match not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 p-4 h-full">
      {/* Center Section - Markets & Odds */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* Match Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-lg p-4 border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="font-semibold text-lg">{match.homeTeam.name}</div>
                <div className="text-sm text-muted-foreground">Home</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">VS</div>
                {match.status === 'live' && (
                  <Badge variant="destructive" className="animate-pulse">
                    LIVE {match.minute}'
                  </Badge>
                )}
                {match.homeScore !== undefined && match.awayScore !== undefined && (
                  <div className="text-lg font-semibold text-destructive">
                    {match.homeScore} - {match.awayScore}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">{match.awayTeam.name}</div>
                <div className="text-sm text-muted-foreground">Away</div>
              </div>
            </div>
            
            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(match.kickoffTime).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {new Date(match.kickoffTime).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {match.venue}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Markets */}
        <div className="space-y-2">
          {Object.entries(MARKET_CATEGORIES).map(([categoryKey, categoryName]) => {
            const categoryMarkets = marketsByCategory[categoryKey] || [];
            const isExpanded = expandedCategories.has(categoryKey);
            const isMain = categoryKey === 'main';

            if (categoryMarkets.length === 0 && !isMain) return null;

            return (
              <motion.div
                key={categoryKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-lg border overflow-hidden"
              >
                {/* Category Header */}
                <div
                  onClick={() => toggleCategory(categoryKey)}
                  className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                    isMain ? 'bg-primary text-primary-foreground' : 'bg-primary/10 hover:bg-primary/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{categoryName}</span>
                    <Badge variant="secondary" className="bg-background/20">
                      {categoryMarkets.length || '0'}
                    </Badge>
                  </div>
                  {!isMain && (
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  )}
                </div>

                {/* Category Markets */}
                <AnimatePresence>
                  {(isExpanded || isMain) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 space-y-4 bg-card">
                        {categoryMarkets.length === 0 ? (
                          <div className="text-center py-4">
                            <p className="text-muted-foreground">Markets coming soon...</p>
                          </div>
                        ) : (
                          categoryMarkets.map((market) => (
                            <div key={market.id} className="space-y-2">
                              <h4 className="font-medium text-sm">{market.name}</h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {market.outcomes.map((outcome) => (
                                  <Button
                                    key={outcome.id}
                                    variant="outline"
                                    size="default"
                                    onClick={() => handleOddsClick(matchId!, market.name, outcome.name, outcome.odds)}
                                    className="flex flex-col gap-1 h-auto py-3"
                                    data-testid={`button-odds-${outcome.name.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    <span className="text-xs text-muted-foreground">{outcome.name}</span>
                                    <span className="font-semibold text-lg">{outcome.odds.toFixed(2)}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Right Section - Match Info Card */}
      <div className="w-80 space-y-4 overflow-y-auto">
        {/* Win Probability */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Win Probability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{match.homeTeam.name}</span>
                    <span className="font-semibold">{mockWinProbability.home}%</span>
                  </div>
                  <Progress value={mockWinProbability.home} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Draw</span>
                    <span className="font-semibold">{mockWinProbability.draw}%</span>
                  </div>
                  <Progress value={mockWinProbability.draw} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{match.awayTeam.name}</span>
                    <span className="font-semibold">{mockWinProbability.away}%</span>
                  </div>
                  <Progress value={mockWinProbability.away} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Head to Head */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Previous Meetings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockHeadToHead.map((match, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(match.date).toLocaleDateString()} • {match.competition}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{match.homeScore} - {match.awayScore}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}