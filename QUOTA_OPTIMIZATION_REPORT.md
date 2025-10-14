# The Odds API - Quota Optimization Report

## Executive Summary
Successfully optimized API usage from **~30M credits/month** to **~2.27M credits/month** (within 2.5M limit)

## Configuration Changes

### 1. Sport-Specific API Parameters
| Sport | Markets | Regions | Cost per Request |
|-------|---------|---------|------------------|
| **Football** | h2h, spreads, totals (3) | uk (1) | **3 credits** |
| **Other Sports** | h2h (1) | uk (1) | **1 credit** |

### 2. League Limits
- **Football**: 30 leagues (7 top priority + 23 others)
- **Other Sports**: 10 leagues each (6 sports × 10 = 60 total)
- **Total**: 90 leagues

### 3. Optimized Refresh Intervals
| Refresh Type | Football Top 7 | Football Other 23 | Other Sports (60) |
|--------------|----------------|-------------------|-------------------|
| **Live** | 2 min | 4 min | 5 min |
| **Prematch** | 15 min | 15 min | 15 min |
| **Scores** | 5 min | 5 min | 5 min |

## Monthly Quota Calculation

### Live Refresh (per hour):
- **Football Top 7**: (3600/120) × 7 leagues × 3 credits = **630 credits/hour**
- **Football Other 23**: (3600/240) × 23 leagues × 3 credits = **1,035 credits/hour**
- **Other Sports 60**: (3600/300) × 60 leagues × 1 credit = **720 credits/hour**
- **Live Total**: **2,385 credits/hour**

### Prematch Refresh (per hour):
- **Football 30**: (3600/900) × 30 leagues × 3 credits = **360 credits/hour**
- **Other Sports 60**: (3600/900) × 60 leagues × 1 credit = **240 credits/hour**
- **Prematch Total**: **600 credits/hour**

### Scores/Settlement (per hour):
- **7 Sport Categories**: (3600/300) × 7 sports × 2 credits = **168 credits/hour**

### Total Usage:
| Period | Calculation | Credits |
|--------|-------------|---------|
| **Per Hour** | 2,385 + 600 + 168 | **3,153** |
| **Per Day** | 3,153 × 24 | **75,672** |
| **Per Month** | 75,672 × 30 | **≈2,270,160** |

## ✅ Result: Within 2.5M Monthly Quota
**Safety Margin**: ~230,000 credits (9.2%)

## Technical Improvements

### 1. Dynamic Credit Tracking
- Modified `apiQuotaTracker.incrementRequest()` to accept variable credit costs
- All endpoints now report actual credit consumption

### 2. Fixed Data Loss Issue
- Preload worker now MERGES leagues instead of replacing
- Top priority leagues no longer disappear when loading remaining leagues

### 3. Sport-Specific Configurations
- Centralized config in `match-utils.ts` via `SPORT_API_CONFIG`
- All workers (preload, refresh) use `getSportApiConfig()` for consistency

## Files Modified
1. `server/match-utils.ts` - Added sport-specific configs, reduced football leagues to 30
2. `server/odds-api-client.ts` - Dynamic credit cost calculation
3. `server/api-quota-tracker.ts` - Variable credit cost tracking
4. `server/preload-worker.ts` - Sport-specific configs + merge fix
5. `server/refresh-worker.ts` - Optimized intervals + sport-specific configs

## Next Steps
- Monitor actual quota usage in production
- Adjust intervals if needed based on real-world patterns
- Consider further optimizations if approaching 80% of quota
