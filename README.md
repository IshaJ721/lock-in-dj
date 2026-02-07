# Lock In DJ

> Real-time focus detection with adaptive music intervention

A Chrome extension that detects when you lose focus while studying and automatically adjusts your music to help you lock in.

## Features

- **Focus Detection**: Tracks tab switching, doomscrolling, and idle time to compute a real-time focus score (0-100)
- **Adaptive Interventions**: Uses a multi-armed bandit algorithm (UCB1) to learn what music changes work best for you
- **YouTube Music Control**: Injects a controller into your YouTube Music tab to skip tracks, pause, adjust volume
- **Nuclear Option**: Max volume attention blast when you're caught doomscrolling in strict mode
- **Privacy First**: All processing happens locally - no data leaves your browser

## Architecture

```
[Chrome Extension]
   ├─ Tab Sensors (switches, URLs, time)
   ├─ Focus Score Estimator (weighted heuristic)
   ↓
[Decision Engine]
   ├─ UCB1 Bandit for intervention selection
   ├─ Focus trend tracking (EMA)
   ↓
[Music Controller]
   ├─ Content script injected in music.youtube.com
   ├─ DOM manipulation for play/pause/next/volume
   ↓
[Feedback Loop]
   ├─ Measure focus improvement after 45s
   └─ Update intervention arm weights
```

## Setup

### 1. Load the Extension

1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" → select the `extension` folder

### 2. Open YouTube Music

1. Go to [music.youtube.com](https://music.youtube.com)
2. Start playing your focus playlist
3. The extension will automatically detect the tab

### 3. Start a Session

1. Click the extension icon
2. Choose intensity: Gentle / Normal / Strict
3. Click "Start Session"
4. Study!

## How It Works

### Focus Score Calculation

```javascript
focus_score = 100
  - 40 * tab_switch_penalty    // 10+ switches/min = max penalty
  - 45 * off_task_penalty      // time on doomscroll sites
  - 15 * idle_penalty          // inactivity
  + 10 * on_task_bonus         // sustained work time
```

### Intervention Types

| Type | What it does |
|------|-------------|
| **Boost Energy** | Skips to next track (up to 3x) |
| **Switch Playlist** | Skips track (can't switch playlists in YTM easily) |
| **Pattern Break** | Pauses for 3 seconds, then resumes |
| **Nuclear** | Max volume for 3 seconds (strict mode + doomscrolling only) |

### UCB1 Bandit Algorithm

The system learns which interventions work for you:

1. After each intervention, wait 45 seconds
2. Measure focus score change (delta)
3. Convert to reward: `(delta + 15) / 30` → 0 to 1
4. Update arm value with incremental mean

Over time, it favors interventions that actually improve your focus.

## File Structure

```
extension/
├── manifest.json              # Chrome MV3 manifest
├── src/
│   ├── background/
│   │   ├── service_worker.js  # Main brain - orchestrates everything
│   │   ├── storage.js         # State management
│   │   ├── focus_model.js     # Focus score computation
│   │   ├── decision_engine.js # UCB1 bandit + intervention logic
│   │   └── music_controller.js # Abstracts YTM control
│   ├── content/
│   │   └── ytm_controller.js  # Injected into YouTube Music
│   └── ui/
│       ├── popup.html/js      # Extension popup
│       ├── options.html/js    # Settings page
│       └── styles.css         # Shared styles
```

## Team Collaboration

### Suggested Split

- **Person A**: UI (popup + options) + styling
- **Person B**: YouTube Music controller (content script)
- **Person C**: Focus model + decision engine + service worker

### Key Integration Points

1. `service_worker.js` calls `music_controller.js` for interventions
2. `music_controller.js` sends messages to `ytm_controller.js` (content script)
3. `ytm_controller.js` manipulates YouTube Music DOM

## Privacy

- ✅ All focus detection happens on-device
- ✅ No URLs or page content is stored long-term
- ✅ No external API calls (except YouTube Music DOM)
- ✅ Learning model stays in `chrome.storage.local`

## Future Ideas

- [ ] Webcam-based gaze detection (opt-in)
- [ ] Pomodoro timer integration
- [ ] Focus score history dashboard
- [ ] Cross-user learning (aggregated, anonymous)
- [ ] Support for other music services (Spotify when API is back)

## License

MIT
