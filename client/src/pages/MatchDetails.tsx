import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import PageLoader from "@/components/PageLoader";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useMatchStore } from "@/store/matchStore";
import { LazyImage } from "@/components/LazyImage";
import { isLiveByTime, isMatchFinished } from "@/lib/matchStatusUtils";

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
  const { onAddToBetSlip, betSlipSelections } = useBetSlip();
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({});
  const [activeMarket, setActiveMarket] = useState<string | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const hasInitializedMarkets = useRef(false);
  
  // Store commence_time to prevent it from changing during re-renders
  const [commenceTime, setCommenceTime] = useState<string | null>(null);

  // Get match from Zustand store (populated by Ably subscriptions from homepage)
  const storeMatch = useMatchStore((state) => state.getMatch(matchId || ""));
  
  // Get markets Map from Zustand store (pre-generated on hydrate for instant display)
  const marketsMap = useMatchStore((state) => state.markets);
  
  // Subscribe to store updates for real-time changes
  const lastUpdate = useMatchStore((state) => state.lastUpdate);
  
  // Filter markets for this match using useMemo to prevent infinite re-renders
  const storeMarkets = useMemo(() => {
    return Array.from(marketsMap.values()).filter(m => m.match_id === matchId);
  }, [marketsMap, matchId]);

  // Fetch from API as fallback (runs when store is empty or as backup for deep links)
  const { data: apiMatchData, isLoading: apiMatchLoading } = useQuery({
    queryKey: ["/api/match", matchId, "details"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/details`);
      if (!response.ok) throw new Error("Failed to fetch match details");
      return response.json();
    },
    enabled: !!matchId && !storeMatch,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Fetch markets as fallback (only when store is empty)
  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["/api/match", matchId, "markets"],
    queryFn: async () => {
      const response = await fetch(`/api/match/${matchId}/markets`);
      if (!response.ok) {
        return { success: true, data: { markets: [] } };
      }
      return response.json();
    },
    enabled: !!matchId && storeMarkets.length === 0,
    refetchInterval: 30000,
  });

  // Use store match if available, otherwise use API fallback
  const matchSource = storeMatch || apiMatchData?.data;
  
  // Use store markets if available, otherwise use API fallback
  const markets: Market[] = storeMarkets.length > 0 ? storeMarkets : (marketsData?.data?.markets || []);

  // Store commence_time once we have it - prevents countdown from resetting
  useEffect(() => {
    if (matchSource?.commence_time && !commenceTime) {
      setCommenceTime(matchSource.commence_time);
    }
  }, [matchSource?.commence_time, commenceTime]);

  // Initialize all markets as expanded and set first market as active (only once)
  // IMPORTANT: This useEffect must be called BEFORE any conditional returns
  useEffect(() => {
    if (markets.length > 0 && !hasInitializedMarkets.current) {
      const initialExpanded: Record<string, boolean> = {};
      markets.forEach(market => {
        initialExpanded[market.key] = true;
      });
      setExpandedMarkets(initialExpanded);
      setActiveMarket(markets[0].key);
      hasInitializedMarkets.current = true;
    }
  }, [markets]);

  // IMPORTANT: Call useCountdown unconditionally before any conditional returns
  // This prevents "Rendered more hooks than during the previous render" error
  // Use stored commence_time to prevent countdown from changing
  const countdown = useCountdown(commenceTime || new Date().toISOString());

  // Show page loader only while fetching from API (no skeleton)
  // Markets load from store instantly, only wait for match data
  const isLoading = !matchSource && apiMatchLoading;

  if (isLoading) {
    return <PageLoader />;
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

  // Continue showing page loader if no data yet (waiting for Ably)
  if (!matchSource) {
    return <PageLoader />;
  }

  // Validate that essential match data exists
  if (!matchSource.home_team || !matchSource.away_team || !matchSource.match_id) {
    return <PageLoader />;
  }

  // Determine actual match status - use centralized time-based check with cached commence_time
  // This prevents flickering when backend status changes prematurely
  // Use cached commence_time to handle edge case where API temporarily omits the field
  const matchWithCachedTime = { 
    ...matchSource, 
    commence_time: commenceTime || matchSource.commence_time 
  };
  const actualStatus = isLiveByTime(matchWithCachedTime) ? 'LIVE' 
                      : isMatchFinished(matchWithCachedTime) ? 'FINISHED' 
                      : 'SCHEDULED';

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
    status: actualStatus,
    homeScore: matchSource.scores?.home,
    awayScore: matchSource.scores?.away,
    sportKey: matchSource.sport_key,
  };

  const sportKey = matchSource.sport_key || 'default';

  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets((prev) => ({
      ...prev,
      [marketKey]: !prev[marketKey],
    }));
  };

  const scrollToMarket = (direction: 'left' | 'right') => {
    if (scrollContainer) {
      const scrollAmount = 200;
      scrollContainer.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleMarketTabClick = (marketKey: string) => {
    setActiveMarket(marketKey);
    const element = document.getElementById(`market-${marketKey}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

  // Helper function to check if an outcome is selected in the betslip
  const isOutcomeSelected = (market: Market, outcome: any): boolean => {
    const selectionId = `${match.id}-${market.key}-${outcome.name}`;
    return betSlipSelections?.some(selection => selection.id === selectionId) || false;
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
          {match.status === "LIVE" ? (
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

      {/* Market Navigation Header */}
      {markets.length > 0 && (
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="flex items-center gap-2 px-2 py-3">
            {/* Left Arrow */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => scrollToMarket('left')}
              className="shrink-0 h-8 w-8"
              data-testid="button-scroll-markets-left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Scrollable Market Tabs */}
            <div
              ref={setScrollContainer}
              className="flex-1 overflow-x-auto scrollbar-hide"
            >
              <div className="flex gap-2">
                {markets.map((market) => (
                  <button
                    key={market.key}
                    onClick={() => handleMarketTabClick(market.key)}
                    className={`
                      shrink-0 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium
                      transition-all duration-200 whitespace-nowrap
                      ${activeMarket === market.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover-elevate active-elevate-2'
                      }
                    `}
                    data-testid={`button-market-tab-${market.key}`}
                  >
                    {market.name} ({market.outcomes.length})
                  </button>
                ))}
              </div>
            </div>

            {/* Right Arrow */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => scrollToMarket('right')}
              className="shrink-0 h-8 w-8"
              data-testid="button-scroll-markets-right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Markets Section */}
      <div className="p-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {markets.map((market, index) => (
                <motion.div
                  key={market.key}
                  id={`market-${market.key}`}
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
                        <div className="p-4 pt-0 flex flex-col gap-2">
                          {market.outcomes.map((outcome: any, idx: number) => {
                            const isSelected = isOutcomeSelected(market, outcome);
                            return (
                              <button
                                key={idx}
                                onClick={() => handleOddsClick(market, outcome)}
                                className={`
                                  ${isSelected ? 'odds-button-selected' : 'odds-button'}
                                  flex flex-row items-center justify-between gap-2
                                  h-8 py-2 px-3 rounded-md
                                  min-w-0 w-full
                                `}
                                data-testid={`button-odds-${market.key}-${idx}`}
                              >
                                <span className="text-xs opacity-90 truncate flex-1 text-left">
                                  {outcome.point !== undefined ? `${outcome.name} ${outcome.point > 0 ? '+' : ''}${outcome.point}` : outcome.name}
                                </span>
                                <span className="text-sm font-bold shrink-0">
                                  {outcome.price.toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
