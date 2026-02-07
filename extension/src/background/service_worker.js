// Main service worker - the brain of Lock In DJ
// Orchestrates: tab tracking → focus scoring → intervention → feedback

import { loadState, saveState, updateState } from './storage.js';
import {
  computeFocusScore,
  updateEMA,
  computeTrendDelta,
  isDoomscrollSite,
  pruneTimestamps,
  pruneIntervals,
} from './focus_model.js';
import {
  shouldIntervene,
  selectIntervention,
  evaluateIntervention,
  getInterventionDescription,
} from './decision_engine.js';
import { applyIntervention, isYTMusicAvailable, getPlaybackInfo } from './music_controller.js';

// ============================================================
// Constants
// ============================================================

const TICK_INTERVAL_MS = 10_000;      // Main loop every 10 seconds
const EVAL_WINDOW_MS = 45_000;        // Evaluate intervention after 45 seconds
const HISTORY_MAX_ENTRIES = 1000;     // Max history entries to keep

// ============================================================
// State tracking
// ============================================================

let currentTabUrl = null;
let offTaskStart = null; // Track when we started being off-task

// ============================================================
// Tab tracking
// ============================================================

/**
 * Handle tab activation (user switched to a tab)
 */
async function onTabActivated(activeInfo) {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await handleTabChange(tab.url);
  } catch (err) {
    // Tab might be gone
    console.debug('Tab get failed:', err);
  }
}

/**
 * Handle tab URL update (navigation)
 */
async function onTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.url && tab.active) {
    await handleTabChange(changeInfo.url);
  }
}

/**
 * Process a tab change event
 */
async function handleTabChange(newUrl) {
  const now = Date.now();
  const state = await loadState();

  if (!state.session.active) return;

  const previousUrl = currentTabUrl;
  currentTabUrl = newUrl;

  // Record tab switch
  state.signals.tabSwitches.push(now);
  state.signals.tabSwitches = pruneTimestamps(state.signals.tabSwitches, now);

  // Track off-task time
  const wasDoomscrolling = previousUrl && isDoomscrollSite(previousUrl, state.settings.doomscrollSites);
  const isDoomscrolling = isDoomscrollSite(newUrl, state.settings.doomscrollSites);

  // End previous off-task interval
  if (wasDoomscrolling && offTaskStart) {
    state.signals.offTaskTime.push({ start: offTaskStart, end: now });
    state.signals.offTaskTime = pruneIntervals(state.signals.offTaskTime, now);
    offTaskStart = null;
  }

  // Start new off-task interval
  if (isDoomscrolling && !offTaskStart) {
    offTaskStart = now;
  }

  // Update last activity
  state.signals.lastActivity = now;

  await saveState(state);
}

// ============================================================
// Main tick loop
// ============================================================

/**
 * Main loop - runs every TICK_INTERVAL_MS
 */
async function tick() {
  const now = Date.now();
  const state = await loadState();

  // Skip if session not active
  if (!state.session.active) return;

  // Check if YouTube Music is available (don't skip if not - still track focus)
  const musicAvailable = await isYTMusicAvailable();

  // Update off-task time if currently on doomscroll site
  if (offTaskStart) {
    const tempEnd = now;
    // We don't close the interval yet, just note it's ongoing
    state.signals.offTaskTime = pruneIntervals(state.signals.offTaskTime, now);
    // Add current ongoing interval for scoring
    const ongoingOffTask = [...state.signals.offTaskTime, { start: offTaskStart, end: tempEnd }];
    state.signals.offTaskTime = ongoingOffTask;
  }

  // Compute focus score
  const focusScore = computeFocusScore(state.signals, now);
  const focusTrend = updateEMA(state.metrics.focusTrend, focusScore);

  // Add to history for trend calculation
  state.history.push({ timestamp: now, score: focusScore });
  if (state.history.length > HISTORY_MAX_ENTRIES) {
    state.history = state.history.slice(-HISTORY_MAX_ENTRIES);
  }

  const trendDelta = computeTrendDelta(state.history, now);

  // Update metrics
  state.metrics = {
    focusScore,
    focusTrend,
    trendDelta,
  };

  // Check if we should evaluate previous intervention
  if (state.lastIntervention) {
    const elapsed = now - state.lastIntervention.appliedAt;
    if (elapsed >= EVAL_WINDOW_MS) {
      const evalResult = evaluateIntervention(state, focusScore);
      if (evalResult.evaluated) {
        console.log(
          `Intervention ${evalResult.interventionType}: delta=${evalResult.delta}, reward=${evalResult.reward.toFixed(2)}`
        );
        state.policy = evalResult.policy;
        state.lastIntervention = null;
      }
    }
  }

  // Check if we should intervene (only if music is available)
  if (musicAvailable) {
    const interventionCheck = shouldIntervene(state, now);

    if (interventionCheck.should) {
      const isDoomscrolling = currentTabUrl && isDoomscrollSite(currentTabUrl, state.settings.doomscrollSites);
      const interventionType = selectIntervention(state, isDoomscrolling);

      console.log(`Intervening: ${interventionType} (reason: ${interventionCheck.reason})`);

      // Apply the intervention
      const result = await applyIntervention(interventionType);

      if (result?.success) {
        state.lastIntervention = {
          type: interventionType,
          appliedAt: now,
          preScore: focusScore,
        };

        // Notify UI
        chrome.runtime.sendMessage({
          type: 'INTERVENTION_APPLIED',
          intervention: interventionType,
          description: getInterventionDescription(interventionType),
          focusScore,
        }).catch(() => {});
      }
    }
  }

  // Broadcast state update to UI
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    focusScore,
    focusTrend,
    trendDelta,
    sessionActive: state.session.active,
    mode: state.session.mode,
    musicAvailable,
  }).catch(() => {});

  await saveState(state);
}

// ============================================================
// Session control
// ============================================================

/**
 * Start a study session
 */
async function startSession(mode = 'normal') {
  await updateState((state) => ({
    ...state,
    session: {
      active: true,
      mode,
      phase: 'study',
      startedAt: Date.now(),
    },
    signals: {
      tabSwitches: [],
      offTaskTime: [],
      activeTime: 0,
      lastActivity: Date.now(),
    },
    metrics: {
      focusScore: 100,
      focusTrend: 100,
      trendDelta: 0,
    },
    lastIntervention: null,
    history: [],
  }));

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url) {
    currentTabUrl = tabs[0].url;
  }

  // Start the alarm for periodic ticks
  chrome.alarms.create('focus-tick', { periodInMinutes: TICK_INTERVAL_MS / 60000 });

  console.log('Session started:', mode);
}

/**
 * Stop the session
 */
async function stopSession() {
  await updateState((state) => ({
    ...state,
    session: {
      ...state.session,
      active: false,
    },
  }));

  chrome.alarms.clear('focus-tick');
  offTaskStart = null;
  currentTabUrl = null;

  console.log('Session stopped');
}

/**
 * Change session mode
 */
async function setMode(mode) {
  await updateState((state) => ({
    ...state,
    session: {
      ...state.session,
      mode,
    },
  }));
  console.log('Mode changed:', mode);
}

// ============================================================
// Message handling (from popup/options)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'START_SESSION':
        await startSession(message.mode);
        sendResponse({ success: true });
        break;

      case 'STOP_SESSION':
        await stopSession();
        sendResponse({ success: true });
        break;

      case 'SET_MODE':
        await setMode(message.mode);
        sendResponse({ success: true });
        break;

      case 'GET_STATE':
        const state = await loadState();
        const musicAvailable = await isYTMusicAvailable();
        sendResponse({ ...state, musicAvailable });
        break;

      case 'GET_PLAYBACK':
        const playback = await getPlaybackInfo();
        sendResponse(playback);
        break;

      case 'TICK':
        await tick();
        sendResponse({ success: true });
        break;

      case 'YTM_READY':
        console.log('YouTube Music tab ready:', message.url);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true; // Keep channel open for async response
});

// ============================================================
// Event listeners
// ============================================================

// Tab events
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onUpdated.addListener(onTabUpdated);

// Alarm for periodic tick
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'focus-tick') {
    tick();
  }
});

// Extension installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Lock In DJ installed/updated');
});

// Startup
chrome.runtime.onStartup.addListener(async () => {
  const state = await loadState();
  if (state.session.active) {
    // Resume session
    chrome.alarms.create('focus-tick', { periodInMinutes: TICK_INTERVAL_MS / 60000 });
    console.log('Session resumed on startup');
  }
});

console.log('Lock In DJ service worker loaded');
