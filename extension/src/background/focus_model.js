// Focus score computation - heuristic model (ML-ready architecture)

const WINDOW_MS = 60_000; // 60 second rolling window
const EMA_ALPHA = 0.3;    // smoothing factor for trend

/**
 * Clamp value between 0 and 1
 */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Clamp value between min and max
 */
function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

/**
 * Clean old entries from a timestamp array (keep only last WINDOW_MS)
 */
export function pruneTimestamps(arr, now) {
  const cutoff = now - WINDOW_MS;
  return arr.filter((t) => t > cutoff);
}

/**
 * Clean old intervals from off-task time array
 */
export function pruneIntervals(intervals, now) {
  const cutoff = now - WINDOW_MS;
  return intervals
    .map((i) => ({
      start: Math.max(i.start, cutoff),
      end: i.end,
    }))
    .filter((i) => i.end > cutoff && i.end > i.start);
}

/**
 * Sum total time from intervals
 */
function sumIntervals(intervals) {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}

/**
 * Compute focus score from signals
 * Returns 0-100 where 100 = fully focused
 */
export function computeFocusScore(signals, now) {
  // Prune to window
  const tabSwitches = pruneTimestamps(signals.tabSwitches, now);
  const offTaskIntervals = pruneIntervals(signals.offTaskTime, now);

  // Tab switch penalty: 10+ switches/min = very bad
  const tabSwitchRate = tabSwitches.length; // per 60s
  const tabPenalty = clamp01(tabSwitchRate / 10);

  // Off-task penalty: time on doomscroll sites
  const offTaskMs = sumIntervals(offTaskIntervals);
  const offTaskPenalty = clamp01(offTaskMs / WINDOW_MS);

  // Idle penalty: time since last activity
  const idleMs = signals.lastActivity ? now - signals.lastActivity : 0;
  const idlePenalty = clamp01(idleMs / WINDOW_MS);

  // Base score with penalties
  let score = 100
    - 40 * tabPenalty      // heavy penalty for tab switching
    - 45 * offTaskPenalty  // heavy penalty for doomscrolling
    - 15 * idlePenalty;    // light penalty for being idle

  // Bonus for sustained on-task time
  const onTaskMs = WINDOW_MS - offTaskMs;
  const onTaskRatio = clamp01(onTaskMs / WINDOW_MS);
  score += 10 * onTaskRatio;

  return clamp(Math.round(score), 0, 100);
}

/**
 * Update exponential moving average for trend tracking
 */
export function updateEMA(currentEMA, newScore) {
  return EMA_ALPHA * newScore + (1 - EMA_ALPHA) * currentEMA;
}

/**
 * Calculate trend delta (how much focus changed recently)
 */
export function computeTrendDelta(history, now) {
  // Look at last 30 seconds of history
  const cutoff = now - 30_000;
  const recent = history.filter((h) => h.timestamp > cutoff);

  if (recent.length < 2) return 0;

  const oldest = recent[0].score;
  const newest = recent[recent.length - 1].score;

  return newest - oldest;
}

/**
 * Check if URL is on a doomscroll site
 */
export function isDoomscrollSite(url, doomscrollSites) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return doomscrollSites.some((site) =>
      hostname === site || hostname.endsWith('.' + site)
    );
  } catch {
    return false;
  }
}

/**
 * Check if URL is on a study site
 */
export function isStudySite(url, studySites) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return studySites.some((site) =>
      hostname === site || hostname.endsWith('.' + site)
    );
  } catch {
    return false;
  }
}
