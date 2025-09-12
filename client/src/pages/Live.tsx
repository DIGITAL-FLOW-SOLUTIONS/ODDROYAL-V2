import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Zap,
  Clock,
  TrendingUp,
  Play,
  Users,
  Target,
  Timer
} from "lucide-react";

interface LiveProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Live({ onAddToBetSlip }: LiveProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for live matches
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live matches from SportMonks API
  const { data: liveMatchesData, isLoading: liveLoading } = useQuery({
    queryKey: ['/api/fixtures/live'],
    queryFn: async () => {
      const response = await fetch('/api/fixtures/live');
      if (!response.ok) throw new Error('Failed to fetch live matches');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for live data
  });

  const liveMatches = liveMatchesData?.data || [];

  const handleLiveOddsClick = (matchId: string, market: string, type: string, odds: number, homeTeam: string, awayTeam: string) => {
    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      market,
      type,
      odds,
      homeTeam,
      awayTeam,
      league: liveMatches.find(m => m.id === matchId)?.league || "Unknown",
      isLive: true
    };
    onAddToBetSlip(selection);
    console.log("Added live selection to bet slip:", selection);
  };

  const filteredMatches = liveMatches.filter(match => 
    searchQuery === "" || 
    match.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    match.league.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 p-4 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-destructive animate-pulse" />
              <h1 className="text-2xl font-display font-bold">Live Betting</h1>
              <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search live matches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-live"
                className="pl-10 w-64"
              />
            </div>
          </div>
        </div>

        {/* Live stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{liveMatches.length}</div>
              <div className="text-xs text-muted-foreground">Live Matches</div>
            </CardContent>
          </Card>
          <Card className="bg-chart-4/10 border-chart-4/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-chart-4">156</div>
              <div className="text-xs text-muted-foreground">Live Markets</div>
            </CardContent>
          </Card>
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-accent-foreground">89%</div>
              <div className="text-xs text-muted-foreground">Uptime Today</div>
            </CardContent>
          </Card>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">1,234</div>
              <div className="text-xs text-muted-foreground">Active Bettors</div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Live matches */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-destructive" />
            Live Matches
          </h2>
          <Badge variant="destructive" data-testid="text-live-count">
            {filteredMatches.length} Live
          </Badge>
        </div>

        <div className="space-y-4">
          {filteredMatches.map((match, index) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-destructive/20 bg-gradient-to-r from-card to-destructive/5">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="destructive" className="animate-pulse" data-testid={`status-${match.id}`}>
                        LIVE {match.minute}' {match.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{match.league}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{match.venue}</div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Score display */}
                  <div className="flex items-center justify-center py-4 bg-card border border-card-border rounded-lg">
                    <div className="text-center flex-1">
                      <div className="font-semibold text-lg" data-testid={`text-home-team-${match.id}`}>
                        {match.homeTeam}
                      </div>
                      <div className="text-3xl font-bold text-destructive mt-2" data-testid={`text-home-score-${match.id}`}>
                        {match.homeScore}
                      </div>
                    </div>
                    <div className="px-4">
                      <div className="text-2xl font-bold text-muted-foreground">-</div>
                    </div>
                    <div className="text-center flex-1">
                      <div className="font-semibold text-lg" data-testid={`text-away-team-${match.id}`}>
                        {match.awayTeam}
                      </div>
                      <div className="text-3xl font-bold text-destructive mt-2" data-testid={`text-away-score-${match.id}`}>
                        {match.awayScore}
                      </div>
                    </div>
                  </div>

                  {/* Live stats */}
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Users className="h-3 w-3" />
                        Possession
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{match.possession.home}%</span>
                        <span>{match.possession.away}%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Target className="h-3 w-3" />
                        Shots
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{match.shots.home}</span>
                        <span>{match.shots.away}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <TrendingUp className="h-3 w-3" />
                        Corners
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{match.corners.home}</span>
                        <span>{match.corners.away}</span>
                      </div>
                    </div>
                  </div>

                  {/* Live odds */}
                  <div className="space-y-3">
                    {/* Match Result */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        Match Result (Live)
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "1x2", "home", match.odds["1x2"].home, match.homeTeam, match.awayTeam)}
                          data-testid={`button-live-odds-home-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate bg-destructive/5"
                        >
                          <span className="text-xs text-muted-foreground">1</span>
                          <span className="font-semibold text-destructive">{match.odds["1x2"].home.toFixed(2)}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "1x2", "draw", match.odds["1x2"].draw, match.homeTeam, match.awayTeam)}
                          data-testid={`button-live-odds-draw-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate bg-destructive/5"
                        >
                          <span className="text-xs text-muted-foreground">X</span>
                          <span className="font-semibold text-destructive">{match.odds["1x2"].draw.toFixed(2)}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "1x2", "away", match.odds["1x2"].away, match.homeTeam, match.awayTeam)}
                          data-testid={`button-live-odds-away-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate bg-destructive/5"
                        >
                          <span className="text-xs text-muted-foreground">2</span>
                          <span className="font-semibold text-destructive">{match.odds["1x2"].away.toFixed(2)}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Next Goal */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">Next Goal</div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "nextgoal", "home", match.odds.nextgoal.home, match.homeTeam, match.awayTeam)}
                          data-testid={`button-next-goal-home-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                        >
                          <span className="text-xs text-muted-foreground">{match.homeTeam}</span>
                          <span className="font-semibold">{match.odds.nextgoal.home.toFixed(2)}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "nextgoal", "away", match.odds.nextgoal.away, match.homeTeam, match.awayTeam)}
                          data-testid={`button-next-goal-away-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                        >
                          <span className="text-xs text-muted-foreground">{match.awayTeam}</span>
                          <span className="font-semibold">{match.odds.nextgoal.away.toFixed(2)}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLiveOddsClick(match.id, "nextgoal", "none", match.odds.nextgoal.none, match.homeTeam, match.awayTeam)}
                          data-testid={`button-next-goal-none-${match.id}`}
                          className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                        >
                          <span className="text-xs text-muted-foreground">No Goal</span>
                          <span className="font-semibold">{match.odds.nextgoal.none.toFixed(2)}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}