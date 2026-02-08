# FocusDJ Web Dashboard

Onboarding + settings hub for the FocusDJ Chrome extension.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at http://localhost:5173

## Features

- **Login** - Continue with Google (mock) or as Guest
- **Onboarding** - 5-step wizard to configure:
  - Music preferences (genres, artists, playlists)
  - Study technique (Pomodoro, Deep Work, Custom)
  - Privacy & AI tracking toggles
- **Dashboard** - Settings hub with:
  - Session settings (mode, playlists, energy)
  - AI controls (Viola toggles)
  - Privacy controls & data deletion
  - Focus timeline (mock visualization)

## Extension Connection

The web app syncs settings to the FocusDJ extension via:

1. **Direct messaging** - Uses `chrome.runtime.sendMessage` when extension is installed
2. **localStorage fallback** - Stores settings for extension to pick up

To enable direct messaging:
1. Load the extension in Chrome
2. Copy the extension ID from `chrome://extensions`
3. Update `EXTENSION_ID` in `src/utils/settings.js`

## Project Structure

```
web/
├── src/
│   ├── components/     # Reusable UI components
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── ChipSelect.jsx
│   │   ├── Input.jsx
│   │   ├── Slider.jsx
│   │   ├── Stepper.jsx
│   │   ├── Toast.jsx
│   │   ├── Toggle.jsx
│   │   ├── ViolaCard.jsx
│   │   └── Waveform.jsx
│   ├── pages/          # Route pages
│   │   ├── Login.jsx
│   │   ├── Onboarding.jsx
│   │   └── Dashboard.jsx
│   ├── utils/
│   │   └── settings.js # Settings schema & storage
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css       # Theme tokens & global styles
├── package.json
└── vite.config.js
```

## Settings Schema

```javascript
{
  user: { name, mode, loggedIn, onboarded, isGuest },
  music: { focusPlaylistUrl, breakPlaylistUrl, genres, artists, energy },
  study: { technique, workMins, breakMins, autoSwitchOnBreak },
  tracking: { enabled, camera, keystroke, mouse, scroll, tabs },
  extension: { nuclearEnabled, customProductive, customBlocked }
}
```

## Design System

- **Colors**: Dark background (#0a0a0f) with soft neon pink (#ff6b9d) accents
- **Typography**: Inter font family
- **Spacing**: Consistent 8px grid
- **Animations**: Subtle transitions and glow effects
