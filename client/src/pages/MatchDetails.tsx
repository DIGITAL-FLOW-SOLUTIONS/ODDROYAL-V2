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
  MapPin,
} from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useMatchStore } from "@/store/matchStore";
import { LazyImage } from "@/components/LazyImage";

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLive: boolean;
}

function useCountdown(targetDate: string): CountdownTime {
  const [countdown, setCountdown] = useState<CountdownTime>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isLive: false,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        setCountdown({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
          isLive: false,
        });
      } else {
        // Time has passed - match is live
        setCountdown({ 
          days: 0, 
          hours: 0, 
          minutes: 0, 
          seconds: 0, 
          isLive: true 
        });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}

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
  
  // Store commence_time to prevent it from changing during re-renders
  const [commenceTime, setCommenceTime] = useState<string | null>(null);

  // Get match from Zustand store (populated by Ably subscriptions from homepage)
  const storeMatch = useMatchStore((state) => state.getMatch(matchId || ""));
  
  // Subscribe to store updates for real-time changes
  const lastUpdate = useMatchStore((state) => state.lastUpdate);

  // Fetch from API as fallback (runs when store is empty or as backup for deep links)
  const { data: apiMatchData, isLoading: apiMatchLoading } = useQuery({
    queryKey: ["/api/match", matchId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/details`);
      if (!response.ok) throw new Error("Failed to fetch match details");
      return response.json();
    },
    enabled: !!matchId,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Fetch markets (with multi-layer caching: Memory → Redis → Fallback)
  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["/api/match", matchId, "markets"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/markets`);
      if (!response.ok) {
        return { success: true, data: { markets: [] } };
      }
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 30000,
  });

  // Use store match if available, otherwise use API fallback
  const matchSource = storeMatch || apiMatchData?.data;
  
  // Store commence_time once we have it - prevents countdown from resetting
  useEffect(() => {
    if (matchSource?.commence_time && !commenceTime) {
      setCommenceTime(matchSource.commence_time);
    }
  }, [matchSource?.commence_time, commenceTime]);

  // IMPORTANT: Call useCountdown unconditionally before any conditional returns
  // This prevents "Rendered more hooks than during the previous render" error
  // Use stored commence_time to prevent countdown from changing
  const countdown = useCountdown(commenceTime || new Date().toISOString());

  // Determine loading state - show skeleton while fetching or waiting for Ably data
  // Don't show error immediately - give time for Ably subscription to populate store
  const isLoading = (!matchSource && apiMatchLoading) || marketsLoading;

  if (isLoading) {
    return <MatchDetailsSkeleton />;
  }

  // Only show "not found" if API explicitly returned 404 or data is truly unavailable
  if (!matchSource && apiMatchData?.error) {
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

  // Continue showing skeleton if no data yet (waiting for Ably)
  if (!matchSource) {
    return <MatchDetailsSkeleton />;
  }

  // Validate that essential match data exists
  if (!matchSource.home_team || !matchSource.away_team || !matchSource.match_id) {
    return <MatchDetailsSkeleton />;
  }

  const match: MatchDetails = {
    id: matchSource.match_id,
    homeTeam: {
      name: matchSource.home_team,
      logo: matchSource.home_team_logo,
    },
    awayTeam: {
      name: matchSource.away_team,
      logo: matchSource.away_team_logo,
    },
    league: matchSource.league_name || 'Unknown League',
    kickoffTime: matchSource.commence_time || new Date().toISOString(),
    status: matchSource.status === 'live' ? 'LIVE' : matchSource.status === 'completed' ? 'FINISHED' : 'SCHEDULED',
    homeScore: matchSource.scores?.home,
    awayScore: matchSource.scores?.away,
    sportKey: matchSource.sport_key,
  };

  const sportKey = matchSource.sport_key || 'default';
  
  // Markets are generated by worker and cached in Redis
  const markets: Market[] = marketsData?.data?.markets || [];

  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets((prev) => ({
      ...prev,
      [marketKey]: !prev[marketKey],
    }));
  };

  const formatKickoffTime = (kickoffTime: string) => {
    // Parse UTC time and convert to local time for display
    const date = new Date(kickoffTime);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return {
        time: "Invalid Time",
        date: "Invalid Date",
      };
    }
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

  const getTeamNameSize = (name: string): string => {
    const length = name.length;
    if (length <= 10) return "text-sm";
    if (length <= 15) return "text-xs";
    return "text-[10px]";
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
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3">
          {/* Home Team */}
          <div className="text-center flex-1 max-w-[100px] sm:max-w-[120px]">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
              {match.homeTeam.logo ? (
                <LazyImage 
                  src={match.homeTeam.logo} 
                  alt={match.homeTeam.name}
                  className="w-6 h-6 sm:w-8 sm:h-8"
                  width={32}
                  height={32}
                />
              ) : (
                <span className="text-base sm:text-lg font-bold text-foreground">
                  {match.homeTeam.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <p className={`${getTeamNameSize(match.homeTeam.name || '')} font-bold text-foreground leading-tight px-1`}>
              {match.homeTeam.name || 'Unknown'}
            </p>
          </div>

          {/* Score/Time */}
          <div className="text-center min-w-[60px] sm:min-w-[80px]">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-0.5 sm:mb-1">
              {match.status === "LIVE" &&
              match.homeScore !== undefined &&
              match.awayScore !== undefined
                ? `${match.homeScore} - ${match.awayScore}`
                : kickoff.time}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              {kickoff.date}
            </div>
            {match.status === "LIVE" && match.minute && (
              <Badge variant="destructive" className="text-xs mt-1">
                {match.minute}' LIVE
              </Badge>
            )}
          </div>

          {/* Away Team */}
          <div className="text-center flex-1 max-w-[100px] sm:max-w-[120px]">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
              {match.awayTeam.logo ? (
                <LazyImage 
                  src={match.awayTeam.logo} 
                  alt={match.awayTeam.name}
                  className="w-6 h-6 sm:w-8 sm:h-8"
                  width={32}
                  height={32}
                />
              ) : (
                <span className="text-base sm:text-lg font-bold text-foreground">
                  {match.awayTeam.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <p className={`${getTeamNameSize(match.awayTeam.name || '')} font-bold text-foreground leading-tight px-1`}>
              {match.awayTeam.name || 'Unknown'}
            </p>
          </div>
        </div>

        {/* Countdown Timer - Always visible */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 text-foreground/90 mb-2 min-h-[52px]" data-testid="match-countdown-container">
          {countdown.isLive || match.status === "LIVE" ? (
            <div className="flex items-center gap-2" data-testid="match-live-indicator">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive live-blink" />
              <span className="text-xl sm:text-2xl font-bold text-destructive tracking-wider">
                LIVE
              </span>
              <div className="w-2.5 h-2.5 rounded-full bg-destructive live-blink" />
            </div>
          ) : match.status === "FINISHED" ? (
            <div className="text-lg sm:text-xl font-bold text-muted-foreground" data-testid="match-finished-indicator">
              FINISHED
            </div>
          ) : (
            <>
              <div className="text-center min-w-[45px] sm:min-w-[52px]" data-testid="countdown-days">
                <div className="text-lg sm:text-xl font-bold leading-none">
                  {String(countdown.days).padStart(2, '0')}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                  days
                </div>
              </div>
              <span className="text-base sm:text-lg font-bold pb-3">:</span>
              <div className="text-center min-w-[45px] sm:min-w-[52px]" data-testid="countdown-hours">
                <div className="text-lg sm:text-xl font-bold leading-none">
                  {String(countdown.hours).padStart(2, '0')}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                  hours
                </div>
              </div>
              <span className="text-base sm:text-lg font-bold pb-3">:</span>
              <div className="text-center min-w-[45px] sm:min-w-[52px]" data-testid="countdown-minutes">
                <div className="text-lg sm:text-xl font-bold leading-none">
                  {String(countdown.minutes).padStart(2, '0')}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                  minutes
                </div>
              </div>
              <span className="text-base sm:text-lg font-bold pb-3">:</span>
              <div className="text-center min-w-[45px] sm:min-w-[52px]" data-testid="countdown-seconds">
                <div className="text-lg sm:text-xl font-bold leading-none">
                  {String(countdown.seconds).padStart(2, '0')}
                </div>
                <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                  seconds
                </div>
              </div>
            </>
          )}
        </div>

        {/* Venue Info */}
        {match.venue && (
          <div className="flex items-center justify-center text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 mr-1" />
            <span>{match.venue}</span>
          </div>
        )}
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
