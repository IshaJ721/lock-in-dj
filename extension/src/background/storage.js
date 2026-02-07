// Storage wrapper for chrome.storage.local

const DEFAULT_STATE = {
  // Session state
  session: {
    active: false,
    mode: 'normal', // 'gentle' | 'normal' | 'strict'
    phase: 'study', // 'study' | 'break'
    startedAt: null,
  },

  // Rolling signals (last 60s window)
  signals: {
    tabSwitches: [],      // timestamps of tab switches
    offTaskTime: [],      // { start, end } intervals on doomscroll sites
    activeTime: 0,        // ms active in current window
    lastActivity: null,   // timestamp of last activity
  },

  // Computed metrics
  metrics: {
    focusScore: 100,
    focusTrend: 100,      // EMA
    trendDelta: 0,        // change over last 30s
  },

  // Last intervention for feedback loop
  lastIntervention: null, // { type, appliedAt, preScore }

  // Bandit policy (what works for this user)
  policy: {
    arms: {
      BOOST_ENERGY: { value: 0.5, n: 1 },
      SWITCH_PLAYLIST: { value: 0.5, n: 1 },
      PATTERN_BREAK: { value: 0.5, n: 1 },
      NUCLEAR: { value: 0.2, n: 1 },
    },
  },

  // User settings
  settings: {
    studySites: ['docs.google.com', 'notion.so', 'overleaf.com', 'github.com', 'stackoverflow.com'],
    doomscrollSites: ['twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'reddit.com', 'youtube.com'],
    nuclearEnabled: false,
    pomodoroEnabled: false,
    pomodoroWork: 25,     // minutes
    pomodoroBreak: 5,
  },

  // Spotify
  spotify: {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    playlists: {
      lockIn: null,       // high energy focus
      deepFocus: null,    // calm focus
      patternBreak: null, // short interrupt track
      annoying: null,     // nuclear option
    },
  },

  // History for dashboard
  history: [],
};

export async function loadState() {
  const result = await chrome.storage.local.get('state');
  if (!result.state) {
    await chrome.storage.local.set({ state: DEFAULT_STATE });
    return structuredClone(DEFAULT_STATE);
  }
  return result.state;
}

export async function saveState(state) {
  await chrome.storage.local.set({ state });
}

export async function updateState(updater) {
  const state = await loadState();
  const newState = updater(state);
  await saveState(newState);
  return newState;
}

export async function resetState() {
  await chrome.storage.local.set({ state: DEFAULT_STATE });
  return structuredClone(DEFAULT_STATE);
}

// Convenience: get just settings
export async function getSettings() {
  const state = await loadState();
  return state.settings;
}

// Convenience: get just spotify tokens
export async function getSpotifyTokens() {
  const state = await loadState();
  return state.spotify;
}

export async function setSpotifyTokens(tokens) {
  await updateState((s) => ({
    ...s,
    spotify: { ...s.spotify, ...tokens },
  }));
}
