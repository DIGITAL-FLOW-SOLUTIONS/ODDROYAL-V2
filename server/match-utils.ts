import crypto from 'crypto';

// Sport category mapping - determines how API sport groups map to our internal categories
export const SPORT_CATEGORY_MAP: Record<string, { ourKey: string; title: string; priority: number }> = {
  'Soccer': { ourKey: 'football', title: 'Football', priority: 1 },
  'Basketball': { ourKey: 'basketball', title: 'Basketball', priority: 2 },
  'American Football': { ourKey: 'americanfootball', title: 'American Football', priority: 3 },
  'Baseball': { ourKey: 'baseball', title: 'Baseball', priority: 4 },
  'Ice Hockey': { ourKey: 'icehockey', title: 'Ice Hockey', priority: 5 },
  'Cricket': { ourKey: 'cricket', title: 'Cricket', priority: 6 },
  'Mixed Martial Arts': { ourKey: 'mma', title: 'MMA', priority: 7 },
};

// League priority order within Football category
export const FOOTBALL_LEAGUE_PRIORITY: Record<string, number> = {
  'soccer_epl': 1,
  'soccer_spain_la_liga': 2,
  'soccer_uefa_champs_league': 3,
  'soccer_germany_bundesliga': 4,
  'soccer_italy_serie_a': 5,
  'soccer_france_ligue_one': 6,
  'soccer_uefa_europa_league': 7,
  'soccer_efl_champ': 8,
  'soccer_england_league1': 9,
  'soccer_england_league2': 10,
  'soccer_germany_bundesliga2': 11,
  'soccer_germany_liga3': 12,
  'soccer_italy_serieb': 13,
  'soccer_spain_segunda_division': 14,
  'soccer_greece_super_league': 15,
  'soccer_brazil_campeonato': 16,
  'soccer_brazil_serie_b': 17,
  'soccer_argentina_primera_division': 18,
  'soccer_mexico_ligamx': 19,
  'soccer_usa_mls': 20,
  'soccer_japan_j_league': 21,
};

// Interface for API sport response
export interface ApiSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

// Interface for grouped sport
export interface GroupedSport {
  ourKey: string;
  title: string;
  priority: number;
  leagues: ApiSport[];
}

// Group sports by category and filter for supported sports
export function groupSportsByCategory(apiSports: ApiSport[]): GroupedSport[] {
  const grouped = new Map<string, GroupedSport>();

  // Initialize supported categories
  Object.entries(SPORT_CATEGORY_MAP).forEach(([apiGroup, config]) => {
    grouped.set(config.ourKey, {
      ourKey: config.ourKey,
      title: config.title,
      priority: config.priority,
      leagues: [],
    });
  });

  // Group API sports by category
  apiSports.forEach(sport => {
    const categoryConfig = SPORT_CATEGORY_MAP[sport.group];
    if (categoryConfig) {
      const group = grouped.get(categoryConfig.ourKey);
      if (group) {
        group.leagues.push(sport);
      }
    }
  });

  // Filter out categories with no leagues and sort
  const result = Array.from(grouped.values())
    .filter(group => group.leagues.length > 0)
    .sort((a, b) => a.priority - b.priority);

  // Sort football leagues by priority
  result.forEach(group => {
    if (group.ourKey === 'football') {
      group.leagues.sort((a, b) => {
        const priorityA = FOOTBALL_LEAGUE_PRIORITY[a.key] || 999;
        const priorityB = FOOTBALL_LEAGUE_PRIORITY[b.key] || 999;
        return priorityA - priorityB;
      });
    }
  });

  return result;
}

// Get all sport keys for a category
export function getSportKeysForCategory(groupedSports: GroupedSport[], categoryKey: string): string[] {
  const category = groupedSports.find(g => g.ourKey === categoryKey);
  return category ? category.leagues.map(l => l.key) : [];
}

// League limits for API efficiency (Professional betting site strategy)
export const LEAGUE_LIMITS = {
  football: 35,  // Max 35 football leagues (7 top priority + 28 others)
  default: 10,   // Max 10 leagues for other sports
};

// Apply league limits to grouped sports
export function applyLeagueLimits(groupedSports: GroupedSport[]): GroupedSport[] {
  return groupedSports.map(group => {
    const limit = group.ourKey === 'football' ? LEAGUE_LIMITS.football : LEAGUE_LIMITS.default;
    
    // Leagues are already sorted by priority in groupSportsByCategory
    // Just take the top N leagues
    const limitedLeagues = group.leagues.slice(0, limit);
    
    return {
      ...group,
      leagues: limitedLeagues,
    };
  });
}

// Generate deterministic match ID
export function generateMatchId(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
  commenceTime: string
): string {
  const key = `${sportKey}::${homeTeam.trim().toLowerCase()}::${awayTeam.trim().toLowerCase()}::${commenceTime}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

// Normalize team name for logo lookups
export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Extract league ID from The Odds API event data
export function extractLeagueId(event: any): string {
  // The Odds API doesn't always provide league_id, so we use sport_title + region
  return event.league_id || 
         `${event.sport_key}_${event.sport_title?.replace(/\s+/g, '_').toLowerCase() || 'unknown'}`;
}

// Extract league name from event
export function extractLeagueName(event: any): string {
  return event.sport_title || event.league_name || 'Unknown League';
}

// Convert The Odds API event to our match format
export interface NormalizedMatch {
  match_id: string;
  sport_key: string;
  league_id: string;
  league_name: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_team_logo?: string;
  away_team_logo?: string;
  bookmakers: any[];
  markets: string[];
  status: 'upcoming' | 'live' | 'completed';
  scores?: {
    home: number;
    away: number;
  };
}

export function normalizeOddsEvent(event: any, sportKey: string, isLiveRequest: boolean = false): NormalizedMatch {
  const leagueId = extractLeagueId(event);
  const leagueName = extractLeagueName(event);
  const matchId = generateMatchId(
    sportKey,
    event.home_team,
    event.away_team,
    event.commence_time
  );

  // Extract available markets
  const markets = event.bookmakers?.[0]?.markets?.map((m: any) => m.key) || [];

  // Determine status: if this is from a live API request, trust it's live
  // Otherwise, use the old logic with scores as indicator
  const status = event.completed 
    ? 'completed' 
    : (isLiveRequest || event.scores) 
      ? 'live' 
      : 'upcoming';

  return {
    match_id: matchId,
    sport_key: sportKey,
    league_id: leagueId,
    league_name: leagueName,
    home_team: event.home_team,
    away_team: event.away_team,
    commence_time: event.commence_time,
    bookmakers: event.bookmakers || [],
    markets,
    status,
    scores: event.scores ? {
      home: event.scores.find((s: any) => s.name === event.home_team)?.score || 0,
      away: event.scores.find((s: any) => s.name === event.away_team)?.score || 0,
    } : undefined,
  };
}

// Group matches by league
export interface LeagueGroup {
  league_id: string;
  league_name: string;
  matches: NormalizedMatch[];
  match_count: number;
}

export function groupMatchesByLeague(matches: NormalizedMatch[]): LeagueGroup[] {
  const leagueMap = new Map<string, NormalizedMatch[]>();

  matches.forEach(match => {
    const existing = leagueMap.get(match.league_id) || [];
    existing.push(match);
    leagueMap.set(match.league_id, existing);
  });

  return Array.from(leagueMap.entries()).map(([leagueId, matches]) => ({
    league_id: leagueId,
    league_name: matches[0].league_name,
    matches,
    match_count: matches.length,
  }));
}

// Normalize markets for UI consumption
export interface NormalizedMarket {
  market_key: string;
  label: string;
  selections: Array<{
    name: string;
    price: number;
    point?: number;
  }>;
  last_update?: string;
}

export function normalizeMarkets(bookmakers: any[]): NormalizedMarket[] {
  if (!bookmakers || bookmakers.length === 0) return [];

  // Use the first bookmaker with the most markets
  const bestBookmaker = bookmakers.reduce((best, current) => {
    const bestMarkets = best.markets?.length || 0;
    const currentMarkets = current.markets?.length || 0;
    return currentMarkets > bestMarkets ? current : best;
  }, bookmakers[0]);

  const marketLabels: Record<string, string> = {
    h2h: 'Match Winner',
    spreads: 'Handicap',
    totals: 'Over/Under',
    outrights: 'Outrights',
    h2h_lay: 'Match Winner (Lay)',
    btts: 'Both Teams to Score',
  };

  return (bestBookmaker.markets || []).map((market: any) => {
    const selections = market.outcomes?.map((outcome: any) => ({
      name: outcome.name,
      price: outcome.price,
      point: outcome.point,
    })) || [];

    return {
      market_key: market.key,
      label: marketLabels[market.key] || market.key.replace(/_/g, ' ').toUpperCase(),
      selections,
      last_update: bestBookmaker.last_update,
    };
  });
}

// Calculate best odds across bookmakers
export function getBestOdds(bookmakers: any[], marketKey: string): any {
  const allOdds: any[] = [];

  bookmakers.forEach(bookmaker => {
    const market = bookmaker.markets?.find((m: any) => m.key === marketKey);
    if (market?.outcomes) {
      market.outcomes.forEach((outcome: any) => {
        allOdds.push({
          ...outcome,
          bookmaker: bookmaker.title,
        });
      });
    }
  });

  // Group by outcome name and find best price
  const bestOddsByOutcome = new Map<string, any>();
  
  allOdds.forEach(odd => {
    const existing = bestOddsByOutcome.get(odd.name);
    if (!existing || odd.price > existing.price) {
      bestOddsByOutcome.set(odd.name, odd);
    }
  });

  return Array.from(bestOddsByOutcome.values());
}

// Sport icon mapping
export function getSportIcon(sportKey: string): string {
  const icons: Record<string, string> = {
    football: '⚽',
    basketball: '🏀',
    americanfootball: '🏈',
    baseball: '⚾',
    icehockey: '🏒',
    cricket: '🏏',
    mma: '🥊',
  };

  return icons[sportKey] || '🏆';
}

// Check if match is starting soon (within 1 hour)
export function isMatchStartingSoon(commenceTime: string): boolean {
  const matchTime = new Date(commenceTime).getTime();
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  return matchTime - now <= oneHour && matchTime > now;
}

// Get refresh interval based on match status and sport
export function getRefreshInterval(
  status: 'upcoming' | 'live' | 'completed',
  sportKey: string,
  isStartingSoon: boolean = false
): number {
  if (status === 'completed') return 0; // No need to refresh
  
  if (status === 'live') {
    // Live match refresh intervals (in seconds)
    const liveIntervals: Record<string, number> = {
      football: 15,
      basketball: 30,
      americanfootball: 30,
      baseball: 45,
      icehockey: 30,
      cricket: 60,
      mma: 30,
    };
    return liveIntervals[sportKey] || 30;
  }

  // Upcoming matches
  if (isStartingSoon) {
    return 60; // 1 minute for matches starting soon
  }

  const upcomingIntervals: Record<string, number> = {
    football: 300, // 5 minutes
    basketball: 600,
    americanfootball: 900,
    baseball: 900,
    icehockey: 600,
    cricket: 1200,
    mma: 900,
  };

  return upcomingIntervals[sportKey] || 600;
}
