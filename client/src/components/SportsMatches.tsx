import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  Clock, 
  Star,
  Gamepad2,
  Zap,
  Target,
  Circle,
  Disc3
} from "lucide-react";

// Sport icons mapping
const SPORT_ICONS: Record<string, any> = {
  football: Gamepad2,
  americanfootball: Gamepad2,
  hockey: Zap,
  icehockey: Zap,
  tennis: Target,
  basketball: Circle,
  baseball: Target,
  volleyball: Target,
  rugby: Disc3,
  cricket: Target,
  mma: Target,
};

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
  } | null;
  additionalMarkets?: number;
}

interface League {
  id: string;
  name: string;
  logo?: string;
  matches: Match[];
}

interface Sport {
  id: string;
  name: string;
  icon?: string;
  leagues: League[];
}

interface SportsMatchesProps {
  sports: Sport[];
  isLoading?: boolean;
  onOddsClick?: (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => void;
  onAddToFavorites?: (matchId: string) => void;
}

export default function SportsMatches({
  sports,
  isLoading = false,
  onOddsClick,
  onAddToFavorites,
}: SportsMatchesProps) {
  const [, setLocation] = useLocation();
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>(
    sports.reduce(
      (acc, sport, index) => ({
        ...acc,
        [sport.id]: index === 0, // First sport expanded by default
      }),
      {},
    ),
  );
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>(
    {},
  );

  const toggleSport = (sportId: string) => {
    setExpandedSports((prev) => ({
      ...prev,
      [sportId]: !prev[sportId],
    }));
  };

  const toggleLeague = (leagueId: string) => {
    setExpandedLeagues((prev) => ({
      ...prev,
      [leagueId]: !prev[leagueId],
    }));
  };

  const handleMatchClick = (matchId: string) => {
    setLocation(`/match/${matchId}`);
  };

  const handleOddsClick = (match: Match, type: "home" | "draw" | "away") => {
    if (!onOddsClick || !match.odds) return;

    const oddsValue = match.odds[type];
    onOddsClick(match.id, "1x2", type, oddsValue);
  };

  const formatTime = (dateString: string) => {
    // Extract literal time without timezone conversion using regex
    // Handles ISO 8601, RFC3339, and various timestamp formats with 1-2 digit hours
    const timeMatch = dateString.match(/(\d{1,2}):(\d{2})/);
    
    if (!timeMatch) {
      return dateString; // Fallback: show original string if parsing fails
    }
    
    const [, hours, minutes] = timeMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    );
  }

  if (sports.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No matches available at the moment
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sports.map((sport, sportIndex) => {
        const SportIcon = SPORT_ICONS[sport.id.toLowerCase()] || Gamepad2;
        const isSportExpanded = expandedSports[sport.id];

        return (
          <motion.div
            key={sport.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sportIndex * 0.1 }}
          >
            <Collapsible
              open={isSportExpanded}
              onOpenChange={() => toggleSport(sport.id)}
            >
              {/* Sport Header */}
              <CollapsibleTrigger asChild>
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer rounded-md mb-2"
                  style={{ backgroundColor: "hsl(var(--surface-2))", color: "hsl(var(--foreground))" }}
                  data-testid={`button-sport-${sport.id}`}
                >
                  <div className="flex items-center gap-2">
                    <SportIcon className="h-5 w-5" />
                    <h2 className="text-lg font-semibold">{sport.name}</h2>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 transition-transform ${
                      isSportExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </CollapsibleTrigger>

              {/* Sport Content - Leagues */}
              <CollapsibleContent>
                <div className="space-y-2 mb-4">
                  {sport.leagues.map((league, leagueIndex) => {
                    const isLeagueExpanded = expandedLeagues[league.id] ?? (leagueIndex === 0);

                    return (
                      <motion.div
                        key={league.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: leagueIndex * 0.05 }}
                      >
                        <Card
                          className="overflow-hidden"
                          style={{
                            backgroundColor: "hsl(var(--surface-2))",
                            borderColor: "hsl(var(--surface-4))",
                          }}
                        >
                          <Collapsible
                            open={isLeagueExpanded}
                            onOpenChange={() => toggleLeague(league.id)}
                          >
                            <CollapsibleTrigger asChild>
                              <CardHeader
                                className="pb-3 league-header-gradient cursor-pointer transition-colors"
                                style={{ color: "white" }}
                              >
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
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Odds Headers */}
                                    <div className="grid grid-cols-3 gap-2 text-sm font-medium text-white/90 w-48">
                                      <span className="text-center">1</span>
                                      <span className="text-center">X</span>
                                      <span className="text-center">2</span>
                                    </div>
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform text-white ${
                                        isLeagueExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </div>
                                </div>
                              </CardHeader>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <CardContent
                                className="pt-0 pb-0"
                                style={{ backgroundColor: "white" }}
                              >
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
                                        className="grid grid-cols-12 gap-2 py-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
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

                                        {/* Star icon */}
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

                                        {/* Match teams */}
                                        <div className="col-span-7 flex flex-col justify-center space-y-1">
                                          <div className="flex items-center gap-2">
                                            {match.homeTeam.logo && (
                                              <img
                                                src={match.homeTeam.logo}
                                                alt={match.homeTeam.name}
                                                className="w-4 h-4 rounded"
                                              />
                                            )}
                                            <span
                                              className="text-sm font-medium text-black"
                                              data-testid={`home-team-${match.id}`}
                                            >
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
                                            <span
                                              className="text-sm font-medium text-black"
                                              data-testid={`away-team-${match.id}`}
                                            >
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

                                        {/* Odds columns */}
                                        {match.odds ? (
                                          <div className="col-span-3">
                                            <div className="grid grid-cols-3 gap-3">
                                              <Button
                                                style={{ marginLeft: "-70px" }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOddsClick(match, "home");
                                                }}
                                                className="w-16 font-semibold odds-button"
                                                data-testid={`odds-home-${match.id}`}
                                              >
                                                {match.odds.home.toFixed(2)}
                                              </Button>

                                              <Button
                                                style={{ marginLeft: "-50px" }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOddsClick(match, "draw");
                                                }}
                                                className="w-16 font-semibold odds-button"
                                                data-testid={`odds-draw-${match.id}`}
                                              >
                                                {match.odds.draw.toFixed(2)}
                                              </Button>

                                              <Button
                                                style={{ marginLeft: "-30px" }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleOddsClick(match, "away");
                                                }}
                                                className="w-16 font-semibold odds-button"
                                                data-testid={`odds-away-${match.id}`}
                                              >
                                                {match.odds.away.toFixed(2)}
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="col-span-3 flex items-center justify-center text-sm text-gray-500">
                                            Odds not available
                                          </div>
                                        )}
                                      </motion.div>
                                    ))}
                                  </AnimatePresence>
                                </div>
                              </CardContent>
                            </CollapsibleContent>
                          </Collapsible>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        );
      })}
    </div>
  );
}
