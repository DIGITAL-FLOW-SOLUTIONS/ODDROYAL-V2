import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { Clock } from "lucide-react";
import { useBetSlip } from "@/contexts/BetSlipContext";
import { useMatchStore } from "@/store/matchStore";
import { useQuery } from "@tanstack/react-query";

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

  // Fetch stable master catalog - prevents flickering
  const { data: menuData } = useQuery({
    queryKey: ['/api/menu', 'prematch'],
    queryFn: async () => {
      const response = await fetch('/api/menu?mode=prematch');
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30000, // 30 seconds
    placeholderData: (previousData: any) => previousData, // Show old data while refetching - prevents flicker
  });

  // Read from match store for real-time data
  const lastUpdate = useMatchStore(state => state.lastUpdate);
  
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

  // Create match lookup map for fast access
  const matchesByLeague = useMemo(() => {
    const map = new Map<string, any[]>();
    
    for (const match of prematchMatches) {
      const leagueMatches = map.get(match.league_id) || [];
      
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
      
      leagueMatches.push(transformedMatch);
      map.set(match.league_id, leagueMatches);
    }
    
    return map;
  }, [prematchMatches]);

  // Build stable sport groups from catalog, overlay real-time match data
  const sportGroups = useMemo(() => {
    if (!menuData?.sports) return [];
    
    return menuData.sports.map((sport: any) => ({
      id: sport.sport_key,
      name: sport.sport_title,
      sport_icon: sport.sport_icon,
      leagues: sport.leagues.map((league: any) => ({
        id: league.league_id,
        name: league.league_name,
        matches: matchesByLeague.get(league.league_id) || [], // Overlay real-time matches
      })),
      total_matches: sport.leagues.reduce((sum: number, league: any) => {
        return sum + (matchesByLeague.get(league.league_id)?.length || 0);
      }, 0),
    }));
  }, [menuData, matchesByLeague]);

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

  // Separate football from other sports - maintaining catalog order
  // Filter for sports with at least one match for better UX
  const sportsWithMatches = sportGroups.filter((s: any) => s.total_matches > 0);
  const footballSport = sportsWithMatches.find((s: any) => s.id === 'football');
  const otherSports = sportsWithMatches.filter((s: any) => s.id !== 'football');

  // Check if we have any actual matches
  const hasMatches = sportsWithMatches.length > 0;

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
            {footballSport && (
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

            {/* Other Sports - In Catalog Order */}
            {otherSports.map((sport: any, index: number) => (
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
            ))}
        </div>
      )}
    </div>
  );
}

export default function Line() {
  return <LineContent />;
}
