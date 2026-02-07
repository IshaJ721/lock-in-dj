// Popup UI controller

import { startAuthFlow, isAuthenticated } from '../background/spotify/auth.js';
import { getPlaybackInfo } from '../background/spotify/player.js';

// ============================================================
// DOM Elements
// ============================================================

const $ = (id) => document.getElementById(id);

const elements = {
  // Spotify
  spotifyDisconnected: $('spotify-disconnected'),
  spotifyConnected: $('spotify-connected'),
  connectSpotify: $('connect-spotify'),
  albumArt: $('album-art'),
  trackName: $('track-name'),
  artistName: $('artist-name'),

  // Focus
  focusScore: $('focus-score'),
  focusRing: $('focus-ring'),
  focusStatus: $('focus-status'),
  focusTrend: $('focus-trend'),

  // Session
  sessionInactive: $('session-inactive'),
  sessionActive: $('session-active'),
  startSession: $('start-session'),
  stopSession: $('stop-session'),
  sessionMode: $('session-mode'),
  sessionTime: $('session-time'),
  modeBtns: document.querySelectorAll('.mode-btn'),

  // Intervention
  interventionSection: $('intervention-section'),
  lastIntervention: $('last-intervention'),

  // Footer
  openOptions: $('open-options'),
  toggleNuclear: $('toggle-nuclear'),
  nuclearStatus: $('nuclear-status'),
};

// ============================================================
// State
// ============================================================

let selectedMode = 'normal';
let sessionStartTime = null;
let updateInterval = null;

// ============================================================
// Spotify
// ============================================================

async function checkSpotifyConnection() {
  const authenticated = await isAuthenticated();

  if (authenticated) {
    elements.spotifyDisconnected.classList.add('hidden');
    elements.spotifyConnected.classList.remove('hidden');
    updateNowPlaying();
  } else {
    elements.spotifyDisconnected.classList.remove('hidden');
    elements.spotifyConnected.classList.add('hidden');
  }
}

async function updateNowPlaying() {
  try {
    const playback = await getPlaybackInfo();
    if (playback) {
      elements.trackName.textContent = playback.track || 'Not playing';
      elements.artistName.textContent = playback.artist || '';
      if (playback.albumArt) {
        elements.albumArt.src = playback.albumArt;
        elements.albumArt.style.display = 'block';
      }
    } else {
      elements.trackName.textContent = 'Not playing';
      elements.artistName.textContent = '';
      elements.albumArt.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to get playback:', err);
  }
}

elements.connectSpotify.addEventListener('click', async () => {
  try {
    elements.connectSpotify.disabled = true;
    elements.connectSpotify.textContent = 'Connecting...';
    await startAuthFlow();
    await checkSpotifyConnection();
  } catch (err) {
    console.error('Spotify auth failed:', err);
    alert('Failed to connect to Spotify: ' + err.message);
  } finally {
    elements.connectSpotify.disabled = false;
    elements.connectSpotify.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
      Connect Spotify
    `;
  }
});

// ============================================================
// Focus Display
// ============================================================

function updateFocusDisplay(score, trend, trendDelta) {
  // Update score text
  elements.focusScore.textContent = score;

  // Update ring (circumference = 2 * PI * 45 ≈ 283)
  const circumference = 283;
  const offset = circumference - (score / 100) * circumference;
  elements.focusRing.style.strokeDashoffset = offset;

  // Color based on score
  let color;
  if (score >= 70) {
    color = '#10b981'; // green
  } else if (score >= 50) {
    color = '#f59e0b'; // amber
  } else {
    color = '#ef4444'; // red
  }
  elements.focusRing.style.stroke = color;

  // Status text
  if (score >= 80) {
    elements.focusStatus.textContent = 'Locked in!';
  } else if (score >= 60) {
    elements.focusStatus.textContent = 'Focused';
  } else if (score >= 40) {
    elements.focusStatus.textContent = 'Distracted';
  } else {
    elements.focusStatus.textContent = 'Unfocused';
  }

  // Trend indicator
  if (trendDelta > 5) {
    elements.focusTrend.textContent = '↑';
    elements.focusTrend.className = 'trend trend-up';
  } else if (trendDelta < -5) {
    elements.focusTrend.textContent = '↓';
    elements.focusTrend.className = 'trend trend-down';
  } else {
    elements.focusTrend.textContent = '→';
    elements.focusTrend.className = 'trend trend-stable';
  }
}

// ============================================================
// Session Controls
// ============================================================

// Mode selection
elements.modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    elements.modeBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// Start session
elements.startSession.addEventListener('click', async () => {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    alert('Please connect Spotify first');
    return;
  }

  await chrome.runtime.sendMessage({ type: 'START_SESSION', mode: selectedMode });
  sessionStartTime = Date.now();
  showActiveSession();
});

// Stop session
elements.stopSession.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
  showInactiveSession();
});

function showActiveSession() {
  elements.sessionInactive.classList.add('hidden');
  elements.sessionActive.classList.remove('hidden');
  elements.sessionMode.textContent = selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1);

  // Start timer update
  updateInterval = setInterval(updateSessionTime, 1000);
}

function showInactiveSession() {
  elements.sessionInactive.classList.remove('hidden');
  elements.sessionActive.classList.add('hidden');
  elements.focusScore.textContent = '--';
  elements.focusStatus.textContent = 'Not active';
  elements.focusTrend.textContent = '';

  // Reset ring
  elements.focusRing.style.strokeDashoffset = 283;
  elements.focusRing.style.stroke = '#374151';

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

function updateSessionTime() {
  if (!sessionStartTime) return;
  const elapsed = Date.now() - sessionStartTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  elements.sessionTime.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================
// Footer
// ============================================================

elements.openOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

elements.toggleNuclear.addEventListener('click', async () => {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const newValue = !state.settings.nuclearEnabled;

  await chrome.storage.local.get('state').then(async (result) => {
    const s = result.state;
    s.settings.nuclearEnabled = newValue;
    await chrome.storage.local.set({ state: s });
  });

  elements.nuclearStatus.textContent = `Nuclear: ${newValue ? 'On' : 'Off'}`;
});

// ============================================================
// Message handling
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    updateFocusDisplay(message.focusScore, message.focusTrend, message.trendDelta);
  }

  if (message.type === 'INTERVENTION_APPLIED') {
    elements.interventionSection.classList.remove('hidden');
    elements.lastIntervention.textContent = message.description;
    setTimeout(() => {
      elements.interventionSection.classList.add('hidden');
    }, 5000);
  }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  await checkSpotifyConnection();

  // Get current state
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

  // Update nuclear toggle
  elements.nuclearStatus.textContent = `Nuclear: ${state.settings.nuclearEnabled ? 'On' : 'Off'}`;

  // Restore session if active
  if (state.session.active) {
    selectedMode = state.session.mode;
    sessionStartTime = state.session.startedAt;

    // Update mode buttons
    elements.modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === selectedMode);
    });

    showActiveSession();
    updateFocusDisplay(state.metrics.focusScore, state.metrics.focusTrend, state.metrics.trendDelta);
  }

  // Periodic updates
  setInterval(async () => {
    if (state.session.active) {
      await chrome.runtime.sendMessage({ type: 'TICK' });
    }
    await updateNowPlaying();
  }, 5000);
}

init();
