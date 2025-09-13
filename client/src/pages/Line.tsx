import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

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

  // Fetch upcoming matches from SportMonks API
  const { data: upcomingMatchesData, isLoading: matchesLoading } = useQuery({
    queryKey: ['/api/fixtures/upcoming'],
    queryFn: async () => {
      const response = await fetch('/api/fixtures/upcoming?limit=50');
      if (!response.ok) throw new Error('Failed to fetch upcoming matches');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const upcomingMatches = upcomingMatchesData?.data || [];

  // Transform API data for Popular Events - only use real data
  const popularMatches = upcomingMatches.slice(0, 6).map((match: any) => ({
    id: match.id,
    homeTeam: {
      name: match.homeTeam?.name || match.homeTeam,
      logo: match.homeTeam?.logo,
    },
    awayTeam: {
      name: match.awayTeam?.name || match.awayTeam,
      logo: match.awayTeam?.logo,
    },
    kickoffTime: match.kickoffTime || match.kickoff,
    league: match.league,
    venue: match.venue,
    odds: match.markets?.["1x2"] ? {
      home: match.markets["1x2"].home,
      draw: match.markets["1x2"].draw,
      away: match.markets["1x2"].away,
    } : null,
    additionalMarkets: match.markets ? Object.keys(match.markets).length - 1 : 0, // Real markets count minus main 1x2
  }));

  // Group matches by league for Football section
  const footballLeagues = (() => {
    const leagueMap = new Map();
    
    upcomingMatches.forEach((match: any) => {
      const leagueName = match.league || "Other";
      if (!leagueMap.has(leagueName)) {
        leagueMap.set(leagueName, {
          id: leagueName.toLowerCase().replace(/\s+/g, '-'),
          name: leagueName,
          logo: undefined, // Would be populated from API
          matches: [],
        });
      }
      
      leagueMap.get(leagueName).matches.push({
        id: match.id,
        homeTeam: {
          name: match.homeTeam?.name || match.homeTeam,
          logo: match.homeTeam?.logo,
        },
        awayTeam: {
          name: match.awayTeam?.name || match.awayTeam,
          logo: match.awayTeam?.logo,
        },
        kickoffTime: match.kickoffTime || match.kickoff,
        venue: match.venue,
        odds: match.markets?.["1x2"] ? {
          home: match.markets["1x2"].home,
          draw: match.markets["1x2"].draw,
          away: match.markets["1x2"].away,
        } : null,
        additionalMarkets: match.markets ? Object.keys(match.markets).length - 1 : 0, // Real markets count minus main 1x2
      });
    });

    return Array.from(leagueMap.values());
  })();

  // Handle odds selection for bet slip
  const handleOddsClick = (matchId: string, market: string, type: string, odds: number) => {
    if (!onAddToBetSlip) return;

    const match = upcomingMatches.find((m: any) => m.id === matchId);
    if (!match) return;

    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      market,
      type,
      odds,
      homeTeam: match.homeTeam?.name || match.homeTeam,
      awayTeam: match.awayTeam?.name || match.awayTeam,
      league: match.league || "Unknown"
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
  const filteredFootballLeagues = selectedLeague === "all" 
    ? footballLeagues 
    : footballLeagues.filter(league => 
        league.id === selectedLeague || 
        league.name.toLowerCase().includes(selectedLeague.toLowerCase())
      );

  return (
    <div className="w-full max-w-none overflow-hidden">
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