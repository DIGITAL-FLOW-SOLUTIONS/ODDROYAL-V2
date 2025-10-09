import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, Clock } from "lucide-react";
import { marketsCache } from "@/lib/marketsCache";

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

interface MatchInfo {
  id: string;
  homeTeam: { name: string; logo?: string };
  awayTeam: { name: string; logo?: string };
  league: string;
  kickoffTime: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
}

const CATEGORY_TABS = [
  { id: "all", label: "All" },
  { id: "main", label: "Main" },
  { id: "goals", label: "Goals" },
  { id: "handicap", label: "Handicap" },
  { id: "correct-score", label: "Correct Score" },
  { id: "halves", label: "Halves" },
  { id: "specials", label: "Specials" },
];

export default function MatchDetails({ onAddToBetSlip }: MatchDetailsProps) {
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  const [activeTab, setActiveTab] = useState("all");
  const [cachedMarkets, setCachedMarkets] = useState<Market[]>([]);
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  // Fetch match info
  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["/api/fixtures", matchId],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}`);
      if (!response.ok) throw new Error("Failed to fetch match details");
      return response.json();
    },
    enabled: !!matchId,
  });

  // Fetch fresh odds in background
  const { data: oddsData } = useQuery({
    queryKey: ["/api/fixtures", matchId, "odds"],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}/odds`);
      if (!response.ok) throw new Error("Failed to fetch match odds");
      const data = await response.json();
      
      // Update cache with fresh data
      if (matchId && matchData?.data && data?.data) {
        const markets = transformOddsToMarkets(data.data);
        const match = matchData.data;
        
        marketsCache.setMarket(matchId, {
          matchId,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          league: match.league,
          sport: 'football',
          status: match.status,
          kickoffTime: match.kickoffTime,
          markets,
          lastUpdate: new Date().toISOString(),
        });
        
        setCachedMarkets(markets);
      }
      
      return data;
    },
    enabled: !!matchId,
    refetchInterval: matchData?.data?.status === 'LIVE' ? 5000 : 30000,
  });

  // Load from cache immediately
  useEffect(() => {
    if (!matchId) return;
    
    const loadFromCache = async () => {
      setIsLoadingCache(true);
      const cached = marketsCache.getMarket(matchId);
      
      if (cached && cached.markets && cached.markets.length > 0) {
        console.log(`📦 Loaded ${cached.markets.length} markets from cache for match ${matchId}`);
        setCachedMarkets(cached.markets);
      } else {
        console.log(`❌ No cached markets for match ${matchId}`);
      }
      
      setIsLoadingCache(false);
    };
    
    loadFromCache();
  }, [matchId]);

  if (matchLoading || isLoadingCache) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading match...</p>
        </div>
      </div>
    );
  }

  if (!matchData?.success || !matchData?.data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Match not found</h2>
          <p className="text-muted-foreground">
            The requested match could not be found.
          </p>
        </div>
      </div>
    );
  }

  const match: MatchInfo = matchData.data;
  const markets = cachedMarkets.length > 0 ? cachedMarkets : transformOddsToMarkets(oddsData?.data || []);

  const marketsByCategory = markets.reduce(
    (acc, market) => {
      if (!acc[market.category]) acc[market.category] = [];
      acc[market.category].push(market);
      return acc;
    },
    {} as Record<string, Market[]>,
  );

  const filteredMarkets = activeTab === "all" 
    ? markets 
    : marketsByCategory[activeTab] || [];

  const formatKickoffTime = (kickoffTime: string) => {
    const date = new Date(kickoffTime);
    return {
      time: date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      date: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  };

  const kickoff = formatKickoffTime(match.kickoffTime);

  return (
    <div className="min-h-screen bg-background">
      {/* Match Header */}
      <div className="bg-surface-2 border-b">
        <div className="container mx-auto px-4 py-4">
          {/* League */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{match.league}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{kickoff.date} • {kickoff.time}</span>
            </div>
          </div>

          {/* Teams */}
          <div className="flex items-center justify-between gap-4">
            {/* Home Team */}
            <div className="flex items-center gap-3 flex-1">
              {match.homeTeam.logo && (
                <img
                  src={match.homeTeam.logo}
                  alt={match.homeTeam.name}
                  className="w-8 h-8 object-contain"
                />
              )}
              <span className="font-semibold text-lg">{match.homeTeam.name}</span>
              {match.status === "LIVE" && match.homeScore !== undefined && (
                <Badge className="ml-auto">{match.homeScore}</Badge>
              )}
            </div>

            {/* Status/Time */}
            <div className="text-center px-4">
              {match.status === "LIVE" && match.minute ? (
                <Badge variant="destructive" className="text-sm">
                  {match.minute}' LIVE
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">{kickoff.time}</span>
              )}
            </div>

            {/* Away Team */}
            <div className="flex items-center gap-3 flex-1 justify-end">
              {match.status === "LIVE" && match.awayScore !== undefined && (
                <Badge className="mr-auto">{match.awayScore}</Badge>
              )}
              <span className="font-semibold text-lg">{match.awayTeam.name}</span>
              {match.awayTeam.logo && (
                <img
                  src={match.awayTeam.logo}
                  alt={match.awayTeam.name}
                  className="w-8 h-8 object-contain"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Markets Tabs */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Horizontal Tab Navigation */}
          <TabsList className="w-full justify-start mb-6 bg-surface-2 h-auto p-1 gap-1">
            {CATEGORY_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-testid={`tab-${tab.id}`}
              >
                {tab.label}
                {tab.id !== "all" && marketsByCategory[tab.id] && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {marketsByCategory[tab.id].length}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Content */}
          {CATEGORY_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              <div className="space-y-4">
                {filteredMarkets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No markets available in this category
                  </div>
                ) : (
                  filteredMarkets.map((market) => (
                    <motion.div
                      key={market.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-surface-2 rounded-lg overflow-hidden"
                    >
                      {/* Market Name */}
                      <div className="px-4 py-3 border-b bg-surface-3">
                        <h4 className="font-medium text-sm">{market.name}</h4>
                      </div>

                      {/* Outcomes */}
                      <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                          {market.outcomes.map((outcome) => (
                            <Button
                              key={outcome.id}
                              variant="outline"
                              className="h-auto py-3 flex flex-col justify-center hover-elevate active-elevate-2"
                              onClick={() =>
                                onAddToBetSlip?.({
                                  id: `${match.id}-${market.id}-${outcome.id}`,
                                  matchId: match.id,
                                  fixtureId: match.id,
                                  market: market.id,
                                  type: outcome.id,
                                  selection: outcome.name,
                                  odds: outcome.odds,
                                  homeTeam: match.homeTeam.name,
                                  awayTeam: match.awayTeam.name,
                                  league: match.league,
                                  isLive: match.status === "LIVE",
                                })
                              }
                              data-testid={`button-odds-${outcome.id}`}
                            >
                              <div className="text-xs text-muted-foreground mb-1">
                                {outcome.name}
                              </div>
                              <div className="text-base font-bold">
                                {outcome.odds.toFixed(2)}
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

// Transform odds data to markets format
const transformOddsToMarkets = (oddsData: any[]): Market[] => {
  if (!oddsData || oddsData.length === 0) {
    // Return comprehensive mock markets
    return [
      {
        id: "1x2",
        name: "Match Winner (1X2)",
        category: "main",
        outcomes: [
          { id: "home", name: "1", odds: 2.25 },
          { id: "draw", name: "X", odds: 3.1 },
          { id: "away", name: "2", odds: 2.85 },
        ],
      },
      {
        id: "double-chance",
        name: "Double Chance",
        category: "main",
        outcomes: [
          { id: "1x", name: "1X", odds: 1.44 },
          { id: "12", name: "12", odds: 1.28 },
          { id: "x2", name: "X2", odds: 1.53 },
        ],
      },
      {
        id: "over-under-25",
        name: "Total Goals O/U 2.5",
        category: "goals",
        outcomes: [
          { id: "over-25", name: "Over 2.5", odds: 1.85 },
          { id: "under-25", name: "Under 2.5", odds: 1.95 },
        ],
      },
      {
        id: "over-under-15",
        name: "Total Goals O/U 1.5",
        category: "goals",
        outcomes: [
          { id: "over-15", name: "Over 1.5", odds: 1.33 },
          { id: "under-15", name: "Under 1.5", odds: 3.2 },
        ],
      },
      {
        id: "over-under-35",
        name: "Total Goals O/U 3.5",
        category: "goals",
        outcomes: [
          { id: "over-35", name: "Over 3.5", odds: 2.65 },
          { id: "under-35", name: "Under 3.5", odds: 1.48 },
        ],
      },
      {
        id: "both-teams-score",
        name: "Both Teams to Score",
        category: "goals",
        outcomes: [
          { id: "yes", name: "Yes", odds: 1.7 },
          { id: "no", name: "No", odds: 2.15 },
        ],
      },
      {
        id: "handicap-0",
        name: "Asian Handicap (0:0)",
        category: "handicap",
        outcomes: [
          { id: "home-0", name: "Home (0)", odds: 1.95 },
          { id: "away-0", name: "Away (0)", odds: 1.87 },
        ],
      },
      {
        id: "handicap-1",
        name: "Asian Handicap (-1:+1)",
        category: "handicap",
        outcomes: [
          { id: "home-1", name: "Home (-1)", odds: 3.2 },
          { id: "away-1", name: "Away (+1)", odds: 1.35 },
        ],
      },
      {
        id: "correct-score-1",
        name: "Correct Score - Popular",
        category: "correct-score",
        outcomes: [
          { id: "1-0", name: "1-0", odds: 7.5 },
          { id: "2-0", name: "2-0", odds: 9.0 },
          { id: "2-1", name: "2-1", odds: 8.5 },
          { id: "1-1", name: "1-1", odds: 5.5 },
          { id: "0-0", name: "0-0", odds: 8.0 },
          { id: "0-1", name: "0-1", odds: 11.0 },
          { id: "0-2", name: "0-2", odds: 15.0 },
          { id: "1-2", name: "1-2", odds: 12.0 },
        ],
      },
      {
        id: "ht-ft",
        name: "Half Time / Full Time",
        category: "halves",
        outcomes: [
          { id: "h-h", name: "H/H", odds: 3.2 },
          { id: "h-d", name: "H/D", odds: 8.5 },
          { id: "h-a", name: "H/A", odds: 15.0 },
          { id: "d-h", name: "D/H", odds: 4.5 },
          { id: "d-d", name: "D/D", odds: 5.0 },
          { id: "d-a", name: "D/A", odds: 7.0 },
          { id: "a-h", name: "A/H", odds: 20.0 },
          { id: "a-d", name: "A/D", odds: 12.0 },
          { id: "a-a", name: "A/A", odds: 4.2 },
        ],
      },
      {
        id: "first-half-winner",
        name: "First Half Winner",
        category: "halves",
        outcomes: [
          { id: "fh-1", name: "1", odds: 2.8 },
          { id: "fh-x", name: "X", odds: 2.3 },
          { id: "fh-2", name: "2", odds: 3.4 },
        ],
      },
      {
        id: "clean-sheet-home",
        name: "Home Team Clean Sheet",
        category: "specials",
        outcomes: [
          { id: "cs-yes", name: "Yes", odds: 2.5 },
          { id: "cs-no", name: "No", odds: 1.52 },
        ],
      },
      {
        id: "clean-sheet-away",
        name: "Away Team Clean Sheet",
        category: "specials",
        outcomes: [
          { id: "cs-away-yes", name: "Yes", odds: 3.1 },
          { id: "cs-away-no", name: "No", odds: 1.38 },
        ],
      },
    ];
  }

  // Transform real data if available
  const groupedByMarket = oddsData.reduce(
    (acc, odd: any) => {
      const marketName = odd.market?.name || "Unknown";
      if (!acc[marketName]) {
        acc[marketName] = {
          id: marketName.toLowerCase().replace(/\s+/g, "-"),
          name: marketName,
          category: categorizeMarket(marketName),
          outcomes: [],
        };
      }

      acc[marketName].outcomes.push({
        id: odd.id?.toString() || Math.random().toString(),
        name: odd.label || "Unknown",
        odds: parseFloat(odd.value) || 0,
      });

      return acc;
    },
    {} as Record<string, Market>,
  );

  return Object.values(groupedByMarket);
};

const categorizeMarket = (marketName: string): string => {
  const name = marketName.toLowerCase();
  if (name.includes("winner") || name.includes("1x2") || name.includes("double chance")) 
    return "main";
  if (name.includes("goal") || name.includes("total") || name.includes("btts") || name.includes("score"))
    return "goals";
  if (name.includes("correct") && name.includes("score")) 
    return "correct-score";
  if (name.includes("handicap")) 
    return "handicap";
  if (name.includes("half") || name.includes("ht") || name.includes("ft")) 
    return "halves";
  return "specials";
};
