/**
 * Centralized match status utilities
 * 
 * Determines when a match should display "LIVE" status based on:
 * - Actual kickoff time (client-side calculation)
 * - Backend status (to exclude completed matches)
 * 
 * This prevents flickering when backend prematurely changes status to 'live'
 * before the actual match time arrives.
 */

interface MatchWithTime {
  commence_time?: string;
  start_time?: string;
  scheduled?: string;
  status?: string;
}

/**
 * Terminal statuses indicating match has ended
 */
const TERMINAL_STATUSES = [
  'completed', 'finished', 'final', 'full_time', 'ft'
];

/**
 * All non-live statuses that should exclude a match from being shown as LIVE
 * Includes terminal statuses (ended) and disrupted statuses (postponed/cancelled)
 */
const NON_LIVE_STATUSES = [
  ...TERMINAL_STATUSES,
  // Disrupted statuses (match not actually happening)
  'postponed', 'delayed', 'suspended', 'cancelled', 'canceled', 'abandoned',
  // Scheduled/upcoming statuses
  'upcoming', 'scheduled', 'not_started'
];

/**
 * Determines if a match is actually live based on time and status
 * 
 * CRITICAL: This function prioritizes TIME over backend status to prevent
 * flickering when the backend prematurely marks matches as 'live'.
 * 
 * @param match - Match object with commence_time and optional status
 * @returns true if match should display as "LIVE", false otherwise
 */
export function isLiveByTime(match: MatchWithTime | null | undefined): boolean {
  if (!match) return false;
  
  // Try to get kickoff time from multiple possible fields (fallback hierarchy)
  // This handles cases where API uses different field names or temporarily omits one
  const kickoffTime = match.commence_time || match.start_time || match.scheduled;
  
  // CRITICAL: If NO time field is available, return false
  // We NEVER fall back to trusting backend status - that causes the flickering bug
  if (!kickoffTime) return false;
  
  const matchTime = new Date(kickoffTime).getTime();
  
  // Guard against invalid dates (NaN)
  // If ALL time fields produce invalid dates, return false
  if (isNaN(matchTime)) return false;
  
  const now = new Date().getTime();
  
  // Not live if kickoff time hasn't arrived yet
  if (matchTime > now) return false;
  
  // Not live if match is in any non-live status (completed, postponed, etc.)
  if (match.status && NON_LIVE_STATUSES.includes(match.status.toLowerCase())) {
    return false;
  }
  
  // Match time has passed and match is not in a non-live status = LIVE
  return true;
}

/**
 * Determines if a match should show countdown (not started yet)
 * 
 * @param match - Match object with commence_time
 * @returns true if countdown should be displayed
 */
export function shouldShowCountdown(match: MatchWithTime | null | undefined): boolean {
  if (!match || !match.commence_time) return false;
  
  const matchTime = new Date(match.commence_time).getTime();
  if (isNaN(matchTime)) return false;
  
  const now = new Date().getTime();
  
  // Show countdown if match hasn't started yet
  return matchTime > now;
}

/**
 * Determines if a match is finished
 * 
 * @param match - Match object with optional status
 * @returns true if match has ended
 */
export function isMatchFinished(match: MatchWithTime | null | undefined): boolean {
  if (!match || !match.status) return false;
  return TERMINAL_STATUSES.includes(match.status.toLowerCase());
}
