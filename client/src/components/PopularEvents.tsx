import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Clock, Star } from "lucide-react";

interface Team {
  name: string;
  logo?: string;
}

interface PopularMatch {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoffTime: string;
  league: string;
  venue?: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
  additionalMarkets: number;
}

interface PopularEventsProps {
  matches: PopularMatch[];
  isLoading?: boolean;
  onOddsClick?: (matchId: string, market: string, type: string, odds: number) => void;
  onAddToFavorites?: (matchId: string) => void;
}

export default function PopularEvents({ 
  matches, 
  isLoading = false,
  onOddsClick, 
  onAddToFavorites 
}: PopularEventsProps) {
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
      scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
      setTimeout(checkScrollPosition, 100);
    }
  };

  // Initialize carousel arrow state on mount
  useEffect(() => {
    checkScrollPosition();
  }, [matches]);

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const handleOddsClick = (match: PopularMatch, type: string) => {
    if (onOddsClick) {
      const odds = type === 'home' ? match.odds.home : type === 'draw' ? match.odds.draw : match.odds.away;
      onOddsClick(match.id, '1x2', type, odds);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      // Loading skeleton
      return Array.from({ length: 3 }).map((_, index) => (
        <div key={`skeleton-${index}`} className="flex-shrink-0">
          <Card className="w-80 bg-card border border-card-border">
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded mb-3"></div>
                <div className="h-6 bg-muted rounded mb-2"></div>
                <div className="h-4 bg-muted rounded mb-4"></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-12 bg-muted rounded"></div>
                  <div className="h-12 bg-muted rounded"></div>
                  <div className="h-12 bg-muted rounded"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ));
    }

    if (!matches?.length) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No popular events available at the moment.</p>
        </div>
      );
    }

    return matches.map((match, index) => (
      <motion.div
        key={match.id}
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.1 }}
        className="flex-shrink-0"
      >
        <Card className="w-80 bg-card border border-card-border hover-elevate cursor-pointer">
          <CardContent className="p-4">
            {/* Match header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {formatTime(match.kickoffTime)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover-elevate"
                onClick={() => onAddToFavorites?.(match.id)}
                data-testid={`button-favorite-${match.id}`}
              >
                <Star className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-3">
              {/* League */}
              <Badge variant="outline" className="text-xs">
                {match.league}
              </Badge>

              {/* Teams */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  {match.homeTeam.logo && (
                    <img 
                      src={match.homeTeam.logo} 
                      alt={match.homeTeam.name}
                      className="w-6 h-6 rounded"
                    />
                  )}
                  <span className="font-medium text-sm flex-1" data-testid={`text-home-team-${match.id}`}>
                    {match.homeTeam.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {match.awayTeam.logo && (
                    <img 
                      src={match.awayTeam.logo} 
                      alt={match.awayTeam.name}
                      className="w-6 h-6 rounded"
                    />
                  )}
                  <span className="font-medium text-sm flex-1" data-testid={`text-away-team-${match.id}`}>
                    {match.awayTeam.name}
                  </span>
                </div>
              </div>

              {/* Odds */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOddsClick(match, 'home')}
                  className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                  data-testid={`button-odds-home-${match.id}`}
                >
                  <span className="text-xs text-muted-foreground">1</span>
                  <span className="font-semibold">{match.odds.home.toFixed(2)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOddsClick(match, 'draw')}
                  className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                  data-testid={`button-odds-draw-${match.id}`}
                >
                  <span className="text-xs text-muted-foreground">X</span>
                  <span className="font-semibold">{match.odds.draw.toFixed(2)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOddsClick(match, 'away')}
                  className="flex flex-col gap-1 h-auto py-2 hover-elevate"
                  data-testid={`button-odds-away-${match.id}`}
                >
                  <span className="text-xs text-muted-foreground">2</span>
                  <span className="font-semibold">{match.odds.away.toFixed(2)}</span>
                </Button>
              </div>

              {/* Additional markets footer */}
              <div className="flex items-center justify-center pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  +{match.additionalMarkets} more markets
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold flex items-center gap-2">
          <Star className="h-5 w-5 text-destructive" />
          Popular Events
        </h2>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            className="h-8 w-8 hover-elevate"
            data-testid="button-scroll-left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={scrollRight}
            disabled={!canScrollRight}
            className="h-8 w-8 hover-elevate"
            data-testid="button-scroll-right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 max-w-full"
        onScroll={checkScrollPosition}
        data-testid="popular-events-carousel"
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {renderContent()}
      </div>
    </div>
  );
}