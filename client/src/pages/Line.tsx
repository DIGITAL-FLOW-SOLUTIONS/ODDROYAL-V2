import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { usePrematchMatches } from "@/hooks/usePrematchMatches";

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

  // Use the new hook with localStorage cache for instant loading
  const { data: sportGroupsData, isRefetching, isLoading, refetch } = usePrematchMatches();

  // Track retry attempts for data availability
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const maxRetries = 3;
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const hasData = sportGroupsData?.sportGroups && sportGroupsData.sportGroups.length > 0;
    
    // Mark as successfully loaded once we have data
    if (hasData) {
      hasLoadedOnce.current = true;
    }
    
    // Reset retry count when we get data
    if (hasData && retryCount > 0) {
      setRetryCount(0);
      setIsRetrying(false);
    }

    const shouldRetry = !isLoading && !isRefetching && !hasData && retryCount < maxRetries && !isRetrying;

    // Only show loader if we've NEVER loaded data successfully
    if (!hasLoadedOnce.current && (isLoading || isRefetching || shouldRetry)) {
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
