import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SportsMatches from "@/components/SportsMatches";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";

interface LeagueMatchesProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function LeagueMatches({ onAddToBetSlip }: LeagueMatchesProps) {
  const params = useParams<{ sport: string; leagueId: string }>();
  const { mode } = useMode();
  const [, setLocation] = useLocation();
  const { setPageLoading } = usePageLoading();
  
  const sport = params.sport;
  const leagueId = params.leagueId;

  // Fetch league matches with instant loading from cache
  const { data: leagueData, isRefetching, isLoading, refetch } = useQuery({
    queryKey: ['/api/line', sport, leagueId, mode],
    queryFn: async () => {
      const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch league matches');
      const result = await response.json();
      return result.data;
    },
    staleTime: mode === 'live' ? 30 * 1000 : 3 * 60 * 1000,
    refetchInterval: mode === 'live' ? 15000 : 30000,
    placeholderData: (previousData: any) => previousData, // Show cached data instantly
  });

  // Track retry attempts for data availability
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const maxRetries = 3;

  useEffect(() => {
    const hasData = leagueData?.matches && leagueData.matches.length > 0;
    
    // Reset retry count when we get data
    if (hasData && retryCount > 0) {
      setRetryCount(0);
      setIsRetrying(false);
    }

    const shouldRetry = !isLoading && !isRefetching && !hasData && retryCount < maxRetries && !isRetrying;

    if (isLoading || isRefetching || shouldRetry) {
      setPageLoading(true);
      
      // If we should retry, trigger a refetch with delay
      if (shouldRetry) {
        setIsRetrying(true);
        console.log(`📡 No league matches available, retrying... (${retryCount + 1}/${maxRetries})`);
        
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          refetch().finally(() => setIsRetrying(false));
        }, 1000); // 1 second delay between retries
      }
    } else {
      // Either we have data or we've exceeded retries
      setPageLoading(false);
      if (!hasData && retryCount >= maxRetries) {
        console.log('⚠️ Max retries reached for league matches, showing empty state');
      }
    }
  }, [isLoading, isRefetching, leagueData, retryCount, isRetrying, refetch, setPageLoading]);

  // Format data for SportsMatches component
  const formattedSportGroups = leagueData?.matches ? [{
    id: sport || 'unknown',
    name: leagueData.sport_title || sport?.toUpperCase() || 'Unknown Sport',
    leagues: [{
      id: leagueId || 'unknown',
      name: leagueData.league_name || 'Unknown League',
      matches: leagueData.matches.map((match: any) => {
        const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h");
        
        return {
          id: match.match_id,
          homeTeam: {
            name: match.home_team,
            logo: match.home_team_logo,
          },
          awayTeam: {
            name: match.away_team,
            logo: match.away_team_logo,
          },
          league: leagueData.league_name || 'Unknown League',
          kickoffTime: match.commence_time,
          venue: match.venue,
          odds: h2hMarket ? {
            home: h2hMarket.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
            draw: h2hMarket.outcomes?.find((o: any) => o.name === "Draw")?.price || 0,
            away: h2hMarket.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
          } : null,
        };
      })
    }]
  }] : [];

  // Handle odds selection for bet slip
  const handleOddsClick = (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => {
    if (!onAddToBetSlip) return;

    const match = leagueData?.matches?.find((m: any) => m.match_id === matchId);
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
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      league: leagueData?.league_name || "Unknown",
      isLive: mode === 'live',
    };

    onAddToBetSlip(selection);
  };

  // Handle favorites
  const handleAddToFavorites = (matchId: string) => {
    console.log("Added to favorites:", matchId);
  };

  return (
    <div className="w-full max-w-none overflow-hidden h-full">
      {/* Header with back button */}
      <div className="p-4 border-b border-surface-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(mode === 'live' ? '/live' : '/line')}
            data-testid="button-back"
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-league-name">
              {leagueData?.league_name || 'Loading...'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {leagueData?.sport_title || sport?.toUpperCase() || ''}
              {mode === 'live' && ' • Live Matches'}
            </p>
          </div>
        </div>
      </div>

      {/* Matches List */}
      <div className="p-4">
        {formattedSportGroups[0]?.leagues[0]?.matches?.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No matches available</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <SportsMatches
              sports={formattedSportGroups}
              isLoading={false}
              onOddsClick={handleOddsClick}
              onAddToFavorites={handleAddToFavorites}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
