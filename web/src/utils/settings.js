/**
 * FocusDJ Settings Schema
 * This schema is designed to sync with the Chrome extension's storage
 */

const DEFAULT_SETTINGS = {
  user: {
    name: '',
    mode: 'normal', // 'gentle' | 'normal' | 'strict'
    loggedIn: false,
    onboarded: false,
    isGuest: false,
  },
  music: {
    focusPlaylistUrl: '',
    breakPlaylistUrl: '',
    genres: [],
    artists: [],
    energy: 50, // 0-100 (calm to hype)
  },
  study: {
    technique: 'pomodoro', // 'pomodoro' | '45-15' | 'custom'
    workMins: 25,
    breakMins: 5,
    autoSwitchOnBreak: true,
  },
  tracking: {
    enabled: true,
    camera: false,
    keystroke: true,
    mouse: true,
    scroll: true,
    tabs: true,
  },
  // Extension-specific settings (synced from extension)
  extension: {
    nuclearEnabled: false,
    customProductive: [],
    customBlocked: [],
  },
}

const STORAGE_KEY = 'focusdj_settings'

// Check if we're in Chrome extension context
const isExtension = typeof chrome !== 'undefined' && chrome.storage

/**
 * Load settings - uses chrome.storage in extension, localStorage as fallback
 */
export function loadSettings() {
  // Sync version for initial render (localStorage fallback)
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return deepMerge(DEFAULT_SETTINGS, JSON.parse(stored))
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
  return { ...DEFAULT_SETTINGS }
}

/**
 * Load settings async (preferred - uses chrome.storage)
 */
export async function loadSettingsAsync() {
  if (isExtension) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      if (result[STORAGE_KEY]) {
        return deepMerge(DEFAULT_SETTINGS, result[STORAGE_KEY])
      }
    } catch (err) {
      console.error('Chrome storage load failed:', err)
    }
  }
  return loadSettings()
}

/**
 * Save settings to storage
 */
export function saveSettings(settings) {
  try {
    // Always save to localStorage for sync reads
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))

    // Also save to chrome.storage if available
    if (isExtension) {
      chrome.storage.local.set({ [STORAGE_KEY]: settings })
    }
    return true
  } catch (err) {
    console.error('Failed to save settings:', err)
    return false
  }
}

/**
 * Update specific settings (partial update)
 */
export function updateSettings(updates) {
  const current = loadSettings()
  const updated = deepMerge(current, updates)
  saveSettings(updated)

  // Also sync to extension state if in extension context
  if (isExtension) {
    syncToExtensionState(updated)
  }

  return updated
}

/**
 * Reset all settings to defaults
 */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY)
  if (isExtension) {
    chrome.storage.local.remove(STORAGE_KEY)
  }
  return { ...DEFAULT_SETTINGS }
}

/**
 * Sync settings directly to extension state (we're inside the extension now)
 */
async function syncToExtensionState(settings) {
  if (!isExtension) return { success: false, error: 'Not in extension context' }

  const extensionSettings = {
    mode: settings.user.mode,
    focusPlaylistUrl: settings.music.focusPlaylistUrl,
    breakPlaylistUrl: settings.music.breakPlaylistUrl,
    energy: settings.music.energy,
    pomodoroEnabled: settings.study.technique !== 'custom',
    pomodoroWork: settings.study.workMins,
    pomodoroBreak: settings.study.breakMins,
    autoSwitchOnBreak: settings.study.autoSwitchOnBreak,
    trackingEnabled: settings.tracking.enabled,
    trackCamera: settings.tracking.camera,
    trackKeystroke: settings.tracking.keystroke,
    trackMouse: settings.tracking.mouse,
    trackScroll: settings.tracking.scroll,
    trackTabs: settings.tracking.tabs,
    nuclearEnabled: settings.extension.nuclearEnabled,
    customProductive: settings.extension.customProductive,
    customBlocked: settings.extension.customBlocked,
  }

  try {
    // Send message to service worker to sync settings
    const response = await chrome.runtime.sendMessage({
      type: 'SYNC_SETTINGS',
      settings: extensionSettings,
    })
    return { success: true, response }
  } catch (err) {
    console.error('Extension sync failed:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Public sync function - called from Dashboard
 */
export async function syncToExtension(settings) {
  return syncToExtensionState(settings)
}

/**
 * Deep merge utility
 */
function deepMerge(target, source) {
  const output = { ...target }
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key])
    } else {
      output[key] = source[key]
    }
  }
  return output
}

/**
 * Genre options for music preferences
 */
export const GENRE_OPTIONS = [
  'Lo-Fi',
  'Classical',
  'Jazz',
  'Ambient',
  'Electronic',
  'Indie',
  'Pop',
  'Hip-Hop',
  'R&B',
  'Rock',
  'Acoustic',
  'Instrumental',
]

/**
 * Study technique presets
 */
export const TECHNIQUE_PRESETS = {
  pomodoro: { workMins: 25, breakMins: 5, label: 'Pomodoro (25/5)' },
  '45-15': { workMins: 45, breakMins: 15, label: 'Deep Work (45/15)' },
  custom: { workMins: 30, breakMins: 10, label: 'Custom' },
}
