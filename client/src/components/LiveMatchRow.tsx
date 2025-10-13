/**
 * Compact horizontal match row for live betting
 * Mimics the design from production betting sites like playwin.top
 * 
 * Layout: [Minute] [Team 1 (Score)] vs [Team 2 (Score)] | [1] [X] [2]
 */

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, Star } from 'lucide-react';
import { useState, memo } from 'react';
import { useLocation } from 'wouter';
import { type CachedMatch } from '@/lib/liveMatchesCache';

interface LiveMatchRowProps {
  match: CachedMatch;
  onOddsClick?: (matchId: string, market: string, type: string, odds: number) => void;
  selectedOdds?: Set<string>; // Set of selected odds IDs (matchId-market-type)
}

export const LiveMatchRow = memo(function LiveMatchRow({ match, onOddsClick, selectedOdds }: LiveMatchRowProps) {
  
  const [isFavorite, setIsFavorite] = useState(false);
  const [, setLocation] = useLocation();

  // Calculate match minute based on elapsed time from commence_time
  const getMatchMinute = () => {
    if (match.status !== 'live') return '0';
    
    const startTime = new Date(match.commence_time).getTime();
    const now = Date.now();
    const elapsedMs = now - startTime;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    
    // Cap at reasonable values per sport
    const maxMinutes: Record<string, number> = {
      football: 90,
      basketball: 48,
      americanfootball: 60,
      baseball: 180, // 9 innings * 20 min average
      icehockey: 60,
      cricket: 300, // T20/ODI can be long
      mma: 25, // 5 rounds * 5 min
    };
    
    const max = maxMinutes[match.sport_key] || 90;
    const result = Math.min(Math.max(0, elapsedMin), max).toString();
    
    // Debug logging for first match only
    if (match.match_id.includes('poland')) {
      console.log(`⏱️ Match ${match.home_team} vs ${match.away_team}: ${result}' (elapsed: ${elapsedMin}, status: ${match.status})`);
    }
    
    return result;
  };

  const minute = getMatchMinute();

  // Extract odds
  const h2hMarket = match.bookmakers?.[0]?.markets?.find((m: any) => m.key === 'h2h');
  const homeOdds = h2hMarket?.outcomes?.find((o: any) => o.name === match.home_team)?.price || 0;
  const drawOdds = h2hMarket?.outcomes?.find((o: any) => o.name === 'Draw')?.price || 0;
  const awayOdds = h2hMarket?.outcomes?.find((o: any) => o.name === match.away_team)?.price || 0;

  // Get odds deltas
  const getOddsDelta = (teamName: string) => {
    if (!match.odds_deltas) return 'unchanged';
    return match.odds_deltas[teamName] || 'unchanged';
  };

  const homeDelta = getOddsDelta(match.home_team);
  const drawDelta = getOddsDelta('Draw');
  const awayDelta = getOddsDelta(match.away_team);

  // Check if market is locked
  const isMarketLocked = match.market_status === 'suspended' || match.market_status === 'closed';

  const handleOddsClick = (type: 'home' | 'draw' | 'away', odds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🎯 OddsCell clicked:', { type, odds, isLocked: isMarketLocked, matchId: match.match_id });
    
    if (isMarketLocked || odds === 0) {
      console.log('❌ Click blocked - market locked or invalid odds');
      return;
    }
    
    if (!onOddsClick) {
      console.log('❌ No onOddsClick handler provided');
      return;
    }
    
    console.log('✅ Calling onOddsClick handler');
    onOddsClick?.(match.match_id, '1x2', type, odds);
  };

  const handleRowClick = () => {
    setLocation(`/match/${match.match_id}`);
  };

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFavorite(!isFavorite);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <div
        className="flex items-center gap-2 p-2 hover-elevate rounded-md cursor-pointer bg-surface-5 border-0"
        onClick={handleRowClick}
        data-testid={`live-match-row-${match.match_id}`}
      >
        {/* Live Minute Badge */}
        <div className="flex-shrink-0 w-12 flex items-center justify-center">
          <Badge
            className="bg-live-surface-1 text-red-100 text-xs font-bold border-0"
            data-testid={`minute-${match.match_id}`}
          >
            {minute}'
          </Badge>
        </div>

        {/* Teams and Scores */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-0.5">
            {/* Home Team */}
            <div className="flex items-center gap-2">
              {match.home_team_logo && (
                <img
                  src={match.home_team_logo}
                  alt={match.home_team}
                  className="w-4 h-4 object-contain flex-shrink-0"
                />
              )}
              <span
                className="text-sm font-medium text-foreground truncate"
                data-testid={`home-team-${match.match_id}`}
              >
                {match.home_team}
              </span>
              {match.scores && (
                <Badge
                  className="bg-surface-6 text-foreground text-xs font-bold border-0 ml-auto"
                  data-testid={`home-score-${match.match_id}`}
                >
                  {match.scores.home}
                </Badge>
              )}
            </div>

            {/* Away Team */}
            <div className="flex items-center gap-2">
              {match.away_team_logo && (
                <img
                  src={match.away_team_logo}
                  alt={match.away_team}
                  className="w-4 h-4 object-contain flex-shrink-0"
                />
              )}
              <span
                className="text-sm font-medium text-foreground truncate"
                data-testid={`away-team-${match.match_id}`}
              >
                {match.away_team}
              </span>
              {match.scores && (
                <Badge
                  className="bg-surface-6 text-foreground text-xs font-bold border-0 ml-auto"
                  data-testid={`away-score-${match.match_id}`}
                >
                  {match.scores.away}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Odds Cells */}
        <div className="flex gap-1 flex-shrink-0">
          <OddsCell
            label="1"
            odds={homeOdds}
            delta={homeDelta}
            locked={isMarketLocked}
            selected={selectedOdds?.has(`${match.match_id}-1x2-home`) || false}
            onClick={(e) => handleOddsClick('home', homeOdds, e)}
            testId={`odds-home-${match.match_id}`}
          />
          <OddsCell
            label="X"
            odds={drawOdds}
            delta={drawDelta}
            locked={isMarketLocked}
            selected={selectedOdds?.has(`${match.match_id}-1x2-draw`) || false}
            onClick={(e) => handleOddsClick('draw', drawOdds, e)}
            testId={`odds-draw-${match.match_id}`}
          />
          <OddsCell
            label="2"
            odds={awayOdds}
            delta={awayDelta}
            locked={isMarketLocked}
            selected={selectedOdds?.has(`${match.match_id}-1x2-away`) || false}
            onClick={(e) => handleOddsClick('away', awayOdds, e)}
            testId={`odds-away-${match.match_id}`}
          />
        </div>

        {/* Favorite Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFavorite}
          className="h-8 w-8 flex-shrink-0"
          data-testid={`favorite-${match.match_id}`}
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
        </Button>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if match data actually changed
  return (
    prevProps.match.match_id === nextProps.match.match_id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.scores?.home === nextProps.match.scores?.home &&
    prevProps.match.scores?.away === nextProps.match.scores?.away &&
    prevProps.match.market_status === nextProps.match.market_status &&
    prevProps.match.bookmakers === nextProps.match.bookmakers &&
    prevProps.selectedOdds === nextProps.selectedOdds
  );
});

/**
 * Individual Odds Cell with change indicators
 * Memoized for performance since odds don't change frequently
 */
interface OddsCellProps {
  label: string;
  odds: number;
  delta: 'up' | 'down' | 'unchanged' | 'locked';
  locked: boolean;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  testId: string;
}

const OddsCell = memo(function OddsCell({ label, odds, delta, locked, selected, onClick, testId }: OddsCellProps) {
  const isLocked = locked || odds === 0;

  // Determine border classes based on odds change
  const getBorderClass = () => {
    if (isLocked) return '';
    if (delta === 'up') return 'border-t-2 border-t-green-500';
    if (delta === 'down') return 'border-b-2 border-b-red-500';
    return '';
  };

  const getBackgroundClass = () => {
    if (isLocked) return 'bg-surface-4 text-muted-foreground';
    if (selected) return 'odds-button-selected';
    return 'odds-button';
  };

  return (
    <Button
      size="sm"
      onClick={onClick}
      disabled={isLocked}
      className={`
        flex flex-col gap-0.5 h-auto py-1.5 px-3 min-w-[60px] rounded-md
        ${getBackgroundClass()}
        ${getBorderClass()}
        ${isLocked ? 'cursor-not-allowed opacity-60' : ''}
      `}
      data-testid={testId}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      {isLocked ? (
        <Lock className="h-3 w-3" />
      ) : (
        <span className="text-sm font-bold">{odds.toFixed(2)}</span>
      )}
    </Button>
  );
});
