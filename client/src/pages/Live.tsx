import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { Circle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useLiveMatches } from "@/hooks/useLiveMatches";
import { LiveMatchRow } from "@/components/LiveMatchRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useEffect } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";

interface LiveProps {
  onAddToBetSlip?: (selection: any) => void;
  betSlipSelections?: any[];
}

export default function Live({ onAddToBetSlip, betSlipSelections = [] }: LiveProps) {
  const { mode } = useMode();
  const { setPageLoading } = usePageLoading();

  // NEW: Use the custom hook with localStorage caching
  const { data: liveMatchesData, isRefetching, isLoading } = useLiveMatches();

  useEffect(() => {
    setPageLoading(isLoading);
  }, [isLoading, setPageLoading]);
  
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({});
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  
  // Create Set of selected odds IDs for quick lookup
  const selectedOddsSet = new Set(betSlipSelections.map(s => s.id));
  
  // Scroll functionality for sports carousel
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const sportGroups = liveMatchesData?.sports || [];
  
  // Filter sport groups based on selected sport
  const filteredSportGroups = selectedSport 
    ? sportGroups.filter((sport: any) => sport.sport_key === selectedSport)
    : sportGroups;

  const checkScrollPosition = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -280, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 280, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  // Initialize carousel arrow state on mount
  useEffect(() => {
    checkScrollPosition();
  }, [sportGroups]);

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
      {/* Sports Card Carousel */}
      <div className="relative w-full py-4">
        {/* Navigation Arrows */}
        {canScrollLeft && (
          <Button
            variant="outline"
            size="icon"
            onClick={scrollLeft}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 hover-elevate"
            data-testid="button-sports-scroll-left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        
        {canScrollRight && (
          <Button
            variant="outline"
            size="icon"
            onClick={scrollRight}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-8 w-8 hover-elevate"
            data-testid="button-sports-scroll-right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* Sports Cards Scroll Container */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4"
          onScroll={checkScrollPosition}
          data-testid="sports-carousel"
        >
          {/* Individual Sport Cards */}
          {sportGroups.map((sport: any, index: number) => (
            <motion.div
              key={sport.sport_key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="flex-shrink-0"
            >
              <button
                onClick={() => setSelectedSport(sport.sport_key)}
                className={`flex flex-col items-center justify-center gap-2 w-28 h-24 rounded-md transition-all hover-elevate active-elevate-2 ${
                  selectedSport === sport.sport_key
                    ? 'bg-primary text-primary-foreground border-2 border-primary'
                    : 'bg-surface-3 text-foreground'
                }`}
                data-testid={`button-sport-${sport.sport_key}`}
              >
                <span className="text-3xl">{sport.sport_icon}</span>
                <span className="text-sm font-semibold text-center leading-tight px-2">
                  {sport.sport_title}
                </span>
              </button>
            </motion.div>
          ))}
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
        ) : filteredSportGroups.length === 0 ? (
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
            {filteredSportGroups.map((sport: any) => (
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
                              selectedOdds={selectedOddsSet}
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
      </div>
    </div>
  );
}
