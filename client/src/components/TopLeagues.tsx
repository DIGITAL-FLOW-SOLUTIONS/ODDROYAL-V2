import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Trophy, Crown, Shield, Flag } from "lucide-react";

interface League {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  country: string;
  matchCount?: number;
  isActive?: boolean;
}

interface TopLeaguesProps {
  leagues?: League[];
  selectedLeague?: string;
  onLeagueSelect?: (leagueId: string) => void;
}

const defaultLeagues: League[] = [
  {
    id: "champions-league",
    name: "UEFA Champions League",
    icon: Crown,
    country: "Europe",
    matchCount: 32,
  },
  {
    id: "premier-league",
    name: "Premier League",
    icon: Flag,
    country: "England", 
    matchCount: 89,
  },
  {
    id: "la-liga",
    name: "La Liga",
    icon: Flag,
    country: "Spain",
    matchCount: 76,
  },
  {
    id: "bundesliga",
    name: "Bundesliga", 
    icon: Flag,
    country: "Germany",
    matchCount: 54,
  },
  {
    id: "serie-a",
    name: "Serie A",
    icon: Flag, 
    country: "Italy",
    matchCount: 67,
  },
  {
    id: "ligue-1",
    name: "Ligue 1",
    icon: Flag,
    country: "France", 
    matchCount: 43,
  },
  {
    id: "europa-league",
    name: "UEFA Europa League",
    icon: Shield,
    country: "Europe",
    matchCount: 24,
  },
];

export default function TopLeagues({ 
  leagues = defaultLeagues, 
  selectedLeague = "all",
  onLeagueSelect 
}: TopLeaguesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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

  const handleLeagueClick = (leagueId: string) => {
    onLeagueSelect?.(leagueId);
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
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
        onScroll={checkScrollPosition}
        data-testid="top-leagues-carousel"
      >
        {/* All Leagues option */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-shrink-0"
        >
          <Button
            variant={selectedLeague === "all" ? "default" : "outline"}
            onClick={() => handleLeagueClick("all")}
            className="flex flex-col items-center gap-2 h-auto p-4 w-24 hover-elevate"
            data-testid="button-league-all"
          >
            <Trophy className="h-6 w-6" />
            <div className="text-center">
              <div className="text-xs font-medium">All</div>
              <div className="text-xs text-muted-foreground">Leagues</div>
            </div>
          </Button>
        </motion.div>

        {leagues.map((league, index) => (
          <motion.div
            key={league.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (index + 1) * 0.05 }}
            className="flex-shrink-0"
          >
            <Button
              variant={selectedLeague === league.id ? "default" : "outline"}
              onClick={() => handleLeagueClick(league.id)}
              className="flex flex-col items-center gap-2 h-auto p-4 w-24 hover-elevate"
              data-testid={`button-league-${league.id}`}
            >
              <league.icon className="h-6 w-6" />
              <div className="text-center">
                <div className="text-xs font-medium truncate w-full">{league.name}</div>
                <div className="text-xs text-muted-foreground">{league.country}</div>
                {league.matchCount && (
                  <div className="text-xs text-primary font-semibold">{league.matchCount}</div>
                )}
              </div>
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}