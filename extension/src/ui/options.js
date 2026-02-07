// Options page controller

import { isAuthenticated } from '../background/spotify/auth.js';
import { getUserPlaylists } from '../background/spotify/api.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// Load settings
// ============================================================

async function loadSettings() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const settings = state.settings;

  // Site lists
  $('study-sites').value = settings.studySites.join('\n');
  $('doomscroll-sites').value = settings.doomscrollSites.join('\n');

  // Toggles
  $('nuclear-enabled').checked = settings.nuclearEnabled;
  $('pomodoro-enabled').checked = settings.pomodoroEnabled;

  // Pomodoro
  $('pomodoro-work').value = settings.pomodoroWork;
  $('pomodoro-break').value = settings.pomodoroBreak;
  $('pomodoro-settings').style.display = settings.pomodoroEnabled ? 'block' : 'none';

  // Load playlists if authenticated
  if (await isAuthenticated()) {
    loadPlaylists(state.spotify.playlists);
  }
}

// ============================================================
// Playlists
// ============================================================

async function loadPlaylists(selectedPlaylists) {
  try {
    const data = await getUserPlaylists();
    const playlists = data.items || [];

    renderPlaylistSelector('lockin-playlists', playlists, selectedPlaylists?.lockIn, 'lockIn');
    renderPlaylistSelector('deepfocus-playlists', playlists, selectedPlaylists?.deepFocus, 'deepFocus');
  } catch (err) {
    console.error('Failed to load playlists:', err);
  }
}

function renderPlaylistSelector(containerId, playlists, selectedUri, type) {
  const container = $(containerId);
  container.innerHTML = '';

  playlists.slice(0, 8).forEach((playlist) => {
    const btn = document.createElement('button');
    btn.className = 'playlist-option' + (playlist.uri === selectedUri ? ' selected' : '');
    btn.dataset.uri = playlist.uri;
    btn.dataset.type = type;
    btn.innerHTML = `
      <span class="playlist-name">${playlist.name}</span>
      <span class="playlist-tracks">${playlist.tracks.total} tracks</span>
    `;
    btn.addEventListener('click', () => selectPlaylist(btn, containerId));
    container.appendChild(btn);
  });
}

function selectPlaylist(btn, containerId) {
  const container = $(containerId);
  container.querySelectorAll('.playlist-option').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
}

$('refresh-playlists').addEventListener('click', async () => {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  await loadPlaylists(state.spotify.playlists);
});

// ============================================================
// Pomodoro toggle
// ============================================================

$('pomodoro-enabled').addEventListener('change', (e) => {
  $('pomodoro-settings').style.display = e.target.checked ? 'block' : 'none';
});

// ============================================================
// Save settings
// ============================================================

$('save-settings').addEventListener('click', async () => {
  const studySites = $('study-sites').value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s);

  const doomscrollSites = $('doomscroll-sites').value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s);

  // Get selected playlists
  const lockInPlaylist = document.querySelector('#lockin-playlists .playlist-option.selected')?.dataset.uri;
  const deepFocusPlaylist = document.querySelector('#deepfocus-playlists .playlist-option.selected')?.dataset.uri;

  // Update state
  const result = await chrome.storage.local.get('state');
  const state = result.state;

  state.settings = {
    ...state.settings,
    studySites,
    doomscrollSites,
    nuclearEnabled: $('nuclear-enabled').checked,
    pomodoroEnabled: $('pomodoro-enabled').checked,
    pomodoroWork: parseInt($('pomodoro-work').value) || 25,
    pomodoroBreak: parseInt($('pomodoro-break').value) || 5,
  };

  if (lockInPlaylist) {
    state.spotify.playlists.lockIn = lockInPlaylist;
  }
  if (deepFocusPlaylist) {
    state.spotify.playlists.deepFocus = deepFocusPlaylist;
  }

  await chrome.storage.local.set({ state });

  // Show confirmation
  const btn = $('save-settings');
  const originalText = btn.textContent;
  btn.textContent = 'Saved!';
  btn.style.background = '#10b981';
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);
});

// ============================================================
// Clear history
// ============================================================

$('clear-history').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all history and reset the learning model?')) {
    return;
  }

  const result = await chrome.storage.local.get('state');
  const state = result.state;

  state.history = [];
  state.policy = {
    arms: {
      BOOST_ENERGY: { value: 0.5, n: 1 },
      SWITCH_PLAYLIST: { value: 0.5, n: 1 },
      PATTERN_BREAK: { value: 0.5, n: 1 },
      NUCLEAR: { value: 0.2, n: 1 },
    },
  };

  await chrome.storage.local.set({ state });

  alert('History cleared and learning model reset.');
});

// ============================================================
// Initialize
// ============================================================

loadSettings();
