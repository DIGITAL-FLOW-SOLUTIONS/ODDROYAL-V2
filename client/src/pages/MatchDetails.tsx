import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  MapPin,
} from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";

interface Market {
  key: string;
  name: string;
  description?: string;
  outcomes: {
    name: string;
    price: number;
    point?: number;
  }[];
}

interface MatchDetails {
  id: string;
  homeTeam: { name: string; logo?: string };
  awayTeam: { name: string; logo?: string };
  league: string;
  kickoffTime: string;
  venue?: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  sportKey?: string;
}

// Mobile-first Skeleton Loader
function MatchDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header Skeleton */}
      <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-4">
        <Skeleton className="h-4 w-32 mx-auto mb-4" />
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center flex-1 max-w-[120px]">
            <Skeleton className="h-12 w-12 rounded-full mx-auto mb-2" />
            <Skeleton className="h-4 w-20 mx-auto" />
          </div>
          <Skeleton className="h-10 w-24" />
          <div className="text-center flex-1 max-w-[120px]">
            <Skeleton className="h-12 w-12 rounded-full mx-auto mb-2" />
            <Skeleton className="h-4 w-20 mx-auto" />
          </div>
        </div>
        <Skeleton className="h-3 w-40 mx-auto" />
      </div>

      {/* Markets Skeleton */}
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-16" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Sport-specific market configuration
const SPORT_MARKET_LABELS: Record<string, Record<string, string>> = {
  football: {
    h2h: 'Match Winner (1X2)',
    spreads: 'Asian Handicap',
    totals: 'Total Goals (O/U)',
  },
  basketball: {
    h2h: 'Match Winner',
    spreads: 'Point Spread',
    totals: 'Total Points (O/U)',
  },
  americanfootball: {
    h2h: 'Moneyline',
    spreads: 'Point Spread',
    totals: 'Total Points (O/U)',
  },
  baseball: {
    h2h: 'Moneyline',
    spreads: 'Run Line',
    totals: 'Total Runs (O/U)',
  },
  icehockey: {
    h2h: 'Moneyline',
    spreads: 'Puck Line',
    totals: 'Total Goals (O/U)',
  },
  cricket: {
    h2h: 'Match Winner',
  },
  mma: {
    h2h: 'Fight Winner',
  },
  default: {
    h2h: 'Match Winner',
    spreads: 'Handicap',
    totals: 'Total (O/U)',
  }
};

// Transform The Odds API bookmakers data into UI markets
function transformBookmakersToMarkets(bookmakers: any[], sportKey: string = 'default'): Market[] {
  if (!bookmakers || bookmakers.length === 0) return [];

  const labels = SPORT_MARKET_LABELS[sportKey] || SPORT_MARKET_LABELS.default;
  const bestBookmaker = bookmakers[0];
  
  if (!bestBookmaker.markets) return [];

  return bestBookmaker.markets.map((market: any) => ({
    key: market.key,
    name: labels[market.key] || market.key.replace(/_/g, ' ').toUpperCase(),
    outcomes: market.outcomes || [],
  }));
}

export default function MatchDetails() {
  const { onAddToBetSlip } = useBetSlip();
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["/api/match", matchId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/details`);
      if (!response.ok) throw new Error("Failed to fetch match details");
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["/api/match", matchId, "markets"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/markets`);
      if (!response.ok) {
        // Return empty markets instead of throwing - match might not have markets yet
        return { success: true, data: { markets: [] } };
      }
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  const isLoading = matchLoading || marketsLoading;

  if (isLoading) {
    return <MatchDetailsSkeleton />;
  }

  if (!matchData?.success || !matchData?.data) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Match not found</h2>
          <p className="text-muted-foreground">
            The requested match could not be found.
          </p>
        </div>
      </div>
    );
  }

  const match: MatchDetails = {
    id: matchData.data.match_id,
    homeTeam: {
      name: matchData.data.home_team,
      logo: matchData.data.home_team_logo,
    },
    awayTeam: {
      name: matchData.data.away_team,
      logo: matchData.data.away_team_logo,
    },
    league: matchData.data.league_name,
    kickoffTime: matchData.data.commence_time,
    status: matchData.data.status === 'live' ? 'LIVE' : matchData.data.status === 'completed' ? 'FINISHED' : 'SCHEDULED',
    homeScore: matchData.data.scores?.home,
    awayScore: matchData.data.scores?.away,
    sportKey: matchData.data.sport_key,
  };

  const sportKey = matchData.data.sport_key || 'default';
  
  // Transform persisted markets from database to UI format
  const dbMarkets = marketsData?.data?.markets || [];
  const markets: Market[] = dbMarkets.map((market: any) => ({
    key: market.key || market.type,
    name: market.name,
    description: market.parameter ? `Line: ${market.parameter}` : undefined,
    outcomes: (market.outcomes || []).map((outcome: any) => ({
      name: outcome.label,
      price: parseFloat(outcome.odds),
      point: outcome.point,
    })),
  }));

  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets((prev) => ({
      ...prev,
      [marketKey]: !prev[marketKey],
    }));
  };

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

  const handleOddsClick = (market: Market, outcome: any) => {
    if (!onAddToBetSlip) return;

    const selection = {
      id: `${match.id}-${market.key}-${outcome.name}`,
      matchId: match.id,
      fixtureId: match.id,
      type: outcome.name.toLowerCase(),
      selection: outcome.name,
      odds: outcome.price,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      league: match.league,
      market: market.key,
      isLive: match.status === "LIVE",
    };

    onAddToBetSlip(selection);
  };

  const kickoff = formatKickoffTime(match.kickoffTime);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-First Match Header */}
      <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{match.league}</span>
        </div>

        {/* Team Display */}
        <div className="flex items-center justify-center gap-4 mb-4">
          {/* Home Team */}
          <div className="text-center flex-1 max-w-[120px]">
            <div className="w-12 h-12 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-2">
              {match.homeTeam.logo ? (
                <img 
                  src={match.homeTeam.logo} 
                  alt={match.homeTeam.name}
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <span className="text-lg font-bold text-foreground">
                  {match.homeTeam.name.charAt(0)}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground truncate">
              {match.homeTeam.name}
            </p>
          </div>

          {/* Score/Time */}
          <div className="text-center min-w-[80px]">
            <div className="text-2xl md:text-3xl font-bold text-foreground mb-1">
              {match.status === "LIVE" &&
              match.homeScore !== undefined &&
              match.awayScore !== undefined
                ? `${match.homeScore} - ${match.awayScore}`
                : kickoff.time}
            </div>
            {match.status === "LIVE" && match.minute && (
              <Badge variant="destructive" className="text-xs">
                {match.minute}' LIVE
              </Badge>
            )}
          </div>

          {/* Away Team */}
          <div className="text-center flex-1 max-w-[120px]">
            <div className="w-12 h-12 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-2">
              {match.awayTeam.logo ? (
                <img 
                  src={match.awayTeam.logo} 
                  alt={match.awayTeam.name}
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <span className="text-lg font-bold text-foreground">
                  {match.awayTeam.name.charAt(0)}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground truncate">
              {match.awayTeam.name}
            </p>
          </div>
        </div>

        {/* Match Info */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{kickoff.date}</span>
          </div>
          {match.venue && (
            <>
              <span>•</span>
              <span>{match.venue}</span>
            </>
          )}
        </div>
      </div>

      {/* Markets Section */}
      <div className="p-4 space-y-3">
        {markets.length === 0 ? (
          <Card className="p-6">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                Markets will be available soon
              </p>
            </div>
          </Card>
        ) : (
          <AnimatePresence>
            {markets.map((market, index) => (
              <motion.div
                key={market.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className="overflow-hidden">
                  <button
                    onClick={() => toggleMarket(market.key)}
                    className="w-full p-4 flex items-center justify-between hover-elevate active-elevate-2"
                    data-testid={`button-toggle-market-${market.key}`}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm md:text-base">
                        {market.name}
                      </h3>
                      {market.description && (
                        <Badge variant="secondary" className="text-xs">
                          {market.description}
                        </Badge>
                      )}
                    </div>
                    {expandedMarkets[market.key] ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedMarkets[market.key] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 pt-0 grid grid-cols-2 md:grid-cols-3 gap-2">
                          {market.outcomes.map((outcome: any, idx: number) => (
                            <Button
                              key={idx}
                              variant="outline"
                              onClick={() => handleOddsClick(market, outcome)}
                              className="flex flex-col items-center justify-center h-auto py-3 hover-elevate active-elevate-2"
                              data-testid={`button-odds-${market.key}-${idx}`}
                            >
                              <span className="text-xs text-muted-foreground mb-1 truncate w-full text-center">
                                {outcome.point !== undefined ? `${outcome.name} ${outcome.point > 0 ? '+' : ''}${outcome.point}` : outcome.name}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {outcome.price.toFixed(2)}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
