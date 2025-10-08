import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
import bannerImage from "@assets/banner-live_1757761750950.jpg";
import SportsMatches from "@/components/SportsMatches";
import { Zap, Circle } from "lucide-react";

interface LiveProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Live({ onAddToBetSlip }: LiveProps) {
  const { mode } = useMode();

  // Fetch live matches with instant loading from cache
  const { data: sportGroupsData, isRefetching } = useQuery({
    queryKey: ['/api/live/matches'],
    queryFn: async () => {
      // Fetch menu to get sports and leagues with live matches
      const menuResponse = await fetch('/api/menu?mode=live');
      if (!menuResponse.ok) throw new Error('Failed to fetch menu');
      const menuResult = await menuResponse.json();
      
      const sportGroups: any[] = [];
      
      if (menuResult.success && menuResult.data.sports) {
        // Fetch matches for each sport and league
        for (const sport of menuResult.data.sports) {
          const sportLeagues: any[] = [];
          
          for (const league of sport.leagues) {
            const lineResponse = await fetch(`/api/line/${sport.sport_key}/${league.league_id}?mode=live`);
            if (lineResponse.ok) {
              const lineResult = await lineResponse.json();
              if (lineResult.success && lineResult.data.matches) {
                const leagueMatches = lineResult.data.matches.map((match: any) => {
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
                    league: league.league_name,
                    kickoffTime: match.commence_time,
                    venue: match.venue,
                    odds: h2hMarket ? {
                      home: h2hMarket.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0,
                      draw: h2hMarket.outcomes?.find((o: any) => o.name === "Draw")?.price || 0,
                      away: h2hMarket.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0,
                    } : null,
                  };
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
      
      return { sportGroups };
    },
    staleTime: 30 * 1000, // 30 seconds for live
    refetchInterval: 15000, // Refresh every 15 seconds in background
    placeholderData: (previousData: any) => previousData, // Show cached data instantly
  });

  const sportGroups = sportGroupsData?.sportGroups || [];

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

  // Handle favorites
  const handleAddToFavorites = (matchId: string) => {
    console.log("Added to favorites:", matchId);
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
      <div className="p-4">
        {sportGroups.length === 0 ? (
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
            transition={{ duration: 0.6 }}
          >
            <SportsMatches
              sports={sportGroups}
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
