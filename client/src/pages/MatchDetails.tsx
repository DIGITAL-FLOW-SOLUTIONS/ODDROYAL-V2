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
  MapPin,
  Star,
} from "lucide-react";
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
        name: "Handicap (0)",
        category: "handicap",
        outcomes: [
          { id: "home-hcp", name: "1", odds: 1.95 },
          { id: "draw-hcp", name: "X", odds: 2.2 },
          { id: "away-hcp", name: "2", odds: 3.4 },
        ],
      },
      {
        id: "handicap-1",
        name: "Handicap (-1)",
        category: "handicap",
        outcomes: [
          { id: "home-hcp-1", name: "1", odds: 3.2 },
          { id: "draw-hcp-1", name: "X", odds: 3.1 },
          { id: "away-hcp-1", name: "2", odds: 2.05 },
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
        ],
      },
      {
        id: "first-goal",
        name: "First Goal Scorer",
        category: "player",
        outcomes: [
          { id: "any-player", name: "Any Time", odds: 4.5 },
          { id: "no-goal", name: "No Goal", odds: 12.0 },
        ],
      },
    ];
  }

  // Transform real SportMonks data if available
  const groupedByMarket = oddsData.reduce(
    (acc, odd) => {
      const marketName = odd.market.name;
      if (!acc[marketName]) {
        acc[marketName] = {
          id: marketName.toLowerCase().replace(/\s+/g, "-"),
          name: marketName,
          category: categorizeMarket(marketName),
          outcomes: [],
        };
      }

      acc[marketName].outcomes.push({
        id: odd.id.toString(),
        name: odd.label,
        odds: parseFloat(odd.value),
      });

      return acc;
    },
    {} as Record<string, Market>,
  );

  return Object.values(groupedByMarket);
};

const categorizeMarket = (marketName: string): string => {
  const name = marketName.toLowerCase();
  if (name.includes("winner") || name.includes("1x2")) return "main";
  if (name.includes("goal") || name.includes("total") || name.includes("btts"))
    return "goals";
  if (name.includes("score")) return "correct-score";
  if (name.includes("handicap")) return "handicap";
  if (name.includes("player") || name.includes("scorer")) return "player";
  return "other";
};

// Countdown timer hook - moved outside component to avoid hooks order violation
const useCountdown = (targetDate: string) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor(
            (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
          ),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
};

export default function MatchDetails({ onAddToBetSlip }: MatchDetailsProps) {
  const [, params] = useRoute("/match/:id");
  const matchId = params?.id;
  const [expandedMarkets, setExpandedMarkets] = useState<
    Record<string, boolean>
  >({
    main: true,
    goals: true,
  });
  const [cachedMarkets, setCachedMarkets] = useState<Market[]>([]);

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["/api/fixtures", matchId],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}`);
      if (!response.ok) throw new Error("Failed to fetch match details");
      return response.json();
    },
    enabled: !!matchId,
  });

  const { data: oddsData, isLoading: oddsLoading } = useQuery({
    queryKey: ["/api/fixtures", matchId, "odds"],
    queryFn: async () => {
      const response = await fetch(`/api/fixtures/${matchId}/odds`);
      if (!response.ok) throw new Error("Failed to fetch match odds");
      return response.json();
    },
    enabled: !!matchId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch markets from localStorage cache
  useEffect(() => {
    if (matchId) {
      const cached = marketsCache.getMarket(matchId);
      if (cached && cached.markets) {
        setCachedMarkets(cached.markets);
      }
    }
  }, [matchId]);

  // Call countdown hook before any early returns to maintain hooks order
  const countdown = useCountdown(
    matchData?.data?.kickoffTime || new Date().toISOString(),
  );

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
          <p className="text-muted-foreground">
            The requested match could not be found.
          </p>
        </div>
      </div>
    );
  }

  const match: MatchDetails = matchData.data;
  
  // Use cached markets if available, otherwise use API data or fallback to mock
  const markets = cachedMarkets.length > 0 
    ? cachedMarkets 
    : transformOddsToMarkets(oddsData?.data || []);

  const marketsByCategory = markets.reduce(
    (acc, market) => {
      if (!acc[market.category]) acc[market.category] = [];
      acc[market.category].push(market);
      return acc;
    },
    {} as Record<string, Market[]>,
  );

  const toggleMarketCategory = (category: string) => {
    setExpandedMarkets((prev) => ({
      ...prev,
      [category]: !prev[category],
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

  const getCategoryName = (category: string) => {
    const names: Record<string, string> = {
      main: "Main Markets",
      goals: "Goals",
      handicap: "Handicap",
      "correct-score": "Correct Score",
      player: "Player Markets",
      other: "Other Markets",
    };
    return names[category] || category;
  };

  const kickoff = formatKickoffTime(match.kickoffTime);

  return (
    <div className="min-h-screen bg-background">
      {/* Match Header with Football Field Background */}
      <div className="relative text-white overflow-hidden bg-gradient-to-br from-green-600 to-green-800">
        {/* Football field pattern overlay */}
        <div className="absolute inset-0 opacity-20">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 200 100"
            className="absolute inset-0 w-full h-full"
          >
            {/* Field lines */}
            <rect
              x="0"
              y="0"
              width="200"
              height="100"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
            <line
              x1="100"
              y1="0"
              x2="100"
              y2="100"
              stroke="white"
              strokeWidth="0.5"
            />
            <circle
              cx="100"
              cy="50"
              r="15"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
            <rect
              x="0"
              y="25"
              width="20"
              height="50"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
            <rect
              x="180"
              y="25"
              width="20"
              height="50"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
            <rect
              x="0"
              y="35"
              width="8"
              height="30"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
            <rect
              x="192"
              y="35"
              width="8"
              height="30"
              fill="none"
              stroke="white"
              strokeWidth="0.5"
            />
          </svg>
        </div>

        <div className="relative container mx-auto px-4 py-8 pl-[32px] pr-[32px] pt-[0px] pb-[0px]">
          {/* League and Action Icons */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium">{match.league}</span>
              <Star className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="flex items-center gap-3">
              <button className="w-8 h-8 bg-white/20 rounded hover:bg-white/30 transition-colors flex items-center justify-center">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M4 4h12v12H4z" />
                </svg>
              </button>
              <button className="w-8 h-8 bg-white/20 rounded hover:bg-white/30 transition-colors flex items-center justify-center">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 2h16v16H2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Match Information */}
          <div className="flex items-center justify-center gap-8 mb-6">
            {/* Home Team */}
            <div className="text-center flex-1 max-w-[150px]">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-xl font-bold">
                  {match.homeTeam.name.charAt(0)}
                </span>
              </div>
              <h1 className="text-lg font-bold">{match.homeTeam.name}</h1>
            </div>

            {/* Center - Time/Score */}
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">
                {match.status === "LIVE" &&
                match.homeScore !== undefined &&
                match.awayScore !== undefined
                  ? `${match.homeScore} - ${match.awayScore}`
                  : kickoff.time}
              </div>
              <div className="text-sm opacity-90 mb-1">{kickoff.date}</div>
              {match.status === "LIVE" && match.minute && (
                <div className="text-sm bg-red-500 px-2 py-1 rounded font-medium">
                  {match.minute}' LIVE
                </div>
              )}
            </div>

            {/* Away Team */}
            <div className="text-center flex-1 max-w-[150px]">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-xl font-bold">
                  {match.awayTeam.name.charAt(0)}
                </span>
              </div>
              <h1 className="text-lg font-bold">{match.awayTeam.name}</h1>
            </div>
          </div>

          {/* Countdown Timer */}
          {match.status !== "LIVE" && (
            <div className="bg-black/30 backdrop-blur-sm rounded-lg p-4 max-w-md mx-auto">
              <div className="flex justify-center gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">
                    {countdown.days.toString().padStart(2, "0")}
                  </div>
                  <div className="text-xs uppercase tracking-wide opacity-75">
                    days
                  </div>
                </div>
                <div className="text-2xl font-bold self-start">:</div>
                <div>
                  <div className="text-2xl font-bold">
                    {countdown.hours.toString().padStart(2, "0")}
                  </div>
                  <div className="text-xs uppercase tracking-wide opacity-75">
                    hours
                  </div>
                </div>
                <div className="text-2xl font-bold self-start">:</div>
                <div>
                  <div className="text-2xl font-bold">
                    {countdown.minutes.toString().padStart(2, "0")}
                  </div>
                  <div className="text-xs uppercase tracking-wide opacity-75">
                    minutes
                  </div>
                </div>
                <div className="text-2xl font-bold self-start">:</div>
                <div>
                  <div className="text-2xl font-bold">
                    {countdown.seconds.toString().padStart(2, "0")}
                  </div>
                  <div className="text-xs uppercase tracking-wide opacity-75">
                    seconds
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Betting Markets */}
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {Object.entries(marketsByCategory).map(
            ([category, categoryMarkets]) => (
              <Card key={category} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleMarketCategory(category)}
                  data-testid={`header-market-${category}`}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {getCategoryName(category)}
                    </CardTitle>
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
                            <div
                              key={market.id}
                              className="border rounded-lg overflow-hidden"
                            >
                              <div className="bg-muted/30 px-4 py-2 border-b">
                                <h4 className="font-medium text-sm">
                                  {market.name}
                                </h4>
                              </div>
                              <div className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                  {market.outcomes.map((outcome) => (
                                    <Button
                                      key={outcome.id}
                                      className="h-12 flex flex-col justify-center text-center odds-button"
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
            ),
          )}
        </div>
      </div>
    </div>
  );
}
