import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BannerSlider from "@/components/BannerSlider";
import { ChevronRight, ChevronLeft, Trophy, Circle, Target, Zap, Shield, Disc3, Activity, Clock } from "lucide-react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { LazyImage } from "@/components/LazyImage";
import { useQuery } from "@tanstack/react-query";
import bundesligaLogo from "@assets/Bundesliga - Germany_1760801782151.webp";
import ligue1Logo from "@assets/Ligue 1 - France_1760801782152.webp";
import serieALogo from "@assets/Serie A - Italy_1760801782153.webp";
import eplLogo from "@assets/EPL_1760801782154.webp";
import laLigaLogo from "@assets/La Liga - Spain_1760801782155.webp";
import uclLogo from "@assets/UEFA Champions League_1760801782156.webp";
import stacksOGoldImg from "@assets/Stacks o' Gold game_1760811025217.webp";
import tigerReignImg from "@assets/Tiger Reign game_1760811025218.webp";
import pharaosRichesImg from "@assets/Pharaos Riches game_1760811025218.webp";
import bookOfPharaoImg from "@assets/Book of Pharao Game_1760811025219.webp";
import pharaosFireImg from "@assets/Pharaos Fire Game_1760811025220.webp";
import wildApeImg from "@assets/Wild Ape game_1760811025220.webp";
import luckyLeprechaunImg from "@assets/Lucky Leprechaun game_1760811025221.webp";
import pekingLuckImg from "@assets/Peking Luck game_1760811025222.webp";
import wildWaterImg from "@assets/Wild Woter game_1760811025222.webp";
import jumanjiImg from "@assets/Jumanji Game_1760811025223.webp";
import grandSpinnImg from "@assets/Grand spinn superpot game_1760811025223.webp";
import fortuneRangersImg from "@assets/Fortune rangers game_1760811025224.webp";

export default function Homepage() {
  const { setPageLoading } = usePageLoading();
  const hasInitialData = useRef(false);
  const leaguesScrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!hasInitialData.current) {
      hasInitialData.current = true;
      setPageLoading(false);
    }
  }, [setPageLoading]);

  const scrollLeagues = (direction: 'left' | 'right') => {
    if (leaguesScrollRef.current) {
      const scrollAmount = 350;
      const newScrollLeft = direction === 'left' 
        ? leaguesScrollRef.current.scrollLeft - scrollAmount
        : leaguesScrollRef.current.scrollLeft + scrollAmount;
      
      leaguesScrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  const topLeagues = [
    { 
      id: "soccer_uefa_champs_league_uefa_champions_league",
      name: "UEFA Champions League", 
      sport: "football",
      logo: uclLogo
    },
    { 
      id: "soccer_spain_la_liga_la_liga_-_spain",
      name: "La Liga - Spain", 
      sport: "football",
      logo: laLigaLogo
    },
    { 
      id: "soccer_epl_epl",
      name: "Premier League", 
      sport: "football",
      logo: eplLogo
    },
    { 
      id: "soccer_germany_bundesliga_bundesliga_-_germany",
      name: "Bundesliga - Germany", 
      sport: "football",
      logo: bundesligaLogo
    },
    { 
      id: "soccer_italy_serie_a_serie_a_-_italy",
      name: "Serie A - Italy", 
      sport: "football",
      logo: serieALogo
    },
    { 
      id: "soccer_france_ligue_one_ligue_1_-_france",
      name: "Ligue 1 - France", 
      sport: "football",
      logo: ligue1Logo
    },
  ];

  const [selectedSport, setSelectedSport] = useState<string>("all");

  const sportItems = [
    { id: "football", name: "Football", icon: Trophy },
    { id: "basketball", name: "Basketball", icon: Circle },
    { id: "tennis", name: "Tennis", icon: Target },
    { id: "icehockey", name: "Ice Hockey", icon: Zap },
    { id: "baseball", name: "Baseball", icon: Shield },
    { id: "rugby", name: "Rugby", icon: Disc3 },
    { id: "volleyball", name: "Volleyball", icon: Activity },
  ];

  // Fetch sports menu data
  const { data: menuData } = useQuery({
    queryKey: ['/api/menu', 'live'],
    queryFn: async () => {
      const response = await fetch('/api/menu/live');
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      return result.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 15000,
  });

  // Fetch matches for selected sport
  const { data: matchesData, isLoading: isLoadingMatches } = useQuery({
    queryKey: ['/api/matches', selectedSport],
    queryFn: async () => {
      if (selectedSport === "all") return null;
      const sport = menuData?.sports?.find((s: any) => s.sport_key === selectedSport);
      if (!sport || !sport.leagues || sport.leagues.length === 0) return null;
      
      // Fetch matches from the first league
      const firstLeague = sport.leagues[0];
      const response = await fetch(`/api/line/${selectedSport}/${firstLeague.league_id}?mode=live`);
      if (!response.ok) return null;
      const result = await response.json();
      return result.data;
    },
    enabled: selectedSport !== "all" && !!menuData,
    staleTime: 30 * 1000,
  });

  const casinoItems = [
    { id: "thunderkick", name: "Thunderkick", icon: "⚡" },
    { id: "netgame", name: "NetGame", icon: "🎮" },
    { id: "kacaming", name: "KACaming", icon: "🎰" },
    { id: "no-limit-city", name: "No Limit City", icon: "🎲" },
    { id: "red-tiger", name: "Red Tiger", icon: "🐯" },
  ];

  const hotGames = [
    { id: "1", name: "Stacks o' Gold", image: stacksOGoldImg },
    { id: "2", name: "Tiger Reign", image: tigerReignImg },
    { id: "3", name: "Pharaos Riches", image: pharaosRichesImg },
    { id: "4", name: "Book of Pharao", image: bookOfPharaoImg },
    { id: "5", name: "Pharaos Fire", image: pharaosFireImg },
    { id: "6", name: "Wild Ape", image: wildApeImg },
    { id: "7", name: "Lucky Leprechaun", image: luckyLeprechaunImg },
    { id: "8", name: "Peking Luck", image: pekingLuckImg },
    { id: "9", name: "Wild Water", image: wildWaterImg },
    { id: "10", name: "Jumanji", image: jumanjiImg },
    { id: "11", name: "Grand Spinn Superpot", image: grandSpinnImg },
    { id: "12", name: "Fortune Rangers", image: fortuneRangersImg },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <div className="flex-1">
        <BannerSlider />

        <div className="p-2 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6 max-w-screen-2xl mx-auto">
          {/* Top Leagues Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-2 sm:space-y-3 bg-[#295640] p-2 sm:p-3 md:p-4 rounded-md"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold" data-testid="heading-top-leagues">Top leagues</h2>
              <div className="flex gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 sm:h-8 sm:w-8" 
                  onClick={() => scrollLeagues('left')}
                  data-testid="button-scroll-leagues-left"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 sm:h-8 sm:w-8" 
                  onClick={() => scrollLeagues('right')}
                  data-testid="button-scroll-leagues-right"
                >
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
            
            <div className="relative overflow-hidden">
              <div 
                ref={leaguesScrollRef}
                className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide pb-2" 
                style={{ scrollbarWidth: 'none' }}
              >
                {topLeagues.map((league, index) => (
                  <motion.div
                    key={league.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 * index }}
                    data-testid={`card-league-${league.id}`}
                  >
                    <Link href={`/league/${league.sport}/${league.id}`}>
                      <Card className="min-w-[120px] w-[120px] h-[120px] sm:min-w-[140px] sm:w-[140px] sm:h-[140px] md:min-w-[160px] md:w-[160px] md:h-[160px] hover-elevate active-elevate-2 cursor-pointer overflow-hidden group">
                        <CardContent className="p-2 sm:p-3 flex flex-col items-center justify-center text-center gap-1 sm:gap-2 bg-[#48a83e] h-full">
                          <div className="w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px] flex items-center justify-center relative overflow-hidden">
                            <LazyImage 
                              src={league.logo}
                              alt={league.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] sm:text-xs font-medium leading-tight line-clamp-2">{league.name}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* Sport Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2 sm:space-y-3 bg-[#295640] p-2 sm:p-3 md:p-4 rounded-md"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-semibold" data-testid="heading-sport">Sport</h2>
              <Badge className="text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 bg-[#e23636] text-[#fcfcfc] hover:bg-[#e23636]">Live Sport</Badge>
            </div>

            <Tabs value={selectedSport} onValueChange={setSelectedSport} className="w-full">
              <TabsList className="w-full justify-start gap-1 sm:gap-2 bg-sidebar h-auto p-1.5 sm:p-2 flex-wrap" data-testid="tabs-sport">
                <TabsTrigger 
                  value="all" 
                  className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-background"
                  data-testid="tab-sport-all"
                >
                  All Sports
                </TabsTrigger>
                {sportItems.map((sport) => {
                  const SportIcon = sport.icon;
                  const sportData = menuData?.sports?.find((s: any) => s.sport_key === sport.id);
                  const matchCount = sportData?.total_events || 0;
                  
                  return (
                    <TabsTrigger 
                      key={sport.id} 
                      value={sport.id}
                      className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-background"
                      data-testid={`tab-sport-${sport.id}`}
                    >
                      <SportIcon className="h-3 w-3 mr-1" />
                      <span className="hidden xs:inline sm:inline">{sport.name}</span>
                      {matchCount > 0 && (
                        <Badge className="ml-1 h-4 px-1 text-[8px] bg-[#e23636] text-[#fcfcfc] hover:bg-[#e23636]">
                          {matchCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="all" className="mt-3 sm:mt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {sportItems.map((sport) => {
                        const SportIcon = sport.icon;
                        const sportData = menuData?.sports?.find((s: any) => s.sport_key === sport.id);
                        const matchCount = sportData?.total_events || 0;
                        const leagueCount = sportData?.leagues?.length || 0;

                        return (
                          <Card 
                            key={sport.id} 
                            className="hover-elevate active-elevate-2 cursor-pointer"
                            onClick={() => setSelectedSport(sport.id)}
                            data-testid={`sport-card-${sport.id}`}
                          >
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <SportIcon className="h-5 w-5 text-primary" />
                                  <div>
                                    <p className="text-xs sm:text-sm font-semibold">{sport.name}</p>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                                      {leagueCount} {leagueCount === 1 ? 'league' : 'leagues'}
                                    </p>
                                  </div>
                                </div>
                                {matchCount > 0 && (
                                  <Badge className="bg-[#e23636] text-[#fcfcfc] hover:bg-[#e23636]">
                                    {matchCount} live
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {sportItems.map((sport) => {
                const SportIcon = sport.icon;
                const sportData = menuData?.sports?.find((s: any) => s.sport_key === sport.id);
                const leagues = sportData?.leagues || [];
                const matches = matchesData?.events || [];

                return (
                  <TabsContent key={sport.id} value={sport.id} className="mt-3 sm:mt-4">
                    {isLoadingMatches ? (
                      <Card>
                        <CardContent className="p-4 sm:p-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Clock className="h-4 w-4 animate-spin" />
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Loading {sport.name.toLowerCase()} matches...
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : matches.length > 0 ? (
                      <div className="space-y-2">
                        {matches.slice(0, 5).map((match: any, idx: number) => (
                          <Link key={idx} href={`/match/${sport.id}/${match.event_id}`}>
                            <Card className="hover-elevate active-elevate-2 cursor-pointer" data-testid={`match-card-${match.event_id}`}>
                              <CardContent className="p-3 sm:p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge className="text-[8px] sm:text-[10px] px-1.5 py-0.5 bg-[#e23636] text-[#fcfcfc] hover:bg-[#e23636]">
                                        LIVE
                                      </Badge>
                                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                        {match.league_name}
                                      </p>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs sm:text-sm font-medium truncate">{match.home_team}</p>
                                        {match.scores && (
                                          <span className="text-xs font-bold text-primary">{match.scores.home}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs sm:text-sm font-medium truncate">{match.away_team}</p>
                                        {match.scores && (
                                          <span className="text-xs font-bold text-primary">{match.scores.away}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                        {matches.length > 5 && (
                          <Link href={`/league/${sport.id}`}>
                            <Button variant="outline" className="w-full" data-testid="button-view-all-matches">
                              View all {matches.length} matches
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    ) : leagues.length > 0 ? (
                      <Card>
                        <CardContent className="p-4 sm:p-6">
                          <div className="text-center mb-4">
                            <SportIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
                              No live {sport.name.toLowerCase()} matches at the moment
                            </p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold mb-2">Available Leagues:</p>
                            <div className="grid grid-cols-1 gap-2">
                              {leagues.slice(0, 5).map((league: any, idx: number) => (
                                <Link key={idx} href={`/league/${sport.id}/${league.league_id}`}>
                                  <Card className="hover-elevate active-elevate-2 cursor-pointer" data-testid={`league-card-${league.league_id}`}>
                                    <CardContent className="p-2 sm:p-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] sm:text-xs truncate">{league.league_name}</p>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      </div>
                                    </CardContent>
                                  </Card>
                                </Link>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="p-4 sm:p-6 text-center">
                          <SportIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            No {sport.name.toLowerCase()} data available at the moment
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </motion.section>

          {/* Casino Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2 sm:space-y-3 bg-[#295640] p-2 sm:p-3 md:p-4 rounded-md"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-semibold" data-testid="heading-casino">Casino</h2>
              <Badge className="text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 bg-[#e23636] text-[#fcfcfc] hover:bg-[#e23636]">LIVE Casino</Badge>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start gap-1 sm:gap-2 bg-sidebar h-auto p-1.5 sm:p-2 flex-wrap" data-testid="tabs-casino">
                <TabsTrigger 
                  value="all" 
                  className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-background"
                  data-testid="tab-casino-all"
                >
                  All Games
                </TabsTrigger>
                {casinoItems.map((casino) => (
                  <TabsTrigger 
                    key={casino.id} 
                    value={casino.id}
                    className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-background"
                    data-testid={`tab-casino-${casino.id}`}
                  >
                    <span className="mr-1">{casino.icon}</span>
                    <span className="hidden xs:inline sm:inline">{casino.name}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-3 sm:mt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6 text-center">
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Select a provider to view available casino games
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {casinoItems.map((casino) => (
                <TabsContent key={casino.id} value={casino.id} className="mt-3 sm:mt-4">
                  <Card>
                    <CardContent className="p-4 sm:p-6 text-center">
                      <div className="text-3xl sm:text-4xl mb-2">{casino.icon}</div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {casino.name} games coming soon
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </motion.section>

          {/* Royal Hots Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-2 sm:space-y-3 bg-[#295640] p-2 sm:p-3 md:p-4 rounded-md"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold" data-testid="heading-royal-hots">Royal Hots</h2>
              <Button variant="ghost" size="sm" className="text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 hover-elevate" data-testid="button-view-all-hots">
                All
                <ChevronRight className="h-3 w-3 ml-0.5 sm:ml-1" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
              {hotGames.map((game, index) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.02 * index }}
                  data-testid={`card-game-${game.id}`}
                >
                  <Card className="overflow-hidden hover-elevate active-elevate-2 cursor-pointer group">
                    <CardContent className="p-0">
                      <div className="relative aspect-[4/3] bg-gradient-to-br from-purple-600 to-blue-600 overflow-hidden">
                        <LazyImage 
                          src={game.image}
                          alt={game.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      </div>
                      <div className="p-1.5 sm:p-2 bg-card">
                        <p className="text-[10px] sm:text-xs font-medium text-center line-clamp-1">{game.name}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
