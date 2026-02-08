import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadSettings,
  updateSettings,
  resetSettings,
  syncToExtension,
  GENRE_OPTIONS,
  TECHNIQUE_PRESETS,
} from '../utils/settings'
import Button from '../components/Button'
import Card from '../components/Card'
import Toggle from '../components/Toggle'
import Slider from '../components/Slider'
import Input, { TagInput } from '../components/Input'
import ChipSelect from '../components/ChipSelect'
import ViolaCard from '../components/ViolaCard'
import './Dashboard.css'

function Dashboard({ showToast }) {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(loadSettings())
  const [syncing, setSyncing] = useState(false)

  // Check if user is logged in
  useEffect(() => {
    const s = loadSettings()
    if (!s.user.loggedIn) {
      navigate('/login')
    }
  }, [navigate])

  const update = (updates) => {
    const newSettings = updateSettings(updates)
    setSettings(newSettings)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncToExtension(settings)
      if (result.success) {
        showToast('Settings synced to FocusDJ extension')
      } else {
        showToast('Sync failed. Is the extension installed?', 'error')
      }
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error')
    }
    setSyncing(false)
  }

  const handleResetData = () => {
    if (confirm('Delete all local data? This cannot be undone.')) {
      resetSettings()
      showToast('All data deleted')
      navigate('/login')
    }
  }

  const handleLogout = () => {
    updateSettings({ user: { loggedIn: false, onboarded: false } })
    navigate('/login')
  }

  return (
    <div className="dashboard-page page-scroll">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div>
            <span className="logo logo-small">FocusDJ</span>
            <span className="dashboard-greeting">
              Welcome back{settings.user.name ? `, ${settings.user.name}` : ''}
            </span>
          </div>
          <div className="dashboard-actions">
            <Button
              variant="primary"
              loading={syncing}
              onClick={handleSync}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
                </svg>
              }
            >
              Sync to Extension
            </Button>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Left Column */}
          <div className="dashboard-main">
            {/* Session Settings */}
            <Card title="Session Settings" subtitle="Customize your focus sessions">
              <div className="settings-section">
                <h4>Study Mode</h4>
                <div className="mode-selector">
                  {['gentle', 'normal', 'strict'].map((mode) => (
                    <button
                      key={mode}
                      className={`mode-btn ${settings.user.mode === mode ? 'active' : ''}`}
                      onClick={() => update({ user: { mode } })}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <h4>Technique</h4>
                <div className="technique-grid">
                  {Object.entries(TECHNIQUE_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      className={`technique-btn ${settings.study.technique === key ? 'active' : ''}`}
                      onClick={() => update({
                        study: {
                          technique: key,
                          workMins: preset.workMins,
                          breakMins: preset.breakMins,
                        }
                      })}
                    >
                      <span>{preset.label}</span>
                      <span className="technique-time">
                        {preset.workMins}/{preset.breakMins}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <Input
                  label="Focus Playlist URL"
                  value={settings.music.focusPlaylistUrl}
                  onChange={(focusPlaylistUrl) => update({ music: { focusPlaylistUrl } })}
                  placeholder="https://music.youtube.com/playlist?list=..."
                />
              </div>

              <div className="settings-section">
                <Input
                  label="Break Playlist URL"
                  value={settings.music.breakPlaylistUrl}
                  onChange={(breakPlaylistUrl) => update({ music: { breakPlaylistUrl } })}
                  placeholder="https://music.youtube.com/playlist?list=..."
                />
              </div>

              <div className="settings-section">
                <Slider
                  label="Energy Level"
                  value={settings.music.energy}
                  onChange={(energy) => update({ music: { energy } })}
                  min={0}
                  max={100}
                  leftLabel="Calm"
                  rightLabel="Hype"
                  showValue
                />
              </div>

              <div className="settings-section">
                <h4>Favorite Genres</h4>
                <ChipSelect
                  options={GENRE_OPTIONS}
                  selected={settings.music.genres}
                  onChange={(genres) => update({ music: { genres } })}
                  maxSelect={5}
                />
              </div>

              <div className="settings-section">
                <TagInput
                  label="Favorite Artists"
                  value={settings.music.artists}
                  onChange={(artists) => update({ music: { artists } })}
                  maxTags={5}
                />
              </div>

              <Toggle
                checked={settings.study.autoSwitchOnBreak}
                onChange={(autoSwitchOnBreak) => update({ study: { autoSwitchOnBreak } })}
                label="Auto-switch music on break"
                description="Play your break playlist during rest periods"
              />
            </Card>

            {/* AI Controls */}
            <Card title="AI Controls" subtitle="Manage Viola's focus detection">
              <div className="master-toggle">
                <Toggle
                  checked={settings.tracking.enabled}
                  onChange={(enabled) => update({ tracking: { enabled } })}
                  label="Enable Viola"
                  description="Master toggle for all AI-powered focus detection"
                  size="lg"
                />
              </div>

              <div className={`tracking-toggles ${!settings.tracking.enabled ? 'disabled' : ''}`}>
                <Toggle
                  checked={settings.tracking.camera}
                  onChange={(camera) => update({ tracking: { camera } })}
                  label="Camera posture detection"
                  description="Uses webcam to detect if you're looking away"
                  disabled={!settings.tracking.enabled}
                />
                <Toggle
                  checked={settings.tracking.keystroke}
                  onChange={(keystroke) => update({ tracking: { keystroke } })}
                  label="Keystroke timing"
                  description="Measures typing rhythm (no text captured)"
                  disabled={!settings.tracking.enabled}
                />
                <Toggle
                  checked={settings.tracking.mouse}
                  onChange={(mouse) => update({ tracking: { mouse } })}
                  label="Mouse movement"
                  description="Tracks cursor activity patterns"
                  disabled={!settings.tracking.enabled}
                />
                <Toggle
                  checked={settings.tracking.scroll}
                  onChange={(scroll) => update({ tracking: { scroll } })}
                  label="Scroll behavior"
                  description="Detects doomscrolling patterns"
                  disabled={!settings.tracking.enabled}
                />
                <Toggle
                  checked={settings.tracking.tabs}
                  onChange={(tabs) => update({ tracking: { tabs } })}
                  label="Tab switching"
                  description="Monitors tab changes for distraction"
                  disabled={!settings.tracking.enabled}
                />
              </div>

              <Button
                variant="ghost"
                fullWidth
                onClick={() => update({ tracking: { enabled: false } })}
                disabled={!settings.tracking.enabled}
              >
                Pause All Tracking
              </Button>
            </Card>

            {/* Privacy */}
            <Card title="Privacy" subtitle="Your data, your control">
              <div className="privacy-info">
                <div className="privacy-item">
                  <div className="privacy-icon good">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <strong>Local Processing</strong>
                    <p>All focus detection happens on your device</p>
                  </div>
                </div>
                <div className="privacy-item">
                  <div className="privacy-icon good">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <strong>No Cloud Sync</strong>
                    <p>Your data never leaves your browser</p>
                  </div>
                </div>
                <div className="privacy-item">
                  <div className="privacy-icon good">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <strong>No Text Capture</strong>
                    <p>Keystroke timing only, content is never read</p>
                  </div>
                </div>
              </div>

              <Button variant="danger" fullWidth onClick={handleResetData}>
                Delete All Local Data
              </Button>
            </Card>
          </div>

          {/* Right Column */}
          <div className="dashboard-sidebar">
            {/* Viola Panel */}
            <ViolaCard
              message="I'm monitoring your session. Stay focused, you've got this!"
              status="active"
              lastIntervention="Boosted music energy 2 mins ago"
            />

            {/* Focus Timeline Placeholder */}
            <Card title="Focus Timeline" subtitle="Today's session history">
              <div className="timeline-placeholder">
                <div className="timeline-bar">
                  <div className="timeline-segment good" style={{ width: '30%' }} />
                  <div className="timeline-segment warning" style={{ width: '15%' }} />
                  <div className="timeline-segment good" style={{ width: '40%' }} />
                  <div className="timeline-segment bad" style={{ width: '15%' }} />
                </div>
                <div className="timeline-labels">
                  <span>9am</span>
                  <span>12pm</span>
                  <span>3pm</span>
                  <span>Now</span>
                </div>
                <div className="timeline-stats">
                  <div className="stat">
                    <span className="stat-value">2h 45m</span>
                    <span className="stat-label">Focus time</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">78</span>
                    <span className="stat-label">Avg score</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">3</span>
                    <span className="stat-label">Interventions</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card padding="sm">
              <div className="quick-actions">
                <Button variant="ghost" fullWidth onClick={handleLogout}>
                  Sign Out
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
