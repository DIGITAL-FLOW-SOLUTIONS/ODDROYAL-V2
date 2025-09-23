import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Clock, Star, Trophy } from "lucide-react";

interface Team {
  name: string;
  logo?: string;
}

interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoffTime: string;
  venue?: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
  additionalMarkets?: number;
}

interface League {
  id: string;
  name: string;
  logo?: string;
  matches: Match[];
  isExpanded?: boolean;
}

interface FootballMatchesProps {
  leagues: League[];
  isLoading?: boolean;
  onOddsClick?: (matchId: string, market: string, type: string, odds: number) => void;
  onAddToFavorites?: (matchId: string) => void;
}

export default function FootballMatches({ 
  leagues, 
  isLoading = false,
  onOddsClick, 
  onAddToFavorites 
}: FootballMatchesProps) {
  const [, setLocation] = useLocation();
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>(
    leagues.reduce((acc, league, index) => ({
      ...acc,
      [league.id]: index === 0 // First league expanded by default
    }), {})
  );

  const toggleLeague = (leagueId: string) => {
    setExpandedLeagues(prev => ({
      ...prev,
      [leagueId]: !prev[leagueId]
    }));
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const handleOddsClick = (match: Match, type: string) => {
    if (onOddsClick && match.odds) {
      const odds = type === 'home' ? match.odds.home : type === 'draw' ? match.odds.draw : match.odds.away;
      onOddsClick(match.id, '1x2', type, odds);
    }
  };

  const handleMatchClick = (matchId: string) => {
    setLocation(`/match/${matchId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-display font-bold">Football</h2>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={`skeleton-league-${index}`} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="animate-pulse">
                  <div className="h-6 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded w-20"></div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!leagues.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-display font-bold">Football</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-muted-foreground">No football matches available at the moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-display font-bold">Football</h2>
      </div>

      <div className="space-y-2">
        {leagues.map((league, leagueIndex) => (
          <motion.div
            key={league.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: leagueIndex * 0.1 }}
          >
            <Card className="overflow-hidden" style={{ backgroundColor: 'hsl(var(--surface-2))', borderColor: 'hsl(var(--surface-4))' }}>
              <Collapsible 
                open={expandedLeagues[league.id]} 
                onOpenChange={() => toggleLeague(league.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 league-header-gradient cursor-pointer transition-colors" style={{ color: 'white' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {league.logo && (
                          <img 
                            src={league.logo} 
                            alt={league.name}
                            className="w-6 h-6 rounded"
                          />
                        )}
                        <CardTitle className="text-lg font-semibold text-white">
                          {league.name}
                        </CardTitle>
                        <Badge className="text-xs bg-white/20 text-white border-white/30">
                          {league.matches.length} matches
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Odds Headers - aligned with columns below */}
                        <div className="grid grid-cols-3 gap-2 text-sm font-medium text-white/90 w-48">
                          <span className="text-center">1</span>
                          <span className="text-center">X</span>
                          <span className="text-center">2</span>
                        </div>
                        <div className="w-6"></div> {/* Space for star icon */}
                        <ChevronDown 
                          className={`h-4 w-4 transition-transform text-white ${
                            expandedLeagues[league.id] ? 'rotate-180' : ''
                          }`} 
                        />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 pb-0" style={{ backgroundColor: 'white' }}>
                    <div className="space-y-0">
                      {/* Match rows */}
                      <AnimatePresence>
                        {league.matches.map((match, matchIndex) => (
                          <motion.div
                            key={match.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: matchIndex * 0.05 }}
                            onClick={() => handleMatchClick(match.id)}
                            className="grid grid-cols-13 gap-2 py-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
                            data-testid={`match-row-${match.id}`}
                          >
                            {/* Time */}
                            <div className="col-span-1 flex items-center justify-center">
                              <div className="flex flex-col items-center text-xs">
                                <Clock className="h-3 w-3 text-gray-500 mb-1" />
                                <span className="text-black font-medium">
                                  {formatTime(match.kickoffTime)}
                                </span>
                              </div>
                            </div>

                            {/* Match teams */}
                            <div className="col-span-8 flex flex-col justify-center space-y-1">
                              <div className="flex items-center gap-2">
                                {match.homeTeam.logo && (
                                  <img 
                                    src={match.homeTeam.logo} 
                                    alt={match.homeTeam.name}
                                    className="w-4 h-4 rounded"
                                  />
                                )}
                                <span className="text-sm font-medium text-black" data-testid={`home-team-${match.id}`}>
                                  {match.homeTeam.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {match.awayTeam.logo && (
                                  <img 
                                    src={match.awayTeam.logo} 
                                    alt={match.awayTeam.name}
                                    className="w-4 h-4 rounded"
                                  />
                                )}
                                <span className="text-sm font-medium text-black" data-testid={`away-team-${match.id}`}>
                                  {match.awayTeam.name}
                                </span>
                              </div>
                              {match.additionalMarkets && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-600">
                                    +{match.additionalMarkets} markets
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Odds columns - Only show if odds are available */}
                            {match.odds ? (
                              <>
                                <div className="col-span-1 flex items-center justify-center">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOddsClick(match, 'home');
                                    }}
                                    className="w-full h-8 text-xs font-semibold odds-button"
                                    data-testid={`odds-home-${match.id}`}
                                  >
                                    {match.odds.home.toFixed(2)}
                                  </Button>
                                </div>

                                <div className="col-span-1 flex items-center justify-center">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOddsClick(match, 'draw');
                                    }}
                                    className="w-full h-8 text-xs font-semibold odds-button"
                                    data-testid={`odds-draw-${match.id}`}
                                  >
                                    {match.odds.draw.toFixed(2)}
                                  </Button>
                                </div>

                                <div className="col-span-1 flex items-center justify-center">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOddsClick(match, 'away');
                                    }}
                                    className="w-full h-8 text-xs font-semibold odds-button"
                                    data-testid={`odds-away-${match.id}`}
                                  >
                                    {match.odds.away.toFixed(2)}
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-3 flex items-center justify-center text-sm text-gray-500">
                                Odds not available
                              </div>
                            )}

                            {/* Star icon at the end */}
                            <div className="col-span-1 flex items-center justify-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:text-yellow-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToFavorites?.(match.id);
                                }}
                                data-testid={`favorite-${match.id}`}
                              >
                                <Star className="h-4 w-4 text-gray-400" />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}