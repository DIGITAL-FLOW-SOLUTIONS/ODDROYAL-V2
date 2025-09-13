import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import bannerImage from "@assets/banner-live_1757761750950.jpg";
import { 
  ChevronDown,
  ChevronUp,
  Zap,
  Circle,
  // Sport icons from lucide-react
  Gamepad2,
  Zap as Hockey,
  Target,
  Volleyball as VolleyballIcon,
  Disc3 as Rugby
} from "lucide-react";

// Sports icons using proper lucide-react icons
const SPORTS_ICONS = {
  Football: Gamepad2,
  Hockey: Hockey,
  Tennis: Target,
  Basketball: Circle, // Using Circle for Basketball
  Baseball: Target,
  Volleyball: VolleyballIcon,
  Rugby: Rugby
} as const;

interface LiveProps {
  onAddToBetSlip?: (selection: any) => void;
}

interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  odds: {
    "1x2": {
      home: number;
      draw: number;
      away: number;
    };
  };
}


interface LeagueGroup {
  leagueName: string;
  matches: LiveMatch[];
}

export default function Live({ onAddToBetSlip }: LiveProps) {
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(new Set());
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for live matches
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live Football matches only (no sport toggle needed)
  const { data: liveMatchesData, isLoading: liveLoading } = useQuery({
    queryKey: ['/api/fixtures/live/football'],
    queryFn: async () => {
      const response = await fetch('/api/fixtures/live/football');
      if (!response.ok) throw new Error('Failed to fetch live matches');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for live data
  });

  const liveMatches: LiveMatch[] = liveMatchesData?.data || [];

  // Group matches by league
  const leagueGroups: LeagueGroup[] = liveMatches.reduce((groups, match) => {
    const existingGroup = groups.find(g => g.leagueName === match.league);
    if (existingGroup) {
      existingGroup.matches.push(match);
    } else {
      groups.push({
        leagueName: match.league,
        matches: [match]
      });
    }
    return groups;
  }, [] as LeagueGroup[]);

  // Auto-expand all leagues to show live matches by default
  useEffect(() => {
    if (leagueGroups.length > 0 && expandedLeagues.size === 0) {
      const allLeagueNames = new Set(leagueGroups.map(group => group.leagueName));
      setExpandedLeagues(allLeagueNames);
    }
  }, [leagueGroups, expandedLeagues.size]);

  const handleLiveOddsClick = (matchId: string, market: string, type: string, odds: number, homeTeam: string, awayTeam: string) => {
    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      market,
      type,
      odds,
      homeTeam,
      awayTeam,
      league: liveMatches.find(m => m.id === matchId)?.league || "Unknown",
      isLive: true
    };
    onAddToBetSlip?.(selection);
    console.log("Added live selection to bet slip:", selection);
  };

  const toggleLeague = (leagueName: string) => {
    const newExpanded = new Set(expandedLeagues);
    if (newExpanded.has(leagueName)) {
      newExpanded.delete(leagueName);
    } else {
      newExpanded.add(leagueName);
    }
    setExpandedLeagues(newExpanded);
  };

  const toggleMatchExpansion = (matchId: string) => {
    const newExpanded = new Set(expandedMatches);
    if (newExpanded.has(matchId)) {
      newExpanded.delete(matchId);
    } else {
      newExpanded.add(matchId);
    }
    setExpandedMatches(newExpanded);
  };


  return (
    <div className="flex-1 bg-card text-card-foreground">
      {/* Banner */}
      <div className="w-full">
        <img 
          src={bannerImage} 
          alt="Prime Stake Super Bonus - Quick Payouts, Best Odds, High Bonuses, No Fee Payments"
          className="w-full h-auto object-cover max-h-16 sm:max-h-20 md:max-h-24 lg:max-h-28"
          data-testid="banner-live"
        />
      </div>

      {/* Live Football Header */}
      <div className="flex items-center gap-2 p-3 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <h2 className="text-lg font-semibold text-foreground">Live Football</h2>
        </div>
      </div>

      {/* Live Matches Content */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        {liveLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <Zap className="h-8 w-8 text-destructive animate-pulse mx-auto mb-2" />
              <p className="text-muted-foreground">Loading live matches...</p>
            </div>
          </div>
        ) : leagueGroups.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <Circle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No live matches available</p>
              <p className="text-sm text-muted-foreground/70">Check back during match times</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {leagueGroups.map((group) => {
              const isExpanded = expandedLeagues.has(group.leagueName);
              
              return (
                <div key={group.leagueName} className="bg-card">
                  {/* League Header */}
                  <div
                    onClick={() => toggleLeague(group.leagueName)}
                    className="flex items-center justify-between p-3 bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors"
                    data-testid={`button-league-${group.leagueName.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className="flex items-center gap-3">
                      <Gamepad2 className="h-5 w-5" />
                      <span className="font-semibold">{group.leagueName}</span>
                      <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground">
                        {group.matches.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-6">
                      {/* Odds Headers */}
                      <div className="flex items-center gap-4 text-sm font-medium">
                        <span className="w-6 text-center">1</span>
                        <span className="w-6 text-center">X</span>
                        <span className="w-6 text-center">2</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* League Matches */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {group.matches.map((match) => {
                          const isMatchExpanded = expandedMatches.has(match.id);
                          
                          return (
                            <div key={match.id} className="border-b border-border/50 last:border-b-0">
                              {/* Match Row */}
                              <div
                                onClick={() => toggleMatchExpansion(match.id)}
                                className="flex items-center justify-between p-3 hover:bg-sidebar/30 cursor-pointer transition-colors"
                                data-testid={`button-match-${match.id}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="destructive" className="animate-pulse text-xs">
                                          LIVE {match.minute}'
                                        </Badge>
                                        <span className="text-sm font-medium text-destructive">
                                          {match.homeScore} - {match.awayScore}
                                        </span>
                                      </div>
                                      <div className="mt-1 space-y-0.5">
                                        <div className="text-sm font-medium truncate" data-testid={`text-home-team-${match.id}`}>
                                          {match.homeTeam}
                                        </div>
                                        <div className="text-sm text-muted-foreground truncate" data-testid={`text-away-team-${match.id}`}>
                                          {match.awayTeam}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Odds Buttons */}
                                <div className="flex items-center gap-2 ml-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLiveOddsClick(match.id, "1x2", "home", match.odds["1x2"].home, match.homeTeam, match.awayTeam);
                                    }}
                                    data-testid={`button-odds-home-${match.id}`}
                                    className="text-xs font-semibold min-w-[48px]"
                                  >
                                    {match.odds["1x2"].home.toFixed(2)}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLiveOddsClick(match.id, "1x2", "draw", match.odds["1x2"].draw, match.homeTeam, match.awayTeam);
                                    }}
                                    data-testid={`button-odds-draw-${match.id}`}
                                    className="text-xs font-semibold min-w-[48px]"
                                  >
                                    {match.odds["1x2"].draw.toFixed(2)}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLiveOddsClick(match.id, "1x2", "away", match.odds["1x2"].away, match.homeTeam, match.awayTeam);
                                    }}
                                    data-testid={`button-odds-away-${match.id}`}
                                    className="text-xs font-semibold min-w-[48px]"
                                  >
                                    {match.odds["1x2"].away.toFixed(2)}
                                  </Button>
                                  {isMatchExpanded ? (
                                    <ChevronUp className="h-3 w-3 ml-2" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 ml-2" />
                                  )}
                                </div>
                              </div>

                              {/* Expandable Match Details */}
                              <AnimatePresence>
                                {isMatchExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-sidebar/20"
                                  >
                                    <div className="p-4 space-y-3 border-t border-border/30">
                                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        Additional Markets
                                      </div>
                                      
                                      {/* Over/Under Market */}
                                      <div>
                                        <div className="text-sm font-medium mb-2">Total Goals (Over/Under 2.5)</div>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="outline"
                                            size="default"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleLiveOddsClick(match.id, "over_under", "over", 1.95, match.homeTeam, match.awayTeam);
                                            }}
                                            data-testid={`button-over-${match.id}`}
                                            className="flex flex-col gap-1"
                                          >
                                            <span className="text-xs text-muted-foreground">Over 2.5</span>
                                            <span className="font-semibold">1.95</span>
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="default"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleLiveOddsClick(match.id, "over_under", "under", 2.05, match.homeTeam, match.awayTeam);
                                            }}
                                            data-testid={`button-under-${match.id}`}
                                            className="flex flex-col gap-1"
                                          >
                                            <span className="text-xs text-muted-foreground">Under 2.5</span>
                                            <span className="font-semibold">2.05</span>
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Both Teams to Score */}
                                      <div>
                                        <div className="text-sm font-medium mb-2">Both Teams to Score</div>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="outline"
                                            size="default"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleLiveOddsClick(match.id, "btts", "yes", 1.88, match.homeTeam, match.awayTeam);
                                            }}
                                            data-testid={`button-btts-yes-${match.id}`}
                                            className="flex flex-col gap-1"
                                          >
                                            <span className="text-xs text-muted-foreground">Yes</span>
                                            <span className="font-semibold">1.88</span>
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="default"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleLiveOddsClick(match.id, "btts", "no", 2.12, match.homeTeam, match.awayTeam);
                                            }}
                                            data-testid={`button-btts-no-${match.id}`}
                                            className="flex flex-col gap-1"
                                          >
                                            <span className="text-xs text-muted-foreground">No</span>
                                            <span className="font-semibold">2.12</span>
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}