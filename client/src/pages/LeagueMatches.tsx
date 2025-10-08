import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SportsMatches from "@/components/SportsMatches";
import { useLocation } from "wouter";

interface LeagueMatchesProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function LeagueMatches({ onAddToBetSlip }: LeagueMatchesProps) {
  const params = useParams<{ sport: string; leagueId: string }>();
  const { mode } = useMode();
  const [, setLocation] = useLocation();
  
  const sport = params.sport;
  const leagueId = params.leagueId;

  // Fetch league matches
  const { data: leagueData, isLoading } = useQuery({
    queryKey: ['/api/line', sport, leagueId, mode],
    queryFn: async () => {
      const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch league matches');
      const result = await response.json();
      return result.data;
    },
    refetchInterval: mode === 'live' ? 15000 : 30000,
  });

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
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading matches...</p>
            </div>
          </div>
        ) : formattedSportGroups[0]?.leagues[0]?.matches?.length === 0 ? (
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
              isLoading={isLoading}
              onOddsClick={handleOddsClick}
              onAddToFavorites={handleAddToFavorites}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
