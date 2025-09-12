import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Filter, 
  Calendar,
  Clock,
  MapPin,
  TrendingUp,
  Star
} from "lucide-react";

interface LineProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Line({ onAddToBetSlip }: LineProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeague, setSelectedLeague] = useState("all");
  const [selectedMarket, setSelectedMarket] = useState("1x2");

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

  // Mock competitions for filtering (would be replaced with real leagues API)
  const competitions = [
    { id: "premier", name: "Premier League", matches: 89, country: "England" },
    { id: "laliga", name: "La Liga", matches: 76, country: "Spain" },
    { id: "bundesliga", name: "Bundesliga", matches: 54, country: "Germany" },
    { id: "seriea", name: "Serie A", matches: 67, country: "Italy" },
    { id: "ligue1", name: "Ligue 1", matches: 43, country: "France" },
  ];

  const upcomingMatches = upcomingMatchesData?.data || [];

  const handleOddsClick = (matchId: string, market: string, type: string, odds: number, homeTeam: string, awayTeam: string) => {
    const selection = {
      id: `${matchId}-${market}-${type}`,
      matchId,
      market,
      type,
      odds,
      homeTeam,
      awayTeam,
      league: upcomingMatches.find(m => m.id === matchId)?.league || "Unknown"
    };
    onAddToBetSlip(selection);
    console.log("Added to bet slip:", selection);
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const filteredMatches = upcomingMatches.filter(match => {
    const searchMatch = searchQuery === "" || 
      match.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.awayTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.league.toLowerCase().includes(searchQuery.toLowerCase());
    
    const leagueMatch = selectedLeague === "all" || match.league.toLowerCase().includes(selectedLeague);
    
    return searchMatch && leagueMatch;
  });

  return (
    <div className="flex-1 p-4 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Pre-Match Betting</h1>
            <p className="text-sm text-muted-foreground">
              Upcoming fixtures and betting markets
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search matches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-line"
                className="pl-10 w-full sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedLeague === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedLeague("all")}
            data-testid="filter-all-leagues"
            className="hover-elevate"
          >
            All Leagues
          </Button>
          {competitions.slice(0, 4).map(comp => (
            <Button
              key={comp.id}
              variant={selectedLeague === comp.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedLeague(comp.id)}
              data-testid={`filter-${comp.id}`}
              className="hover-elevate"
            >
              {comp.name}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Market Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs value={selectedMarket} onValueChange={setSelectedMarket} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="1x2" data-testid="tab-1x2">1X2</TabsTrigger>
            <TabsTrigger value="ou" data-testid="tab-over-under">O/U 2.5</TabsTrigger>
            <TabsTrigger value="btts" data-testid="tab-btts">BTTS</TabsTrigger>
            <TabsTrigger value="handicap" data-testid="tab-handicap">Handicap</TabsTrigger>
            <TabsTrigger value="correctscore" data-testid="tab-correct-score">Correct Score</TabsTrigger>
          </TabsList>

          {/* Matches with odds */}
          <TabsContent value={selectedMarket} className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {selectedMarket === "1x2" ? "Match Result" : 
                     selectedMarket === "ou" ? "Over/Under 2.5 Goals" :
                     selectedMarket === "btts" ? "Both Teams to Score" :
                     selectedMarket === "handicap" ? "Asian Handicap" : "Correct Score"}
                  </CardTitle>
                  <Badge variant="outline" data-testid="text-match-count">
                    {filteredMatches.length} matches
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredMatches.map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-card border border-card-border rounded-lg p-4"
                      data-testid={`card-line-match-${match.id}`}
                    >
                      {/* Match header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatTime(match.kickoffTime || match.kickoff)}
                            </span>
                            <Badge variant="outline" className="text-xs">{match.league}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{match.venue}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover-elevate" data-testid={`button-favorite-${match.id}`}>
                          <Star className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Teams and Odds */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm" data-testid={`text-home-team-${match.id}`}>
                            {match.homeTeam?.name || match.homeTeam}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm" data-testid={`text-away-team-${match.id}`}>
                            {match.awayTeam?.name || match.awayTeam}
                          </span>
                        </div>
                      </div>

                      {/* Odds buttons based on selected market */}
                      <div className="mt-4 pt-4 border-t border-border">
                        {selectedMarket === "1x2" && (
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "1x2", "home", match.markets["1x2"].home, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-home-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">1</span>
                              <span className="font-semibold">{match.markets["1x2"].home.toFixed(2)}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "1x2", "draw", match.markets["1x2"].draw, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-draw-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">X</span>
                              <span className="font-semibold">{match.markets["1x2"].draw.toFixed(2)}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "1x2", "away", match.markets["1x2"].away, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-away-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">2</span>
                              <span className="font-semibold">{match.markets["1x2"].away.toFixed(2)}</span>
                            </Button>
                          </div>
                        )}

                        {selectedMarket === "ou" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "ou", "over", match.markets.ou.over25, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-over-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">Over 2.5</span>
                              <span className="font-semibold">{match.markets.ou.over25.toFixed(2)}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "ou", "under", match.markets.ou.under25, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-under-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">Under 2.5</span>
                              <span className="font-semibold">{match.markets.ou.under25.toFixed(2)}</span>
                            </Button>
                          </div>
                        )}

                        {selectedMarket === "btts" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "btts", "yes", match.markets.btts.yes, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-btts-yes-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">Yes</span>
                              <span className="font-semibold">{match.markets.btts.yes.toFixed(2)}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "btts", "no", match.markets.btts.no, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-btts-no-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">No</span>
                              <span className="font-semibold">{match.markets.btts.no.toFixed(2)}</span>
                            </Button>
                          </div>
                        )}

                        {selectedMarket === "handicap" && (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "handicap", "home", match.markets.handicap.home, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-handicap-home-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">{match.homeTeam} -1</span>
                              <span className="font-semibold">{match.markets.handicap.home.toFixed(2)}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOddsClick(match.id, "handicap", "away", match.markets.handicap.away, match.homeTeam, match.awayTeam)}
                              data-testid={`button-odds-handicap-away-${match.id}`}
                              className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                            >
                              <span className="text-xs text-muted-foreground">{match.awayTeam} +1</span>
                              <span className="font-semibold">{match.markets.handicap.away.toFixed(2)}</span>
                            </Button>
                          </div>
                        )}

                        {selectedMarket === "correctscore" && (
                          <div className="grid grid-cols-3 gap-2">
                            {Object.entries(match.markets.correctscore).map(([score, odds]) => (
                              <Button
                                key={score}
                                variant="outline"
                                size="sm"
                                onClick={() => handleOddsClick(match.id, "correctscore", score, odds as number, match.homeTeam, match.awayTeam)}
                                data-testid={`button-odds-score-${score}-${match.id}`}
                                className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                              >
                                <span className="text-xs text-muted-foreground">{score}</span>
                                <span className="font-semibold">{(odds as number).toFixed(2)}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}