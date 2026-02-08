// Music Controller - Abstracts YouTube Music control via message passing
// Sends commands to content script injected in music.youtube.com

import { INTERVENTIONS } from './decision_engine.js';
import { getContextualRecommendation } from './recommendation_engine.js';
import { loadState } from './storage.js';

// ============================================================
// Tab Management
// ============================================================

/**
 * Find the YouTube Music tab
 */
async function findYTMusicTab() {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  return tabs.length > 0 ? tabs[0] : null;
}

/**
 * Check if YouTube Music tab exists and is ready
 */
export async function isYTMusicAvailable() {
  const tab = await findYTMusicTab();
  if (!tab) return false;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
    return response?.success === true;
  } catch {
    return false;
  }
}

/**
 * Send action to YouTube Music tab
 */
async function sendToYTMusic(action, params = {}) {
  const tab = await findYTMusicTab();

  if (!tab) {
    console.warn('[Music Controller] No YouTube Music tab found');
    return { success: false, error: 'No YouTube Music tab open' };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action, ...params });
    return response;
  } catch (err) {
    console.error('[Music Controller] Failed to send message:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// Basic Controls
// ============================================================

export async function play() {
  return sendToYTMusic('PLAY');
}

export async function pause() {
  return sendToYTMusic('PAUSE');
}

export async function togglePlayPause() {
  return sendToYTMusic('TOGGLE');
}

export async function next() {
  return sendToYTMusic('NEXT');
}

export async function previous() {
  return sendToYTMusic('PREVIOUS');
}

export async function setVolume(level) {
  return sendToYTMusic('SET_VOLUME', { level });
}

export async function getVolume() {
  return sendToYTMusic('GET_VOLUME');
}

// ============================================================
// Track Info
// ============================================================

export async function getTrackInfo() {
  const result = await sendToYTMusic('GET_INFO');
  return result?.info || null;
}

export async function isPlaying() {
  const result = await sendToYTMusic('IS_PLAYING');
  return result?.playing || false;
}

// ============================================================
// Interventions
// ============================================================

/**
 * Apply an intervention based on type
 */
export async function applyIntervention(interventionType) {
  console.log('[Music Controller] Applying intervention:', interventionType);

  switch (interventionType) {
    case INTERVENTIONS.BOOST_ENERGY:
      return boostEnergy();

    case INTERVENTIONS.SWITCH_PLAYLIST:
      // For YTM, we just skip to next - can't easily switch playlists
      return next();

    case INTERVENTIONS.PATTERN_BREAK:
      return patternBreak();

    case INTERVENTIONS.DUCK_VOLUME:
      return duckVolume();

    case INTERVENTIONS.WHITE_NOISE:
      return whiteNoiseBurst();

    case INTERVENTIONS.SMART_RECOMMEND:
      return smartRecommend();

    case INTERVENTIONS.VIOLA_POPUP:
      // Handled by service worker directly
      return { success: true, handled: 'service_worker' };

    case INTERVENTIONS.NUCLEAR:
      return nuclear();

    default:
      console.warn('[Music Controller] Unknown intervention:', interventionType);
      return { success: false, error: 'Unknown intervention' };
  }
}

/**
 * BOOST_ENERGY: Skip to next track(s) for energy boost
 */
async function boostEnergy() {
  const result = await sendToYTMusic('BOOST_ENERGY');
  console.log('[Music Controller] Boost energy result:', result);
  return result;
}

/**
 * PATTERN_BREAK: Brief pause to refocus attention
 */
async function patternBreak(duration = 3000) {
  const result = await sendToYTMusic('PATTERN_BREAK', { duration });
  console.log('[Music Controller] Pattern break result:', result);
  return result;
}

/**
 * NUCLEAR: Max volume attention grab for doomscrolling
 */
async function nuclear() {
  const result = await sendToYTMusic('NUCLEAR');
  console.log('[Music Controller] Nuclear result:', result);
  return result;
}

/**
 * DUCK_VOLUME: Lower volume to reduce distraction
 */
async function duckVolume(level = 30) {
  const result = await sendToYTMusic('DUCK_VOLUME', { level });
  console.log('[Music Controller] Duck volume result:', result);
  return result;
}

/**
 * Restore volume after ducking
 */
export async function restoreVolume() {
  return sendToYTMusic('RESTORE_VOLUME');
}

/**
 * WHITE_NOISE: Burst of white noise to grab attention
 */
async function whiteNoiseBurst(duration = 2000) {
  const result = await sendToYTMusic('WHITE_NOISE', { duration });
  console.log('[Music Controller] White noise result:', result);
  return result;
}

/**
 * SMART_RECOMMEND: AI-powered track recommendation based on BPM-focus correlation
 */
async function smartRecommend() {
  try {
    const state = await loadState();
    const playbackInfo = await getPlaybackInfo();

    // Get contextual recommendation based on current focus and track
    const recommendation = await getContextualRecommendation(
      state.metrics.focusScore,
      playbackInfo?.track ? { title: playbackInfo.track, artist: playbackInfo.artist } : null
    );

    if (!recommendation) {
      console.log('[Music Controller] No recommendation available, falling back to boost energy');
      return boostEnergy();
    }

    console.log('[Music Controller] Smart recommendation:', recommendation.title, 'by', recommendation.artist);
    console.log('[Music Controller] Reason:', recommendation.reason);

    // Search and play the recommended track
    const searchResult = await searchAndPlayTrack(recommendation.searchQuery);

    if (searchResult.success) {
      return {
        success: true,
        action: 'smart_recommend',
        recommendation,
      };
    }

    // Fallback to next track if search fails
    console.log('[Music Controller] Search failed, falling back to next track');
    return next();
  } catch (err) {
    console.error('[Music Controller] Smart recommend error:', err);
    return boostEnergy();
  }
}

/**
 * Search for a track and play it on YouTube Music
 */
async function searchAndPlayTrack(query) {
  if (!query) {
    return { success: false, error: 'No search query' };
  }

  console.log('[Music Controller] Searching for:', query);
  const result = await sendToYTMusic('SEARCH_AND_PLAY', { query });

  if (result.success) {
    console.log('[Music Controller] Successfully started playing search result');
  } else {
    console.warn('[Music Controller] Search and play failed:', result.error);
  }

  return result;
}

// ============================================================
// Playback Info (for UI)
// ============================================================

export async function getPlaybackInfo() {
  const available = await isYTMusicAvailable();

  if (!available) {
    return null;
  }

  const info = await getTrackInfo();
  const playing = await isPlaying();

  return {
    available: true,
    isPlaying: playing,
    track: info?.title || 'Unknown',
    artist: info?.artist || '',
    thumbnail: info?.thumbnail || null,
    volume: info?.volume || 50,
  };
}

// ============================================================
// Open YouTube Music
// ============================================================

export async function openYTMusic() {
  const tab = await findYTMusicTab();

  if (tab) {
    // Focus existing tab
    await chrome.tabs.update(tab.id, { active: true });
    return { success: true, action: 'focused' };
  }

  // Open new tab
  await chrome.tabs.create({ url: 'https://music.youtube.com/' });
  return { success: true, action: 'opened' };
}
