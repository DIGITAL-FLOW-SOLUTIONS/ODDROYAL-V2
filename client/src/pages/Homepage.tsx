import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MatchCard from "@/components/MatchCard";
import BannerSlider from "@/components/BannerSlider";
import { 
  Trophy, 
  TrendingUp, 
  Calendar, 
  Gift,
  Star,
  Clock,
  ArrowRight,
  Zap
} from "lucide-react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { useMatchStore } from "@/store/matchStore";

interface HomepageProps {
  onAddToBetSlip?: (selection: any) => void;
}

export default function Homepage({ onAddToBetSlip }: HomepageProps) {
  const { setPageLoading } = usePageLoading();
  
  // Subscribe to global Zustand store - WebSocket provides all data
  const liveMatches = useMatchStore(state => state.getLiveMatches());
  const isConnected = useMatchStore(state => state.isConnected);
  
  // Calculate live match count from store
  const liveMatchCount = liveMatches.length;

  // Featured matches from live data
  const featuredMatches: any[] = useMemo(() => {
    return liveMatches.slice(0, 6).map((match: any) => ({
      id: match.match_id,
      homeTeam: { name: match.home_team, logo: match.home_team_logo },
      awayTeam: { name: match.away_team, logo: match.away_team_logo },
      kickoffTime: match.commence_time,
      league: match.league_name,
      odds: {
        home: 0,
        draw: 0,
        away: 0
      }
    }));
  }, [liveMatches]);

  const topLeagues = [
    { id: "1", name: "Premier League", country: "England", matches: 89, logo: "⚽" },
    { id: "2", name: "La Liga", country: "Spain", matches: 76, logo: "🇪🇸" },
    { id: "3", name: "Bundesliga", country: "Germany", matches: 54, logo: "🇩🇪" },
    { id: "4", name: "Serie A", country: "Italy", matches: 67, logo: "🇮🇹" },
    { id: "5", name: "Ligue 1", country: "France", matches: 43, logo: "🇫🇷" },
  ];

  const promotions = [
    {
      id: "1",
      title: "Welcome Bonus",
      description: "Get 100% match bonus up to $200 on your first deposit",
      type: "New Player",
      color: "bg-destructive"
    },
    {
      id: "2", 
      title: "Accumulator Boost",
      description: "Get up to 50% extra winnings on 5+ selection accumulators",
      type: "Weekly",
      color: "bg-chart-4"
    },
    {
      id: "3",
      title: "Live Betting Cashback",
      description: "Get 10% cashback on live betting losses every weekend",
      type: "Weekend",
      color: "bg-accent"
    }
  ];

  return (
    <div className="flex-1">
      {/* Banner Slider Section */}
      <BannerSlider />

      <div className="p-4 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Featured Matches */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-destructive" />
                    Featured Matches
                  </CardTitle>
                  <Button variant="ghost" size="sm" data-testid="link-view-all-matches" className="hover-elevate">
                    View All
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {featuredMatches.map((match: any, index: number) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <MatchCard match={match} onAddToBetSlip={onAddToBetSlip} />
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Top Leagues */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-chart-4" />
                  Top Football Leagues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {topLeagues.map((league, index) => (
                    <motion.div
                      key={league.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-card border border-card-border rounded-md p-4 hover-elevate cursor-pointer"
                      data-testid={`card-league-${league.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{league.logo}</span>
                          <div>
                            <h4 className="font-semibold text-sm">{league.name}</h4>
                            <p className="text-xs text-muted-foreground">{league.country}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {league.matches}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sidebar Content */}
        <div className="space-y-4">
          {/* Live Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-destructive" />
                  Live Now
                  <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm">Active Matches</span>
                  <Badge variant="destructive" className="text-xs">
                    {liveMatchCount}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm">Total Bets Today</span>
                  <span className="text-sm font-semibold">2,456</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm">Biggest Win</span>
                  <span className="text-sm font-semibold text-chart-4">$12,340</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Promotions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4 text-chart-4" />
                  Promotions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {promotions.map((promo, index) => (
                    <motion.div
                      key={promo.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative overflow-hidden rounded-md border border-border p-3 hover-elevate cursor-pointer"
                      data-testid={`card-promotion-${promo.id}`}
                    >
                      <div className={`absolute top-0 right-0 px-2 py-1 text-xs text-white rounded-bl-md ${promo.color}`}>
                        {promo.type}
                      </div>
                      <h5 className="font-semibold text-sm mb-1">{promo.title}</h5>
                      <p className="text-xs text-muted-foreground">{promo.description}</p>
                    </motion.div>
                  ))}
                </div>
                <Button size="sm" className="w-full mt-3 hover-elevate" data-testid="button-view-all-promotions">
                  View All Promotions
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Winners */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-chart-4" />
                  Recent Winners
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>John D.</span>
                    <span className="text-chart-4 font-semibold">$1,250</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sarah M.</span>
                    <span className="text-chart-4 font-semibold">$890</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mike R.</span>
                    <span className="text-chart-4 font-semibold">$2,100</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Emma L.</span>
                    <span className="text-chart-4 font-semibold">$675</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        </div>
      </div>
    </div>
  );
}