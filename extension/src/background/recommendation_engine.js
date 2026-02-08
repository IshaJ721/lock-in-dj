// Recommendation Engine
// Generates personalized music recommendations based on focus-music correlation

import { lookupBpm, getBpmRange, getBpmRangeCenter } from './bpm_lookup.js';

const CACHE_TTL_MS = 3600000; // 1 hour
const TRACK_HISTORY_MAX = 500;

// API keys are configured in options - no defaults hardcoded
const DEFAULT_API_KEYS = {
  groq: null,
  serp: null,
};

/**
 * Get API key from chrome storage (with fallback to defaults)
 */
async function getApiKey(keyType) {
  try {
    const result = await chrome.storage.local.get(`apiKey_${keyType}`);
    return result[`apiKey_${keyType}`] || DEFAULT_API_KEYS[keyType] || null;
  } catch (e) {
    return DEFAULT_API_KEYS[keyType] || null;
  }
}

/**
 * Load state from storage
 */
async function loadState() {
  const result = await chrome.storage.local.get('state');
  return result.state || {};
}

/**
 * Update state in storage
 */
async function updateState(updater) {
  const state = await loadState();
  const newState = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
  await chrome.storage.local.set({ state: newState });
  return newState;
}

/**
 * Get track history from state
 */
export async function getTrackHistory(limit = 100) {
  const state = await loadState();
  const history = state.musicIntelligence?.trackHistory || [];
  return history.slice(0, limit);
}

/**
 * Add entry to track history
 */
export async function addTrackHistory(entry) {
  await updateState(s => {
    const intelligence = s.musicIntelligence || initMusicIntelligence();
    intelligence.trackHistory.unshift(entry);

    // Prune old entries
    if (intelligence.trackHistory.length > TRACK_HISTORY_MAX) {
      intelligence.trackHistory = intelligence.trackHistory.slice(0, TRACK_HISTORY_MAX);
    }

    return { ...s, musicIntelligence: intelligence };
  });
  return entry;
}

/**
 * Initialize music intelligence structure
 */
function initMusicIntelligence() {
  return {
    trackHistory: [],
    bpmModel: {
      ranges: {
        slow: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },
        moderate: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },
        upbeat: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },
        fast: { avgFocusScore: 0, sampleCount: 0, totalListenTimeMs: 0 },
      },
      optimalRange: null,
      lastUpdated: null,
    },
    genreModel: {
      genres: {},
      optimalGenres: [],
    },
    recommendationCache: {
      lastFetch: null,
      recommendations: [],
      ttlMs: CACHE_TTL_MS,
    },
  };
}

/**
 * Build user profile from track history
 */
export async function buildUserProfile() {
  const history = await getTrackHistory(200);
  const state = await loadState();

  const bpmScores = {};
  const genreScores = {};
  const artistScores = {};

  for (const track of history) {
    // BPM correlation
    if (track.bpm && track.avgFocusScore > 0) {
      const range = getBpmRange(track.bpm);
      if (range) {
        if (!bpmScores[range]) {
          bpmScores[range] = { totalScore: 0, count: 0 };
        }
        bpmScores[range].totalScore += track.avgFocusScore;
        bpmScores[range].count++;
      }
    }

    // Genre correlation
    if (track.estimatedGenre && track.avgFocusScore > 0) {
      const genre = track.estimatedGenre.toLowerCase();
      if (!genreScores[genre]) {
        genreScores[genre] = { totalScore: 0, count: 0 };
      }
      genreScores[genre].totalScore += track.avgFocusScore;
      genreScores[genre].count++;
    }

    // Artist correlation
    if (track.artist && track.avgFocusScore > 0) {
      if (!artistScores[track.artist]) {
        artistScores[track.artist] = { totalScore: 0, count: 0 };
      }
      artistScores[track.artist].totalScore += track.avgFocusScore;
      artistScores[track.artist].count++;
    }
  }

  const optimalBpm = findOptimalCategory(bpmScores);
  const optimalGenres = findTopCategories(genreScores, 3);
  const topArtists = findTopCategories(artistScores, 5);

  return {
    optimalBpmRange: optimalBpm,
    optimalBpmValue: getBpmRangeCenter(optimalBpm),
    optimalGenres,
    topArtists,
    recentTracks: history.slice(0, 20),
    currentMode: state.session?.mode || 'normal',
    avgFocusScore: state.metrics?.focusScore || 50,
    trackCount: history.length,
  };
}

function findOptimalCategory(scores) {
  let best = null;
  let bestAvg = 0;

  for (const [category, data] of Object.entries(scores)) {
    if (data.count >= 3) {
      const avg = data.totalScore / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = category;
      }
    }
  }

  return best || 'moderate';
}

function findTopCategories(scores, topN) {
  return Object.entries(scores)
    .filter(([_, data]) => data.count >= 2)
    .map(([category, data]) => ({
      category,
      avgScore: data.totalScore / data.count,
      count: data.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, topN);
}

/**
 * Main recommendation function
 */
export async function getRecommendations(count = 10) {
  const state = await loadState();
  const intelligence = state.musicIntelligence || initMusicIntelligence();

  // Check cache first
  if (isCacheValid(intelligence.recommendationCache)) {
    return intelligence.recommendationCache.recommendations.slice(0, count);
  }

  // Build user profile
  const profile = await buildUserProfile();

  // Generate recommendations from multiple sources
  const [localRecs, groqRecs, serpRecs] = await Promise.all([
    getLocalRecommendations(profile),
    getGroqRecommendations(profile),
    getSerpDiscovery(profile),
  ]);

  // Merge, dedupe, and rank
  const merged = mergeRecommendations([...localRecs, ...groqRecs, ...serpRecs], profile);

  // Cache results
  await updateState(s => ({
    ...s,
    musicIntelligence: {
      ...s.musicIntelligence,
      recommendationCache: {
        lastFetch: Date.now(),
        recommendations: merged,
        ttlMs: CACHE_TTL_MS,
      },
    },
  }));

  return merged.slice(0, count);
}

function isCacheValid(cache) {
  if (!cache?.lastFetch) return false;
  return (Date.now() - cache.lastFetch) < (cache.ttlMs || CACHE_TTL_MS);
}

/**
 * Local recommendations from high-performing tracks
 */
async function getLocalRecommendations(profile) {
  const history = await getTrackHistory(100);

  const goodTracks = history
    .filter(t => t.avgFocusScore >= 70 && !t.wasSkipped)
    .sort((a, b) => b.avgFocusScore - a.avgFocusScore)
    .slice(0, 20);

  return goodTracks.map(track => ({
    title: track.title,
    artist: track.artist,
    reason: `High focus score (${Math.round(track.avgFocusScore)}%) when you listened`,
    estimatedBpm: track.bpm,
    searchQuery: `${track.title} ${track.artist}`,
    source: 'local',
    confidence: 0.9,
    createdAt: Date.now(),
  }));
}

/**
 * AI-powered recommendations from Groq
 */
async function getGroqRecommendations(profile) {
  const apiKey = await getApiKey('groq');
  if (!apiKey) return [];

  const recentTracksList = profile.recentTracks
    .slice(0, 5)
    .map(t => `"${t.title}" by ${t.artist}`)
    .join(', ');

  const genresList = profile.optimalGenres.map(g => g.category).join(', ') || 'focus music';
  const artistsList = profile.topArtists.map(a => a.category).join(', ') || 'various artists';

  const prompt = `You are a music recommendation AI for a focus/productivity app.

User's optimal music profile:
- Best BPM range: ${profile.optimalBpmRange} (around ${profile.optimalBpmValue} BPM)
- Top performing genres: ${genresList}
- Favorite artists: ${artistsList}
- Current focus mode: ${profile.currentMode}
- Recent tracks that worked well: ${recentTracksList || 'none yet'}

Generate 5 music recommendations that would help this user focus. Include:
- Tracks similar to their high-performing ones
- Discovery picks in their preferred BPM range
- At least one instrumental/lofi track for deep focus

Respond with ONLY a JSON array (no other text):
[{"title": "...", "artist": "...", "reason": "...", "estimatedBpm": <number>}]`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('[Groq Recommendations] API error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse JSON array
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed.map(rec => ({
        ...rec,
        searchQuery: `${rec.title} ${rec.artist}`,
        source: 'groq',
        confidence: 0.7,
        createdAt: Date.now(),
      }));
    }
  } catch (err) {
    console.error('[Groq Recommendations]', err);
  }

  return [];
}

/**
 * Discover new music via SERP API
 */
async function getSerpDiscovery(profile) {
  const apiKey = await getApiKey('serp');
  if (!apiKey) return [];

  const topGenre = profile.optimalGenres[0]?.category || 'lofi';
  const queries = [
    `best ${topGenre} music for focus concentration 2024`,
    `${profile.optimalBpmRange || 'moderate'} tempo study music playlist`,
  ];

  const results = [];

  for (const query of queries.slice(0, 1)) { // Limit API calls
    try {
      const response = await fetch(
        `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`
      );

      if (!response.ok) continue;

      const data = await response.json();
      const extracted = extractMusicFromSerp(data);
      results.push(...extracted);

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error('[SERP Discovery]', err);
    }
  }

  return results.map(rec => ({
    ...rec,
    source: 'serp',
    confidence: 0.6,
    createdAt: Date.now(),
  }));
}

/**
 * Extract music recommendations from SERP results
 */
function extractMusicFromSerp(serpData) {
  const results = [];

  for (const item of serpData.organic_results || []) {
    // Check if it's a music-related result
    const isMusic = item.link?.includes('youtube.com') ||
      item.link?.includes('spotify.com') ||
      item.link?.includes('soundcloud.com') ||
      item.title?.toLowerCase().includes('playlist') ||
      item.title?.toLowerCase().includes('mix');

    if (isMusic) {
      // Try to extract track/playlist info
      const trackMatch = item.title.match(/["']([^"']+)["']\s*(?:by|-)?\s*([^-|]+)/i);
      if (trackMatch) {
        results.push({
          title: trackMatch[1].trim(),
          artist: trackMatch[2].trim(),
          reason: 'Popular focus music from web search',
          estimatedBpm: null,
          searchQuery: `${trackMatch[1]} ${trackMatch[2]}`,
        });
      } else {
        // Use as a search term for playlists
        const cleanTitle = item.title
          .replace(/\s*[-|].*$/, '')
          .replace(/playlist/i, '')
          .trim();

        if (cleanTitle.length > 5 && cleanTitle.length < 50) {
          results.push({
            title: cleanTitle,
            artist: 'Various',
            reason: 'Discovered from focus music searches',
            estimatedBpm: null,
            searchQuery: cleanTitle,
          });
        }
      }
    }
  }

  return results.slice(0, 5);
}

/**
 * Merge and dedupe recommendations
 */
function mergeRecommendations(recommendations, profile) {
  const seen = new Set();
  const unique = [];

  for (const rec of recommendations) {
    if (!rec.title) continue;

    const key = `${rec.title.toLowerCase()}_${rec.artist?.toLowerCase() || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Score based on confidence and BPM match
    let score = rec.confidence || 0.5;
    if (rec.estimatedBpm) {
      const range = getBpmRange(rec.estimatedBpm);
      if (range === profile.optimalBpmRange) {
        score += 0.2; // Bonus for BPM match
      }
    }

    // Prefer local tracks (proven to work)
    if (rec.source === 'local') {
      score += 0.1;
    }

    unique.push({ ...rec, score });
  }

  return unique.sort((a, b) => b.score - a.score);
}

// Default focus music by genre (expanded for variety)
const DEFAULT_FOCUS_MUSIC_BY_GENRE = {
  lofi: [
    { title: 'lofi hip hop radio', artist: 'Lofi Girl', searchQuery: 'lofi hip hop radio beats to relax study', estimatedBpm: 85 },
    { title: 'Chillhop Essentials', artist: 'Chillhop', searchQuery: 'chillhop essentials winter', estimatedBpm: 80 },
    { title: 'lofi beats', artist: 'College Music', searchQuery: 'college music lofi beats', estimatedBpm: 82 },
    { title: 'Jazz Hop Cafe', artist: 'Various', searchQuery: 'jazz hop cafe lofi', estimatedBpm: 78 },
    { title: 'Chill Lofi Study', artist: 'Dreamy', searchQuery: 'dreamy lofi study music', estimatedBpm: 75 },
  ],
  jazz: [
    { title: 'Jazz for Study', artist: 'Various', searchQuery: 'smooth jazz for studying', estimatedBpm: 95 },
    { title: 'Coffee Shop Jazz', artist: 'Various', searchQuery: 'coffee shop jazz instrumental', estimatedBpm: 100 },
    { title: 'Late Night Jazz', artist: 'Various', searchQuery: 'late night jazz piano', estimatedBpm: 90 },
    { title: 'Bossa Nova Focus', artist: 'Various', searchQuery: 'bossa nova jazz focus', estimatedBpm: 105 },
  ],
  classical: [
    { title: 'Classical Focus', artist: 'Various', searchQuery: 'classical music for concentration piano', estimatedBpm: 80 },
    { title: 'Bach for Studying', artist: 'Bach', searchQuery: 'bach study music instrumental', estimatedBpm: 85 },
    { title: 'Mozart Effect', artist: 'Mozart', searchQuery: 'mozart study concentration', estimatedBpm: 90 },
    { title: 'Debussy Clair de Lune', artist: 'Debussy', searchQuery: 'debussy peaceful piano', estimatedBpm: 70 },
  ],
  electronic: [
    { title: 'Deep Focus Electronic', artist: 'Various', searchQuery: 'deep focus electronic ambient', estimatedBpm: 120 },
    { title: 'Chillstep Focus', artist: 'Various', searchQuery: 'chillstep music for focus', estimatedBpm: 140 },
    { title: 'Ambient Electronic', artist: 'Various', searchQuery: 'ambient electronic work music', estimatedBpm: 100 },
    { title: 'Future Garage', artist: 'Various', searchQuery: 'future garage study music', estimatedBpm: 130 },
  ],
  synthwave: [
    { title: 'Synthwave Focus', artist: 'Various', searchQuery: 'synthwave retrowave study', estimatedBpm: 115 },
    { title: 'Outrun Vibes', artist: 'Various', searchQuery: 'outrun synthwave focus', estimatedBpm: 120 },
    { title: 'Retrowave Coding', artist: 'Various', searchQuery: 'retrowave coding music', estimatedBpm: 110 },
  ],
  ambient: [
    { title: 'Ambient Focus', artist: 'Various', searchQuery: 'ambient music for deep focus', estimatedBpm: 70 },
    { title: 'Space Ambient', artist: 'Various', searchQuery: 'space ambient meditation focus', estimatedBpm: 60 },
    { title: 'Nature Sounds Music', artist: 'Various', searchQuery: 'nature sounds with soft music', estimatedBpm: 65 },
    { title: 'Rain and Piano', artist: 'Various', searchQuery: 'rain sounds piano study', estimatedBpm: 75 },
  ],
  instrumental: [
    { title: 'Acoustic Focus', artist: 'Various', searchQuery: 'acoustic guitar instrumental focus', estimatedBpm: 90 },
    { title: 'Piano Study', artist: 'Various', searchQuery: 'piano instrumental study music', estimatedBpm: 85 },
    { title: 'Instrumental Hip Hop', artist: 'Various', searchQuery: 'instrumental hip hop beats no lyrics', estimatedBpm: 95 },
  ],
  rock: [
    { title: 'Post Rock Focus', artist: 'Various', searchQuery: 'post rock instrumental focus', estimatedBpm: 110 },
    { title: 'Instrumental Rock', artist: 'Various', searchQuery: 'instrumental rock study', estimatedBpm: 120 },
  ],
  pop: [
    { title: 'Chill Pop Instrumentals', artist: 'Various', searchQuery: 'chill pop instrumental focus', estimatedBpm: 100 },
    { title: 'Acoustic Pop Covers', artist: 'Various', searchQuery: 'acoustic pop covers instrumental', estimatedBpm: 95 },
  ],
};

// Flatten all defaults for fallback
const ALL_DEFAULT_MUSIC = Object.values(DEFAULT_FOCUS_MUSIC_BY_GENRE).flat();

/**
 * Get recently recommended songs from storage (to avoid repeats)
 */
async function getRecentlyRecommended() {
  const state = await loadState();
  return state.music?.recentlyRecommended || [];
}

/**
 * Add a song to recently recommended list
 */
async function addToRecentlyRecommended(searchQuery) {
  await updateState(s => {
    const recent = s.music?.recentlyRecommended || [];
    recent.unshift(searchQuery);
    // Keep only last 20 to avoid repeats
    if (recent.length > 20) {
      recent.length = 20;
    }
    return {
      ...s,
      music: { ...s.music, recentlyRecommended: recent },
    };
  });
}

/**
 * Get user's preferred genres from settings
 */
async function getUserPreferredGenres() {
  const state = await loadState();
  return state.settings?.preferredGenres || [];
}

/**
 * Get contextual recommendation for current focus state
 * PRIORITIZES user's preferred genres
 */
export async function getContextualRecommendation(focusScore, currentTrack) {
  const state = await loadState();
  const recentlyRecommended = await getRecentlyRecommended();
  const userGenres = state.settings?.preferredGenres || [];

  console.log('[Recommendation] User preferred genres:', userGenres);
  console.log('[Recommendation] Recently recommended:', recentlyRecommended.length, 'tracks');

  // Build recommendation pool - PRIORITIZE user's preferred genres
  let recommendations = [];

  // If user has preferred genres, use ONLY those
  if (userGenres.length > 0) {
    console.log('[Recommendation] Using user preferred genres:', userGenres.join(', '));
    for (const genre of userGenres) {
      const genreKey = genre.toLowerCase();
      const genreMusic = DEFAULT_FOCUS_MUSIC_BY_GENRE[genreKey];
      if (genreMusic) {
        recommendations.push(...genreMusic.map(m => ({
          ...m,
          reason: `From your ${genre} preference`,
          source: 'user_preference',
          genre: genreKey,
        })));
      }
    }
  }

  // If no user preferences or no matches, use all defaults
  if (recommendations.length === 0) {
    console.log('[Recommendation] No user preferences, using all genres');
    recommendations = ALL_DEFAULT_MUSIC.map(m => ({
      ...m,
      reason: 'Focus music',
      source: 'default',
    }));
  }

  console.log('[Recommendation] Total pool:', recommendations.length, 'tracks');

  // Shuffle for variety (Fisher-Yates)
  for (let i = recommendations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [recommendations[i], recommendations[j]] = [recommendations[j], recommendations[i]];
  }

  // Filter out recently recommended (avoid repeats)
  let candidates = recommendations.filter(rec =>
    !recentlyRecommended.some(recent =>
      recent === rec.searchQuery ||
      recent?.toLowerCase().includes(rec.title?.toLowerCase())
    )
  );

  console.log('[Recommendation] After filtering recent:', candidates.length, 'candidates');

  // Exclude current track
  if (currentTrack?.title) {
    candidates = candidates.filter(rec =>
      !rec.title?.toLowerCase().includes(currentTrack.title.toLowerCase()) &&
      !rec.searchQuery?.toLowerCase().includes(currentTrack.title.toLowerCase())
    );
  }

  // Pick a random result from candidates
  let result;
  if (candidates.length > 0) {
    result = candidates[Math.floor(Math.random() * candidates.length)];
  } else {
    // All tracks were recently played, clear history and pick random
    console.log('[Recommendation] All tracks recently played, clearing history');
    await updateState(s => ({
      ...s,
      music: { ...s.music, recentlyRecommended: [] },
    }));
    result = recommendations[Math.floor(Math.random() * recommendations.length)];
  }

  // Track this recommendation to avoid repeating it
  if (result?.searchQuery) {
    await addToRecentlyRecommended(result.searchQuery);
  }

  console.log('[Recommendation Engine] Selected:', result?.title, '| Query:', result?.searchQuery);
  console.log('[Recommendation Engine] Recently played:', recentlyRecommended.length, 'tracks');

  return result;
}

/**
 * Record track play - returns handler to call on track end
 */
export async function recordTrackPlay(trackInfo, focusScore, sessionMode) {
  const startTime = Date.now();
  const startFocusScore = focusScore;

  // Return a handler to call when track ends
  return async (endFocusScore, wasSkipped = false, skipReason = null) => {
    const endTime = Date.now();
    const listenDurationMs = endTime - startTime;

    // Skip very short listens (less than 10 seconds)
    if (listenDurationMs < 10000) {
      return null;
    }

    // Lookup BPM
    const bpmData = await lookupBpm(trackInfo.title, trackInfo.artist);

    const entry = {
      id: hashCode(`${trackInfo.title}_${trackInfo.artist}_${startTime}`),
      title: trackInfo.title,
      artist: trackInfo.artist,
      thumbnail: trackInfo.thumbnail,
      startedAt: startTime,
      endedAt: endTime,
      listenDurationMs,
      focusScoreAtStart: startFocusScore,
      focusScoreAtEnd: endFocusScore,
      focusScoreDelta: endFocusScore - startFocusScore,
      avgFocusScore: (startFocusScore + endFocusScore) / 2,
      bpm: bpmData?.bpm || null,
      bpmConfidence: bpmData?.confidence || 0,
      estimatedGenre: bpmData?.estimatedGenre || null,
      sessionMode,
      wasSkipped,
      skipReason,
    };

    await addTrackHistory(entry);
    await updateBpmModel(entry);

    console.log('[Recommendation Engine] Recorded track:', entry.title, 'BPM:', entry.bpm, 'Focus:', entry.avgFocusScore);

    return entry;
  };
}

/**
 * Update BPM model with new data point
 */
async function updateBpmModel(entry) {
  if (!entry.bpm) return;

  const range = getBpmRange(entry.bpm);
  if (!range) return;

  await updateState(s => {
    const intelligence = s.musicIntelligence || initMusicIntelligence();
    const model = intelligence.bpmModel;
    const rangeData = model.ranges[range];

    // Incremental mean update
    rangeData.sampleCount++;
    rangeData.avgFocusScore = rangeData.avgFocusScore +
      (entry.avgFocusScore - rangeData.avgFocusScore) / rangeData.sampleCount;
    rangeData.totalListenTimeMs += entry.listenDurationMs;

    // Recalculate optimal range (need at least 5 samples)
    let bestRange = null;
    let bestScore = 0;
    for (const [rangeName, data] of Object.entries(model.ranges)) {
      if (data.sampleCount >= 5 && data.avgFocusScore > bestScore) {
        bestScore = data.avgFocusScore;
        bestRange = rangeName;
      }
    }

    model.optimalRange = bestRange;
    model.lastUpdated = Date.now();

    return {
      ...s,
      musicIntelligence: {
        ...intelligence,
        bpmModel: model,
      },
    };
  });
}

/**
 * Simple hash function for IDs
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Clear all recommendation data
 */
export async function clearMusicIntelligence() {
  await updateState(s => ({
    ...s,
    musicIntelligence: initMusicIntelligence(),
  }));
}
