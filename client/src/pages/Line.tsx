import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { useQuery } from "@tanstack/react-query";
import { Clock, AlertCircle } from "lucide-react";

// Import all the new components
import HeroBanner from "@/components/HeroBanner";
import PopularEvents from "@/components/PopularEvents";
import TopLeagues from "@/components/TopLeagues";
import SportsMatches from "@/components/SportsMatches";
import OtherSports from "@/components/OtherSports";

interface LineProps {
  onAddToBetSlip?: (selection: any) => void;
}

function LineContent({ onAddToBetSlip }: LineProps) {
  console.log('[LINE] Component render START');
  const [selectedLeague, setSelectedLeague] = useState("all");
  const { mode, setMode } = useMode();

  // Ensure mode is set to 'prematch' when Line page loads (run only once)
  useEffect(() => {
    setMode('prematch');
  }, [setMode]);

  // Fetch menu data - same as sidebar, organized with football first
  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['/api/menu', mode],
    queryFn: async () => {
      const response = await fetch(`/api/menu?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      console.log('[LINE] Menu data received:', result.data);
      return result.data;
    },
    staleTime: mode === 'live' ? 60 * 1000 : 5 * 60 * 1000,
  });

  const sports = menuData?.sports || [];
  console.log('[LINE] Sports:', sports.length, 'Mode:', mode);
  
  // Fetch matches for all leagues
  const leagueIds = useMemo(() => {
    const ids: Array<{ sport: string; leagueId: string }> = [];
    sports.forEach((sport: any) => {
      sport.leagues?.forEach((league: any) => {
        ids.push({ sport: sport.sport_key, leagueId: league.league_id });
      });
    });
    console.log('[LINE] League IDs to fetch:', ids.length);
    return ids;
  }, [sports]);

  // Fetch all league matches in parallel
  const leagueMatchesQueries = useQuery({
    queryKey: ['/api/line/all', mode, leagueIds.map(l => l.leagueId).join(',')],
    queryFn: async () => {
      console.log('[LINE] Fetching matches for', leagueIds.length, 'leagues');
      const results = await Promise.all(
        leagueIds.map(async ({ sport, leagueId }) => {
          try {
            const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${mode}`);
            if (!response.ok) return { sport, leagueId, matches: [] };
            const result = await response.json();
            return { sport, leagueId, matches: result.data?.matches || [] };
          } catch (error) {
            return { sport, leagueId, matches: [] };
          }
        })
      );
      console.log('[LINE] Fetched results:', results.length, 'Total matches:', results.reduce((sum, r) => sum + r.matches.length, 0));
      return results;
    },
    enabled: leagueIds.length > 0,
    staleTime: mode === 'live' ? 30 * 1000 : 3 * 60 * 1000,
  });

  const isLoading = menuLoading || leagueMatchesQueries.isLoading;
  console.log('[LINE] Loading states - menu:', menuLoading, 'matches:', leagueMatchesQueries.isLoading);

  // Build match lookup by league
  const matchesByLeague = useMemo(() => {
    const map = new Map<string, any[]>();
    leagueMatchesQueries.data?.forEach(({ leagueId, matches }) => {
      map.set(leagueId, matches);
    });
    console.log('[LINE] Matches by league map size:', map.size);
    return map;
  }, [leagueMatchesQueries.data]);

  // Group sports with their leagues and matches - maintaining menu order
  const sportGroups = useMemo(() => {
    const groups = sports.map((sport: any) => ({
      id: sport.sport_key,
      name: sport.sport_title,
      leagues: sport.leagues?.map((league: any) => ({
        id: league.league_id,
        name: league.league_name,
        matches: (matchesByLeague.get(league.league_id) || []).map((match: any) => ({
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
          odds: match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h')
            ? {
                home: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
                draw: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === 'Draw')?.price || 0,
                away: match.bookmakers[0].markets.find((m: any) => m.key === 'h2h')?.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
              }
            : null,
          additionalMarkets: match.bookmakers?.[0]?.markets?.length || 0,
        }))
      })) || []
    }));
    console.log('[LINE] Sport groups:', groups.length, 'Total matches:', groups.reduce((sum: number, g: any) => sum + g.leagues.reduce((s: number, l: any) => s + l.matches.length, 0), 0));
    return groups;
  }, [sports, matchesByLeague]);

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
      matchId: match.id,
      matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
      market,
      selection: getSelectionName(market, type),
      odds,
      status: 'pending' as const,
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
      <div className="container mx-auto pb-6 space-y-8">
        {/* Hero Banner */}
        <HeroBanner />

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading matches...</p>
          </div>
        )}

        {/* No data state */}
        {!isLoading && !hasMatches && (
          <div className="text-center py-12">
            <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium text-foreground mb-2">No matches available</p>
            <p className="text-muted-foreground">Check back later for upcoming matches</p>
          </div>
        )}

        {/* Content - only show when we have data */}
        {!isLoading && hasMatches && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

// Error boundary wrapper to catch any rendering errors
export default function Line(props: LineProps) {
  console.log('='.repeat(80));
  console.log('[LINE] ✅ WRAPPER COMPONENT IS MOUNTING');
  console.log('[LINE] Props:', props);
  console.log('='.repeat(80));
  
  try {
    return <LineContent {...props} />;
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[LINE] ❌ RENDER ERROR CAUGHT:', error);
    console.error('='.repeat(80));
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="h-16 w-16 text-destructive" />
            <h2 className="text-2xl font-bold text-foreground">Error Loading Line Page</h2>
            <p className="text-muted-foreground max-w-md">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
