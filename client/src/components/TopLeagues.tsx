import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMode } from "@/contexts/ModeContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Trophy, Crown } from "lucide-react";

export default function TopLeagues() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [location] = useLocation();
  const { mode } = useMode();

  // Fetch menu data to get football leagues
  const { data: menuData } = useQuery({
    queryKey: ['/api/menu', mode],
    queryFn: async () => {
      const response = await fetch(`/api/menu?mode=${mode}`);
      if (!response.ok) throw new Error('Failed to fetch menu');
      const result = await response.json();
      return result.data;
    },
    staleTime: mode === 'live' ? 60 * 1000 : 5 * 60 * 1000,
    refetchInterval: mode === 'live' ? 15000 : 30000,
    placeholderData: (previousData: any) => previousData,
  });

  const sports = menuData?.sports || [];
  const footballSport = sports.find((s: any) => s.sport_key === 'football');
  const footballLeagues = footballSport?.leagues?.slice(0, 8) || [];

  const checkScrollPosition = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-chart-4" />
          Top Leagues
        </h2>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            className="h-8 w-8 hover-elevate"
            data-testid="button-leagues-scroll-left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={scrollRight}
            disabled={!canScrollRight}
            className="h-8 w-8 hover-elevate"
            data-testid="button-leagues-scroll-right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 max-w-full"
        onScroll={checkScrollPosition}
        data-testid="top-leagues-carousel"
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {footballLeagues.map((league: any, index: number) => {
          const isActive = location.includes(`/league/football/${league.league_id}`);
          
          return (
            <motion.div
              key={league.league_id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex-shrink-0"
            >
              <Button
                asChild
                variant={isActive ? "default" : "outline"}
                className={`flex flex-col items-center gap-2 h-auto p-4 w-24 hover-elevate ${isActive ? "odds-button" : ""}`}
                style={isActive ? {} : { backgroundColor: 'hsl(var(--surface-3))', borderColor: 'hsl(var(--surface-4))' }}
                data-testid={`button-league-${league.league_id}`}
              >
                <Link href={`/league/football/${league.league_id}`}>
                  <Crown className="h-6 w-6" />
                  <div className="text-center">
                    <div className="text-xs font-medium truncate w-full">{league.league_name}</div>
                    {league.match_count > 0 && (
                      <div className="text-xs text-primary font-semibold">{league.match_count}</div>
                    )}
                  </div>
                </Link>
              </Button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
