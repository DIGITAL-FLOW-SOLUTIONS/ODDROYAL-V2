import { useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useMatchStore } from "@/store/matchStore";
import { useMode } from "@/contexts/ModeContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Trophy, Crown } from "lucide-react";

export default function TopLeagues() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [location] = useLocation();
  const { mode } = useMode();

  // Get football leagues from Zustand store
  const leagues = useMatchStore(state => state.leagues);
  const sports = useMatchStore(state => state.sports);
  
  const footballLeagues = useMemo(() => {
    const footballLeagues = leagues.get('football') || [];
    return footballLeagues.slice(0, 8);
  }, [leagues]);

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
                className={`flex flex-col items-center gap-3 h-auto p-6 w-52 hover-elevate ${isActive ? "odds-button" : ""}`}
                style={isActive ? {} : { backgroundColor: 'hsl(var(--surface-3))', borderColor: 'hsl(var(--surface-4))' }}
                data-testid={`button-league-${league.league_id}`}
              >
                <Link href={`/league/football/${league.league_id}`} className="flex flex-col items-center gap-3 w-full">
                  <Crown className="h-12 w-12" />
                  <div className="text-center w-full">
                    <div className="text-sm font-semibold mb-1">{league.league_name}</div>
                    <div className="text-xs text-muted-foreground">Football</div>
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
