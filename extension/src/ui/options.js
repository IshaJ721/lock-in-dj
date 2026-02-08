// Options page controller - YouTube Music version

const $ = (id) => document.getElementById(id);

// ============================================================
// Load settings
// ============================================================

async function loadSettings() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const settings = state.settings || {};

  // Site lists
  $('study-sites').value = (settings.customProductive || settings.studySites || []).join('\n');
  $('doomscroll-sites').value = (settings.customBlocked || settings.doomscrollSites || []).join('\n');

  // Toggles
  $('nuclear-enabled').checked = settings.nuclearEnabled;
  $('pomodoro-enabled').checked = settings.pomodoroEnabled;

  // Pomodoro
  $('pomodoro-work').value = settings.pomodoroWork || 25;
  $('pomodoro-break').value = settings.pomodoroBreak || 5;
  $('pomodoro-settings').style.display = settings.pomodoroEnabled ? 'block' : 'none';

  // AI Recommendations
  $('ai-recommendations-enabled').checked = settings.aiRecommendationsEnabled !== false;

  // Auto Music Switch
  $('auto-music-switch').checked = settings.autoMusicSwitch !== false;
  $('auto-music-threshold').value = settings.autoMusicThreshold || 50;
  $('threshold-value').textContent = settings.autoMusicThreshold || 50;

  // Genre Preferences
  const preferredGenres = settings.preferredGenres || [];
  document.querySelectorAll('.genre-checkbox').forEach(cb => {
    cb.checked = preferredGenres.includes(cb.value);
  });

  // Load API key status
  await loadApiKeyStatus();

  // Load music intelligence
  await loadMusicIntelligence();
}

// ============================================================
// API Key Management
// ============================================================

async function loadApiKeyStatus() {
  // Check if keys exist (without retrieving them)
  const groqResult = await chrome.runtime.sendMessage({ type: 'GET_API_KEY', keyType: 'groq' });
  const serpResult = await chrome.runtime.sendMessage({ type: 'GET_API_KEY', keyType: 'serp' });

  if (groqResult.hasKey) {
    $('groq-api-key').value = '••••••••••••••••';
    $('groq-status').textContent = '✓ Key saved';
    $('groq-status').style.color = '#22c55e';
  }

  if (serpResult.hasKey) {
    $('serp-api-key').value = '••••••••••••••••';
    $('serp-status').textContent = '✓ Key saved';
    $('serp-status').style.color = '#22c55e';
  }
}

// Toggle password visibility
$('toggle-groq-key').addEventListener('click', () => {
  const input = $('groq-api-key');
  const btn = $('toggle-groq-key');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
});

$('toggle-serp-key').addEventListener('click', () => {
  const input = $('serp-api-key');
  const btn = $('toggle-serp-key');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
});

// Test API connections
$('test-apis').addEventListener('click', async () => {
  const btn = $('test-apis');
  btn.textContent = 'Testing...';
  btn.disabled = true;

  // Save keys first
  const groqKey = $('groq-api-key').value;
  const serpKey = $('serp-api-key').value;

  if (groqKey && !groqKey.startsWith('••')) {
    await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', keyType: 'groq', value: groqKey });
  }
  if (serpKey && !serpKey.startsWith('••')) {
    await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', keyType: 'serp', value: serpKey });
  }

  // Test Groq
  try {
    const groqKeyResult = await chrome.storage.local.get('apiKey_groq');
    if (groqKeyResult.apiKey_groq) {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${groqKeyResult.apiKey_groq}` },
      });
      if (response.ok) {
        $('groq-status').textContent = '✓ Connected';
        $('groq-status').style.color = '#22c55e';
      } else {
        throw new Error('Invalid key');
      }
    }
  } catch (err) {
    $('groq-status').textContent = '✗ Connection failed';
    $('groq-status').style.color = '#ef4444';
  }

  // Test SERP
  try {
    const serpKeyResult = await chrome.storage.local.get('apiKey_serp');
    if (serpKeyResult.apiKey_serp) {
      const response = await fetch(
        `https://serpapi.com/account.json?api_key=${serpKeyResult.apiKey_serp}`
      );
      if (response.ok) {
        $('serp-status').textContent = '✓ Connected';
        $('serp-status').style.color = '#22c55e';
      } else {
        throw new Error('Invalid key');
      }
    }
  } catch (err) {
    $('serp-status').textContent = '✗ Connection failed';
    $('serp-status').style.color = '#ef4444';
  }

  btn.textContent = 'Test API Connections';
  btn.disabled = false;
});

// ============================================================
// Music Intelligence
// ============================================================

async function loadMusicIntelligence() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GET_MUSIC_INTELLIGENCE' });
    if (!result.success) return;

    const intelligence = result.intelligence;

    // Track count
    $('tracks-analyzed').textContent = intelligence.trackHistory?.length || 0;

    // Optimal BPM
    const optimalRange = intelligence.bpmModel?.optimalRange;
    if (optimalRange) {
      const rangeLabels = { slow: '60-90', moderate: '90-120', upbeat: '120-140', fast: '140+' };
      $('optimal-bpm').textContent = rangeLabels[optimalRange] || '--';
    }

    // Top genre
    const topGenre = intelligence.genreModel?.optimalGenres?.[0]?.category;
    if (topGenre) {
      $('top-genre').textContent = topGenre.charAt(0).toUpperCase() + topGenre.slice(1);
    }

    // BPM model details
    const bpmModel = intelligence.bpmModel;
    if (bpmModel && Object.values(bpmModel.ranges).some(r => r.sampleCount > 0)) {
      let html = '<table style="width: 100%; font-size: 12px;">';
      html += '<tr style="color: #666;"><th style="text-align: left;">BPM Range</th><th>Samples</th><th>Avg Focus</th></tr>';

      for (const [range, data] of Object.entries(bpmModel.ranges)) {
        if (data.sampleCount > 0) {
          const rangeLabels = { slow: '60-90', moderate: '90-120', upbeat: '120-140', fast: '140-180' };
          const isOptimal = range === bpmModel.optimalRange;
          html += `<tr style="${isOptimal ? 'color: #ff6b9d;' : ''}">
            <td>${rangeLabels[range]} BPM ${isOptimal ? '★' : ''}</td>
            <td style="text-align: center;">${data.sampleCount}</td>
            <td style="text-align: center;">${Math.round(data.avgFocusScore)}%</td>
          </tr>`;
        }
      }
      html += '</table>';
      $('bpm-model-details').innerHTML = html;
    }
  } catch (err) {
    console.error('Failed to load music intelligence:', err);
  }
}

// Clear music learning data
$('clear-music-data').addEventListener('click', async () => {
  if (!confirm('Clear all music learning data? This will reset BPM preferences and recommendations.')) {
    return;
  }

  await chrome.runtime.sendMessage({ type: 'CLEAR_MUSIC_INTELLIGENCE' });

  $('tracks-analyzed').textContent = '0';
  $('optimal-bpm').textContent = '--';
  $('top-genre').textContent = '--';
  $('bpm-model-details').innerHTML = '<p>BPM correlation data will appear here as you listen to music.</p>';

  const btn = $('clear-music-data');
  btn.textContent = 'Cleared!';
  setTimeout(() => { btn.textContent = 'Clear Music Learning Data'; }, 2000);
});

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
// Auto Music Threshold slider
// ============================================================

$('auto-music-threshold').addEventListener('input', (e) => {
  $('threshold-value').textContent = e.target.value;
});

// ============================================================
// Save settings
// ============================================================

$('save-settings').addEventListener('click', async () => {
  const customProductive = $('study-sites').value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s);

  const customBlocked = $('doomscroll-sites').value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s);

  // Save API keys if changed
  const groqKey = $('groq-api-key').value;
  const serpKey = $('serp-api-key').value;

  if (groqKey && !groqKey.startsWith('••')) {
    await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', keyType: 'groq', value: groqKey });
  }
  if (serpKey && !serpKey.startsWith('••')) {
    await chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', keyType: 'serp', value: serpKey });
  }

  // Update state
  const result = await chrome.storage.local.get('state');
  const state = result.state;

  // Get selected genres
  const preferredGenres = [];
  document.querySelectorAll('.genre-checkbox:checked').forEach(cb => {
    preferredGenres.push(cb.value);
  });

  state.settings = {
    ...state.settings,
    customProductive,
    customBlocked,
    // Keep old names for backwards compatibility
    studySites: customProductive,
    doomscrollSites: customBlocked,
    nuclearEnabled: $('nuclear-enabled').checked,
    pomodoroEnabled: $('pomodoro-enabled').checked,
    pomodoroWork: parseInt($('pomodoro-work').value) || 25,
    pomodoroBreak: parseInt($('pomodoro-break').value) || 5,
    aiRecommendationsEnabled: $('ai-recommendations-enabled').checked,
    autoMusicSwitch: $('auto-music-switch').checked,
    autoMusicThreshold: parseInt($('auto-music-threshold').value) || 50,
    preferredGenres,
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
      SMART_RECOMMEND: { value: 0.6, n: 1 },
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
