import axios, { AxiosInstance, AxiosError } from 'axios';
import pLimit from 'p-limit';

const API_FOOTBALL_BASE = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const CONCURRENCY_LIMIT = 3; // Conservative for API-Football

const limit = pLimit(CONCURRENCY_LIMIT);

interface TeamLogo {
  teamId?: number;
  teamName: string;
  logo: string;
  country?: string;
  founded?: number;
  venue?: string;
}

class ApiFootballClient {
  private client: AxiosInstance;
  private logoCache: Map<string, TeamLogo> = new Map();

  constructor() {
    this.client = axios.create({
      baseURL: API_FOOTBALL_BASE,
      timeout: 30000,
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY,
      },
    });
  }

  private normalizeTeamName(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async getTeamLogo(teamName: string, country?: string): Promise<TeamLogo | null> {
    const normalizedName = this.normalizeTeamName(teamName);
    
    // Check cache first
    const cached = this.logoCache.get(normalizedName);
    if (cached) {
      return cached;
    }

    return limit(async () => {
      try {
        const params: any = {
          search: teamName,
        };

        if (country) {
          params.country = country;
        }

        const response = await this.client.get('/teams', { params });

        if (response.data?.response && response.data.response.length > 0) {
          const team = response.data.response[0];
          const logoData: TeamLogo = {
            teamId: team.team?.id,
            teamName: team.team?.name || teamName,
            logo: team.team?.logo || '',
            country: team.team?.country,
            founded: team.team?.founded,
            venue: team.venue?.name,
          };

          this.logoCache.set(normalizedName, logoData);
          return logoData;
        }

        return null;
      } catch (error) {
        console.warn(`Failed to fetch logo for ${teamName}:`, (error as Error).message);
        return null;
      }
    });
  }

  async getTeamsByLeague(leagueId: number, season: number): Promise<TeamLogo[]> {
    return limit(async () => {
      try {
        const response = await this.client.get('/teams', {
          params: {
            league: leagueId,
            season,
          },
        });

        if (response.data?.response) {
          const teams: TeamLogo[] = response.data.response.map((item: any) => ({
            teamId: item.team?.id,
            teamName: item.team?.name,
            logo: item.team?.logo || '',
            country: item.team?.country,
            founded: item.team?.founded,
            venue: item.venue?.name,
          }));

          // Cache all teams
          teams.forEach(team => {
            const normalizedName = this.normalizeTeamName(team.teamName);
            this.logoCache.set(normalizedName, team);
          });

          return teams;
        }

        return [];
      } catch (error) {
        console.warn(`Failed to fetch teams for league ${leagueId}:`, (error as Error).message);
        return [];
      }
    });
  }

  async searchLeague(name: string, country?: string): Promise<any[]> {
    return limit(async () => {
      try {
        const params: any = { search: name };
        if (country) params.country = country;

        const response = await this.client.get('/leagues', { params });
        return response.data?.response || [];
      } catch (error) {
        console.warn(`Failed to search league ${name}:`, (error as Error).message);
        return [];
      }
    });
  }

  getCachedLogo(teamName: string): TeamLogo | null {
    const normalizedName = this.normalizeTeamName(teamName);
    return this.logoCache.get(normalizedName) || null;
  }

  clearCache(): void {
    this.logoCache.clear();
  }
}

export const apiFootballClient = new ApiFootballClient();
export type { TeamLogo };
