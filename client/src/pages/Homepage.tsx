import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BannerSlider from "@/components/BannerSlider";
import { ChevronRight } from "lucide-react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { LazyImage } from "@/components/LazyImage";
import bundesligaLogo from "@assets/Bundesliga - Germany_1760801782151.webp";
import ligue1Logo from "@assets/Ligue 1 - France_1760801782152.webp";
import serieALogo from "@assets/Serie A - Italy_1760801782153.webp";
import eplLogo from "@assets/EPL_1760801782154.webp";
import laLigaLogo from "@assets/La Liga - Spain_1760801782155.webp";
import uclLogo from "@assets/UEFA Champions League_1760801782156.webp";

export default function Homepage() {
  const { setPageLoading } = usePageLoading();
  const hasInitialData = useRef(false);
  
  useEffect(() => {
    if (!hasInitialData.current) {
      hasInitialData.current = true;
      setPageLoading(false);
    }
  }, [setPageLoading]);

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

  const sportItems = [
    { id: "skiing", name: "Skiing", icon: "⛷️" },
    { id: "mini-football", name: "Mini football", icon: "⚽" },
    { id: "american-football", name: "American football", icon: "🏈" },
    { id: "billiards", name: "Billiards", icon: "🎱" },
    { id: "snooker", name: "Snooker", icon: "🎯" },
  ];

  const casinoItems = [
    { id: "thunderkick", name: "Thunderkick", icon: "⚡" },
    { id: "netgame", name: "NetGame", icon: "🎮" },
    { id: "kacaming", name: "KACaming", icon: "🎰" },
    { id: "no-limit-city", name: "No Limit City", icon: "🎲" },
    { id: "red-tiger", name: "Red Tiger", icon: "🐯" },
  ];

  const hotGames = [
    { id: "1", name: "Christmas Jackpot", thumbnail: "🎄" },
    { id: "2", name: "Vikings", thumbnail: "⚔️" },
    { id: "3", name: "Chinese Kitchen", thumbnail: "🥢" },
    { id: "4", name: "Bermuda Triangle", thumbnail: "🌊" },
    { id: "5", name: "Sherlock Mystery", thumbnail: "🔍" },
    { id: "6", name: "Sun Cong Long", thumbnail: "🐉" },
    { id: "7", name: "Lie Yan Zuan Shi", thumbnail: "💎" },
    { id: "8", name: "Sai Sa", thumbnail: "🎨" },
    { id: "9", name: "Silent Samurai", thumbnail: "⚔️" },
    { id: "10", name: "Frog Story", thumbnail: "🐸" },
    { id: "11", name: "La Quiniolita", thumbnail: "🎪" },
    { id: "12", name: "Lucky Clover", thumbnail: "🍀" },
    { id: "13", name: "Rocky", thumbnail: "🥊" },
    { id: "14", name: "New Queen", thumbnail: "👑" },
    { id: "15", name: "Ice Fantasy", thumbnail: "❄️" },
    { id: "16", name: "Triple Monkey", thumbnail: "🐵" },
    { id: "17", name: "Captain Treasure", thumbnail: "🏴‍☠️" },
    { id: "18", name: "Wild Water", thumbnail: "🌊" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <div className="flex-1">
        <BannerSlider />

        <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">
          {/* Top Leagues Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3 bg-[#295640] pl-[10px] pr-[10px] pt-[10px] pb-[10px] ml-[0px] mr-[0px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" data-testid="heading-top-leagues">Top leagues</h2>
              <Button variant="ghost" size="sm" className="text-xs hover-elevate" data-testid="button-view-all-leagues">
                All
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            
            <div className="relative overflow-hidden">
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2" style={{ scrollbarWidth: 'none' }}>
                {topLeagues.map((league, index) => (
                  <motion.div
                    key={league.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 * index }}
                    data-testid={`card-league-${league.id}`}
                  >
                    <Link href={`/line/${league.sport}/${league.id}`}>
                      <Card className="min-w-[140px] w-[140px] h-[160px] hover-elevate active-elevate-2 cursor-pointer overflow-hidden">
                        <CardContent className="p-3 flex flex-col items-center justify-center text-center gap-2 bg-[#48a83e] h-full">
                          <div className="w-20 h-20 flex items-center justify-center">
                            <LazyImage 
                              src={league.logo}
                              alt={league.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium leading-tight line-clamp-2">{league.name}</p>
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
            className="space-y-3 bg-[#295640] pl-[10px] pr-[10px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" data-testid="heading-sport">Sport</h2>
              <span className="text-xs font-medium pl-[10px] pr-[10px] bg-[#e23636] text-[#fcfcfc]">Live Sport</span>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start gap-2 bg-sidebar h-auto p-2 flex-wrap" data-testid="tabs-sport">
                <TabsTrigger 
                  value="all" 
                  className="text-xs px-3 py-1.5 data-[state=active]:bg-background"
                  data-testid="tab-sport-all"
                >
                  All Sports
                </TabsTrigger>
                {sportItems.map((sport) => (
                  <TabsTrigger 
                    key={sport.id} 
                    value={sport.id}
                    className="text-xs px-3 py-1.5 data-[state=active]:bg-background"
                    data-testid={`tab-sport-${sport.id}`}
                  >
                    <span className="mr-1.5">{sport.icon}</span>
                    {sport.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Select a sport to view live matches and events
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {sportItems.map((sport) => (
                <TabsContent key={sport.id} value={sport.id} className="mt-4">
                  <Card>
                    <CardContent className="p-6 text-center">
                      <div className="text-4xl mb-2">{sport.icon}</div>
                      <p className="text-sm text-muted-foreground">
                        No live {sport.name.toLowerCase()} matches at the moment
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </motion.section>

          {/* Casino Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3 pl-[10px] pr-[10px] bg-[#295640]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" data-testid="heading-casino">Casino</h2>
              <span className="text-xs font-medium bg-[#e23636] text-[#fcfcfc] pl-[10px] pr-[10px] ml-[0px] mr-[0px]">LIVE Casino</span>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full justify-start gap-2 bg-sidebar h-auto p-2 flex-wrap" data-testid="tabs-casino">
                <TabsTrigger 
                  value="all" 
                  className="text-xs px-3 py-1.5 data-[state=active]:bg-background"
                  data-testid="tab-casino-all"
                >
                  All Games
                </TabsTrigger>
                {casinoItems.map((casino) => (
                  <TabsTrigger 
                    key={casino.id} 
                    value={casino.id}
                    className="text-xs px-3 py-1.5 data-[state=active]:bg-background"
                    data-testid={`tab-casino-${casino.id}`}
                  >
                    <span className="mr-1.5">{casino.icon}</span>
                    {casino.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Select a provider to view available casino games
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {casinoItems.map((casino) => (
                <TabsContent key={casino.id} value={casino.id} className="mt-4">
                  <Card>
                    <CardContent className="p-6 text-center">
                      <div className="text-4xl mb-2">{casino.icon}</div>
                      <p className="text-sm text-muted-foreground">
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
            className="space-y-3 bg-[#295640] pl-[10px] pr-[10px] pt-[10px] pb-[10px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" data-testid="heading-royal-hots">Royal Hots</h2>
              <Button variant="ghost" size="sm" className="text-xs hover-elevate" data-testid="button-view-all-hots">
                All
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {hotGames.map((game, index) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.02 * index }}
                  data-testid={`card-game-${game.id}`}
                >
                  <Card className="overflow-hidden hover-elevate active-elevate-2 cursor-pointer group bg-[#48a83e]">
                    <CardContent className="p-0">
                      <div className="relative aspect-[4/3] bg-[#48a83e] flex items-center justify-center">
                        <span className="text-5xl transform group-hover:scale-110 transition-transform duration-300">
                          {game.thumbnail}
                        </span>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium text-center line-clamp-1">{game.name}</p>
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
