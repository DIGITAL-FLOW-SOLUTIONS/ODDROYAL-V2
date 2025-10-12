import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
import { usePageLoading } from "@/contexts/PageLoadingContext";

// Import all the new components
import HeroBanner from "@/components/HeroBanner";
import PopularEvents from "@/components/PopularEvents";
import TopLeagues from "@/components/TopLeagues";
import SportsMatches from "@/components/SportsMatches";
import OtherSports from "@/components/OtherSports";

interface LineProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Line({ onAddToBetSlip }: LineProps) {
  const [selectedLeague, setSelectedLeague] = useState("all");
  const { mode } = useMode();
  const { setPageLoading } = usePageLoading();

  // Fetch prematch matches with instant loading from cache
  const { data: sportGroupsData, isRefetching, isLoading, refetch } = useQuery({
    queryKey: ["/api/prematch/matches"],
    queryFn: async () => {
      // Fetch menu to get sports and leagues with prematch matches
      const menuResponse = await fetch('/api/menu?mode=prematch');
      if (!menuResponse.ok) throw new Error("Failed to fetch menu");
      const menuResult = await menuResponse.json();
      
      const sportGroups: any[] = [];
      const allMatches: any[] = [];
      
      if (menuResult.success && menuResult.data.sports) {
        // Fetch matches for each sport and league
        for (const sport of menuResult.data.sports) {
          const sportLeagues: any[] = [];
          
          for (const league of sport.leagues) {
            const lineResponse = await fetch(`/api/line/${sport.sport_key}/${league.league_id}?mode=prematch`);
            if (lineResponse.ok) {
              const lineResult = await lineResponse.json();
              if (lineResult.success && lineResult.data.matches) {
                const leagueMatches = lineResult.data.matches.map((match: any) => {
                  const matchData = {
                    id: match.match_id,
                    homeTeam: {
                      name: match.home_team,
                      logo: match.home_team_logo,
                    },
                    awayTeam: {
                      name: match.away_team,
                      logo: match.away_team_logo,
                    },
                    league: league.league_name,
                    kickoffTime: match.commence_time,
                    venue: match.venue,
                    odds: match.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h")
                      ? {
                          home: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
                          draw: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === "Draw")?.price || 0,
                          away: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
                        }
                      : null,
                    homeTeamLogo: match.home_team_logo,
                    awayTeamLogo: match.away_team_logo,
                  };
                  allMatches.push(matchData);
                  return matchData;
                });
                
                sportLeagues.push({
                  id: league.league_id,
                  name: league.league_name,
                  matches: leagueMatches,
                });
              }
            }
          }
          
          if (sportLeagues.length > 0) {
            sportGroups.push({
              id: sport.sport_key,
              name: sport.sport_title,
              icon: sport.sport_icon,
              leagues: sportLeagues,
            });
          }
        }
      }
      
      return { sportGroups, allMatches };
    },
    staleTime: 3 * 60 * 1000, // 3 minutes for prematch
    refetchInterval: 30000, // Refresh every 30 seconds in background
    placeholderData: (previousData: any) => previousData, // Show cached data instantly
  });

  // Track retry attempts for data availability
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const maxRetries = 3;
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const hasData = sportGroupsData?.sportGroups && sportGroupsData.sportGroups.length > 0;
    
    // Reset retry count when we get data
    if (hasData && retryCount > 0) {
      setRetryCount(0);
      setIsRetrying(false);
    }

    const shouldRetry = !isLoading && !isRefetching && !hasData && retryCount < maxRetries && !isRetrying;

    if (!hasData && (isLoading || isRefetching || shouldRetry)) {
      setPageLoading(true);
      
      // If we should retry, trigger a refetch with delay
      if (shouldRetry) {
        setIsRetrying(true);
        console.log(`📡 No prematch data available, retrying... (${retryCount + 1}/${maxRetries})`);
        
        // Clear any existing timeout before setting a new one
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        
        retryTimeoutRef.current = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          refetch().catch(err => {
            console.error('Refetch error:', err);
          }).finally(() => {
            setIsRetrying(false);
          });
        }, 1000); // 1 second delay between retries
      }
    } else {
      // Either we have data or we've exceeded retries
      setPageLoading(false);
      if (!hasData && retryCount >= maxRetries) {
        console.log('⚠️ Max retries reached for line page, showing empty state');
      }
    }

  }, [isLoading, isRefetching, sportGroupsData, retryCount, isRetrying, refetch, setPageLoading]);

  // Cleanup timeout only on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  const sportGroups = sportGroupsData?.sportGroups || [];
  const upcomingMatches = sportGroupsData?.allMatches || [];

  // Transform API data for Popular Events - only use real data, include logos
  const popularMatches = upcomingMatches.slice(0, 6).map((match: any) => ({
    id: match.id,
    homeTeam: {
      name: match.homeTeam?.name || match.homeTeam,
      logo: match.homeTeamLogo || match.homeTeam?.logo,
    },
    awayTeam: {
      name: match.awayTeam?.name || match.awayTeam,
      logo: match.awayTeamLogo || match.awayTeam?.logo,
    },
    kickoffTime: match.kickoffTime || match.kickoff,
    league: match.league,
    venue: match.venue,
    odds: match.odds || {
      home: 0,
      draw: 0,
      away: 0,
    },
    additionalMarkets: match.additionalMarkets || 0,
  }));

  // Handle odds selection for bet slip
  const handleOddsClick = (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => {
    if (!onAddToBetSlip) return;

    const match = upcomingMatches.find((m: any) => m.id === matchId);
    if (!match) return;

    // Create human-readable selection name
    const getSelectionName = (market: string, type: string) => {
      if (market === "1x2") {
        return type === "home" ? "1" : type === "draw" ? "X" : "2";
      }
      return type.charAt(0).toUpperCase() + type.slice(1);
    };

    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      fixtureId: matchId, // Add fixtureId for backend compatibility
      market: market || "1x2",
      type,
      selection: getSelectionName(market, type),
      odds,
      homeTeam: match.homeTeam?.name || match.homeTeam,
      awayTeam: match.awayTeam?.name || match.awayTeam,
      league: match.league || "Unknown",
      isLive: false,
    };

    onAddToBetSlip(selection);
    console.log("Added to bet slip:", selection);
  };

  // Handle league selection from Top Leagues
  const handleLeagueSelect = (leagueId: string) => {
    setSelectedLeague(leagueId);
    // TODO: Filter matches based on selected league
    console.log("Selected league:", leagueId);
  };

  // Handle favorites
  const handleAddToFavorites = (matchId: string) => {
    console.log("Added to favorites:", matchId);
    // TODO: Implement favorites functionality
  };

  // Filter sport groups based on selected league
  const filteredSportGroups =
    selectedLeague === "all"
      ? sportGroups
      : sportGroups.map(sport => ({
          ...sport,
          leagues: sport.leagues.filter((league: any) =>
            league.id === selectedLeague ||
            league.name.toLowerCase().includes(selectedLeague.toLowerCase())
          ),
        })).filter((sport: any) => sport.leagues.length > 0);

  return (
    <div className="w-full max-w-none overflow-hidden h-full">
      <div className="p-4 space-y-8">
        {/* Hero Banner - Top promotional slider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <HeroBanner />
        </motion.div>

        {/* Popular Events - Horizontal carousel of featured matches */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <PopularEvents
            matches={popularMatches}
            isLoading={false}
            onOddsClick={handleOddsClick}
            onAddToFavorites={handleAddToFavorites}
          />
        </motion.div>

        {/* Top Leagues - Horizontal slider with league selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <TopLeagues />
        </motion.div>

        {/* Sports Matches - Table format grouped by sport and league */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <SportsMatches
            sports={filteredSportGroups}
            isLoading={false}
            onOddsClick={handleOddsClick}
            onAddToFavorites={handleAddToFavorites}
          />
        </motion.div>

        {/* Other Sports - Expandable accordion sections */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <OtherSports
            onOddsClick={handleOddsClick}
            onAddToFavorites={handleAddToFavorites}
          />
        </motion.div>
      </div>
    </div>
  );
}
