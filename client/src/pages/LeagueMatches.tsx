import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useMode } from "@/contexts/ModeContext";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import MatchCard from "@/components/MatchCard";

interface LeagueMatchesProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function LeagueMatches({ onAddToBetSlip }: LeagueMatchesProps) {
  const { sport, leagueId } = useParams<{ sport: string; leagueId: string }>();
  const { mode } = useMode();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/line', sport, leagueId, mode],
    queryFn: async () => {
      const response = await fetch(`/api/line/${sport}/${leagueId}?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch matches');
      const result = await response.json();
      return result;
    },
    refetchInterval: mode === 'live' ? 15000 : 30000,
  });

  const matches = data?.data?.matches || [];
  const leagueName = data?.data?.league_name || 'League';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href={mode === 'live' ? '/live' : '/line'}>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-6"
        >
          <Link href={mode === 'live' ? '/live' : '/line'}>
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold" data-testid="text-league-name">
            {leagueName}
          </h1>
          {mode === 'live' && (
            <div className="flex items-center gap-2 text-destructive">
              <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
              <span className="text-sm font-medium">LIVE</span>
            </div>
          )}
        </motion.div>

        {matches.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <p className="text-muted-foreground">No matches available</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {matches.map((match: any, index: number) => {
              const h2hMarket = match.bookmakers?.[0]?.markets?.find(
                (m: any) => m.key === "h2h"
              );
              
              const matchData = {
                id: match.match_id,
                homeTeam: {
                  id: `${match.match_id}-home`,
                  name: match.home_team,
                  logo: match.home_team_logo,
                },
                awayTeam: {
                  id: `${match.match_id}-away`,
                  name: match.away_team,
                  logo: match.away_team_logo,
                },
                league: leagueName,
                kickoffTime: match.commence_time,
                venue: match.venue,
                status: (mode === 'live' ? 'live' : 'upcoming') as "upcoming" | "live" | "finished",
                odds: h2hMarket
                  ? {
                      home: h2hMarket.outcomes?.find(
                        (o: any) => o.name === match.home_team
                      )?.price || 0,
                      draw: h2hMarket.outcomes?.find(
                        (o: any) => o.name === "Draw"
                      )?.price || 0,
                      away: h2hMarket.outcomes?.find(
                        (o: any) => o.name === match.away_team
                      )?.price || 0,
                    }
                  : {
                      home: 0,
                      draw: 0,
                      away: 0,
                    },
              };

              return (
                <motion.div
                  key={match.match_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <MatchCard
                    match={matchData}
                    onAddToBetSlip={onAddToBetSlip}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
