// Music Controller - Abstracts YouTube Music control via message passing
// Sends commands to content script injected in music.youtube.com

import { INTERVENTIONS } from './decision_engine.js';

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
