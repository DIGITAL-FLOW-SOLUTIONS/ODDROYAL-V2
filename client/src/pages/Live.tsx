import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { Circle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { LiveMatchRow } from "@/components/LiveMatchRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useMemo, useEffect } from "react";
import { useMatchStore } from "@/store/matchStore";
import { renderProfiler } from "@/lib/renderProfiler";
import { FPSCounter } from "@/components/FPSCounter";
import { useBetSlip } from "@/contexts/BetSlipContext";

export default function Live() {
  const { onAddToBetSlip, betSlipSelections } = useBetSlip();
  const { mode, setMode } = useMode();
  
  // Log component render for profiling
  renderProfiler.logRender('Live');
  
  // Ensure mode is set to 'live' when Live page loads (run only once)
  useEffect(() => {
    setMode('live');
  }, [setMode]);
  
  // Subscribe only to lastUpdate - triggers re-render only when data actually changes
  const lastUpdate = useMatchStore(state => state.lastUpdate);
  const sports = useMatchStore(state => state.sports);
  const leagues = useMatchStore(state => state.leagues);
  
  // Filter live matches - reads current state without subscribing to it
  const liveMatches = useMemo(() => {
    const currentMatches = useMatchStore.getState().matches;
    return Array.from(currentMatches.values()).filter(m => m.status === 'live');
  }, [lastUpdate]);
  
  const [expandedLeagues, setExpandedLeagues] = useState<Record<string, boolean>>({});
  const [expandedSports, setExpandedSports] = useState<Record<string, boolean>>({});
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  
  // Create Set of selected odds IDs for quick lookup (memoized to prevent child re-renders)
  const selectedOddsSet = useMemo(() => {
    return new Set((betSlipSelections || []).map(s => s.id));
  }, [betSlipSelections]);
  
  // Scroll functionality for sports carousel
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Group live matches by sport and league (similar to old REST response structure)
  const sportGroups = useMemo(() => {
    const groupsMap = new Map<string, any>();
    
    for (const match of liveMatches) {
      const sport = sports.find(s => s.sport_key === match.sport_key);
      if (!sport) continue;
      
      // Get or create sport group
      let sportGroup = groupsMap.get(match.sport_key);
      if (!sportGroup) {
        sportGroup = {
          sport_key: match.sport_key,
          sport_title: sport.sport_title,
          sport_icon: sport.sport_icon,
          leagues: new Map<string, any>()
        };
        groupsMap.set(match.sport_key, sportGroup);
      }
      
      // Get or create league within sport
      let league = sportGroup.leagues.get(match.league_id);
      if (!league) {
        league = {
          league_id: match.league_id,
          league_name: match.league_name,
          matches: []
        };
        sportGroup.leagues.set(match.league_id, league);
      }
      
      league.matches.push(match);
    }
    
    // Convert maps to arrays and calculate totals
    const groups: any[] = [];
    groupsMap.forEach(sportGroup => {
      const leagues = Array.from(sportGroup.leagues.values());
      groups.push({
        sport_key: sportGroup.sport_key,
        sport_title: sportGroup.sport_title,
        sport_icon: sportGroup.sport_icon,
        leagues,
        total_matches: leagues.reduce((sum, l: any) => sum + l.matches.length, 0)
      });
    });
    
    return groups;
  }, [liveMatches, sports]);
  
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

    // Find match to get team names - use match_id property
    const match = sportGroups
      .flatMap((sport: any) => sport.leagues)
      .flatMap((league: any) => league.matches)
      .find((m: any) => m.match_id === matchId);
    
    if (!match) {
      console.warn('Match not found for betting:', matchId);
      return;
    }

    const getSelectionName = (market: string, type: string) => {
      if (market === "1x2" || market === "h2h") {
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
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      league: match.league_name || "Unknown",
      isLive: true,
    };

    onAddToBetSlip(selection);
    console.log("✅ Added live selection to bet slip:", selection);
  };

  // Toggle league expansion
  const toggleLeague = (leagueId: string) => {
    setExpandedLeagues(prev => ({
      ...prev,
      [leagueId]: !prev[leagueId],
    }));
  };

  // Toggle sport expansion
  const toggleSport = (sportKey: string) => {
    setExpandedSports(prev => ({
      ...prev,
      [sportKey]: !prev[sportKey],
    }));
  };


  return (
    <div className="w-full max-w-none overflow-hidden h-full">
      <FPSCounter />
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
        {filteredSportGroups.length === 0 ? (
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
            {filteredSportGroups.map((sport: any) => {
              const isSportExpanded = expandedSports[sport.sport_key] !== false; // Default to expanded
              
              return (
                <Collapsible 
                  key={sport.sport_key} 
                  open={isSportExpanded} 
                  onOpenChange={() => toggleSport(sport.sport_key)}
                  className="space-y-2"
                >
                  {/* Sport Header - Collapsible */}
                  <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-surface-2 rounded-md hover-elevate">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{sport.sport_icon}</span>
                      <h3 className="text-sm font-semibold text-foreground">
                        {sport.sport_title}
                      </h3>
                      <Badge variant="secondary" className="ml-2">
                        {sport.total_matches}
                      </Badge>
                    </div>
                    {isSportExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>

                  {/* Leagues */}
                  <CollapsibleContent className="space-y-2">
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
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
