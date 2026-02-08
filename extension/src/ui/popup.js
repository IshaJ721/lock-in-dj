// Popup UI controller - YouTube Music version

// ============================================================
// DOM Elements
// ============================================================

const $ = (id) => document.getElementById(id);

const elements = {
  // Music
  musicDisconnected: $('music-disconnected'),
  musicConnected: $('music-connected'),
  openYTMusic: $('open-ytmusic'),
  albumArt: $('album-art'),
  trackName: $('track-name'),
  artistName: $('artist-name'),
  prevBtn: $('prev-btn'),
  playPauseBtn: $('play-pause-btn'),
  nextBtn: $('next-btn'),

  // Focus
  focusScore: $('focus-score'),
  focusRing: $('focus-ring'),
  focusStatus: $('focus-status'),
  focusTrend: $('focus-trend'),
  focusDetails: $('focus-details'),
  currentSite: $('current-site'),
  penaltyList: $('penalty-list'),

  // Session
  sessionInactive: $('session-inactive'),
  sessionActive: $('session-active'),
  startSession: $('start-session'),
  stopSession: $('stop-session'),
  sessionMode: $('session-mode'),
  sessionTime: $('session-time'),
  modeBtns: document.querySelectorAll('.mode-btn'),

  // Pomodoro
  pomodoroSection: $('pomodoro-section'),
  pomodoroPhase: $('pomodoro-phase'),
  pomodoroTime: $('pomodoro-time'),
  pomodoroToggle: $('pomodoro-toggle'),

  // Intervention
  interventionSection: $('intervention-section'),
  lastIntervention: $('last-intervention'),

  // Footer
  openDashboard: $('open-dashboard'),
  openCamera: $('open-camera'),
  cameraStatus: $('camera-status'),
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
// YouTube Music
// ============================================================

async function checkMusicConnection() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

  if (state.musicAvailable) {
    elements.musicDisconnected.classList.add('hidden');
    elements.musicConnected.classList.remove('hidden');
    updateNowPlaying();
  } else {
    elements.musicDisconnected.classList.remove('hidden');
    elements.musicConnected.classList.add('hidden');
  }
}

async function updateNowPlaying() {
  try {
    const playback = await chrome.runtime.sendMessage({ type: 'GET_PLAYBACK' });
    if (playback && playback.available) {
      elements.trackName.textContent = playback.track || 'Not playing';
      elements.artistName.textContent = playback.artist || '';
      if (playback.thumbnail) {
        elements.albumArt.src = playback.thumbnail;
        elements.albumArt.style.display = 'block';
      } else {
        elements.albumArt.style.display = 'none';
      }
      elements.playPauseBtn.textContent = playback.isPlaying ? '⏸' : '▶';
    } else {
      elements.trackName.textContent = 'Not playing';
      elements.artistName.textContent = '';
      elements.albumArt.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to get playback:', err);
  }
}

// Open YouTube Music
elements.openYTMusic.addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'https://music.youtube.com/' });
  // Check again after a delay
  setTimeout(checkMusicConnection, 2000);
});

// Playback controls
elements.prevBtn?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  if (tabs[0]) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'PREVIOUS' });
    setTimeout(updateNowPlaying, 500);
  }
});

elements.playPauseBtn?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  if (tabs[0]) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'TOGGLE' });
    setTimeout(updateNowPlaying, 300);
  }
});

elements.nextBtn?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  if (tabs[0]) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'NEXT' });
    setTimeout(updateNowPlaying, 500);
  }
});

// ============================================================
// Focus Display
// ============================================================

function updateFocusDisplay(score, trend, trendDelta, details = {}) {
  // Update score text
  elements.focusScore.textContent = score;

  // Update ring (circumference = 2 * PI * 45 ≈ 283)
  const circumference = 283;
  const offset = circumference - (score / 100) * circumference;
  elements.focusRing.style.strokeDashoffset = offset;

  // Color based on score - pink/purple theme
  let color;
  if (score >= 70) {
    color = '#ff6b9d'; // pink - focused
  } else if (score >= 50) {
    color = '#a855f7'; // purple - moderate
  } else {
    color = '#ef4444'; // red - unfocused
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

  // Show details (current site + penalties)
  if (details.currentSite || details.penalties?.length) {
    elements.focusDetails.classList.remove('hidden');

    // Current site with category
    if (details.currentSite) {
      const categoryColors = {
        productive: '#ff6b9d',  // pink
        socialMedia: '#ef4444',
        entertainment: '#a855f7', // purple
        games: '#ef4444',
        shopping: '#a855f7',
        news: '#6b7280',
        blocked: '#dc2626',
        neutral: '#6b7280',
      };
      const categoryLabels = {
        productive: 'Productive',
        socialMedia: 'Social Media',
        entertainment: 'Entertainment',
        games: 'Games',
        shopping: 'Shopping',
        news: 'News',
        blocked: 'Blocked',
        neutral: 'Neutral',
      };
      const cat = details.currentCategory || 'neutral';
      const color = categoryColors[cat] || '#6b7280';
      const label = categoryLabels[cat] || 'Unknown';
      elements.currentSite.innerHTML = `<span style="color: ${color}">${label}</span>: ${details.currentSite}`;
    } else {
      elements.currentSite.textContent = '';
    }

    // Penalties/bonuses
    const items = [];
    if (details.penalties) {
      details.penalties.forEach((p) => {
        items.push(`<span class="penalty">-${Math.round(p.value)} ${formatPenaltyType(p.type)}</span>`);
      });
    }
    if (details.bonuses) {
      details.bonuses.forEach((b) => {
        items.push(`<span class="bonus">+${Math.round(b.value)} ${formatBonusType(b.type)}</span>`);
      });
    }
    elements.penaltyList.innerHTML = items.join(' ');
  } else {
    elements.focusDetails.classList.add('hidden');
  }
}

function formatPenaltyType(type) {
  switch (type) {
    case 'tabSwitch': return 'tab switching';
    case 'badSite': return 'unproductive site';
    case 'idle': return 'idle';
    case 'doomscroll': return 'doomscrolling';
    case 'prolongedBadSite': return 'time wasting';
    case 'faceAway': return 'away from screen';
    case 'lookingAway': return 'looking away';
    default: return type;
  }
}

function formatBonusType(type) {
  switch (type) {
    case 'goodSite': return 'productive';
    case 'typing': return 'active typing';
    case 'visuallyFocused': return 'visually focused';
    default: return type;
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
// Pomodoro Controls
// ============================================================

let pomodoroActive = false;

elements.pomodoroToggle?.addEventListener('click', async () => {
  if (pomodoroActive) {
    await chrome.runtime.sendMessage({ type: 'STOP_POMODORO' });
    pomodoroActive = false;
    elements.pomodoroToggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;
  } else {
    await chrome.runtime.sendMessage({ type: 'START_POMODORO' });
    pomodoroActive = true;
    elements.pomodoroToggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;
  }
});

function updatePomodoroDisplay(status) {
  if (!status || !status.active) {
    elements.pomodoroSection?.classList.add('hidden');
    return;
  }

  elements.pomodoroSection?.classList.remove('hidden');

  const mins = Math.floor(status.remaining / 60);
  const secs = status.remaining % 60;
  elements.pomodoroTime.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  elements.pomodoroPhase.textContent = status.phase === 'study' ? 'Focus' : 'Break';
  elements.pomodoroPhase.className = `pomodoro-phase ${status.phase === 'break' ? 'break' : ''}`;

  pomodoroActive = true;
  elements.pomodoroToggle.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>
  `;
}

// ============================================================
// Dashboard
// ============================================================

elements.openDashboard.addEventListener('click', () => {
  // Open dashboard in a new tab for better experience
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
});

elements.openCamera?.addEventListener('click', () => {
  // Open camera detection page
  chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/camera.html') });
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
    updateFocusDisplay(message.focusScore, message.focusTrend, message.trendDelta, {
      currentSite: message.currentSite,
      currentCategory: message.currentCategory,
      penalties: message.penalties,
      bonuses: message.bonuses,
    });

    // Update music connection status
    if (message.musicAvailable) {
      elements.musicDisconnected.classList.add('hidden');
      elements.musicConnected.classList.remove('hidden');
    }
  }

  if (message.type === 'INTERVENTION_APPLIED') {
    elements.interventionSection.classList.remove('hidden');
    elements.lastIntervention.textContent = message.description;
    setTimeout(() => {
      elements.interventionSection.classList.add('hidden');
    }, 5000);
  }

  if (message.type === 'POMODORO_TICK') {
    updatePomodoroDisplay(message);
  }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  await checkMusicConnection();

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
    updateFocusDisplay(state.metrics.focusScore, state.metrics.focusTrend, state.metrics.trendDelta, {
      currentSite: state.signals?.currentSite,
      currentCategory: state.signals?.currentCategory,
      penalties: state.metrics?.penalties,
      bonuses: state.metrics?.bonuses,
    });

    // Check pomodoro status
    const pomodoroStatus = await chrome.runtime.sendMessage({ type: 'GET_POMODORO_STATUS' });
    if (pomodoroStatus?.active) {
      updatePomodoroDisplay(pomodoroStatus);
    } else if (state.settings?.pomodoroEnabled) {
      // Show pomodoro section but not active
      elements.pomodoroSection?.classList.remove('hidden');
    }
  }

  // Periodic updates
  setInterval(async () => {
    await checkMusicConnection();
    await updateNowPlaying();

    const currentState = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (currentState.session.active) {
      await chrome.runtime.sendMessage({ type: 'TICK' });
    }
  }, 5000);
}

init();
