# Perfect Migration Prompt — Full Preload & Cache

**Goal:** Migrate and configure this project so that after migration it behaves like a production betting site (e.g., 1xBet / Playwin): **all data (fixtures, live matches, results, markets) are preloaded and cached**, side menu shows only sports/leagues with matches, clicking a match opens its markets instantly, logos are mapped, and toggling between **Live** and **Prematch** shows only leagues with live or prematch fixtures respectively. Focus initially on these 7 sports:

1. Football
2. Basketball
3. American Football
4. Baseball
5. Ice Hockey
6. Cricket
7. MMA

---

## High-level Requirements (what you must implement)

1. **Startup full preload**: On app startup (or on deployment), the backend **fetches and caches** every available sport, every league, and all available matches (prematch and live) for the 7 priority sports. This preload must finish before the app serves pages that depend on the cache (or must set a `cache_ready` flag so frontend knows data is ready).

2. **Two-mode caches**: Maintain separate caches for **prematch** and **live** data. The side menu and line pages must be generated from the appropriate cache depending on the user toggle.

3. **Side menu cleanliness**: Side menu must list only sports that currently have matches in the currently selected mode (prematch | live). Do not show leagues with 0 matches.

4. **Match & market prefetch**: For every cached match, fetch and cache the full list of **markets** that will be displayed when a user clicks the match. This ensures clicking a match is instantaneous.

5. **Logos & metadata**: Use **API-Football (API-Sports)** for logos. The leagues and matches whose logo you can find on **API-Sports**. Provide a fallback strategy (placeholder avatars or locally-hosted assets) if logos are missing.&#x20;

6. **Efficient credit usage**: Implement batching, concurrency limits, TTL-aware caching, and incremental refresh policies tuned to our 1M credits/month plan. Avoid wasted duplicate requests.

7. **Robust error handling & retries**: Exponential backoff with jitter on rate-limited or failed API calls; log and alert on repeated failures.

8. **Monitoring & validation**: After preload, verify cache completeness (no leagues with zero matches listed). Generate a summary report/log to Replit console and a `cache_report` Redis key with the results.

9. **Developer-friendly**: Provide clear environment variables, Redis key schema, cron schedules, and a checklist so the Replit agent or developer can validate the migration's success.

---

## Environment variables (add to `.env`)

```
ODDS_API_KEY=your_theoddsapi_key
ODDS_API_BASE=https://api.the-odds-api.com/v4
API_FOOTBALL_KEY=your_apifootball_key
API_FOOTBALL_BASE=https://v3.football.api-sports.io
REDIS_URL=redis://localhost:6379
CONCURRENCY_LIMIT=6            # Number of parallel requests to The Odds API during preload
CACHE_READY_KEY=cache:ready    # Redis key set to true after initial preload
```

---

## Redis Key Schema (canonical)

Use clear namespaced keys so workers and the frontend can read deterministic keys.

- `sports:list` — JSON array of `{sport_key, title}` — TTL 1h
- `prematch:leagues:<sport_key>` — JSON array of leagues (each `{league_id, league_name}`) — TTL 15m
- `prematch:matches:<sport_key>:<league_id>` — JSON array of match objects — TTL 10m
- `live:leagues:<sport_key>` — JSON array of leagues that currently have live matches — TTL 90s
- `live:matches:<sport_key>:<league_id>` — JSON array of live matches for that league — TTL 60s
- `match:markets:<match_id>` — JSON object with all markets for a match (ready to render) — TTL 120s for live, 5m for prematch
- `teams:logos:<sport>:<normalized_team_name>` — URL + metadata — TTL 7d (football logos primarily from API-Football)
- `cache:ready` — boolean flag when initial preload completed
- `cache:report:<timestamp>` — JSON summary of preload validation (leagues processed, empty leagues, failures)

**Important**: Use compressed JSON (e.g., gzip or msgpack) for large arrays since Redis memory is a concern.

---

## Match ID & Deterministic Keys

Create a deterministic `match_id` so odds, scores and markets can be correlated later. Example generation function (Node.js):

```js
const crypto = require('crypto');
function makeMatchId(sportKey, home, away, commenceTime) {
  const key = `${sportKey}::${home.trim().toLowerCase()}::${away.trim().toLowerCase()}::${commenceTime}`;
  return crypto.createHash('md5').update(key).digest('hex');
}
```

Store `match_id` in cached match records.

---

## Preload Algorithm (startup worker)

Create `workers/preloadAll.js` (or TypeScript `preloadAll.ts`) and run it at startup (imported by the server entry). It must:

1. Fetch `/sports` from The Odds API to get available sport keys.
2. Filter to the 7 priority sports.
3. For each sport, run `fetchAndCachePrematch(sport)` and `fetchAndCacheLive(sport)` in parallel BUT bounded by `CONCURRENCY_LIMIT`.
4. After all sports processed, validate caches and set `cache:ready=true` and push `cache_report`.

Pseudo-code:

```js
const pLimit = require('p-limit');
const limit = pLimit(parseInt(process.env.CONCURRENCY_LIMIT || '6'));
const sports = await api.get(`/sports`);
const priority = ['soccer_epl','basketball_nba', ...]; // use actual sport_keys from API
await Promise.all(sports.map(s => limit(() => fetchAndCacheSport(s))));
await validateCacheAndSetReady();
```

`fetchAndCacheSport` does:

- call `/sports/{sport_key}/odds?markets=h2h,spreads,totals&regions=uk,eu,us&oddsFormat=decimal&dateFormat=iso` to get prematch and near-term fixtures.
- separate matches into leagues (use `bookmakers` results where available). For some endpoints The Odds API returns `bookmakers` array under each event; parse that.
- cache prematch: `prematch:matches:<sport>:<league_id>` and populate `prematch:leagues:<sport>` only with leagues which have `matches.length > 0`.
- call `/sports/{sport_key}/odds?status=live...` or use `status=live` param to get live fixtures; cache them under `live:matches...`.
- for every match, compute `match_id` and store `match:markets:<match_id>` with normalized market data (map The Odds API structures into our UI-ready schema).
- for football teams present in matches, call API-Football teams endpoints to get logos if not yet in `teams:logos:football:<normalized>`.

````

**Important**: If a league has zero matches, do not add that league to `prematch:leagues:<sport>` or `live:leagues:<sport>`.

---

## Market Prefetching & Normalization
When caching `match:markets:<match_id>` store UI-ready payloads for each market you show (e.g., H2H, Over/Under, Handicap, Moneyline, 1x2, totals, props if available).

Example normalized market shape:
```json
{
  "match_id": "...",
  "markets": [
    { "market_key": "h2h", "label": "1X2", "selections": [{"name":"Home","price":2.40},{"name":"Away","price":3.2},{"name":"Draw","price":3.1}] },
    { "market_key": "totals", "label":"Over/Under 2.5","selections":[...] }
  ]
}
````

Pre-calc anything the UI needs (e.g., fractional odds conversions, prices formatted, special tags like bestOdds).

---

## Live / Prematch Toggle Behavior

- The frontend will request side menu from server endpoints: `/api/menu?mode=prematch` or `/api/menu?mode=live`.
- Server reads `prematch:leagues:<sport>` or `live:leagues:<sport>` and returns only leagues that have matches.
- Line pages read `prematch:matches:<sport>:<league_id>` or `live:matches...` depending on mode. If an empty array is returned, the server must exclude that league from response.

**Note:** If a user toggles to `live`, do not query The Odds API — serve directly from `live:*` Redis keys which are updated by the background refresh worker.

---

## Refresh Schedules (suggested)

Tuned for production-like experience while protecting credits:

**Football (priority)**

- Live matches: refresh every **15s** for top leagues, **30s** otherwise. (Redis TTL \~15–30s)
- Prematch odds: every **2–5 min** depending on proximity to start (1–2 min within 1 hr). (Redis TTL \~120–300s)
- Fixtures list: every **5–10 min**.

**Other 6 sports** (Basketball, NFL, Baseball, Ice Hockey, Cricket, MMA)

- Live matches: every 3**0–60s** depending on sport (basketball shorter, cricket longer).
- Prematch: every **10–20 min**.

**Global housekeeping**

- Results check (scores): every **60–90s** during active play for finalization.
- Logo metadata (API-Football): once per day.

Use a job scheduler (e.g., BullMQ) or cron jobs  to implement these.

---

## Rate Limiting & Credit Budgeting

- Use concurrency limit `CONCURRENCY_LIMIT` to avoid bursts.
- Deduplicate requests: If multiple workers request the same `sport/league` at once, use an in-memory inflight map (or Redis `SETNX`) to ensure only one fetch runs and others await the same result.
- Implement exponential backoff with jitter for 429 responses.
- Log credits used daily (store `credits:used:YYYY-MM-DD`).

---

## Failover & Fallback Strategies

1. **Partial data fallback**: If an API call fails, serve existing cached data (even stale) and mark freshness flag. Do not return an empty list to frontend if cached data exists.
2. **Empty league handling**: If a league returns empty from The Odds API but other providers or local history show matches, keep it hidden until matches exist. Log cases for later manual review.
3. **Graceful degraded mode**: If The Odds API is down, serve prematch fixtures from previously cached data and set a site-wide banner: "Odds feed delayed — data may be stale.".

---

## Frontend / API Endpoints (server contract)

Provide the following server endpoints that read from Redis and never call upstream APIs directly in response to user requests:

- `GET /api/menu?mode=prematch|live` — returns sports + leagues arrays (only with matches)
- `GET /api/line/:sport/:league_id?mode=prematch|live` — returns all matches for the league
- `GET /api/match/:match_id/markets` — returns normalized markets for the match
- `GET /api/match/:match_id/details` — returns teams, logos, start time, live status, best odds
- `GET /api/status/cache` — returns `{ ready: boolean, last_update: timestamp, stats: {...} }`

**Important**: These endpoints must read from Redis and return very fast (milliseconds).

---

##
