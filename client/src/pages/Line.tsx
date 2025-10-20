import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { Clock } from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useMatchStore } from "@/store/matchStore";

// Import all the new components
import HeroBanner from "@/components/HeroBanner";
import PopularEvents from "@/components/PopularEvents";
import SportsMatches from "@/components/SportsMatches";

function LineContent() {
  const { onAddToBetSlip } = useBetSlip();
  const { mode, setMode } = useMode();

  // Ensure mode is set to 'prematch' when Line page loads (run only once)
  useEffect(() => {
    setMode('prematch');
  }, [setMode]);

  // Read from match store like Live page does
  const lastUpdate = useMatchStore(state => state.lastUpdate);
  const sports = useMatchStore(state => state.sports);
  const leagues = useMatchStore(state => state.leagues);
  
  // Get prematch matches from store - reads current state without subscribing
  const prematchMatches = useMemo(() => {
    const currentMatches = useMatchStore.getState().matches;
    const currentOdds = useMatchStore.getState().odds;
    
    // Filter for upcoming matches and enrich with odds
    return Array.from(currentMatches.values())
      .filter(m => m.status === 'upcoming')
      .map(match => ({
        ...match,
        odds: currentOdds.get(match.match_id)
      }));
  }, [lastUpdate]);

  // Group prematch matches by sport and league (similar to Live page)
  const sportGroups = useMemo(() => {
    const groupsMap = new Map<string, any>();
    
    for (const match of prematchMatches) {
      const sport = sports.find(s => s.sport_key === match.sport_key);
      if (!sport) continue;
      
      // Get or create sport group
      let sportGroup = groupsMap.get(match.sport_key);
      if (!sportGroup) {
        sportGroup = {
          id: match.sport_key,
          name: sport.sport_title,
          sport_icon: sport.sport_icon,
          leagues: new Map<string, any>()
        };
        groupsMap.set(match.sport_key, sportGroup);
      }
      
      // Get or create league within sport
      let league = sportGroup.leagues.get(match.league_id);
      if (!league) {
        league = {
          id: match.league_id,
          name: match.league_name,
          matches: []
        };
        sportGroup.leagues.set(match.league_id, league);
      }
      
      // Transform match to component format
      const transformedMatch = {
        id: match.match_id,
        homeTeam: {
          name: match.home_team,
          logo: match.home_team_logo,
        },
        awayTeam: {
          name: match.away_team,
          logo: match.away_team_logo,
        },
        kickoffTime: match.commence_time,
        venue: match.venue,
        odds: match.odds ? {
          home: match.odds.home,
          draw: match.odds.draw,
          away: match.odds.away,
        } : { home: 0, draw: 0, away: 0 },
        additionalMarkets: match.bookmakers?.[0]?.markets?.length || 0,
      };
      
      league.matches.push(transformedMatch);
    }
    
    // Convert maps to arrays
    const groups: any[] = [];
    groupsMap.forEach(sportGroup => {
      const leaguesArray = Array.from(sportGroup.leagues.values());
      groups.push({
        id: sportGroup.id,
        name: sportGroup.name,
        sport_icon: sportGroup.sport_icon,
        leagues: leaguesArray,
        total_matches: leaguesArray.reduce((sum, l: any) => sum + l.matches.length, 0)
      });
    });
    
    return groups;
  }, [prematchMatches, sports]);

  // Collect all matches for Popular Events
  const allMatchesWithLeague = useMemo(() => {
    const matches: any[] = [];
    sportGroups.forEach((sport: any) => {
      sport.leagues?.forEach((league: any) => {
        league.matches.forEach((match: any) => {
          matches.push({ ...match, league: league.name });
        });
      });
    });
    return matches;
  }, [sportGroups]);

  // Transform data for Popular Events - only use real data, include logos
  const popularMatches = useMemo(() => {
    return allMatchesWithLeague.slice(0, 6).map((match: any) => ({
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      league: match.league,
      venue: match.venue,
      odds: match.odds || {
            home: 0,
            draw: 0,
            away: 0,
          },
      additionalMarkets: match.additionalMarkets,
    }));
  }, [allMatchesWithLeague]);

  // Handle odds selection for bet slip
  const handleOddsClick = (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => {
    if (!onAddToBetSlip) return;

    const match = allMatchesWithLeague.find((m: any) => m.id === matchId);
    if (!match) return;

    // Create human-readable selection name
    const getSelectionName = (market: string, type: string) => {
      if (market === "1x2") {
        return type === "1" ? match.homeTeam.name : type === "X" ? "Draw" : match.awayTeam.name;
      }
      return type;
    };

    const selection = {
      id: `${match.id}-${market}-${type}`,
      matchId: match.id,
      fixtureId: match.id,
      type: type.toLowerCase(),
      selection: getSelectionName(market, type),
      odds,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      league: match.league,
      market: market,
      isLive: false,
    };

    onAddToBetSlip(selection);
  };

  // Separate football from other sports - maintaining order
  const footballSport = sportGroups.find((s: any) => s.id === 'football');
  const otherSports = sportGroups.filter((s: any) => s.id !== 'football');

  // Check if we have any actual matches
  const hasMatches = allMatchesWithLeague.length > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Show content immediately - data always available from store */}
      {!hasMatches ? (
        /* No data state */
        <div className="container mx-auto pb-6">
          <HeroBanner />
          <div className="text-center py-12">
            <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-foreground mb-2">No matches available</p>
            <p className="text-muted-foreground">Check back later for upcoming matches</p>
          </div>
        </div>
      ) : (
        /* Content - only show when we have data */
        <div className="container mx-auto pb-6 space-y-8">
          {/* Hero Banner */}
          <HeroBanner />

          {/* Popular Events - First 6 matches */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <PopularEvents
                matches={popularMatches}
                onOddsClick={handleOddsClick}
              />
            </motion.div>

            {/* Football Section - Always First */}
            {footballSport && footballSport.leagues.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <SportsMatches
                  sports={[footballSport]}
                  onOddsClick={handleOddsClick}
                />
              </motion.div>
            )}

            {/* Other Sports - In Menu Order */}
            {otherSports.map((sport: any, index: number) => (
              sport.leagues.length > 0 && (
                <motion.div
                  key={sport.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                >
                  <SportsMatches
                    sports={[sport]}
                    onOddsClick={handleOddsClick}
                  />
                </motion.div>
              )
            ))}
        </div>
      )}
    </div>
  );
}

export default function Line() {
  return <LineContent />;
}
