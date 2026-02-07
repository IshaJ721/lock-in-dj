// Options page controller - YouTube Music version

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
}

// ============================================================
// YouTube Music
// ============================================================

$('open-ytmusic').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://music.youtube.com/' });
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
  if (!confirm('Are you sure you want to reset the learning model? This cannot be undone.')) {
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

  const btn = $('clear-history');
  btn.textContent = 'Reset Complete';
  setTimeout(() => {
    btn.textContent = 'Reset Learning Model';
  }, 2000);
});

// ============================================================
// Initialize
// ============================================================

loadSettings();
