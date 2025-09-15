import axios from 'axios';

const API_BASE_URL = 'https://api.sportmonks.com/v3';
let warnedAboutMissingToken = false;

function getApiToken(): string | undefined {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token && !warnedAboutMissingToken) {
    console.warn('SportMonks API token not found. Using mock data.');
    warnedAboutMissingToken = true;
  }
  return token;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface SportMonksFixture {
  id: number;
  name: string;
  starting_at: string;
  result_info: string | null;
  leg: string;
  details: string | null;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  participants: Array<{
    id: number;
    sport_id: number;
    country_id: number;
    venue_id: number;
    gender: string;
    name: string;
    short_code: string;
    image_path: string;
    founded: number;
    type: string;
    placeholder: boolean;
    last_played_at: string;
    meta: {
      location: string;
      winner: boolean;
      position: number;
    };
  }>;
  state: {
    id: number;
    state: string;
    name: string;
    short_name: string;
    developer_name: string;
  };
  league: {
    id: number;
    sport_id: number;
    country_id: number;
    name: string;
    active: boolean;
    short_code: string;
    image_path: string;
    type: string;
    sub_type: string;
    last_played_at: string;
  };
  scores: Array<{
    id: number;
    fixture_id: number;
    type_id: number;
    participant_id: number;
    score: {
      goals: number;
      participant: string;
    };
    description: string;
  }>;
}

export interface SportMonksOdds {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  handicap: string | null;
  total: string | null;
  winning: boolean;
  stopped: boolean;
  last_update: {
    date: string;
    timezone_type: number;
    timezone: string;
  };
  market: {
    id: number;
    name: string;
    developer_name: string;
    has_winning_calculations: boolean;
  };
}

// Get upcoming fixtures
export async function getUpcomingFixtures(limit: number = 20): Promise<SportMonksFixture[]> {
  const token = getApiToken();
  if (!token) {
    return getMockUpcomingFixtures();
  }

  try {
    const response = await api.get('/football/fixtures', {
      params: {
        'api_token': token,
        'include': 'participants;league;state;scores',
        'per_page': limit,
        'filters': 'fixtureStates:1', // Upcoming matches (state 1)
      },
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching upcoming fixtures:', error);
    return getMockUpcomingFixtures();
  }
}

// Get live fixtures by sport
export async function getLiveFixtures(sportId?: number): Promise<SportMonksFixture[]> {
  const token = getApiToken();
  if (!token) {
    return getMockLiveFixtures(sportId);
  }

  try {
    const sportEndpoint = getSportEndpoint(sportId);
    const response = await api.get(`/${sportEndpoint}/fixtures`, {
      params: {
        'api_token': token,
        'include': 'participants;league;state;scores',
        'per_page': 50,
        'filters': 'fixtureStates:2', // Live matches (state 2)
      },
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching live fixtures:', error);
    return getMockLiveFixtures(sportId);
  }
}

// Get live Football fixtures only (no mock data fallback)
export async function getLiveFootballFixtures(): Promise<SportMonksFixture[]> {
  const token = getApiToken();
  if (!token) {
    console.warn('SportMonks API token not found. No live football data available.');
    return [];
  }

  try {
    const response = await api.get('/football/fixtures', {
      params: {
        'api_token': token,
        'include': 'participants;league;state;scores',
        'per_page': 50,
        'filters': 'fixtureStates:2', // Live matches (state 2)
      },
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching live football fixtures:', error);
    // Return empty array instead of mock data to ensure only real data is shown
    return [];
  }
}

// Get sports list
export async function getSports(): Promise<any[]> {
  return [
    { id: 1, name: 'Football', icon: 'Football', endpoint: 'football' },
    { id: 3, name: 'Hockey', icon: 'Hockey', endpoint: 'ice-hockey' },
    { id: 5, name: 'Tennis', icon: 'Tennis', endpoint: 'tennis' },
    { id: 2, name: 'Basketball', icon: 'Basketball', endpoint: 'basketball' },
    { id: 4, name: 'Baseball', icon: 'Baseball', endpoint: 'baseball' },
    { id: 6, name: 'Volleyball', icon: 'Volleyball', endpoint: 'volleyball' },
    { id: 7, name: 'Rugby', icon: 'Rugby', endpoint: 'rugby' },
  ];
}

function getSportEndpoint(sportId?: number): string {
  const sportMap: { [key: number]: string } = {
    1: 'football',
    2: 'basketball', 
    3: 'ice-hockey',
    4: 'baseball',
    5: 'tennis',
    6: 'volleyball',
    7: 'rugby'
  };
  return sportMap[sportId || 1] || 'football';
}

// Get odds for a fixture  
export async function getFixtureOdds(fixtureId: number): Promise<SportMonksOdds[]> {
  const token = getApiToken();
  if (!token) {
    return [];
  }

  try {
    const response = await api.get(`/football/odds`, {
      params: {
        'api_token': token,
        'include': 'market',
        'filters': `fixtures:${fixtureId};markets:1,2,3`, // 1x2, Over/Under, Both Teams to Score for specific fixture
      },
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching fixture odds:', error);
    return [];
  }
}

// Get leagues
export async function getLeagues(): Promise<any[]> {
  const token = getApiToken();
  if (!token) {
    return getMockLeagues();
  }

  try {
    const response = await api.get('/football/leagues', {
      params: {
        'api_token': token,
        'per_page': 20,
      },
    });
    
    return response.data.data || [];
  } catch (error) {
    console.error('Error fetching leagues:', error);
    return getMockLeagues();
  }
}

// Mock data fallbacks
function getMockUpcomingFixtures(): SportMonksFixture[] {
  return [
    {
      id: 1,
      name: "Manchester United vs Liverpool",
      starting_at: "2024-01-16T15:00:00Z",
      result_info: null,
      leg: "1/1",
      details: null,
      length: 90,
      placeholder: false,
      has_odds: true,
      participants: [
        {
          id: 1,
          sport_id: 1,
          country_id: 17,
          venue_id: 1,
          gender: "male",
          name: "Manchester United",
          short_code: "MUN",
          image_path: "",
          founded: 1878,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-10T20:00:00Z",
          meta: { location: "home", winner: false, position: 1 }
        },
        {
          id: 2,
          sport_id: 1,
          country_id: 17,
          venue_id: 1,
          gender: "male",
          name: "Liverpool",
          short_code: "LIV",
          image_path: "",
          founded: 1892,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-10T17:30:00Z",
          meta: { location: "away", winner: false, position: 2 }
        }
      ],
      state: {
        id: 1,
        state: "NS",
        name: "Not Started",
        short_name: "NS",
        developer_name: "NOT_STARTED"
      },
      league: {
        id: 8,
        sport_id: 1,
        country_id: 17,
        name: "Premier League",
        active: true,
        short_code: "EPL",
        image_path: "",
        type: "league",
        sub_type: "domestic",
        last_played_at: "2024-01-10T20:00:00Z"
      },
      scores: []
    }
  ];
}

function getMockLiveFixtures(sportId?: number): SportMonksFixture[] {
  return [
    {
      id: 2,
      name: "Real Madrid vs Barcelona",
      starting_at: "2024-01-15T20:00:00Z",
      result_info: "2-1",
      leg: "1/1",
      details: null,
      length: 90,
      placeholder: false,
      has_odds: true,
      participants: [
        {
          id: 3,
          sport_id: 1,
          country_id: 15,
          venue_id: 2,
          gender: "male",
          name: "Real Madrid",
          short_code: "RMA",
          image_path: "",
          founded: 1902,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-15T20:00:00Z",
          meta: { location: "home", winner: false, position: 1 }
        },
        {
          id: 4,
          sport_id: 1,
          country_id: 15,
          venue_id: 2,
          gender: "male",
          name: "Barcelona",
          short_code: "BAR",
          image_path: "",
          founded: 1899,
          type: "domestic",
          placeholder: false,
          last_played_at: "2024-01-15T20:00:00Z",
          meta: { location: "away", winner: false, position: 2 }
        }
      ],
      state: {
        id: 2,
        state: "LIVE",
        name: "Live",
        short_name: "LIVE",
        developer_name: "INPLAY_1ST_HALF"
      },
      league: {
        id: 564,
        sport_id: 1,
        country_id: 15,
        name: "La Liga",
        active: true,
        short_code: "LL",
        image_path: "",
        type: "league",
        sub_type: "domestic",
        last_played_at: "2024-01-15T20:00:00Z"
      },
      scores: [
        {
          id: 1,
          fixture_id: 2,
          type_id: 1525,
          participant_id: 3,
          score: { goals: 2, participant: "Real Madrid" },
          description: "current"
        },
        {
          id: 2,
          fixture_id: 2,
          type_id: 1525,
          participant_id: 4,
          score: { goals: 1, participant: "Barcelona" },
          description: "current"
        }
      ]
    }
  ];
}

function getMockLeagues(): any[] {
  return [
    { id: 8, name: "Premier League", country: { name: "England" }, active: true },
    { id: 564, name: "La Liga", country: { name: "Spain" }, active: true },
    { id: 82, name: "Bundesliga", country: { name: "Germany" }, active: true },
    { id: 384, name: "Serie A", country: { name: "Italy" }, active: true },
    { id: 301, name: "Ligue 1", country: { name: "France" }, active: true },
  ];
}

// Get fixture result for settlement - returns result data with status
export async function getFixtureResult(fixtureId: number): Promise<{
  finished: boolean;
  homeScore: number;
  awayScore: number;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  status: 'finished' | 'cancelled' | 'postponed' | 'ongoing';
} | null> {
  const token = getApiToken();
  if (!token) {
    // For mock data, return null (no finished matches)
    return null;
  }

  try {
    const response = await api.get(`/football/fixtures/${fixtureId}`, {
      params: {
        'api_token': token,
        'include': 'participants;scores;state',
      },
    });

    const fixture = response.data.data;
    if (!fixture) {
      return null;
    }

    // Get match state
    const state = fixture.state?.name || fixture.state?.developer_name;
    
    // Check different match states
    const isFinished = state === 'FT' || state === 'AET' || state === 'PEN' || state === 'FINISHED';
    const isCancelled = state === 'CANCELLED' || state === 'ABANDONED';
    const isPostponed = state === 'POSTPONED' || state === 'DELAYED';
    
    let matchStatus: 'finished' | 'cancelled' | 'postponed' | 'ongoing';
    if (isFinished) {
      matchStatus = 'finished';
    } else if (isCancelled) {
      matchStatus = 'cancelled';
    } else if (isPostponed) {
      matchStatus = 'postponed';
    } else {
      matchStatus = 'ongoing';
    }
    
    // Get team names
    const homeTeam = fixture.participants?.find((p: any) => p.meta?.location === 'home')?.name || 'Home';
    const awayTeam = fixture.participants?.find((p: any) => p.meta?.location === 'away')?.name || 'Away';
    
    // If not finished/cancelled/postponed, return ongoing status
    if (!isFinished && !isCancelled && !isPostponed) {
      return {
        finished: false,
        homeScore: 0,
        awayScore: 0,
        homeTeam,
        awayTeam,
        matchDate: fixture.starting_at,
        status: matchStatus
      };
    }

    // Extract scores for finished matches
    let homeScore = 0;
    let awayScore = 0;
    
    if (isFinished) {
      const scores = fixture.scores || [];
      
      // Handle both 'CURRENT' (real API) and 'current' (mock data) formats
      // Also handle participant name vs location-based matching
      homeScore = scores.find((s: any) => {
        const desc = s.description?.toLowerCase();
        const participant = s.score?.participant?.toLowerCase();
        const isCurrentScore = desc === 'current';
        const isHomeScore = participant === 'home' || participant === homeTeam.toLowerCase();
        return isCurrentScore && isHomeScore;
      })?.score?.goals || 0;
      
      awayScore = scores.find((s: any) => {
        const desc = s.description?.toLowerCase();
        const participant = s.score?.participant?.toLowerCase();
        const isCurrentScore = desc === 'current';
        const isAwayScore = participant === 'away' || participant === awayTeam.toLowerCase();
        return isCurrentScore && isAwayScore;
      })?.score?.goals || 0;
    }

    return {
      finished: isFinished || isCancelled || isPostponed,
      homeScore,
      awayScore,
      homeTeam,
      awayTeam,
      matchDate: fixture.starting_at,
      status: matchStatus
    };
    
  } catch (error) {
    console.error(`Error fetching fixture result for ${fixtureId}:`, error);
    return null;
  }
}