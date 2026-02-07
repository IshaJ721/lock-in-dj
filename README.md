# Lock In DJ

> Real-time focus detection with adaptive music intervention

A Chrome extension that detects when you lose focus while studying and automatically adjusts your music to help you lock in.

## Features

- **Focus Detection**: Tracks tab switching, doomscrolling, and idle time to compute a real-time focus score
- **Adaptive Interventions**: Uses a multi-armed bandit algorithm to learn what music changes work best for you
- **Spotify Integration**: Controls your Spotify playback to boost energy, switch playlists, or play pattern breaks
- **Nuclear Option**: Annoying audio blast when you're doomscrolling in strict mode
- **Privacy First**: All processing happens locally - no data leaves your browser

## Architecture

```
[Chrome Extension]
   ├─ Tab Sensors (switches, URLs, time)
   ├─ Focus Score Estimator (heuristic model)
   ↓
[Decision Engine]
   ├─ UCB1 Bandit for intervention selection
   ├─ Focus trend tracking
   ↓
[Music Controller]
   ├─ Spotify Web API integration
   ├─ Playlist / track switching
   ↓
[Feedback Loop]
   ├─ Measure focus improvement
   └─ Update intervention weights
```

## Setup

### 1. Get Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `https://<your-extension-id>.chromiumapp.org/callback`
4. Copy your Client ID

### 2. Configure the Extension

1. Open `extension/src/background/spotify/auth.js`
2. Replace `YOUR_SPOTIFY_CLIENT_ID` with your actual client ID

### 3. Load the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` folder
4. Copy your extension ID from the card
5. Update the Spotify app redirect URI with your actual extension ID

### 4. Connect Spotify

1. Click the extension icon
2. Click "Connect Spotify"
3. Authorize the app
4. Select your focus playlists in Settings

## Usage

1. **Start a Session**: Choose intensity (Gentle/Normal/Strict) and click Start
2. **Study**: The extension monitors your focus in the background
3. **Automatic Interventions**: When focus drops, music adapts automatically
4. **Learn**: The system learns which interventions work best for you

## Intervention Types

| Type | Description |
|------|-------------|
| Boost Energy | Skips to next track for energy boost |
| Switch Playlist | Changes to your deep focus playlist |
| Pattern Break | Short audio cue to snap you back |
| Nuclear | Annoying audio for doomscrolling (strict mode only) |

## Focus Score Calculation

```
focus_score = 100
  - 40 * tab_switch_penalty    (0-10 switches/min)
  - 45 * off_task_penalty      (time on blocked sites)
  - 15 * idle_penalty          (inactivity)
  + 10 * on_task_bonus         (sustained work time)
```

## Team Collaboration

### Directory Ownership

- **Person A**: UI (`src/ui/*`) + Storage (`storage.js`)
- **Person B**: Spotify (`src/background/spotify/*`)
- **Person C**: Focus model (`focus_model.js`) + Decision engine (`decision_engine.js`) + Service worker

### Branching Strategy

```bash
main          # stable
├─ feat/ui    # popup + options work
├─ feat/spotify # auth + playback
└─ feat/focus # scoring + decisions
```

## Tech Stack

- Chrome Extension Manifest V3
- Spotify Web API (OAuth PKCE)
- Vanilla JS (ES modules)
- chrome.storage for persistence
- chrome.alarms for periodic checks

## Privacy

- **All processing is local** - no external servers
- **No raw data stored** - only aggregated metrics
- **Tab URLs only used for domain matching** - full URLs never logged
- **Spotify tokens stored locally** - never transmitted

## License

MIT
