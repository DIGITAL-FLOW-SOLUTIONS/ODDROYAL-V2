import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import bannerImage from "@assets/banner-live_1757761750950.jpg";
import { Circle, ChevronDown, ChevronUp } from "lucide-react";
import { useLiveMatches } from "@/hooks/useLiveMatches";
import { LiveMatchRow } from "@/components/LiveMatchRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface LiveProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Live({ onAddToBetSlip }: LiveProps) {
  const { mode } = useMode();

  // NEW: Use the custom hook with localStorage caching
  const { data: liveMatchesData, isRefetching, isLoading } = useLiveMatches();
  
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({});

  const sportGroups = liveMatchesData?.sports || [];

  // Handle odds selection for bet slip
  const handleOddsClick = (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => {
    if (!onAddToBetSlip) return;

    // Find match to get team names
    const match = sportGroups
      .flatMap((sport: any) => sport.leagues)
      .flatMap((league: any) => league.matches)
      .find((m: any) => m.id === matchId);
    
    if (!match) return;

    const getSelectionName = (market: string, type: string) => {
      if (market === "1x2") {
        return type === "home" ? "1" : type === "draw" ? "X" : "2";
      }
      return type.charAt(0).toUpperCase() + type.slice(1);
    };

    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      fixtureId: matchId,
      market: market || "1x2",
      type,
      selection: getSelectionName(market, type),
      odds,
      homeTeam: match.homeTeam?.name || match.homeTeam,
      awayTeam: match.awayTeam?.name || match.awayTeam,
      league: match.league || "Unknown",
      isLive: true,
    };

    onAddToBetSlip(selection);
    console.log("Added live selection to bet slip:", selection);
  };

  // Toggle league expansion
  const toggleLeague = (leagueId: string) => {
    setExpandedLeagues(prev => ({
      ...prev,
      [leagueId]: !prev[leagueId],
    }));
  };


  return (
    <div className="w-full max-w-none overflow-hidden h-full">
      {/* Banner */}
      <div className="w-full">
        <img 
          src={bannerImage} 
          alt="Prime Stake Super Bonus - Quick Payouts, Best Odds, High Bonuses, No Fee Payments"
          className="w-full h-auto object-cover max-h-16 sm:max-h-20 md:max-h-24 lg:max-h-28"
          data-testid="banner-live"
        />
      </div>

      {/* Live Header */}
      <div className="flex items-center gap-2 p-3 bg-surface-2 border-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <h2 className="text-lg font-semibold text-foreground">Live Matches</h2>
        </div>
      </div>

      {/* Live Matches Content */}
      <div className="p-4 space-y-4">
        {isLoading && sportGroups.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading live matches...</p>
            </div>
          </div>
        ) : sportGroups.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Circle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No live matches available</p>
              <p className="text-sm text-muted-foreground/70">Check back during match times</p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {sportGroups.map((sport: any) => (
              <div key={sport.sport_key} className="space-y-2">
                {/* Sport Header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-md">
                  <span className="text-lg">{sport.sport_icon}</span>
                  <h3 className="text-sm font-semibold text-foreground">
                    {sport.sport_title}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ({sport.total_matches} live)
                  </span>
                </div>

                {/* Leagues */}
                {sport.leagues.map((league: any) => {
                  const isExpanded = expandedLeagues[league.league_id] !== false; // Default to expanded
                  
                  return (
                    <div key={league.league_id} className="bg-surface-3 rounded-md">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleLeague(league.league_id)}>
                        {/* League Header */}
                        <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover-elevate rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {league.league_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({league.matches.length})
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </CollapsibleTrigger>

                        {/* Matches */}
                        <CollapsibleContent className="space-y-1 p-2">
                          {league.matches.map((match: any) => (
                            <LiveMatchRow
                              key={match.match_id}
                              match={match}
                              onOddsClick={handleOddsClick}
                            />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
        
        {/* Refresh indicator */}
        {isRefetching && sportGroups.length > 0 && (
          <div className="fixed bottom-4 right-4 bg-surface-2 text-foreground px-3 py-2 rounded-md shadow-lg flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs">Updating...</span>
          </div>
        )}
      </div>
    </div>
  );
}
