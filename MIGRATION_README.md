# The Odds API Migration - README

This document describes the completed migration from SportMonks API to The Odds API with full preload and caching system.

## Overview

The application has been migrated to use **The Odds API** for sports odds data with a comprehensive caching system powered by Redis. The system preloads and caches all data for 7 priority sports on startup and continuously refreshes the data in the background.

## Priority Sports

1. **Football** (soccer)
2. **Basketball**
3. **American Football**
4. **Baseball**
5. **Ice Hockey**
6. **Cricket**
7. **MMA**

## Architecture

### Core Components

1. **The Odds API Client** (`server/odds-api-client.ts`)
   - Rate limiting with concurrency controls
   - Automatic retries with exponential backoff
   - Request deduplication
   - Credit usage tracking

2. **API-Football Client** (`server/api-football-client.ts`)
   - Team logo fetching for football matches
   - Caching layer for logos

3. **Redis Cache Manager** (`server/redis-cache.ts`)
   - Compressed storage using msgpack
   - Structured key schema
   - Separate caches for prematch and live data
   - TTL-based expiration

4. **Preload Worker** (`server/preload-worker.ts`)
   - Full data preload on startup
   - Parallel processing with concurrency limits
   - Validation and reporting
   - Market prefetching

5. **Refresh Worker** (`server/refresh-worker.ts`)
   - Continuous background updates
   - Sport-specific refresh intervals
   - Dynamic TTL based on match status
   - Housekeeping tasks

6. **Match Utilities** (`server/match-utils.ts`)
   - Deterministic match ID generation
   - Data normalization
   - Market transformation

### API Endpoints

All new endpoints are cache-only and never call upstream APIs directly:

- `GET /api/menu?mode=prematch|live` - Sports and leagues menu
- `GET /api/line/:sport/:leagueId?mode=prematch|live` - Matches for a league
- `GET /api/match/:matchId/markets` - Markets for a match
- `GET /api/match/:matchId/details` - Complete match details
- `GET /api/status/cache` - Cache status and metrics
- `GET /api/sports?mode=prematch|live` - All sports with match counts
- `GET /api/sports/:sport/leagues?mode=prematch|live` - Leagues for a sport
- `POST /api/admin/preload` - Manual preload trigger (admin only)

## Redis Key Schema

```
sports:list                              → JSON array of sports (TTL: 1h)
prematch:leagues:<sport_key>            → Leagues with matches (TTL: 15min)
prematch:matches:<sport>:<league>       → Match array (TTL: 10min)
live:leagues:<sport_key>                → Live leagues (TTL: 90s)
live:matches:<sport>:<league>           → Live matches (TTL: 60s)
match:markets:<match_id>                → Markets (TTL: 2min live, 5min prematch)
teams:logos:<sport>:<team_name>         → Logo data (TTL: 7 days)
cache:ready                             → Boolean flag
cache:report:<timestamp>                → Preload report
```

## Environment Variables

Required environment variables (configure in Replit Secrets):

```bash
ODDS_API_KEY=your_theoddsapi_key
ODDS_API_BASE=https://api.the-odds-api.com/v4
API_FOOTBALL_KEY=your_apifootball_key
API_FOOTBALL_BASE=https://v3.football.api-sports.io
REDIS_URL=redis://localhost:6379  # Optional, defaults to localhost
CONCURRENCY_LIMIT=6                # API request concurrency
CACHE_READY_KEY=cache:ready        # Redis key for ready flag
```

## Starting Redis

Redis must be running before the application starts. Run:

```bash
./start-redis.sh
```

Or manually:

```bash
redis-server --port 6379 --daemonize yes --protected-mode no --bind 127.0.0.1
```

Verify Redis is running:

```bash
redis-cli ping  # Should return PONG
```

## Refresh Intervals

### Football (Priority Sport)
- **Live matches**: 15s
- **Prematch odds**: 3-5 minutes (1-2 min if starting within 1 hour)
- **Fixtures list**: 10 minutes

### Other Sports
- **Live matches**: 30-60s (depending on sport)
- **Prematch**: 10-20 minutes

### Housekeeping
- **Results check**: Every 90 seconds
- **Logo refresh**: Daily

## Credit Usage & Rate Limiting

- Concurrency limit: 6 parallel requests (configurable)
- Request deduplication to avoid duplicate calls
- Exponential backoff with jitter on rate limits (429)
- Automatic retry (max 3 attempts)
- Daily credit tracking in `credits:used:YYYY-MM-DD`

## Monitoring

### Cache Status

Check cache status:

```bash
GET /api/status/cache
```

Returns:
- Cache ready flag
- Latest preload report
- Redis stats
- API metrics (requests, failures, credits used)

### Cache Report

After each preload, a report is generated showing:
- Sports processed
- Leagues and matches cached
- Empty leagues detected
- Failures encountered
- Credits used
- Duration

## Validation

The preload worker validates:
1. No empty leagues are cached
2. All matches have markets prefetched
3. Logos are available (for football)

Empty leagues are logged in `report.emptyLeagues[]`.

## Fallback Strategy

If Redis is unavailable:
- Application continues using SportMonks API directly
- Warning logs are generated
- Cache features are disabled
- Normal betting functionality continues

## Frontend Integration

The frontend should be updated to:

1. Add mode toggle (Prematch / Live)
2. Use new API endpoints:
   - `/api/menu?mode=...` for sidebar
   - `/api/line/:sport/:league?mode=...` for match lists
   - `/api/match/:matchId/markets` for bet slip

3. Display logos from cached data
4. Show cache status indicator

## Manual Operations

### Trigger Manual Preload

```bash
POST /api/admin/preload
```

### Clear Cache Pattern

```javascript
import { redisCache } from './redis-cache';
await redisCache.flushPattern('prematch:*');
await redisCache.flushPattern('live:*');
```

### Check Specific Cache Key

```javascript
const leagues = await redisCache.getPrematchLeagues('football');
console.log(leagues);
```

## Troubleshooting

### Redis Connection Failed

1. Check if Redis is running: `redis-cli ping`
2. Start Redis: `./start-redis.sh`
3. Verify REDIS_URL environment variable
4. Check logs: `cat /tmp/logs/Start_application_*.log`

### No Data in Cache

1. Check preload logs for errors
2. Verify API keys are set correctly
3. Trigger manual preload: `POST /api/admin/preload`
4. Check cache report: `GET /api/status/cache`

### High Credit Usage

1. Review concurrency limit (reduce if needed)
2. Check refresh intervals (increase TTL)
3. Monitor deduplication effectiveness
4. Review API metrics: `GET /api/status/cache`

## Testing the Migration

1. Start Redis: `./start-redis.sh`
2. Restart application
3. Wait for preload to complete (~30-60 seconds)
4. Check status: `GET /api/status/cache`
5. Test menu: `GET /api/menu?mode=prematch`
6. Test line: `GET /api/line/football/<league_id>?mode=prematch`
7. Toggle to live: `GET /api/menu?mode=live`

## Next Steps

1. ✅ Redis infrastructure setup
2. ✅ API clients created
3. ✅ Cache manager implemented
4. ✅ Preload and refresh workers built
5. ✅ New API endpoints created
6. ⏳ Frontend integration (update UI to use new endpoints)
7. ⏳ Testing and validation
8. ⏳ Production deployment

## Files Modified/Created

### New Files
- `server/odds-api-client.ts`
- `server/api-football-client.ts`
- `server/redis-cache.ts`
- `server/match-utils.ts`
- `server/preload-worker.ts`
- `server/refresh-worker.ts`
- `server/odds-api-routes.ts`
- `start-redis.sh`

### Modified Files
- `server/index.ts` - Integrated Redis and workers
- `package.json` - Added dependencies (redis, ioredis, p-limit, msgpack-lite)
