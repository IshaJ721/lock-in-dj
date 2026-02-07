// Music intervention controller
// Applies different intervention types using Spotify API

import * as api from './api.js';
import { loadState } from '../storage.js';
import { INTERVENTIONS } from '../decision_engine.js';

/**
 * Apply an intervention based on type
 */
export async function applyIntervention(interventionType) {
  const state = await loadState();
  const { playlists } = state.spotify;

  switch (interventionType) {
    case INTERVENTIONS.BOOST_ENERGY:
      return boostEnergy();

    case INTERVENTIONS.SWITCH_PLAYLIST:
      return switchToFocusPlaylist(playlists.deepFocus || playlists.lockIn);

    case INTERVENTIONS.PATTERN_BREAK:
      return playPatternBreak(playlists.patternBreak);

    case INTERVENTIONS.NUCLEAR:
      return playNuclearOption(playlists.annoying);

    default:
      console.warn('Unknown intervention type:', interventionType);
      return false;
  }
}

/**
 * BOOST_ENERGY: Skip to next track (assumes playlist is high-energy)
 * In future: could skip to a higher-energy track based on audio features
 */
async function boostEnergy() {
  try {
    const playback = await api.getPlaybackState();

    if (!playback || !playback.is_playing) {
      // Not playing, start the lock-in playlist
      const state = await loadState();
      if (state.spotify.playlists.lockIn) {
        await api.play({ contextUri: state.spotify.playlists.lockIn });
        return true;
      }
      return false;
    }

    // Skip to next track for energy boost
    await api.skipToNext();
    return true;
  } catch (err) {
    console.error('Boost energy failed:', err);
    return false;
  }
}

/**
 * SWITCH_PLAYLIST: Change to a different focus playlist
 */
async function switchToFocusPlaylist(playlistUri) {
  if (!playlistUri) {
    console.warn('No focus playlist configured');
    return false;
  }

  try {
    await api.play({ contextUri: playlistUri });
    return true;
  } catch (err) {
    console.error('Switch playlist failed:', err);
    return false;
  }
}

/**
 * PATTERN_BREAK: Play a short audio cue then resume
 * This is a "snap out of it" moment
 */
async function playPatternBreak(breakTrackUri) {
  try {
    // Save current playback state to resume after
    const currentPlayback = await api.getPlaybackState();
    const wasPlaying = currentPlayback?.is_playing;
    const currentContext = currentPlayback?.context?.uri;
    const currentPosition = currentPlayback?.progress_ms;
    const currentTrack = currentPlayback?.item?.uri;

    if (breakTrackUri) {
      // Play the pattern break track
      await api.play({ uris: [breakTrackUri] });

      // After 5 seconds, resume previous playback
      setTimeout(async () => {
        try {
          if (currentContext) {
            await api.play({ contextUri: currentContext });
          } else if (currentTrack) {
            await api.play({ uris: [currentTrack], positionMs: currentPosition });
          }
        } catch (e) {
          console.error('Failed to resume after pattern break:', e);
        }
      }, 5000);
    } else {
      // No break track configured, just pause briefly
      await api.pause();
      setTimeout(async () => {
        if (wasPlaying) {
          await api.play({});
        }
      }, 2000);
    }

    return true;
  } catch (err) {
    console.error('Pattern break failed:', err);
    return false;
  }
}

/**
 * NUCLEAR: Play annoying audio for doomscrolling
 * Maximum volume, jarring sound
 */
async function playNuclearOption(annoyingTrackUri) {
  try {
    // Save current volume to restore later
    const playback = await api.getPlaybackState();
    const previousVolume = playback?.device?.volume_percent || 50;

    if (annoyingTrackUri) {
      // Max volume + annoying track
      await api.setVolume(100);
      await api.play({ uris: [annoyingTrackUri] });

      // After 10 seconds, restore volume and resume normal playlist
      setTimeout(async () => {
        try {
          await api.setVolume(previousVolume);
          const state = await loadState();
          if (state.spotify.playlists.lockIn) {
            await api.play({ contextUri: state.spotify.playlists.lockIn });
          }
        } catch (e) {
          console.error('Failed to restore after nuclear:', e);
        }
      }, 10000);
    } else {
      // No track configured, just max volume current track
      await api.setVolume(100);
      setTimeout(async () => {
        await api.setVolume(previousVolume);
      }, 5000);
    }

    return true;
  } catch (err) {
    console.error('Nuclear option failed:', err);
    return false;
  }
}

/**
 * Get current playback info for UI
 */
export async function getPlaybackInfo() {
  try {
    const playback = await api.getPlaybackState();
    if (!playback) return null;

    return {
      isPlaying: playback.is_playing,
      track: playback.item?.name,
      artist: playback.item?.artists?.map((a) => a.name).join(', '),
      album: playback.item?.album?.name,
      albumArt: playback.item?.album?.images?.[0]?.url,
      progress: playback.progress_ms,
      duration: playback.item?.duration_ms,
      device: playback.device?.name,
    };
  } catch (err) {
    console.error('Get playback info failed:', err);
    return null;
  }
}

/**
 * Toggle play/pause
 */
export async function togglePlayback() {
  try {
    const playback = await api.getPlaybackState();
    if (playback?.is_playing) {
      await api.pause();
    } else {
      await api.play({});
    }
    return true;
  } catch (err) {
    console.error('Toggle playback failed:', err);
    return false;
  }
}
