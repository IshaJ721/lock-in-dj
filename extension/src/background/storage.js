// Storage wrapper for chrome.storage.local

// ============================================================
// Site Categories (like Apple Screen Time)
// ============================================================

export const SITE_CATEGORIES = {
  // Productive - gives bonus
  productive: [
    // Music (for focus)
    'music.youtube.com',
    // Docs & Notes
    'docs.google.com', 'notion.so', 'overleaf.com', 'quip.com', 'dropbox.paper.com',
    'evernote.com', 'onenote.com', 'bear.app', 'roamresearch.com', 'obsidian.md',
    // Code & Dev
    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
    'codepen.io', 'codesandbox.io', 'replit.com', 'jsfiddle.net', 'leetcode.com',
    'hackerrank.com', 'codewars.com', 'exercism.org',
    // Learning
    'canvas.instructure.com', 'blackboard.com', 'coursera.org', 'edx.org', 'udemy.com',
    'khanacademy.org', 'brilliant.org', 'duolingo.com', 'quizlet.com', 'chegg.com',
    // Research
    'scholar.google.com', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov', 'arxiv.org',
    'researchgate.net', 'academia.edu', 'wikipedia.org',
    // Work tools
    'slack.com', 'linear.app', 'asana.com', 'trello.com', 'monday.com', 'jira.atlassian.com',
    'figma.com', 'miro.com', 'lucidchart.com',
  ],

  // Social Media - heavy penalty
  socialMedia: [
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'threads.net',
    'snapchat.com', 'tiktok.com', 'linkedin.com', 'pinterest.com', 'tumblr.com',
    'reddit.com', 'discord.com', 'twitch.tv', 'bsky.app', 'mastodon.social',
  ],

  // Entertainment - heavy penalty
  entertainment: [
    'youtube.com', 'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com',
    'primevideo.com', 'peacocktv.com', 'crunchyroll.com', 'funimation.com',
    'twitch.tv', 'kick.com', 'rumble.com', 'dailymotion.com', 'vimeo.com',
    'spotify.com', 'soundcloud.com', 'pandora.com',
  ],

  // Games - heavy penalty
  games: [
    'roblox.com', 'minecraft.net', 'steampowered.com', 'epicgames.com',
    'ea.com', 'battle.net', 'origin.com', 'gog.com', 'itch.io',
    'poki.com', 'coolmathgames.com', 'kongregate.com', 'addictinggames.com',
    'crazygames.com', 'y8.com', 'miniclip.com', 'games.yahoo.com',
    'chess.com', 'lichess.org', 'poker', 'casino',
  ],

  // Shopping - moderate penalty
  shopping: [
    'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
    'etsy.com', 'aliexpress.com', 'wish.com', 'shein.com', 'asos.com',
    'zappos.com', 'nordstrom.com', 'macys.com', 'nike.com', 'adidas.com',
  ],

  // News - light penalty (can be productive but often isn't)
  news: [
    'cnn.com', 'foxnews.com', 'msnbc.com', 'bbc.com', 'nytimes.com',
    'washingtonpost.com', 'theguardian.com', 'reuters.com', 'apnews.com',
    'huffpost.com', 'buzzfeed.com', 'vice.com', 'vox.com', 'axios.com',
  ],
};

// ============================================================
// Default State
// ============================================================

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
    tabSwitches: [],           // timestamps of tab switches
    siteTime: {},              // { hostname: { category, totalMs, lastStart } }
    currentSite: null,         // current hostname
    currentCategory: null,     // current site category

    // Activity signals from content script
    lastMouseMove: null,
    lastKeyPress: null,
    lastScroll: null,
    keyPressCount: 0,
    scrollCount: 0,
    isIdle: false,
    isActivelyTyping: false,
    isDoomscrolling: false,    // scrolling on bad site

    // Vision signals from camera.html
    visionEnabled: false,      // is camera detection active
    facePresent: false,        // is face detected
    lookingAway: false,        // is user looking away
    visionAttentionScore: 0,   // 0-1 attention score from vision
    faceMissingMs: 0,          // time face has been missing
    lookingAwayMs: 0,          // time user has been looking away
  },

  // Computed metrics
  metrics: {
    focusScore: 100,
    focusTrend: 100,           // EMA
    trendDelta: 0,             // change over last 30s

    // Screen Time style breakdown
    productiveTime: 0,
    unproductiveTime: 0,
    neutralTime: 0,
  },

  // Last intervention for feedback loop
  lastIntervention: null,      // { type, appliedAt, preScore }

  // Bandit policy (what works for this user)
  policy: {
    arms: {
      BOOST_ENERGY: { value: 0.5, n: 1 },
      SWITCH_PLAYLIST: { value: 0.5, n: 1 },
      PATTERN_BREAK: { value: 0.5, n: 1 },
      SMART_RECOMMEND: { value: 0.6, n: 1 },  // AI-powered recommendation
      NUCLEAR: { value: 0.2, n: 1 },
    },
  },

  // User settings
  settings: {
    // Custom overrides (in addition to SITE_CATEGORIES)
    customProductive: [],      // user-added productive sites
    customBlocked: [],         // user-added blocked sites

    nuclearEnabled: false,
    pomodoroEnabled: false,
    pomodoroWork: 25,
    pomodoroBreak: 5,

    // Doomscroll detection
    doomscrollThreshold: 15,   // seconds before alarm
    customDoomscrollSites: [], // user-added doomscroll sites

    // Vision detection
    visionEnabled: false,      // is vision detection opt-in enabled
    visionFaceThreshold: 10,   // seconds before face-missing penalty
    visionGazeThreshold: 5,    // seconds before looking-away penalty

    // AI Music Recommendations
    aiRecommendationsEnabled: true,  // use AI-powered music recommendations
    autoMusicSwitch: true,           // automatically switch music when focus drops
    autoMusicThreshold: 50,          // focus score threshold to trigger auto switch
    preferredGenres: [],             // user's preferred genres for recommendations
  },

  // Music state
  music: {
    recentlyRecommended: [],         // track recently recommended songs to avoid repeats
    lastKnownTrack: null,
    lastKnownPlaying: false,
  },

  // History for dashboard
  history: [],

  // Screen Time style daily stats
  dailyStats: {
    date: null,
    siteBreakdown: {},         // { hostname: totalMs }
    categoryBreakdown: {},     // { category: totalMs }
    focusScoreAvg: 0,
    interventionCount: 0,
  },

  // Music Intelligence - BPM correlation and recommendations
  musicIntelligence: {
    trackHistory: [],          // Array of track plays with focus correlation
    bpmModel: {
      ranges: {
        slow: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },      // 60-90 BPM
        moderate: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },  // 90-120 BPM
        upbeat: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },    // 120-140 BPM
        fast: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },      // 140-180 BPM
      },
      optimalRange: null,      // 'slow' | 'moderate' | 'upbeat' | 'fast'
      lastUpdated: null,
    },
    genreModel: {
      genres: {},              // { 'lofi': { avgFocusScore, count }, ... }
      optimalGenres: [],       // Top performing genres
    },
    recommendationCache: {
      lastFetch: null,
      recommendations: [],
      ttlMs: 3600000,          // 1 hour cache
    },
  },
};

// ============================================================
// Helper: Categorize a hostname
// ============================================================

export function categorizeSite(hostname, settings = {}) {
  if (!hostname) return 'neutral';

  // Check custom overrides first
  if (settings.customBlocked?.some(s => hostname.includes(s))) {
    return 'blocked';
  }
  if (settings.customProductive?.some(s => hostname.includes(s))) {
    return 'productive';
  }

  // Check built-in categories
  for (const [category, sites] of Object.entries(SITE_CATEGORIES)) {
    if (sites.some(s => hostname.includes(s) || hostname.endsWith('.' + s))) {
      return category;
    }
  }

  return 'neutral';
}

// Cache for AI-categorized sites
const aiCategoryCache = {};

// Default Groq API key
const DEFAULT_GROQ_KEY = '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';

/**
 * Categorize a site using AI (Groq)
 * Called for sites not in the hardcoded list
 */
export async function categorizeSiteWithAI(hostname) {
  if (!hostname) return 'neutral';

  // Check cache first
  if (aiCategoryCache[hostname]) {
    return aiCategoryCache[hostname];
  }

  try {
    // Get API key
    let apiKey = null;
    try {
      const result = await chrome.storage.local.get('apiKey_groq');
      apiKey = result.apiKey_groq || DEFAULT_GROQ_KEY;
    } catch {
      apiKey = DEFAULT_GROQ_KEY;
    }

    if (!apiKey) return 'neutral';

    const prompt = `Categorize this website hostname for a productivity/focus app: "${hostname}"

Categories:
- productive: work, coding, docs, learning, research, professional tools
- socialMedia: social networks, messaging, forums, communities
- entertainment: streaming, videos, music (except focus music), gaming content
- games: online games, gaming platforms
- shopping: e-commerce, retail, marketplaces
- news: news sites, media outlets, blogs
- neutral: everything else (utilities, search engines, etc.)

Respond with ONLY the category name (one word, lowercase).`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.warn('[AI Categorize] API error:', response.status);
      return 'neutral';
    }

    const data = await response.json();
    const category = data.choices?.[0]?.message?.content?.trim().toLowerCase();

    // Validate category
    const validCategories = ['productive', 'socialMedia', 'entertainment', 'games', 'shopping', 'news', 'neutral'];
    const normalizedCategory = validCategories.find(c => c.toLowerCase() === category) || 'neutral';

    // Cache the result
    aiCategoryCache[hostname] = normalizedCategory;
    console.log('[AI Categorize]', hostname, '→', normalizedCategory);

    return normalizedCategory;
  } catch (err) {
    console.error('[AI Categorize] Error:', err);
    return 'neutral';
  }
}

/**
 * Smart categorize - uses hardcoded first, then AI for unknown sites
 */
export async function smartCategorizeSite(hostname, settings = {}) {
  // Try hardcoded first (fast)
  const hardcodedCategory = categorizeSite(hostname, settings);
  if (hardcodedCategory !== 'neutral') {
    return hardcodedCategory;
  }

  // Use AI for unknown sites
  return categorizeSiteWithAI(hostname);
}

/**
 * Get penalty multiplier for a category
 * Returns: negative = penalty, positive = bonus, 0 = neutral
 */
export function getCategoryPenalty(category, mode = 'normal') {
  const penalties = {
    gentle: {
      productive: 0.15,      // bonus
      socialMedia: -0.3,
      entertainment: -0.25,
      games: -0.35,
      shopping: -0.1,
      news: -0.05,
      blocked: -0.5,
      neutral: 0,
    },
    normal: {
      productive: 0.2,       // bonus
      socialMedia: -0.5,
      entertainment: -0.4,
      games: -0.6,
      shopping: -0.2,
      news: -0.1,
      blocked: -0.7,
      neutral: 0,
    },
    strict: {
      productive: 0.25,      // bonus
      socialMedia: -0.8,
      entertainment: -0.7,
      games: -1.0,           // instant max penalty
      shopping: -0.4,
      news: -0.2,
      blocked: -1.0,
      neutral: -0.05,        // even neutral hurts in strict
    },
  };

  return penalties[mode]?.[category] ?? 0;
}

// ============================================================
// Storage Functions
// ============================================================

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

export async function getSettings() {
  const state = await loadState();
  return state.settings;
}

// ============================================================
// API Key Management (separate from state for security)
// ============================================================

export async function setApiKey(keyType, value) {
  await chrome.storage.local.set({ [`apiKey_${keyType}`]: value });
}

export async function getApiKey(keyType) {
  const result = await chrome.storage.local.get(`apiKey_${keyType}`);
  return result[`apiKey_${keyType}`] || null;
}

export async function hasApiKey(keyType) {
  const key = await getApiKey(keyType);
  return !!key;
}

export async function clearApiKey(keyType) {
  await chrome.storage.local.remove(`apiKey_${keyType}`);
}

// ============================================================
// Music Intelligence Helpers
// ============================================================

const TRACK_HISTORY_MAX = 500;

export async function getTrackHistory(limit = 100) {
  const state = await loadState();
  const history = state.musicIntelligence?.trackHistory || [];
  return history.slice(0, limit);
}

export async function addTrackToHistory(entry) {
  await updateState(s => {
    if (!s.musicIntelligence) {
      s.musicIntelligence = DEFAULT_STATE.musicIntelligence;
    }
    s.musicIntelligence.trackHistory.unshift(entry);
    if (s.musicIntelligence.trackHistory.length > TRACK_HISTORY_MAX) {
      s.musicIntelligence.trackHistory = s.musicIntelligence.trackHistory.slice(0, TRACK_HISTORY_MAX);
    }
    return s;
  });
  return entry;
}

export async function getMusicIntelligence() {
  const state = await loadState();
  return state.musicIntelligence || DEFAULT_STATE.musicIntelligence;
}

export async function clearMusicIntelligence() {
  await updateState(s => ({
    ...s,
    musicIntelligence: structuredClone(DEFAULT_STATE.musicIntelligence),
  }));
}
