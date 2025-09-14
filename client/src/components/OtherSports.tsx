import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Clock, Star, Target, Zap, TrendingUp, Globe } from "lucide-react";

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
    draw?: number;
    away: number;
  };
  additionalMarkets?: number;
}

interface Sport {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  matches: Match[];
  hasDrawOdds?: boolean; // For sports like tennis where there's no draw
  isExpanded?: boolean;
}

interface OtherSportsProps {
  sports?: Sport[];
  onOddsClick?: (matchId: string, market: string, type: string, odds: number) => void;
  onAddToFavorites?: (matchId: string) => void;
}


export default function OtherSports({ 
  sports = [], 
  onOddsClick, 
  onAddToFavorites 
}: OtherSportsProps) {
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>({});

  const toggleSport = (sportId: string) => {
    setExpandedSports(prev => ({
      ...prev,
      [sportId]: !prev[sportId]
    }));
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const handleOddsClick = (match: Match, type: string, sport: Sport) => {
    if (onOddsClick) {
      let odds: number;
      if (type === 'home') odds = match.odds.home;
      else if (type === 'draw' && match.odds.draw) odds = match.odds.draw;
      else odds = match.odds.away;
      
      onOddsClick(match.id, sport.hasDrawOdds ? '1x2' : '12', type, odds);
    }
  };

  return (
    <div className="space-y-2">
      {sports.map((sport, sportIndex) => (
        <motion.div
          key={sport.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: sportIndex * 0.1 }}
        >
          <Card className="overflow-hidden">
            <Collapsible 
              open={expandedSports[sport.id]} 
              onOpenChange={() => toggleSport(sport.id)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 hover:bg-accent/50 cursor-pointer transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <sport.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg font-semibold">
                        {sport.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {sport.matches.length} matches
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {expandedSports[sport.id] ? 'Collapse' : 'Expand'}
                      </span>
                      <ChevronDown 
                        className={`h-4 w-4 transition-transform ${
                          expandedSports[sport.id] ? 'rotate-180' : ''
                        }`} 
                      />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-0">
                    {/* Table header */}
                    <div className={`grid gap-2 py-3 border-b border-border text-xs font-medium text-muted-foreground ${
                      sport.hasDrawOdds ? 'grid-cols-12' : 'grid-cols-10'
                    }`}>
                      <div className="col-span-1 text-center">Time</div>
                      <div className="col-span-5">Match</div>
                      <div className={`text-center ${sport.hasDrawOdds ? 'col-span-2' : 'col-span-2'}`}>1</div>
                      {sport.hasDrawOdds && (
                        <div className="col-span-2 text-center">X</div>
                      )}
                      <div className={`text-center ${sport.hasDrawOdds ? 'col-span-2' : 'col-span-2'}`}>2</div>
                    </div>

                    {/* Match rows */}
                    <AnimatePresence>
                      {sport.matches.map((match, matchIndex) => (
                        <motion.div
                          key={match.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ delay: matchIndex * 0.05 }}
                          className={`grid gap-2 py-4 border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors ${
                            sport.hasDrawOdds ? 'grid-cols-12' : 'grid-cols-10'
                          }`}
                          data-testid={`match-row-${match.id}`}
                        >
                          {/* Time */}
                          <div className="col-span-1 flex items-center justify-center">
                            <div className="flex flex-col items-center text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground mb-1" />
                              <span className="text-muted-foreground">
                                {formatTime(match.kickoffTime)}
                              </span>
                            </div>
                          </div>

                          {/* Match teams/players */}
                          <div className="col-span-5 flex flex-col justify-center space-y-1">
                            <div className="flex items-center gap-2">
                              {match.homeTeam.logo && (
                                <img 
                                  src={match.homeTeam.logo} 
                                  alt={match.homeTeam.name}
                                  className="w-4 h-4 rounded"
                                />
                              )}
                              <span className="text-sm font-medium" data-testid={`home-team-${match.id}`}>
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
                              <span className="text-sm font-medium" data-testid={`away-team-${match.id}`}>
                                {match.awayTeam.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 hover-elevate"
                                onClick={() => onAddToFavorites?.(match.id)}
                                data-testid={`favorite-${match.id}`}
                              >
                                <Star className="h-3 w-3" />
                              </Button>
                              {match.additionalMarkets && (
                                <span className="text-xs text-muted-foreground">
                                  +{match.additionalMarkets} markets
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Odds columns */}
                          <div className={`flex items-center justify-center ${sport.hasDrawOdds ? 'col-span-2' : 'col-span-2'}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match, 'home', sport)}
                              className="w-full h-8 text-xs font-semibold hover-elevate"
                              data-testid={`odds-home-${match.id}`}
                            >
                              {match.odds.home.toFixed(2)}
                            </Button>
                          </div>

                          {sport.hasDrawOdds && match.odds.draw && (
                            <div className="col-span-2 flex items-center justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOddsClick(match, 'draw', sport)}
                                className="w-full h-8 text-xs font-semibold hover-elevate"
                                data-testid={`odds-draw-${match.id}`}
                              >
                                {match.odds.draw.toFixed(2)}
                              </Button>
                            </div>
                          )}

                          <div className={`flex items-center justify-center ${sport.hasDrawOdds ? 'col-span-2' : 'col-span-2'}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match, 'away', sport)}
                              className="w-full h-8 text-xs font-semibold hover-elevate"
                              data-testid={`odds-away-${match.id}`}
                            >
                              {match.odds.away.toFixed(2)}
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
  );
}