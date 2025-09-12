import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  getUpcomingFixtures, 
  getLiveFixtures, 
  getFixtureOdds, 
  getLeagues,
  SportMonksFixture 
} from "./sportmonks";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // Get upcoming football fixtures
  app.get("/api/fixtures/upcoming", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const fixtures = await getUpcomingFixtures(limit);
      
      // Transform SportMonks data to our format
      const transformedFixtures = fixtures.map(transformFixture);
      
      res.json({ 
        success: true, 
        data: transformedFixtures,
        count: transformedFixtures.length 
      });
    } catch (error) {
      console.error('Error fetching upcoming fixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch upcoming fixtures' 
      });
    }
  });

  // Get live football fixtures
  app.get("/api/fixtures/live", async (req, res) => {
    try {
      const fixtures = await getLiveFixtures();
      
      // Transform SportMonks data to our format
      const transformedFixtures = fixtures.map(transformLiveFixture);
      
      res.json({ 
        success: true, 
        data: transformedFixtures,
        count: transformedFixtures.length 
      });
    } catch (error) {
      console.error('Error fetching live fixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch live fixtures' 
      });
    }
  });

  // Get odds for a specific fixture
  app.get("/api/fixtures/:id/odds", async (req, res) => {
    try {
      const fixtureId = parseInt(req.params.id);
      if (isNaN(fixtureId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid fixture ID' 
        });
      }

      const odds = await getFixtureOdds(fixtureId);
      
      res.json({ 
        success: true, 
        data: odds 
      });
    } catch (error) {
      console.error('Error fetching fixture odds:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch fixture odds' 
      });
    }
  });

  // Get football leagues
  app.get("/api/leagues", async (req, res) => {
    try {
      const leagues = await getLeagues();
      
      res.json({ 
        success: true, 
        data: leagues 
      });
    } catch (error) {
      console.error('Error fetching leagues:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch leagues' 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Transform SportMonks fixture data to our app format
function transformFixture(fixture: SportMonksFixture) {
  const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
  const awayTeam = fixture.participants.find(p => p.meta.location === 'away');
  
  return {
    id: fixture.id.toString(),
    homeTeam: {
      id: homeTeam?.id.toString() || '1',
      name: homeTeam?.name || 'Home Team'
    },
    awayTeam: {
      id: awayTeam?.id.toString() || '2', 
      name: awayTeam?.name || 'Away Team'
    },
    kickoffTime: fixture.starting_at,
    status: 'upcoming' as const,
    league: fixture.league?.name || 'Unknown League',
    venue: 'Stadium', // SportMonks doesn't include venue in basic fixture data
    odds: {
      home: 2.10 + Math.random() * 0.5, // Mock odds - would need separate API call
      draw: 3.20 + Math.random() * 0.5,
      away: 3.50 + Math.random() * 0.5
    },
    markets: {
      "1x2": { 
        home: 2.10 + Math.random() * 0.5, 
        draw: 3.20 + Math.random() * 0.5, 
        away: 3.50 + Math.random() * 0.5 
      },
      "ou": { 
        over25: 1.85 + Math.random() * 0.3, 
        under25: 1.95 + Math.random() * 0.3 
      },
      "btts": { 
        yes: 1.80 + Math.random() * 0.3, 
        no: 2.00 + Math.random() * 0.3 
      },
      "handicap": { 
        home: 1.90 + Math.random() * 0.3, 
        away: 1.90 + Math.random() * 0.3 
      },
      "correctscore": { 
        "1-0": 8.50 + Math.random() * 2, 
        "2-1": 9.00 + Math.random() * 2, 
        "0-0": 12.00 + Math.random() * 3 
      }
    }
  };
}

// Transform SportMonks live fixture data to our app format
function transformLiveFixture(fixture: SportMonksFixture) {
  const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
  const awayTeam = fixture.participants.find(p => p.meta.location === 'away');
  
  const homeScore = fixture.scores.find(s => s.participant_id === homeTeam?.id)?.score.goals || 0;
  const awayScore = fixture.scores.find(s => s.participant_id === awayTeam?.id)?.score.goals || 0;
  
  // Calculate elapsed time (basic estimation)
  const startTime = new Date(fixture.starting_at);
  const now = new Date();
  const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
  const minute = Math.min(elapsedMinutes, 90);
  
  return {
    id: fixture.id.toString(),
    homeTeam: homeTeam?.name || 'Home Team',
    awayTeam: awayTeam?.name || 'Away Team',
    league: fixture.league?.name || 'Unknown League',
    homeScore,
    awayScore,
    minute: minute > 0 ? minute : 1,
    status: minute > 45 && minute <= 60 ? 'HT' : minute > 90 ? 'FT' : '1st Half',
    venue: 'Stadium',
    possession: { 
      home: 45 + Math.floor(Math.random() * 20), 
      away: 35 + Math.floor(Math.random() * 20) 
    },
    corners: { 
      home: Math.floor(Math.random() * 8), 
      away: Math.floor(Math.random() * 8) 
    },
    shots: { 
      home: Math.floor(Math.random() * 15) + 1, 
      away: Math.floor(Math.random() * 15) + 1 
    },
    odds: {
      "1x2": { 
        home: 1.75 + Math.random() * 0.5, 
        draw: 3.50 + Math.random() * 1, 
        away: 4.20 + Math.random() * 1.5 
      },
      "nextgoal": { 
        home: 2.10 + Math.random() * 0.5, 
        away: 3.20 + Math.random() * 0.8, 
        none: 4.50 + Math.random() * 1 
      },
      "totalgoals": { 
        over35: 2.40 + Math.random() * 0.3, 
        under35: 1.55 + Math.random() * 0.3 
      }
    }
  };
}
