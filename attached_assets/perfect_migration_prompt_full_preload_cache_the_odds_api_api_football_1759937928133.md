# Perfect Migration Prompt — Full Preload & Cache

**Goal:**
Migrate and configure the Replit project so that after migration it behaves like a production betting site (e.g., 1xBet / Playwin): **all data (fixtures, live matches, results, markets) are preloaded and cached**, side menu shows only sports/leagues with matches, clicking a match opens its markets instantly, logos are mapped, and toggling between **Live** and **Prematch** shows only leagues with live or prematch fixtures respectively. Focus initially on these 7 sports:

1. Football
2. Basketball
3. American Football
4. Baseball
5. Ice Hockey
6. Cricket
7. MMA

---

## High-level Requirements (what this Replit agent must implement)

1. **Startup full preload**: On app startup (or on deployment), the backend **fetches and caches** every available sport, every league, and all available matches (prematch and live) for the 7 priority sports. This preload must finish before the app serves pages that depend on the cache (or must set a `cache_ready` flag so frontend knows data is ready).

2. **Two-mode caches**: Maintain separate caches for **prematch** and **live** data. The side menu and line pages must be generated from the appropriate cache depending on the user toggle.

3. **Side menu cleanliness**: Side menu must list only sports and only leagues that currently have matches in the currently selected mode (prematch | live). Do not show leagues with 0 matches.

4. **Match & market prefetch**: For every cached match, fetch and cache the full list of **markets** that will be displayed when a user clicks the match. This ensures clicking a match is instantaneous.

5. **Logos & metadata**: Use **API-Football (API-Sports)** for football logos and team metadata (free). For non-football sports, attempt to map logos from The Odds API participants. Provide a fallback strategy (placeholder avatars or locally-hosted assets) if logos are missing.

6. **Efficient credit usage**: Implement batching, concurrency limits, TTL-aware caching, and incremental refresh policies tuned to your 100K credits/month plan (or the plan in use). Avoid wasted duplicate requests.

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

- `sports:list` — JSON array of `{sport_key, title, activeMatchesCount}` — TTL 1h
- `prematch:leagues:<sport_key>` — JSON array of leagues (each `{league_id, league_name, matches_count}`) — TTL 15m
- `prematch:matches:<sport_key>:<league_id>` — JSON array of match objects — TTL 10m
- `live:leagues:<sport_key>` — JSON array of leagues that currently have live matches — TTL 90s
- `live:matches:<sport_key>:<league_id>` — JSON array of live matches for that league — TTL 60s
- `match:markets:<match_id>` — JSON object with all markets for a match (ready to render) — TTL 120s for live, 5m for prematch
- `teams:logos:<sport>:<normalized_team_name>` — URL + metadata — TTL 7d (football logos primarily from API-Football)
- `cache:ready` — boolean flag when initial preload completed
- `cache:report:<timestamp>` — JSON summary of preload validation (leagues processed, empty leagues, failures)


**Important**: Use compressed JSON (e.g., gzip or msgpack) for large arrays if Redis memory is a concern.

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
2. Filter to the 7 priority sports (if you want to limit). If not found, still include them but log warning.
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
- for every match, compute `match_id` and store `match:markets:<match_id>` with normalized market data (map The Odds API structures into your UI-ready schema).
- for football teams present in matches, call API-Football teams endpoints to get logos if not yet in `teams:logos:football:<normalized>`.
```

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
```

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
- Live matches: refresh every **12–15s** for top leagues, **30s** otherwise. (Redis TTL ~15–30s)
- Prematch odds: every **2–5 min** depending on proximity to start (1–2 min within 1 hr). (Redis TTL ~120–300s)
- Fixtures list: every **10–15 min**.

**Other 6 sports** (Basketball, NFL, Baseball, Ice Hockey, Cricket, MMA)
- Live matches: every **20–60s** depending on sport (basketball shorter, cricket longer).
- Prematch: every **10–30 min**.

**Global housekeeping**
- Results check (scores): every **60–90s** during active play for finalization.
- Logo metadata (API-Football): once per day.

Use a job scheduler (e.g., BullMQ) or cron jobs inside Replit workers to implement these.

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

**Important**: These endpoints must read from Redis and return fast (milliseconds).

---

## Logos & Team Mapping
1. **Football**: Use API-Football endpoints (teams and leagues) to store `teams:logos:football:<normalized_name>` and `leagues:logos:<league_id>`.
2. **Other sports**: Attempt to use `participants` from The Odds API for team names. Run a normalization + fuzzy match against a local `teams` registry. If no match, use a placeholder image or generate SVG with team initials.
3. Provide a command for manual mapping: store explicit mapping entries in Redis or DB to force-correct matches.

---

## Validation & Acceptance Tests (must pass before marking migration done)
Run this test suite after preload completes and during daily operations:

1. `menu_prematch_non_empty`: For each of the 7 sports, `/api/menu?mode=prematch` returns at least one league object with `matches_count > 0` OR valid log that none exist globally.
2. `menu_live_non_empty`: For each sport, if live matches exist globally per The Odds API docs, then `/api/menu?mode=live` must show leagues for that sport.
3. `line_page_full`: For 10 random leagues in Football, `GET /api/line/football/:league_id?mode=prematch` returns the full match list and no truncation.
4. `match_markets`: For 20 random matches, `GET /api/match/:match_id/markets` returns non-empty markets and prices.
5. `startup_time`: After deployment, `cache:ready` appears within X seconds (goal: under 90s for initial preload of 7 sports) — tune concurrency and TTLs accordingly.
6. `no_empty_league_display`: The side menu does not contain any league that has `matches_count == 0`.

When a test fails, worker must log `cache_report` with failed items and a suggested retry list.

---

## Deployment Steps (for Replit agent)
1. Add environment variables to Replit secrets (see earlier `.env` block).
2. Commit `workers/preloadAll.js` and `workers/refreshLive.js` with concurrency controls.
3. Import preload worker in server entry: `import './workers/preloadAll.js';` — or run it as startup process before server `listen()`.
4. Start background scheduler to run refresh jobs and results polling.
5. Monitor `cache:report` after initial run and fix any items logged as missing.

---

## Debugging & Logs (developer guide)
- After preload finish, print summary:
  - `total_sports`, `sports_with_matches`, `total_leagues`, `leagues_with_matches`, `empty_leagues_list` (top 20)
- Store `cache_report:<timestamp>` in Redis with same data for later inspection.
- For each league with zero matches but expected to have matches (from known list like tennis / nfl), log sample events and full upstream response.

Sample console output (on success):
```
[PRELOAD] Sports fetched: 7
[PRELOAD] Football leagues processed: 59 -> leagues with matches: 22
[PRELOAD] Total matches cached: 3,412
[PRELOAD] Live matches cached: 212
[PRELOAD] Cache ready. Set cache:ready=true
```

---

## Acceptance Criteria (final)
- Side menu lists only sports & leagues that have matches for the selected mode.
- Line pages show full match lists for each league (no artificial 20-item truncation).
- Live page shows live matches instantly after visiting (data served from `live:*` Redis keys).
- Clicking a match opens markets with zero-perceived latency.
- Logos are populated for Football from API-Football and fallback gracefully for other sports.
- Preload completes and sets `cache:ready` and a `cache_report` is available in Redis.

---

## Final Notes for Replit Engineer
- Use `axios` + `p-limit` (or a modern Promise Pool) for concurrency-limited upstream calls.
- Use `ioredis` for robust Redis handling and pub/sub for real-time updates if needed.
- Avoid calling upstream APIs from the request-handling path — always serve from Redis.
- Keep a small in-memory inflight map to dedupe concurrent fetches.
- Ensure logs are verbose during migration; reduce verbosity after stabilization.


**Paste this entire document into Replit's task runner or automation agent** and implement the changes exactly. After first run, post the `cache_report` output here and I will help debug any missing leagues or empty match lists.

