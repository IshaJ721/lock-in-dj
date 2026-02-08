// YouTube Music Controller - Content Script
// Injected into music.youtube.com to control playback

console.log('[FocusDJ] YouTube Music controller loaded');

// ============================================================
// DOM Selectors (YouTube Music specific)
// These may need updating if YTM changes their UI
// ============================================================

const SELECTORS = {
  // Player controls
  playPauseBtn: 'tp-yt-paper-icon-button.play-pause-button, .play-pause-button',
  nextBtn: 'tp-yt-paper-icon-button.next-button, .next-button',
  prevBtn: 'tp-yt-paper-icon-button.previous-button, .previous-button',
  shuffleBtn: 'tp-yt-paper-icon-button.shuffle, .shuffle',
  repeatBtn: 'tp-yt-paper-icon-button.repeat, .repeat',

  // Volume
  volumeSlider: '#volume-slider',
  muteBtn: '.volume tp-yt-paper-icon-button, .mute-button',

  // Player bar
  playerBar: 'ytmusic-player-bar',

  // Video element (for direct control)
  video: 'video',

  // Track info
  trackTitle: 'yt-formatted-string.title.ytmusic-player-bar',
  trackArtist: 'yt-formatted-string.byline.ytmusic-player-bar',
  trackThumbnail: 'img.ytmusic-player-bar',

  // Progress
  progressBar: '#progress-bar',
  timeInfo: 'span.time-info',

  // Navigation (for playlist switching)
  searchInput: 'input#input.ytmusic-search-box',
  navItems: 'ytmusic-pivot-bar-item-renderer',
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Wait for an element to appear in DOM
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
  });
}

/**
 * Click an element safely
 */
function clickElement(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.click();
    return true;
  }
  console.warn(`[FocusDJ] Element not found: ${selector}`);
  return false;
}

/**
 * Get the video element
 */
function getVideo() {
  return document.querySelector(SELECTORS.video);
}

// ============================================================
// Playback Controls
// ============================================================

/**
 * Play or resume playback
 */
function play() {
  const video = getVideo();
  if (video && video.paused) {
    video.play();
    return true;
  }
  // Fallback to button click
  return clickElement(SELECTORS.playPauseBtn);
}

/**
 * Pause playback
 */
function pause() {
  const video = getVideo();
  if (video && !video.paused) {
    video.pause();
    return true;
  }
  return clickElement(SELECTORS.playPauseBtn);
}

/**
 * Toggle play/pause
 */
function togglePlayPause() {
  const video = getVideo();
  if (video) {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
    return true;
  }
  return clickElement(SELECTORS.playPauseBtn);
}

/**
 * Skip to next track
 */
function next() {
  return clickElement(SELECTORS.nextBtn);
}

/**
 * Go to previous track
 */
function previous() {
  return clickElement(SELECTORS.prevBtn);
}

/**
 * Toggle shuffle
 */
function toggleShuffle() {
  return clickElement(SELECTORS.shuffleBtn);
}

/**
 * Toggle repeat
 */
function toggleRepeat() {
  return clickElement(SELECTORS.repeatBtn);
}

// ============================================================
// Volume Controls
// ============================================================

/**
 * Set volume (0-100)
 */
function setVolume(level) {
  const video = getVideo();
  if (video) {
    video.volume = Math.max(0, Math.min(1, level / 100));
    return true;
  }
  return false;
}

/**
 * Get current volume
 */
function getVolume() {
  const video = getVideo();
  return video ? Math.round(video.volume * 100) : 50;
}

/**
 * Mute/unmute
 */
function toggleMute() {
  const video = getVideo();
  if (video) {
    video.muted = !video.muted;
    return true;
  }
  return clickElement(SELECTORS.muteBtn);
}

/**
 * Set to max volume (for nuclear option)
 */
function maxVolume() {
  return setVolume(100);
}

// ============================================================
// Seek Controls
// ============================================================

/**
 * Seek to position (in seconds)
 */
function seek(seconds) {
  const video = getVideo();
  if (video) {
    video.currentTime = seconds;
    return true;
  }
  return false;
}

/**
 * Seek forward by seconds
 */
function seekForward(seconds = 10) {
  const video = getVideo();
  if (video) {
    video.currentTime = Math.min(video.duration, video.currentTime + seconds);
    return true;
  }
  return false;
}

/**
 * Seek backward by seconds
 */
function seekBackward(seconds = 10) {
  const video = getVideo();
  if (video) {
    video.currentTime = Math.max(0, video.currentTime - seconds);
    return true;
  }
  return false;
}

// ============================================================
// Track Info
// ============================================================

/**
 * Get current track info
 */
function getTrackInfo() {
  const video = getVideo();
  const titleEl = document.querySelector(SELECTORS.trackTitle);
  const artistEl = document.querySelector(SELECTORS.trackArtist);
  const thumbnailEl = document.querySelector(SELECTORS.trackThumbnail);

  return {
    title: titleEl?.textContent?.trim() || 'Unknown',
    artist: artistEl?.textContent?.trim() || 'Unknown',
    thumbnail: thumbnailEl?.src || null,
    isPlaying: video ? !video.paused : false,
    currentTime: video?.currentTime || 0,
    duration: video?.duration || 0,
    volume: getVolume(),
  };
}

/**
 * Check if music is currently playing
 */
function isPlaying() {
  const video = getVideo();
  return video ? !video.paused : false;
}

// ============================================================
// Energy Boost (Skip until higher tempo track)
// This is a heuristic - skip a few tracks to "find" better energy
// ============================================================

let skipCount = 0;
const MAX_SKIP_FOR_ENERGY = 3;

/**
 * Boost energy by skipping tracks
 */
function boostEnergy() {
  if (skipCount < MAX_SKIP_FOR_ENERGY) {
    skipCount++;
    next();
    return { skipped: true, remaining: MAX_SKIP_FOR_ENERGY - skipCount };
  }
  // Reset for next boost
  skipCount = 0;
  return { skipped: false, message: 'Max skips reached, resetting' };
}

/**
 * Reset skip counter
 */
function resetSkipCounter() {
  skipCount = 0;
}

// ============================================================
// Pattern Break (Pause briefly, then resume)
// ============================================================

/**
 * Pattern break - brief pause to refocus
 */
async function patternBreak(durationMs = 3000) {
  const wasPlaying = isPlaying();

  if (wasPlaying) {
    pause();

    // Visual indicator could be added here
    console.log(`[FocusDJ] Pattern break for ${durationMs}ms`);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    play();
  }

  return { success: true, wasPlaying };
}

// ============================================================
// Nuclear Option
// ============================================================

/**
 * Nuclear - max volume + pause everything for attention
 */
async function nuclear() {
  const previousVolume = getVolume();

  // Max volume
  maxVolume();

  // Let it blast for 3 seconds
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Restore volume
  setVolume(previousVolume);

  return { success: true, previousVolume };
}

// ============================================================
// White Noise Generator
// ============================================================

let whiteNoiseContext = null;
let whiteNoiseNode = null;
let whiteNoiseGain = null;

/**
 * Start white noise (uses Web Audio API)
 */
function startWhiteNoise(volume = 0.3, durationMs = 5000) {
  try {
    // Create audio context
    whiteNoiseContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create buffer with white noise
    const bufferSize = 2 * whiteNoiseContext.sampleRate;
    const noiseBuffer = whiteNoiseContext.createBuffer(1, bufferSize, whiteNoiseContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Create nodes
    whiteNoiseNode = whiteNoiseContext.createBufferSource();
    whiteNoiseNode.buffer = noiseBuffer;
    whiteNoiseNode.loop = true;

    whiteNoiseGain = whiteNoiseContext.createGain();
    whiteNoiseGain.gain.value = volume;

    // Connect
    whiteNoiseNode.connect(whiteNoiseGain);
    whiteNoiseGain.connect(whiteNoiseContext.destination);

    // Start
    whiteNoiseNode.start();

    // Auto-stop after duration
    if (durationMs > 0) {
      setTimeout(() => stopWhiteNoise(), durationMs);
    }

    console.log('[FocusDJ] White noise started');
    return { success: true };
  } catch (err) {
    console.error('[FocusDJ] Failed to start white noise:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Stop white noise
 */
function stopWhiteNoise() {
  try {
    if (whiteNoiseNode) {
      whiteNoiseNode.stop();
      whiteNoiseNode.disconnect();
    }
    if (whiteNoiseGain) {
      whiteNoiseGain.disconnect();
    }
    if (whiteNoiseContext) {
      whiteNoiseContext.close();
    }
    whiteNoiseNode = null;
    whiteNoiseGain = null;
    whiteNoiseContext = null;
    console.log('[FocusDJ] White noise stopped');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * White noise burst - brief attention-grabber
 */
async function whiteNoiseBurst(durationMs = 2000) {
  const video = getVideo();
  const wasPlaying = video && !video.paused;
  const previousVolume = getVolume();

  // Lower music volume
  setVolume(20);

  // Start white noise
  startWhiteNoise(0.4, durationMs);

  // Wait for burst to complete
  await new Promise(resolve => setTimeout(resolve, durationMs + 500));

  // Restore music volume
  setVolume(previousVolume);

  return { success: true, wasPlaying };
}

// ============================================================
// Volume Duck (lower volume temporarily)
// ============================================================

let originalVolume = null;

/**
 * Duck volume (lower it for focus)
 */
function duckVolume(targetVolume = 30) {
  originalVolume = getVolume();
  setVolume(targetVolume);
  return { success: true, originalVolume };
}

/**
 * Restore volume after ducking
 */
function restoreVolume() {
  if (originalVolume !== null) {
    setVolume(originalVolume);
    originalVolume = null;
    return { success: true };
  }
  return { success: false, error: 'No original volume saved' };
}

// ============================================================
// Message Handling (from service worker)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FocusDJ] Received message:', message);

  let result = { success: false };

  try {
    switch (message.action) {
      // Basic controls
      case 'PLAY':
        result = { success: play() };
        break;
      case 'PAUSE':
        result = { success: pause() };
        break;
      case 'TOGGLE':
        result = { success: togglePlayPause() };
        break;
      case 'NEXT':
        result = { success: next() };
        break;
      case 'PREVIOUS':
        result = { success: previous() };
        break;
      case 'SHUFFLE':
        result = { success: toggleShuffle() };
        break;
      case 'REPEAT':
        result = { success: toggleRepeat() };
        break;

      // Volume
      case 'SET_VOLUME':
        result = { success: setVolume(message.level) };
        break;
      case 'GET_VOLUME':
        result = { success: true, volume: getVolume() };
        break;
      case 'MUTE':
        result = { success: toggleMute() };
        break;
      case 'MAX_VOLUME':
        result = { success: maxVolume() };
        break;

      // Seek
      case 'SEEK':
        result = { success: seek(message.seconds) };
        break;
      case 'SEEK_FORWARD':
        result = { success: seekForward(message.seconds || 10) };
        break;
      case 'SEEK_BACKWARD':
        result = { success: seekBackward(message.seconds || 10) };
        break;

      // Info
      case 'GET_INFO':
        result = { success: true, info: getTrackInfo() };
        break;
      case 'IS_PLAYING':
        result = { success: true, playing: isPlaying() };
        break;

      // Interventions
      case 'BOOST_ENERGY':
        result = { success: true, ...boostEnergy() };
        break;
      case 'PATTERN_BREAK':
        // Async - respond immediately, execute in background
        patternBreak(message.duration || 3000);
        result = { success: true, async: true };
        break;
      case 'NUCLEAR':
        // Async
        nuclear();
        result = { success: true, async: true };
        break;
      case 'RESET_SKIP':
        resetSkipCounter();
        result = { success: true };
        break;

      // White noise
      case 'WHITE_NOISE':
        whiteNoiseBurst(message.duration || 2000);
        result = { success: true, async: true };
        break;
      case 'WHITE_NOISE_START':
        result = startWhiteNoise(message.volume || 0.3, message.duration || 0);
        break;
      case 'WHITE_NOISE_STOP':
        result = stopWhiteNoise();
        break;

      // Volume duck
      case 'DUCK_VOLUME':
        result = duckVolume(message.level || 30);
        break;
      case 'RESTORE_VOLUME':
        result = restoreVolume();
        break;

      // Ping (for checking if tab is active)
      case 'PING':
        result = { success: true, playing: isPlaying() };
        break;

      default:
        result = { success: false, error: 'Unknown action' };
    }
  } catch (err) {
    console.error('[FocusDJ] Error handling message:', err);
    result = { success: false, error: err.message };
  }

  sendResponse(result);
  return true; // Keep channel open for async
});

// ============================================================
// Initialize
// ============================================================

// Notify service worker that we're ready
chrome.runtime.sendMessage({ type: 'YTM_READY', url: window.location.href });

console.log('[FocusDJ] YouTube Music controller ready');
