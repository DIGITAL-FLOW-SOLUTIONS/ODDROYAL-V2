import { useState, memo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Clock, Star, Plus } from "lucide-react";

interface Team {
  id: string;
  name: string;
  logo?: string;
  score?: number;
}

interface Odds {
  home: number;
  draw?: number;
  away: number;
}

interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoffTime: string;
  status: "upcoming" | "live" | "finished";
  odds: Odds;
  league: string;
  minute?: number;
  isFavorite?: boolean;
}

interface MatchCardProps {
  match: Match;
  onAddToBetSlip?: (selection: any) => void;
}

const MatchCard = memo(function MatchCard({ match, onAddToBetSlip }: MatchCardProps) {
  const [isFavorite, setIsFavorite] = useState(match.isFavorite || false);
  const [, setLocation] = useLocation();

  const handleAddToBetSlip = (type: "home" | "draw" | "away", odds: number, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation when clicking odds buttons
    
    const selection = {
      id: `${match.id}-${type}`,
      matchId: match.id,
      type,
      odds,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      league: match.league,
    };
    
    onAddToBetSlip?.(selection);
    console.log("Added to bet slip:", selection);
  };

  const toggleFavorite = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation when clicking favorite button
    setIsFavorite(!isFavorite);
    console.log("Toggled favorite for match:", match.id);
  };

  const handleCardClick = () => {
    setLocation(`/match/${match.id}`);
  };

  const formatTime = (timeString: string) => {
    // Extract literal time without timezone conversion using regex
    // Handles ISO 8601, RFC3339, and various timestamp formats with 1-2 digit hours
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
    
    if (!timeMatch) {
      return timeString; // Fallback: show original string if parsing fails
    }
    
    const [, hours, minutes] = timeMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className="hover-elevate cursor-pointer bg-surface-5 border-0" 
        data-testid={`card-match-${match.id}`}
        onClick={handleCardClick}
      >
        <CardHeader className="pb-2 bg-surface-4 rounded-t-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge 
                className={`text-xs border-0 ${
                  match.status === "live" 
                    ? "bg-live-surface-1 text-red-100" 
                    : "bg-surface-6 text-foreground"
                }`}
                data-testid={`status-${match.id}`}
              >
                {match.status === "live" ? `${match.minute}'` : formatTime(match.kickoffTime)}
              </Badge>
              <span className="text-xs text-muted-foreground">{match.league}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFavorite}
              data-testid={`button-favorite-${match.id}`}
              className="h-6 w-6 bg-surface-6 border-0 rounded-md hidden md:flex"
            >
              <Star 
                className={`h-3 w-3 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} 
              />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Teams */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium" data-testid={`text-home-team-${match.id}`}>
                  {match.homeTeam.name}
                </span>
                {match.status === "live" && match.homeTeam.score !== undefined && (
                  <Badge className="text-xs bg-surface-6 text-foreground border-0">
                    {match.homeTeam.score}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium" data-testid={`text-away-team-${match.id}`}>
                  {match.awayTeam.name}
                </span>
                {match.status === "live" && match.awayTeam.score !== undefined && (
                  <Badge className="text-xs bg-surface-6 text-foreground border-0">
                    {match.awayTeam.score}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Odds */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              onClick={(e) => handleAddToBetSlip("home", match.odds.home, e)}
              data-testid={`button-odds-home-${match.id}`}
              className="flex flex-col gap-1 h-auto py-2 bg-surface-6 text-foreground border-0"
            >
              <span className="text-xs text-muted-foreground">1</span>
              <span className="font-semibold">{match.odds.home.toFixed(2)}</span>
            </Button>
            
            {match.odds.draw && (
              <Button
                size="sm"
                onClick={(e) => handleAddToBetSlip("draw", match.odds.draw!, e)}
                data-testid={`button-odds-draw-${match.id}`}
                className="flex flex-col gap-1 h-auto py-2 bg-surface-6 text-foreground border-0"
              >
                <span className="text-xs text-muted-foreground">X</span>
                <span className="font-semibold">{match.odds.draw.toFixed(2)}</span>
              </Button>
            )}
            
            <Button
              size="sm"
              onClick={(e) => handleAddToBetSlip("away", match.odds.away, e)}
              data-testid={`button-odds-away-${match.id}`}
              className="flex flex-col gap-1 h-auto py-2 bg-surface-6 text-foreground border-0"
            >
              <span className="text-xs text-muted-foreground">2</span>
              <span className="font-semibold">{match.odds.away.toFixed(2)}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

export default MatchCard;