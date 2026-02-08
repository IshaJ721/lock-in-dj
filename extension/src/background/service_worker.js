// Main service worker - the brain of FocusDJ
// Orchestrates: tab tracking → focus scoring → intervention → feedback

import { loadState, saveState, updateState, categorizeSite, smartCategorizeSite, getMusicIntelligence, clearMusicIntelligence, setApiKey, getApiKey } from './storage.js';
import {
  computeFocusScore,
  updateEMA,
  computeTrendDelta,
  isDoomscrollSite,
  pruneTimestamps,
} from './focus_model.js';
import {
  shouldIntervene,
  selectIntervention,
  evaluateIntervention,
  getInterventionDescription,
} from './decision_engine.js';
import { applyIntervention, isYTMusicAvailable, getPlaybackInfo } from './music_controller.js';
import {
  recordTrackPlay,
  getRecommendations,
  getContextualRecommendation,
  buildUserProfile,
  clearMusicIntelligence as clearRecommendationData,
} from './recommendation_engine.js';

// ============================================================
// Constants
// ============================================================

const TICK_INTERVAL_MS = 10_000;      // Main loop every 10 seconds
const EVAL_WINDOW_MS = 45_000;        // Evaluate intervention after 45 seconds
const HISTORY_MAX_ENTRIES = 1000;     // Max history entries to keep

// Viola messages for different situations
const VIOLA_MESSAGES = {
  stillDistracted: [
    "Hey, I noticed you're still here. Need help getting back on track?",
    "Still scrolling? Let's take a breath and refocus.",
    "I've tried changing your music, but you're still distracted. Let's talk!",
  ],
  doomscrolling: [
    "Doomscrolling detected! Your focus score is dropping fast.",
    "This site is eating your time. Let's bounce!",
  ],
  breakTime: [
    "Break time! You've earned it. Step away for a bit.",
    "Pomodoro complete! Take a well-deserved break.",
  ],
  backToWork: [
    "Break's over! Ready to crush it again?",
    "Let's get back into focus mode!",
  ],
};

// ============================================================
// State tracking
// ============================================================

let currentTabUrl = null;
let offTaskStart = null; // Track when we started being off-task

// Vision detection state
let visionEnabled = false;
let lastVisionSignal = null;
let faceMissingMs = 0;
let lookingAwayMs = 0;
let lastFaceAwayAlarm = 0;
const FACE_AWAY_ALARM_THRESHOLD_MS = 10000; // 10 seconds before alarm
const FACE_AWAY_ALARM_COOLDOWN_MS = 30000; // 30 seconds between alarms

// Doomscroll detection state
let doomscrollSeconds = 0;
let lastDoomscrollAlarm = 0;
const DOOMSCROLL_THRESHOLD_SECONDS = 15; // Trigger alarm after 15 seconds
const DOOMSCROLL_ALARM_COOLDOWN = 30000; // 30 second cooldown between alarms

// Doomscroll sites (defaults)
const DEFAULT_DOOMSCROLL_SITES = [
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'youtube.com/shorts',
  'facebook.com',
];

// Offscreen document state
let offscreenCreated = false;

// Track monitoring for music intelligence
let currentTrackHandler = null;
let lastKnownTrackId = null;

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
  state.signals.tabSwitches = state.signals.tabSwitches || [];
  state.signals.tabSwitches.push(now);
  state.signals.tabSwitches = pruneTimestamps(state.signals.tabSwitches, now);

  // Track site time for previous site
  if (previousUrl && state.signals.currentSite) {
    const prevHostname = state.signals.currentSite;
    if (state.signals.siteTime?.[prevHostname]?.lastStart) {
      const elapsed = now - state.signals.siteTime[prevHostname].lastStart;
      state.signals.siteTime[prevHostname].totalMs += elapsed;
      state.signals.siteTime[prevHostname].lastStart = null;
    }
  }

  // Extract hostname and categorize new site (using AI for unknown sites)
  let hostname = null;
  let category = 'neutral';
  try {
    hostname = new URL(newUrl).hostname;
    // Use smart categorization (AI-powered for unknown sites)
    category = await smartCategorizeSite(hostname, state.settings);
  } catch {
    // Invalid URL
  }

  // Update current site tracking
  state.signals.currentSite = hostname;
  state.signals.currentCategory = category;

  // Initialize site time tracking for new site
  if (hostname) {
    state.signals.siteTime = state.signals.siteTime || {};
    if (!state.signals.siteTime[hostname]) {
      state.signals.siteTime[hostname] = { category, totalMs: 0, lastStart: null };
    }
    state.signals.siteTime[hostname].lastStart = now;
  }

  // Update last activity
  state.signals.lastActivity = now;

  await saveState(state);
}

// ============================================================
// Viola Popup (show chatbot on current tab)
// ============================================================

/**
 * Show Viola popup on the current active tab
 */
async function showViolaPopup(messageType, customMessage = null, focusScore = null) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && !tabs[0].url.includes('music.youtube.com')) {
      const messages = VIOLA_MESSAGES[messageType] || VIOLA_MESSAGES.stillDistracted;
      const message = customMessage || messages[Math.floor(Math.random() * messages.length)];

      await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'VIOLA_POPUP',
        message,
        alertType: messageType,
        focusScore,
        actionLabel: messageType === 'breakTime' ? 'Start Break' : "Let's Focus",
      });
      return { success: true };
    }
  } catch (err) {
    console.warn('Failed to show Viola popup:', err);
  }
  return { success: false };
}

/**
 * Hide Viola popup on current tab
 */
async function hideViolaPopup() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'VIOLA_HIDE' });
    }
  } catch (err) {
    // Ignore
  }
}

// ============================================================
// Pomodoro Timer
// ============================================================

let pomodoroInterval = null;
let pomodoroTimeRemaining = 0;

/**
 * Start Pomodoro timer
 */
async function startPomodoro() {
  const state = await loadState();
  const workMins = state.settings.pomodoroWork || 25;

  pomodoroTimeRemaining = workMins * 60; // Convert to seconds

  await updateState((s) => ({
    ...s,
    session: {
      ...s.session,
      phase: 'study',
      pomodoroStartedAt: Date.now(),
    },
  }));

  // Create alarm for pomodoro end
  chrome.alarms.create('pomodoro-end', { delayInMinutes: workMins });

  // Create alarm for tick updates
  chrome.alarms.create('pomodoro-tick', { periodInMinutes: 1 / 60 }); // Every second

  console.log(`Pomodoro started: ${workMins} minutes`);
}

/**
 * Handle pomodoro completion
 */
async function handlePomodoroEnd() {
  const state = await loadState();
  const isWorkPhase = state.session.phase === 'study';

  chrome.alarms.clear('pomodoro-tick');

  if (isWorkPhase) {
    // Work phase ended, start break
    const breakMins = state.settings.pomodoroBreak || 5;

    await updateState((s) => ({
      ...s,
      session: {
        ...s.session,
        phase: 'break',
        pomodoroStartedAt: Date.now(),
      },
    }));

    // Show Viola popup for break
    showViolaPopup('breakTime');

    // Schedule break end
    chrome.alarms.create('pomodoro-end', { delayInMinutes: breakMins });
    chrome.alarms.create('pomodoro-tick', { periodInMinutes: 1 / 60 });

    // Switch to break playlist if enabled
    if (state.settings.autoSwitchOnBreak && state.settings.breakPlaylistUrl) {
      // Could navigate to break playlist here
      console.log('Break time - would switch to break playlist');
    }

    console.log(`Break started: ${breakMins} minutes`);
  } else {
    // Break ended, back to work
    const workMins = state.settings.pomodoroWork || 25;

    await updateState((s) => ({
      ...s,
      session: {
        ...s.session,
        phase: 'study',
        pomodoroStartedAt: Date.now(),
      },
    }));

    // Show Viola popup to get back to work
    showViolaPopup('backToWork');

    // Schedule work end
    chrome.alarms.create('pomodoro-end', { delayInMinutes: workMins });
    chrome.alarms.create('pomodoro-tick', { periodInMinutes: 1 / 60 });

    console.log(`Work session started: ${workMins} minutes`);
  }
}

/**
 * Stop Pomodoro timer
 */
function stopPomodoro() {
  chrome.alarms.clear('pomodoro-end');
  chrome.alarms.clear('pomodoro-tick');
  pomodoroTimeRemaining = 0;
}

/**
 * Get remaining Pomodoro time
 */
async function getPomodoroStatus() {
  const state = await loadState();
  if (!state.session.pomodoroStartedAt) {
    return { active: false };
  }

  const elapsed = (Date.now() - state.session.pomodoroStartedAt) / 1000;
  const duration = state.session.phase === 'study'
    ? (state.settings.pomodoroWork || 25) * 60
    : (state.settings.pomodoroBreak || 5) * 60;

  const remaining = Math.max(0, duration - elapsed);

  return {
    active: true,
    phase: state.session.phase,
    remaining: Math.floor(remaining),
    total: duration,
  };
}

// ============================================================
// Activity Report Handling (from content script)
// ============================================================

/**
 * Handle activity report from content script (activity_tracker.js)
 * Updates signals with mouse, keyboard, scroll activity
 */
async function handleActivityReport(message) {
  const now = Date.now();
  const state = await loadState();

  if (!state.session.active) return;

  const { hostname, signals } = message;

  // Update activity timestamps
  if (signals.msSinceMouseMove !== undefined) {
    state.signals.lastMouseMove = now - signals.msSinceMouseMove;
  }
  if (signals.msSinceKeyPress !== undefined) {
    state.signals.lastKeyPress = now - signals.msSinceKeyPress;
  }
  if (signals.msSinceScroll !== undefined) {
    state.signals.lastScroll = now - signals.msSinceScroll;
  }

  // Update activity flags
  state.signals.isIdle = signals.isIdle || false;
  state.signals.isActivelyTyping = signals.isActivelyTyping || false;
  state.signals.keyPressCount = signals.keyPressCount || 0;
  state.signals.scrollCount = signals.scrollCount || 0;

  // Detect doomscrolling (scrolling on a bad site)
  const isBadSite = ['socialMedia', 'entertainment', 'games', 'blocked'].includes(state.signals.currentCategory);
  state.signals.isDoomscrolling = isBadSite && signals.isScrolling;

  // Update site category if hostname changed
  if (hostname && hostname !== state.signals.currentSite) {
    state.signals.currentSite = hostname;
    state.signals.currentCategory = categorizeSite(hostname, state.settings);
  }

  await saveState(state);
}

// ============================================================
// Vision Signal Handling
// ============================================================

/**
 * Handle vision signal from camera.html
 * Updates focus score based on face presence and gaze direction
 */
async function handleVisionSignal(message) {
  const state = await loadState();
  if (!state.session.active) return;

  lastVisionSignal = message;
  visionEnabled = true;

  // Track face missing time
  if (!message.facePresent) {
    faceMissingMs = message.faceMissingMs || (faceMissingMs + 250);
  } else {
    faceMissingMs = 0;
  }

  // Track looking away time
  if (message.lookingAway) {
    lookingAwayMs = message.lookingAwayMs || (lookingAwayMs + 250);
  } else {
    lookingAwayMs = 0;
  }

  // Store in state for focus scoring
  state.signals.visionEnabled = true;
  state.signals.facePresent = message.facePresent;
  state.signals.lookingAway = message.lookingAway;
  state.signals.visionAttentionScore = message.attentionScore;
  state.signals.faceMissingMs = faceMissingMs;
  state.signals.lookingAwayMs = lookingAwayMs;

  await saveState(state);

  // Trigger alarm if face has been away too long
  const now = Date.now();
  if (!message.facePresent && faceMissingMs >= FACE_AWAY_ALARM_THRESHOLD_MS) {
    const timeSinceLastAlarm = now - lastFaceAwayAlarm;
    if (timeSinceLastAlarm > FACE_AWAY_ALARM_COOLDOWN_MS) {
      console.log('[Vision] Face away alarm triggered!');
      lastFaceAwayAlarm = now;
      await playAlarm('PLAY_CHIME'); // Gentle chime first

      // If still away after another 10s, escalate
      if (faceMissingMs >= FACE_AWAY_ALARM_THRESHOLD_MS * 2) {
        await playAlarm('PLAY_ALARM');
        await showViolaPopup('stillDistracted', "Hey! I can't see you. Are you still there?", state.metrics.focusScore);
      }
    }
  }

  console.log('[Vision] Face:', message.facePresent, 'Away:', faceMissingMs + 'ms', 'Attention:', Math.round(message.attentionScore * 100) + '%');
}

// ============================================================
// Offscreen Document Management (for audio playback)
// ============================================================

/**
 * Ensure offscreen document is created for audio playback
 */
async function ensureOffscreen() {
  if (offscreenCreated) return true;

  try {
    // Check if already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) {
      offscreenCreated = true;
      return true;
    }

    // Create new offscreen document
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play alarm sounds for focus interventions'
    });

    offscreenCreated = true;
    console.log('[FocusDJ] Offscreen document created');
    return true;
  } catch (err) {
    console.error('[FocusDJ] Failed to create offscreen document:', err);
    return false;
  }
}

/**
 * Play an alarm sound via offscreen document
 */
async function playAlarm(type = 'PLAY_ALARM') {
  const ready = await ensureOffscreen();
  if (!ready) return;

  try {
    await chrome.runtime.sendMessage({ type });
    console.log('[FocusDJ] Alarm played:', type);
  } catch (err) {
    console.error('[FocusDJ] Failed to play alarm:', err);
  }
}

// ============================================================
// Doomscroll Detection
// ============================================================

/**
 * Check if current URL is a doomscroll site
 */
function isDoomscrollUrl(url) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname;
    const fullPath = hostname + new URL(url).pathname;

    return DEFAULT_DOOMSCROLL_SITES.some(site => {
      if (site.includes('/')) {
        return fullPath.includes(site);
      }
      return hostname.includes(site);
    });
  } catch {
    return false;
  }
}

/**
 * Update doomscroll detection timer
 * Called every tick
 */
async function updateDoomscrollDetection(state) {
  const now = Date.now();

  // Check if on a doomscroll site
  const currentUrl = currentTabUrl || '';
  const isDoomscrolling = isDoomscrollUrl(currentUrl);

  if (isDoomscrolling) {
    // Increment doomscroll timer (roughly 10 seconds per tick)
    doomscrollSeconds += TICK_INTERVAL_MS / 1000;

    console.log(`[Doomscroll] On ${new URL(currentUrl).hostname} for ${doomscrollSeconds}s`);

    // Check if we should trigger alarm
    if (doomscrollSeconds >= DOOMSCROLL_THRESHOLD_SECONDS) {
      const timeSinceLastAlarm = now - lastDoomscrollAlarm;

      if (timeSinceLastAlarm > DOOMSCROLL_ALARM_COOLDOWN) {
        // Trigger alarm!
        console.log('[Doomscroll] Threshold exceeded! Triggering alarm');
        lastDoomscrollAlarm = now;

        // Play alarm sound
        await playAlarm('PLAY_ALARM');

        // Also show Viola popup
        await showViolaPopup('doomscrolling', null, state.metrics.focusScore);

        // If nuclear mode is enabled and this is a repeat offense, escalate
        if (state.settings.nuclearEnabled && doomscrollSeconds > DOOMSCROLL_THRESHOLD_SECONDS * 2) {
          console.log('[Doomscroll] Nuclear escalation!');
          await playAlarm('PLAY_NUCLEAR');
        }

        // Reset timer after alarm (will start accumulating again if they stay)
        doomscrollSeconds = DOOMSCROLL_THRESHOLD_SECONDS; // Keep high so next alarm is faster
      }
    }
  } else {
    // Decay doomscroll timer when on good sites
    doomscrollSeconds = Math.max(0, doomscrollSeconds - (TICK_INTERVAL_MS / 1000) * 2);
  }

  return isDoomscrolling;
}

// ============================================================
// Track Monitoring for Music Intelligence
// ============================================================

/**
 * Monitor track changes and record for BPM-focus correlation learning
 */
async function monitorTrackChange(state) {
  const playback = await getPlaybackInfo();
  if (!playback?.available || !playback.isPlaying) return;

  const trackId = `${playback.track}_${playback.artist}`;

  // New track detected
  if (trackId !== lastKnownTrackId && playback.track) {
    // End previous track recording
    if (currentTrackHandler) {
      try {
        await currentTrackHandler(state.metrics.focusScore, false);
      } catch (err) {
        console.warn('[Track Monitor] Failed to end previous track:', err);
      }
    }

    // Start new track recording
    try {
      currentTrackHandler = await recordTrackPlay(
        { title: playback.track, artist: playback.artist, thumbnail: playback.thumbnail },
        state.metrics.focusScore,
        state.session.mode
      );
      lastKnownTrackId = trackId;
      console.log('[Track Monitor] Now tracking:', playback.track, 'by', playback.artist);
    } catch (err) {
      console.warn('[Track Monitor] Failed to start track recording:', err);
      currentTrackHandler = null;
    }
  }
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

  // Monitor track changes for music intelligence (BPM-focus correlation)
  if (musicAvailable && state.settings.aiRecommendationsEnabled !== false) {
    await monitorTrackChange(state);
  }

  // Update doomscroll detection (triggers alarms if threshold exceeded)
  await updateDoomscrollDetection(state);

  // Update site time for current site
  if (state.signals.currentSite) {
    const hostname = state.signals.currentSite;
    state.signals.siteTime = state.signals.siteTime || {};
    if (state.signals.siteTime[hostname]?.lastStart) {
      const elapsed = now - state.signals.siteTime[hostname].lastStart;
      state.signals.siteTime[hostname].totalMs += elapsed;
      state.signals.siteTime[hostname].lastStart = now; // Reset for next tick
    }
  }

  // Compute focus score using multi-signal model
  const focusResult = computeFocusScore(state.signals, state.settings, state.session.mode);
  const focusScore = focusResult.score;
  const focusTrend = updateEMA(state.metrics.focusTrend, focusScore);

  // Add to history for trend calculation
  state.history.push({ timestamp: now, score: focusScore });
  if (state.history.length > HISTORY_MAX_ENTRIES) {
    state.history = state.history.slice(-HISTORY_MAX_ENTRIES);
  }

  const trendDelta = computeTrendDelta(state.history, now);

  // Update metrics with debug info from focus model
  state.metrics = {
    focusScore,
    focusTrend,
    trendDelta,
    penalties: focusResult.penalties,
    bonuses: focusResult.bonuses,
    debug: focusResult.debug,
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
  // Skip intervention if alarm was just triggered (avoid double-action)
  const recentAlarm = (now - lastDoomscrollAlarm < 10000) || (now - lastFaceAwayAlarm < 10000);

  if (musicAvailable && !recentAlarm) {
    const interventionCheck = shouldIntervene(state, now);

    if (interventionCheck.should) {
      // Use the doomscrolling detection from activity tracker
      const isDoomscrolling = state.signals.isDoomscrolling ||
        ['socialMedia', 'entertainment', 'games', 'blocked'].includes(state.signals.currentCategory);
      const interventionType = selectIntervention(state, isDoomscrolling);

      console.log(`Intervening: ${interventionType} (reason: ${interventionCheck.reason})`);

      // Handle Viola popup specially
      if (interventionType === 'VIOLA_POPUP') {
        await showViolaPopup('stillDistracted', null, focusScore);
      }

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
    // Additional info for enhanced UI
    currentSite: state.signals.currentSite,
    currentCategory: state.signals.currentCategory,
    isActivelyTyping: state.signals.isActivelyTyping,
    isDoomscrolling: state.signals.isDoomscrolling,
    penalties: focusResult.penalties,
    bonuses: focusResult.bonuses,
  }).catch(() => {});

  await saveState(state);
}

// ============================================================
// Settings Sync (from FocusDJ web dashboard)
// ============================================================

/**
 * Handle settings sync from the FocusDJ web dashboard
 * Maps web app settings to extension state
 */
async function handleSettingsSync(webSettings) {
  console.log('Syncing settings from web dashboard:', webSettings);

  await updateState((state) => ({
    ...state,
    session: {
      ...state.session,
      mode: webSettings.mode || state.session.mode,
    },
    settings: {
      ...state.settings,
      // Music settings
      focusPlaylistUrl: webSettings.focusPlaylistUrl || '',
      breakPlaylistUrl: webSettings.breakPlaylistUrl || '',
      energy: webSettings.energy ?? 50,

      // Study settings
      pomodoroEnabled: webSettings.pomodoroEnabled ?? false,
      pomodoroWork: webSettings.pomodoroWork ?? 25,
      pomodoroBreak: webSettings.pomodoroBreak ?? 5,
      autoSwitchOnBreak: webSettings.autoSwitchOnBreak ?? true,

      // Tracking settings
      trackingEnabled: webSettings.trackingEnabled ?? true,
      trackCamera: webSettings.trackCamera ?? false,
      trackKeystroke: webSettings.trackKeystroke ?? true,
      trackMouse: webSettings.trackMouse ?? true,
      trackScroll: webSettings.trackScroll ?? true,
      trackTabs: webSettings.trackTabs ?? true,

      // Extension settings
      nuclearEnabled: webSettings.nuclearEnabled ?? false,
      customProductive: webSettings.customProductive || [],
      customBlocked: webSettings.customBlocked || [],
    },
  }));

  console.log('Settings synced successfully');
}

// ============================================================
// Session control
// ============================================================

/**
 * Start a study session
 */
async function startSession(mode = 'normal') {
  const now = Date.now();
  await updateState((state) => ({
    ...state,
    session: {
      active: true,
      mode,
      phase: 'study',
      startedAt: now,
    },
    signals: {
      // Tab tracking
      tabSwitches: [],
      currentSite: null,
      currentCategory: null,
      siteTime: {},

      // Activity signals (from content script)
      lastMouseMove: now,
      lastKeyPress: now,
      lastScroll: now,
      keyPressCount: 0,
      scrollCount: 0,
      isIdle: false,
      isActivelyTyping: false,
      isDoomscrolling: false,
    },
    metrics: {
      focusScore: 100,
      focusTrend: 100,
      trendDelta: 0,
      penalties: [],
      bonuses: [],
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

      case 'ACTIVITY_REPORT':
        // Handle activity report from content script
        await handleActivityReport(message);
        sendResponse({ success: true });
        break;

      case 'VISION_SIGNAL':
        // Handle vision signal from camera.html
        await handleVisionSignal(message);
        sendResponse({ success: true });
        break;

      case 'CAMERA_STARTED':
        visionEnabled = true;
        console.log('[FocusDJ] Camera detection started');
        sendResponse({ success: true });
        break;

      case 'CAMERA_STOPPED':
        visionEnabled = false;
        faceMissingMs = 0;
        lookingAwayMs = 0;
        console.log('[FocusDJ] Camera detection stopped');
        sendResponse({ success: true });
        break;

      case 'SYNC_SETTINGS':
        // Handle settings sync from web app (FocusDJ dashboard)
        await handleSettingsSync(message.settings);
        sendResponse({ success: true });
        break;

      case 'START_POMODORO':
        await startPomodoro();
        sendResponse({ success: true });
        break;

      case 'STOP_POMODORO':
        stopPomodoro();
        sendResponse({ success: true });
        break;

      case 'GET_POMODORO_STATUS':
        const pomodoroStatus = await getPomodoroStatus();
        sendResponse(pomodoroStatus);
        break;

      case 'VIOLA_ACTION':
        // User clicked action button on Viola popup
        console.log('Viola action:', message.action);
        if (message.action === 'refocus') {
          // Could restore volume, change music, etc.
          await hideViolaPopup();
        }
        sendResponse({ success: true });
        break;

      case 'FIND_PRODUCTIVE_TAB':
        // Try to find and switch to a productive tab
        const productiveTabs = await chrome.tabs.query({});
        const currentSettings = (await loadState()).settings;
        for (const tab of productiveTabs) {
          if (tab.url) {
            const hostname = new URL(tab.url).hostname;
            const category = categorizeSite(hostname, currentSettings);
            if (category === 'productive') {
              await chrome.tabs.update(tab.id, { active: true });
              sendResponse({ success: true, tab: tab.url });
              return;
            }
          }
        }
        sendResponse({ success: false, error: 'No productive tab found' });
        break;

      // ============================================
      // Music Intelligence / Recommendations
      // ============================================

      case 'GET_RECOMMENDATIONS':
        try {
          const recommendations = await getRecommendations(message.count || 10);
          sendResponse({ success: true, recommendations });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'GET_MUSIC_PROFILE':
        try {
          const profile = await buildUserProfile();
          sendResponse({ success: true, profile });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'GET_CONTEXTUAL_RECOMMENDATION':
        try {
          const currentState = await loadState();
          const playbackInfo = await getPlaybackInfo();
          const recommendation = await getContextualRecommendation(
            currentState.metrics.focusScore,
            playbackInfo?.track ? { title: playbackInfo.track, artist: playbackInfo.artist } : null
          );
          sendResponse({ success: true, recommendation });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'GET_MUSIC_INTELLIGENCE':
        try {
          const intelligence = await getMusicIntelligence();
          sendResponse({ success: true, intelligence });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'CLEAR_MUSIC_INTELLIGENCE':
        try {
          await clearMusicIntelligence();
          await clearRecommendationData();
          currentTrackHandler = null;
          lastKnownTrackId = null;
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'SAVE_API_KEY':
        try {
          await setApiKey(message.keyType, message.value);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'GET_API_KEY':
        try {
          const key = await getApiKey(message.keyType);
          sendResponse({ success: true, hasKey: !!key });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;

      case 'TEST_SMART_RECOMMEND':
        // Manual test trigger for smart music recommendation
        try {
          console.log('[Test] Triggering smart recommendation manually');
          const musicAvailable = await isYTMusicAvailable();
          if (!musicAvailable) {
            sendResponse({ success: false, error: 'YouTube Music tab not open' });
            break;
          }

          const result = await applyIntervention('SMART_RECOMMEND');
          console.log('[Test] Smart recommend result:', result);
          sendResponse({
            success: result?.success || false,
            result,
          });
        } catch (err) {
          console.error('[Test] Smart recommend error:', err);
          sendResponse({ success: false, error: err.message });
        }
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

// External message handling (from FocusDJ web dashboard)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('External message from:', sender.origin, message);

  (async () => {
    switch (message.type) {
      case 'SYNC_SETTINGS':
        await handleSettingsSync(message.settings);
        sendResponse({ success: true, message: 'Settings synced' });
        break;

      case 'GET_STATE':
        const state = await loadState();
        sendResponse({ success: true, state });
        break;

      case 'PING':
        sendResponse({ success: true, version: '0.1.0' });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();
  return true; // Keep channel open
});

// Tab events
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onUpdated.addListener(onTabUpdated);

// Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case 'focus-tick':
      tick();
      break;
    case 'pomodoro-end':
      handlePomodoroEnd();
      break;
    case 'pomodoro-tick':
      // Broadcast time update to popup
      (async () => {
        const status = await getPomodoroStatus();
        chrome.runtime.sendMessage({
          type: 'POMODORO_TICK',
          ...status,
        }).catch(() => {});
      })();
      break;
  }
});

// Extension installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('FocusDJ installed/updated');
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

console.log('FocusDJ service worker loaded');
