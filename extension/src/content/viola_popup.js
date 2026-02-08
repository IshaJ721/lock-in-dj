// Viola Popup - Injected notification for distraction alerts
// This creates a floating Viola chatbot card on any page

let violaContainer = null;
let hideTimeout = null;

// Viola's messages for different situations
const VIOLA_MESSAGES = {
  stillDistracted: [
    "Hey, I noticed you're still here. Need help getting back on track?",
    "Still scrolling? Let's take a breath and refocus.",
    "I've tried changing your music, but you're still distracted. Want to talk about it?",
    "You've been off-task for a while. Remember why you started!",
    "I'm here to help! Let's get back to what matters.",
  ],
  doomscrolling: [
    "Doomscrolling detected! Your focus score is dropping fast.",
    "This site is eating your time. Let's bounce!",
    "I see you scrolling... and scrolling... time to stop!",
  ],
  gentleReminder: [
    "Quick check-in: How's your focus?",
    "Just a gentle nudge to stay on track.",
    "You're doing great! Keep it up.",
  ],
  breakTime: [
    "Break time! You've earned it. Step away for a bit.",
    "Pomodoro complete! Take a well-deserved break.",
    "Great work session! Time to rest your mind.",
  ],
  backToWork: [
    "Break's over! Ready to crush it again?",
    "Let's get back into focus mode!",
    "Refreshed? Time to lock in!",
  ],
  nuclear: [
    "WAKE UP! You're deep in distraction territory!",
    "This is a code red! Get back to work!",
    "I'm turning up the volume because you need it!",
  ],
};

function getRandomMessage(type) {
  const messages = VIOLA_MESSAGES[type] || VIOLA_MESSAGES.stillDistracted;
  return messages[Math.floor(Math.random() * messages.length)];
}

function createViolaPopup() {
  if (violaContainer) return violaContainer;

  violaContainer = document.createElement('div');
  violaContainer.id = 'focusdj-viola-popup';
  violaContainer.innerHTML = `
    <style>
      #focusdj-viola-popup {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        animation: violaSlideIn 0.4s ease;
      }

      @keyframes violaSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes violaSlideOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
      }

      .viola-card {
        background: linear-gradient(135deg, #12121a 0%, #1a1a25 100%);
        border: 1px solid #2a2a3a;
        border-radius: 16px;
        padding: 16px;
        width: 300px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 107, 157, 0.15);
      }

      .viola-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .viola-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6b9d 0%, #a855f7 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: violaPulse 2s ease-in-out infinite;
      }

      @keyframes violaPulse {
        0%, 100% { box-shadow: 0 0 20px rgba(255, 107, 157, 0.4); }
        50% { box-shadow: 0 0 30px rgba(255, 107, 157, 0.6); }
      }

      .viola-avatar-inner {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: white;
        opacity: 0.9;
      }

      .viola-info {
        flex: 1;
      }

      .viola-name {
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
      }

      .viola-status {
        font-size: 11px;
        color: #ff6b9d;
      }

      .viola-close {
        background: none;
        border: none;
        color: #606070;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .viola-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }

      .viola-message {
        background: #0a0a0f;
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 12px;
      }

      .viola-message p {
        font-size: 14px;
        color: #a0a0b0;
        line-height: 1.5;
        margin: 0;
      }

      .viola-actions {
        display: flex;
        gap: 8px;
      }

      .viola-btn {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .viola-btn-primary {
        background: linear-gradient(135deg, #ff6b9d 0%, #a855f7 100%);
        color: white;
      }

      .viola-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(255, 107, 157, 0.4);
      }

      .viola-btn-secondary {
        background: #222230;
        color: #a0a0b0;
        border: 1px solid #2a2a3a;
      }

      .viola-btn-secondary:hover {
        background: #2a2a3a;
        color: #ffffff;
      }

      .viola-score {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 8px;
        background: rgba(255, 107, 157, 0.1);
        border-radius: 8px;
      }

      .viola-score-label {
        font-size: 12px;
        color: #606070;
      }

      .viola-score-value {
        font-size: 18px;
        font-weight: 700;
        background: linear-gradient(135deg, #ff6b9d 0%, #a855f7 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .viola-hidden {
        animation: violaSlideOut 0.3s ease forwards;
      }
    </style>
    <div class="viola-card">
      <div class="viola-header">
        <div class="viola-avatar">
          <div class="viola-avatar-inner"></div>
        </div>
        <div class="viola-info">
          <div class="viola-name">Viola</div>
          <div class="viola-status">Focus Assistant</div>
        </div>
        <button class="viola-close" id="viola-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="viola-score" id="viola-score" style="display: none;">
        <span class="viola-score-label">Focus Score:</span>
        <span class="viola-score-value" id="viola-score-value">--</span>
      </div>
      <div class="viola-message">
        <p id="viola-text"></p>
      </div>
      <div class="viola-actions">
        <button class="viola-btn viola-btn-secondary" id="viola-dismiss">Dismiss</button>
        <button class="viola-btn viola-btn-primary" id="viola-action">Let's Focus</button>
      </div>
    </div>
  `;

  document.body.appendChild(violaContainer);

  // Event listeners
  document.getElementById('viola-close').addEventListener('click', hideViola);
  document.getElementById('viola-dismiss').addEventListener('click', hideViola);
  document.getElementById('viola-action').addEventListener('click', handleViolaAction);

  return violaContainer;
}

function showViola(message, type = 'stillDistracted', focusScore = null, actionLabel = "Let's Focus") {
  createViolaPopup();

  const text = message || getRandomMessage(type);
  document.getElementById('viola-text').textContent = text;
  document.getElementById('viola-action').textContent = actionLabel;

  // Show score if provided
  const scoreEl = document.getElementById('viola-score');
  if (focusScore !== null) {
    scoreEl.style.display = 'flex';
    document.getElementById('viola-score-value').textContent = focusScore;
  } else {
    scoreEl.style.display = 'none';
  }

  violaContainer.classList.remove('viola-hidden');
  violaContainer.style.display = 'block';

  // Clear any existing timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }

  // Auto-hide after 15 seconds unless it's nuclear
  if (type !== 'nuclear') {
    hideTimeout = setTimeout(() => {
      hideViola();
    }, 15000);
  }
}

function hideViola() {
  if (violaContainer) {
    violaContainer.classList.add('viola-hidden');
    setTimeout(() => {
      if (violaContainer) {
        violaContainer.style.display = 'none';
      }
    }, 300);
  }
}

function handleViolaAction() {
  // Send message to background to acknowledge and boost focus
  chrome.runtime.sendMessage({
    type: 'VIOLA_ACTION',
    action: 'refocus',
  }).catch(() => {});

  hideViola();

  // Try to go back to a productive tab
  chrome.runtime.sendMessage({
    type: 'FIND_PRODUCTIVE_TAB',
  }).catch(() => {});
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VIOLA_POPUP') {
    showViola(message.message, message.alertType, message.focusScore, message.actionLabel);
    sendResponse({ success: true });
  }

  if (message.type === 'VIOLA_HIDE') {
    hideViola();
    sendResponse({ success: true });
  }

  return true;
});

console.log('[FocusDJ] Viola popup ready');
