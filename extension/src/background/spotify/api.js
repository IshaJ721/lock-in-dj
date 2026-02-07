// Spotify Web API wrapper for playback control

import { getValidAccessToken } from './auth.js';

const API_BASE = 'https://api.spotify.com/v1';

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getValidAccessToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // No content response (e.g., play/pause commands)
  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || 'Spotify API error');
  }

  return response.json();
}

// ============================================================
// Playback Control
// ============================================================

/**
 * Get current playback state
 */
export async function getPlaybackState() {
  return apiRequest('/me/player');
}

/**
 * Get currently playing track
 */
export async function getCurrentTrack() {
  return apiRequest('/me/player/currently-playing');
}

/**
 * Start/resume playback
 * @param {string} contextUri - Playlist/album URI (optional)
 * @param {string[]} uris - Specific track URIs (optional)
 * @param {number} positionMs - Position in track (optional)
 */
export async function play({ contextUri, uris, positionMs, deviceId } = {}) {
  const body = {};
  if (contextUri) body.context_uri = contextUri;
  if (uris) body.uris = uris;
  if (positionMs) body.position_ms = positionMs;

  const query = deviceId ? `?device_id=${deviceId}` : '';

  return apiRequest(`/me/player/play${query}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Pause playback
 */
export async function pause() {
  return apiRequest('/me/player/pause', { method: 'PUT' });
}

/**
 * Skip to next track
 */
export async function skipToNext() {
  return apiRequest('/me/player/next', { method: 'POST' });
}

/**
 * Skip to previous track
 */
export async function skipToPrevious() {
  return apiRequest('/me/player/previous', { method: 'POST' });
}

/**
 * Set playback volume (0-100)
 */
export async function setVolume(volumePercent) {
  return apiRequest(`/me/player/volume?volume_percent=${volumePercent}`, {
    method: 'PUT',
  });
}

/**
 * Seek to position in current track
 */
export async function seek(positionMs) {
  return apiRequest(`/me/player/seek?position_ms=${positionMs}`, {
    method: 'PUT',
  });
}

/**
 * Get available devices
 */
export async function getDevices() {
  return apiRequest('/me/player/devices');
}

/**
 * Transfer playback to a device
 */
export async function transferPlayback(deviceId, play = true) {
  return apiRequest('/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
}

// ============================================================
// Playlists
// ============================================================

/**
 * Get user's playlists
 */
export async function getUserPlaylists(limit = 50) {
  return apiRequest(`/me/playlists?limit=${limit}`);
}

/**
 * Get playlist tracks
 */
export async function getPlaylistTracks(playlistId, limit = 100) {
  return apiRequest(`/playlists/${playlistId}/tracks?limit=${limit}`);
}

/**
 * Get playlist details
 */
export async function getPlaylist(playlistId) {
  return apiRequest(`/playlists/${playlistId}`);
}

// ============================================================
// Track Features (for smart selection)
// ============================================================

/**
 * Get audio features for tracks
 * Features include: energy, tempo, danceability, valence, etc.
 */
export async function getAudioFeatures(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
  return apiRequest(`/audio-features?ids=${ids}`);
}

/**
 * Search for tracks
 */
export async function searchTracks(query, limit = 20) {
  const encoded = encodeURIComponent(query);
  return apiRequest(`/search?q=${encoded}&type=track&limit=${limit}`);
}

// ============================================================
// Recommendations
// ============================================================

/**
 * Get recommendations based on seeds
 * Useful for finding high-energy focus tracks
 */
export async function getRecommendations({
  seedTracks,
  seedArtists,
  seedGenres,
  targetEnergy,
  targetTempo,
  limit = 20,
}) {
  const params = new URLSearchParams();
  params.set('limit', limit);

  if (seedTracks?.length) params.set('seed_tracks', seedTracks.slice(0, 5).join(','));
  if (seedArtists?.length) params.set('seed_artists', seedArtists.slice(0, 5).join(','));
  if (seedGenres?.length) params.set('seed_genres', seedGenres.slice(0, 5).join(','));
  if (targetEnergy !== undefined) params.set('target_energy', targetEnergy);
  if (targetTempo !== undefined) params.set('target_tempo', targetTempo);

  return apiRequest(`/recommendations?${params.toString()}`);
}
