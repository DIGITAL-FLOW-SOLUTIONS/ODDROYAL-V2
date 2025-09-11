import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import MatchCard from "./MatchCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Filter, 
  Clock, 
  Zap, 
  TrendingUp,
  Calendar,
  Star
} from "lucide-react";

interface MainContentProps {
  onAddToBetSlip: (selection: any) => void;
}

export default function MainContent({ onAddToBetSlip }: MainContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  
  //todo: remove mock functionality
  const mockMatches = [
    {
      id: "1",
      homeTeam: { id: "1", name: "Manchester United", score: 1 },
      awayTeam: { id: "2", name: "Liverpool", score: 0 },
      kickoffTime: "2024-01-15T15:00:00Z",
      status: "live" as const,
      odds: { home: 2.1, draw: 3.2, away: 3.8 },
      league: "Premier League",
      minute: 67,
      isFavorite: true
    },
    {
      id: "2",
      homeTeam: { id: "3", name: "Chelsea" },
      awayTeam: { id: "4", name: "Arsenal" },
      kickoffTime: "2024-01-15T17:30:00Z",
      status: "upcoming" as const,
      odds: { home: 2.5, draw: 3.1, away: 2.9 },
      league: "Premier League",
      isFavorite: false
    },
    {
      id: "3",
      homeTeam: { id: "5", name: "Real Madrid" },
      awayTeam: { id: "6", name: "Barcelona" },
      kickoffTime: "2024-01-15T20:00:00Z",
      status: "upcoming" as const,
      odds: { home: 2.3, draw: 3.4, away: 3.1 },
      league: "La Liga",
      isFavorite: true
    },
    {
      id: "4",
      homeTeam: { id: "7", name: "Bayern Munich" },
      awayTeam: { id: "8", name: "Borussia Dortmund" },
      kickoffTime: "2024-01-15T18:30:00Z",
      status: "upcoming" as const,
      odds: { home: 1.8, draw: 3.6, away: 4.2 },
      league: "Bundesliga",
      isFavorite: false
    },
    {
      id: "5",
      homeTeam: { id: "9", name: "PSG", score: 2 },
      awayTeam: { id: "10", name: "Marseille", score: 1 },
      kickoffTime: "2024-01-15T14:00:00Z",
      status: "live" as const,
      odds: { home: 1.6, draw: 4.1, away: 5.2 },
      league: "Ligue 1",
      minute: 78,
      isFavorite: false
    }
  ];

  const filteredMatches = mockMatches.filter(match => {
    const searchMatch = searchQuery === "" || 
      match.homeTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.awayTeam.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.league.toLowerCase().includes(searchQuery.toLowerCase());
    
    const filterMatch = activeFilter === "all" || 
      (activeFilter === "live" && match.status === "live") ||
      (activeFilter === "upcoming" && match.status === "upcoming") ||
      (activeFilter === "favorites" && match.isFavorite);
    
    return searchMatch && filterMatch;
  });

  const liveMatches = mockMatches.filter(m => m.status === "live");
  const upcomingMatches = mockMatches.filter(m => m.status === "upcoming");

  return (
    <div className="flex-1 p-4 space-y-6">
      {/* Header with search and filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Football Betting</h1>
            <p className="text-sm text-muted-foreground">
              Live odds and upcoming matches
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teams or leagues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-matches"
                className="pl-10 w-full sm:w-64"
              />
            </div>
            <Button variant="outline" size="sm" className="hover-elevate" data-testid="button-filters">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter("all")}
            data-testid="filter-all"
            className="hover-elevate"
          >
            <Calendar className="h-4 w-4 mr-1" />
            All Matches
          </Button>
          <Button
            variant={activeFilter === "live" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter("live")}
            data-testid="filter-live"
            className="hover-elevate"
          >
            <Zap className="h-4 w-4 mr-1" />
            Live ({liveMatches.length})
          </Button>
          <Button
            variant={activeFilter === "upcoming" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter("upcoming")}
            data-testid="filter-upcoming"
            className="hover-elevate"
          >
            <Clock className="h-4 w-4 mr-1" />
            Upcoming ({upcomingMatches.length})
          </Button>
          <Button
            variant={activeFilter === "favorites" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter("favorites")}
            data-testid="filter-favorites"
            className="hover-elevate"
          >
            <Star className="h-4 w-4 mr-1" />
            Favorites
          </Button>
        </div>
      </motion.div>

      {/* Live matches section */}
      {liveMatches.length > 0 && activeFilter !== "upcoming" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <CardTitle className="text-lg">Live Matches</CardTitle>
                <Badge variant="destructive" className="text-xs">
                  {liveMatches.length} Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {liveMatches.map((match, index) => (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <MatchCard
                      match={match}
                      onAddToBetSlip={onAddToBetSlip}
                    />
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Main matches grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {activeFilter === "live" ? "Live Matches" : 
             activeFilter === "upcoming" ? "Upcoming Matches" :
             activeFilter === "favorites" ? "Your Favorites" : "All Matches"}
          </h2>
          <Badge variant="outline" data-testid="text-matches-count">
            {filteredMatches.length} matches
          </Badge>
        </div>

        {filteredMatches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {searchQuery ? "No matches found for your search" : "No matches available"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredMatches.map((match, index) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <MatchCard
                  match={match}
                  onAddToBetSlip={onAddToBetSlip}
                />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}