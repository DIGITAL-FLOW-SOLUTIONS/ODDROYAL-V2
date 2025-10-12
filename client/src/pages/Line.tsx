import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { useMatchStore } from "@/store/matchStore";

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

  // Subscribe to global store - instant access, no REST calls
  const matches = useMatchStore(state => state.matches);
  const sports = useMatchStore(state => state.sports);
  const leagues = useMatchStore(state => state.leagues);
  
  // Filter prematch matches with useMemo to avoid infinite loops
  const prematchMatches = useMemo(() => {
    return Array.from(matches.values()).filter(m => m.status === 'upcoming');
  }, [matches]);

  // Group prematch matches by sport and league (similar to old REST response structure)
  const sportGroups = useMemo(() => {
    const groupsMap = new Map<string, any>();
    
    for (const match of prematchMatches) {
      const sport = sports.find(s => s.sport_key === match.sport_key);
      if (!sport) continue;
      
      // Get or create sport group
      let sportGroup = groupsMap.get(match.sport_key);
      if (!sportGroup) {
        sportGroup = {
          sport: match.sport_key,
          sportTitle: sport.sport_title,
          leagues: new Map<string, any>()
        };
        groupsMap.set(match.sport_key, sportGroup);
      }
      
      // Get or create league within sport
      let league = sportGroup.leagues.get(match.league_id);
      if (!league) {
        league = {
          league_id: match.league_id,
          league_name: match.league_name,
          matches: []
        };
        sportGroup.leagues.set(match.league_id, league);
      }
      
      league.matches.push(match);
    }
    
    // Convert maps to arrays
    const groups: any[] = [];
    groupsMap.forEach(sportGroup => {
      const leagues = Array.from(sportGroup.leagues.values());
      groups.push({
        sport: sportGroup.sport,
        sportTitle: sportGroup.sportTitle,
        leagues
      });
    });
    
    return groups;
  }, [prematchMatches, sports]);

  // All upcoming matches for popular events
  const upcomingMatches = prematchMatches;

  // Transform API data for Popular Events - only use real data, include logos
  const popularMatches = upcomingMatches.slice(0, 6).map((match: any) => ({
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
    league: match.league_name,
    venue: match.venue,
    odds: {
      home: 0,
      draw: 0,
      away: 0,
    },
    additionalMarkets: match.bookmakers?.[0]?.markets?.length || 0,
  }));

  // Handle odds selection for bet slip
  const handleOddsClick = (
    matchId: string,
    market: string,
    type: string,
    odds: number,
  ) => {
    if (!onAddToBetSlip) return;

    const match = upcomingMatches.find((m: any) => m.match_id === matchId);
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
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      league: match.league_name || "Unknown",
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
