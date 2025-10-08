import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";

// Import all the new components
import HeroBanner from "@/components/HeroBanner";
import PopularEvents from "@/components/PopularEvents";
import TopLeagues from "@/components/TopLeagues";
import FootballMatches from "@/components/FootballMatches";
import OtherSports from "@/components/OtherSports";

interface LineProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Line({ onAddToBetSlip }: LineProps) {
  const [selectedLeague, setSelectedLeague] = useState("all");
  const { mode } = useMode();

  // Fetch prematch matches from cache
  const { data: upcomingMatchesData, isLoading: matchesLoading } = useQuery({
    queryKey: ["/api/prematch/matches"],
    queryFn: async () => {
      // Fetch menu to get sports and leagues with prematch matches
      const menuResponse = await fetch('/api/menu?mode=prematch');
      if (!menuResponse.ok) throw new Error("Failed to fetch menu");
      const menuResult = await menuResponse.json();
      
      const allMatches: any[] = [];
      
      if (menuResult.success && menuResult.data.sports) {
        // Fetch matches for each league
        for (const sport of menuResult.data.sports) {
          for (const league of sport.leagues) {
            const lineResponse = await fetch(`/api/line/${sport.sport_key}/${league.league_id}?mode=prematch`);
            if (lineResponse.ok) {
              const lineResult = await lineResponse.json();
              if (lineResult.success && lineResult.data.matches) {
                lineResult.data.matches.forEach((match: any) => {
                  allMatches.push({
                    id: match.match_id,
                    homeTeam: match.home_team,
                    awayTeam: match.away_team,
                    league: league.league_name,
                    kickoffTime: match.commence_time,
                    venue: match.venue,
                    odds: match.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h")
                      ? {
                          home: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === match.home_team)?.price,
                          draw: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === "Draw")?.price,
                          away: match.bookmakers[0].markets.find((m: any) => m.key === "h2h")?.outcomes?.find((o: any) => o.name === match.away_team)?.price,
                        }
                      : null,
                    homeTeamLogo: match.home_team_logo,
                    awayTeamLogo: match.away_team_logo,
                  });
                });
              }
            }
          }
        }
      }
      
      return { data: allMatches };
    },
    refetchInterval: 30000, // Refresh every 30 seconds for prematch
  });

  const upcomingMatches = upcomingMatchesData?.data || [];

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
    odds: {
      home: match.odds?.home || 0,
      draw: match.odds?.draw || 0,
      away: match.odds?.away || 0,
    },
    additionalMarkets: match.additionalMarkets || 0,
  }));

  // Group matches by league for Football section
  const footballLeagues = (() => {
    const leagueMap = new Map();

    upcomingMatches.forEach((match: any) => {
      const leagueName = match.league || "Other";
      if (!leagueMap.has(leagueName)) {
        leagueMap.set(leagueName, {
          id: leagueName.toLowerCase().replace(/\s+/g, "-"),
          name: leagueName,
          logo: undefined, // Would be populated from API
          matches: [],
        });
      }

      leagueMap.get(leagueName).matches.push({
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
        venue: match.venue,
        odds: {
          home: match.odds?.home || 0,
          draw: match.odds?.draw || 0,
          away: match.odds?.away || 0,
        },
        additionalMarkets: match.additionalMarkets || 0,
      });
    });

    return Array.from(leagueMap.values());
  })();

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

  // Filter football leagues based on selected league
  const filteredFootballLeagues =
    selectedLeague === "all"
      ? footballLeagues
      : footballLeagues.filter(
          (league) =>
            league.id === selectedLeague ||
            league.name.toLowerCase().includes(selectedLeague.toLowerCase()),
        );

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
            isLoading={matchesLoading}
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
          <TopLeagues
            selectedLeague={selectedLeague}
            onLeagueSelect={handleLeagueSelect}
          />
        </motion.div>

        {/* Football Matches - Table format grouped by league */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <FootballMatches
            leagues={filteredFootballLeagues}
            isLoading={matchesLoading}
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
