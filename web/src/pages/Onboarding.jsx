import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings, updateSettings, GENRE_OPTIONS, TECHNIQUE_PRESETS } from '../utils/settings'
import Button from '../components/Button'
import Card from '../components/Card'
import Stepper from '../components/Stepper'
import ChipSelect from '../components/ChipSelect'
import Slider from '../components/Slider'
import Toggle from '../components/Toggle'
import Input, { TagInput } from '../components/Input'
import ViolaCard from '../components/ViolaCard'
import './Onboarding.css'

const STEPS = ['Welcome', 'Music', 'Study', 'Sites', 'Privacy', 'Done']

// Common distraction sites for quick selection
const COMMON_DISTRACTIONS = [
  'twitter.com', 'instagram.com', 'tiktok.com', 'reddit.com',
  'facebook.com', 'youtube.com', 'netflix.com', 'twitch.tv',
  'discord.com', 'snapchat.com', 'pinterest.com', 'tumblr.com',
]

// Common productive sites for quick selection
const COMMON_PRODUCTIVE = [
  'docs.google.com', 'notion.so', 'github.com', 'stackoverflow.com',
  'coursera.org', 'khanacademy.org', 'quizlet.com', 'canvas.instructure.com',
  'figma.com', 'linear.app', 'overleaf.com', 'wikipedia.org',
]

function Onboarding({ showToast }) {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [settings, setSettings] = useState(loadSettings())

  const updateLocal = (updates) => {
    const newSettings = { ...settings }
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        newSettings[key] = { ...newSettings[key], ...value }
      } else {
        newSettings[key] = value
      }
    }
    setSettings(newSettings)
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    updateSettings({
      ...settings,
      user: { ...settings.user, onboarded: true }
    })
    showToast('Setup complete! Welcome to FocusDJ')
    navigate('/dashboard')
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />
      case 1:
        return <MusicStep settings={settings} updateLocal={updateLocal} />
      case 2:
        return <StudyStep settings={settings} updateLocal={updateLocal} />
      case 3:
        return <SitesStep settings={settings} updateLocal={updateLocal} />
      case 4:
        return <PrivacyStep settings={settings} updateLocal={updateLocal} />
      case 5:
        return <DoneStep />
      default:
        return null
    }
  }

  return (
    <div className="onboarding-page page">
      <div className="onboarding-container">
        <Stepper
          steps={STEPS}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />

        <div className="onboarding-content animate-fade-in" key={currentStep}>
          {renderStep()}
        </div>

        <div className="onboarding-actions">
          {currentStep > 0 && currentStep < STEPS.length - 1 && (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          )}
          <div className="onboarding-actions-right">
            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext}>
                {currentStep === 0 ? "Let's Go" : 'Continue'}
              </Button>
            ) : (
              <Button onClick={handleComplete}>
                Open FocusDJ Extension
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="step-welcome">
      <ViolaCard
        message="Hey! I'm Viola, your focus companion. I'll help you stay in the zone by adapting your music to your study patterns. Let's set things up!"
        status="active"
      />
    </div>
  )
}

function MusicStep({ settings, updateLocal }) {
  return (
    <div className="step-music">
      <h2>Music Preferences</h2>
      <p className="step-description">Tell me what keeps you focused</p>

      <div className="form-section">
        <h4>Favorite Genres</h4>
        <ChipSelect
          options={GENRE_OPTIONS}
          selected={settings.music.genres}
          onChange={(genres) => updateLocal({ music: { genres } })}
          maxSelect={5}
        />
      </div>

      <div className="form-section">
        <TagInput
          label="Favorite Artists (optional)"
          value={settings.music.artists}
          onChange={(artists) => updateLocal({ music: { artists } })}
          placeholder="Type artist name and press Enter..."
          maxTags={5}
        />
      </div>

      <div className="form-section">
        <Input
          label="Focus Playlist URL"
          value={settings.music.focusPlaylistUrl}
          onChange={(focusPlaylistUrl) => updateLocal({ music: { focusPlaylistUrl } })}
          placeholder="https://music.youtube.com/playlist?list=..."
          hint="Paste your YouTube Music focus playlist"
        />
      </div>

      <div className="form-section">
        <Input
          label="Break Playlist URL (optional)"
          value={settings.music.breakPlaylistUrl}
          onChange={(breakPlaylistUrl) => updateLocal({ music: { breakPlaylistUrl } })}
          placeholder="https://music.youtube.com/playlist?list=..."
          hint="Music for your break time"
        />
      </div>

      <div className="form-section">
        <Slider
          label="Energy Level"
          value={settings.music.energy}
          onChange={(energy) => updateLocal({ music: { energy } })}
          min={0}
          max={100}
          leftLabel="Calm"
          rightLabel="Hype"
        />
      </div>
    </div>
  )
}

function StudyStep({ settings, updateLocal }) {
  const handleTechniqueChange = (technique) => {
    const preset = TECHNIQUE_PRESETS[technique]
    updateLocal({
      study: {
        technique,
        workMins: preset.workMins,
        breakMins: preset.breakMins,
      }
    })
  }

  return (
    <div className="step-study">
      <h2>Study Technique</h2>
      <p className="step-description">How do you like to structure your sessions?</p>

      <div className="technique-options">
        {Object.entries(TECHNIQUE_PRESETS).map(([key, preset]) => (
          <Card
            key={key}
            variant={settings.study.technique === key ? 'glow' : 'default'}
            padding="md"
            className={`technique-card ${settings.study.technique === key ? 'selected' : ''}`}
            onClick={() => handleTechniqueChange(key)}
          >
            <div className="technique-info">
              <span className="technique-label">{preset.label}</span>
              <span className="technique-times">
                {preset.workMins}min work / {preset.breakMins}min break
              </span>
            </div>
          </Card>
        ))}
      </div>

      {settings.study.technique === 'custom' && (
        <div className="custom-times">
          <div className="time-input">
            <label>Work Duration</label>
            <div className="time-controls">
              <button onClick={() => updateLocal({ study: { workMins: Math.max(5, settings.study.workMins - 5) } })}>-</button>
              <span>{settings.study.workMins} min</span>
              <button onClick={() => updateLocal({ study: { workMins: Math.min(90, settings.study.workMins + 5) } })}>+</button>
            </div>
          </div>
          <div className="time-input">
            <label>Break Duration</label>
            <div className="time-controls">
              <button onClick={() => updateLocal({ study: { breakMins: Math.max(1, settings.study.breakMins - 1) } })}>-</button>
              <span>{settings.study.breakMins} min</span>
              <button onClick={() => updateLocal({ study: { breakMins: Math.min(30, settings.study.breakMins + 1) } })}>+</button>
            </div>
          </div>
        </div>
      )}

      <div className="form-section">
        <Toggle
          checked={settings.study.autoSwitchOnBreak}
          onChange={(autoSwitchOnBreak) => updateLocal({ study: { autoSwitchOnBreak } })}
          label="Switch to fun music during breaks"
          description="I'll play your break playlist when it's time to relax"
        />
      </div>
    </div>
  )
}

function SitesStep({ settings, updateLocal }) {
  const [customDistraction, setCustomDistraction] = useState('')
  const [customProductive, setCustomProductive] = useState('')

  // Initialize extension settings if not present
  const blockedSites = settings.extension?.customBlocked || []
  const productiveSites = settings.extension?.customProductive || []

  const toggleDistraction = (site) => {
    const current = [...blockedSites]
    const index = current.indexOf(site)
    if (index > -1) {
      current.splice(index, 1)
    } else {
      current.push(site)
    }
    updateLocal({ extension: { customBlocked: current } })
  }

  const toggleProductive = (site) => {
    const current = [...productiveSites]
    const index = current.indexOf(site)
    if (index > -1) {
      current.splice(index, 1)
    } else {
      current.push(site)
    }
    updateLocal({ extension: { customProductive: current } })
  }

  const addCustomDistraction = () => {
    if (customDistraction && !blockedSites.includes(customDistraction)) {
      updateLocal({ extension: { customBlocked: [...blockedSites, customDistraction] } })
      setCustomDistraction('')
    }
  }

  const addCustomProductive = () => {
    if (customProductive && !productiveSites.includes(customProductive)) {
      updateLocal({ extension: { customProductive: [...productiveSites, customProductive] } })
      setCustomProductive('')
    }
  }

  return (
    <div className="step-sites">
      <h2>Site Categories</h2>
      <p className="step-description">
        Tell me which sites distract you and which help you focus
      </p>

      <div className="form-section">
        <h4>Distracting Sites</h4>
        <p className="section-hint">Select sites that break your focus</p>
        <div className="site-chips">
          {COMMON_DISTRACTIONS.map((site) => (
            <button
              key={site}
              type="button"
              className={`site-chip distraction ${blockedSites.includes(site) ? 'selected' : ''}`}
              onClick={() => toggleDistraction(site)}
            >
              {site}
            </button>
          ))}
        </div>
        <div className="custom-site-input">
          <Input
            value={customDistraction}
            onChange={setCustomDistraction}
            placeholder="Add custom site (e.g., example.com)"
            onKeyDown={(e) => e.key === 'Enter' && addCustomDistraction()}
          />
          <Button variant="ghost" size="sm" onClick={addCustomDistraction}>
            Add
          </Button>
        </div>
        {blockedSites.filter(s => !COMMON_DISTRACTIONS.includes(s)).length > 0 && (
          <div className="custom-sites">
            <span className="custom-label">Custom:</span>
            {blockedSites.filter(s => !COMMON_DISTRACTIONS.includes(s)).map((site) => (
              <span key={site} className="custom-tag distraction">
                {site}
                <button onClick={() => toggleDistraction(site)}>&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="form-section">
        <h4>Productive Sites</h4>
        <p className="section-hint">Select sites that help you stay productive</p>
        <div className="site-chips">
          {COMMON_PRODUCTIVE.map((site) => (
            <button
              key={site}
              type="button"
              className={`site-chip productive ${productiveSites.includes(site) ? 'selected' : ''}`}
              onClick={() => toggleProductive(site)}
            >
              {site}
            </button>
          ))}
        </div>
        <div className="custom-site-input">
          <Input
            value={customProductive}
            onChange={setCustomProductive}
            placeholder="Add custom site (e.g., mywork.com)"
            onKeyDown={(e) => e.key === 'Enter' && addCustomProductive()}
          />
          <Button variant="ghost" size="sm" onClick={addCustomProductive}>
            Add
          </Button>
        </div>
        {productiveSites.filter(s => !COMMON_PRODUCTIVE.includes(s)).length > 0 && (
          <div className="custom-sites">
            <span className="custom-label">Custom:</span>
            {productiveSites.filter(s => !COMMON_PRODUCTIVE.includes(s)).map((site) => (
              <span key={site} className="custom-tag productive">
                {site}
                <button onClick={() => toggleProductive(site)}>&times;</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="sites-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p>
          These settings help Viola understand your focus patterns.
          You can always change them later in Settings.
        </p>
      </div>
    </div>
  )
}

function PrivacyStep({ settings, updateLocal }) {
  return (
    <div className="step-privacy">
      <h2>Privacy & AI Controls</h2>
      <p className="step-description">
        You're in control. Enable only what you're comfortable with.
      </p>

      <Card variant="elevated" padding="md" className="privacy-card">
        <Toggle
          checked={settings.tracking.enabled}
          onChange={(enabled) => updateLocal({ tracking: { enabled } })}
          label="Enable Viola"
          description="Master toggle for all AI-powered focus detection"
          size="lg"
        />
      </Card>

      <div className={`tracking-options ${!settings.tracking.enabled ? 'disabled' : ''}`}>
        <h4>Detection Signals</h4>
        <p className="tracking-intro">
          Viola uses these signals to understand your focus. All processing happens locally on your device.
        </p>

        <Toggle
          checked={settings.tracking.camera}
          onChange={(camera) => updateLocal({ tracking: { camera } })}
          label="Camera-based posture detection"
          description="Detects if you're looking away. No images are stored or transmitted."
          disabled={!settings.tracking.enabled}
        />

        <Toggle
          checked={settings.tracking.keystroke}
          onChange={(keystroke) => updateLocal({ tracking: { keystroke } })}
          label="Keystroke timing"
          description="Measures typing rhythm to detect focus. No text content is ever captured."
          disabled={!settings.tracking.enabled}
        />

        <Toggle
          checked={settings.tracking.mouse}
          onChange={(mouse) => updateLocal({ tracking: { mouse } })}
          label="Mouse movement"
          description="Tracks cursor activity patterns. Position data stays local."
          disabled={!settings.tracking.enabled}
        />

        <Toggle
          checked={settings.tracking.scroll}
          onChange={(scroll) => updateLocal({ tracking: { scroll } })}
          label="Scroll behavior"
          description="Detects doomscrolling patterns. No page content is accessed."
          disabled={!settings.tracking.enabled}
        />

        <Toggle
          checked={settings.tracking.tabs}
          onChange={(tabs) => updateLocal({ tracking: { tabs } })}
          label="Tab switching"
          description="Monitors tab changes to detect distraction. URLs are categorized locally."
          disabled={!settings.tracking.enabled}
        />
      </div>

      <div className="privacy-reassurance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <p>
          <strong>Your privacy is our priority.</strong> All data is processed on your device.
          Nothing is sent to external servers. You can delete all local data anytime from Settings.
        </p>
      </div>
    </div>
  )
}

function DoneStep() {
  return (
    <div className="step-done">
      <div className="done-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h2>You're all set!</h2>
      <p className="step-description">
        Viola is ready to help you stay focused. Open the FocusDJ extension to start your first session.
      </p>

      <ViolaCard
        message="I'll be watching your back. Let's lock in and get things done!"
        status="idle"
      />
    </div>
  )
}

export default Onboarding
