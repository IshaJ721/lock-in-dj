// Offscreen document for audio playback
// MV3 service workers can't play audio directly, so we use this offscreen document

const audioEl = document.getElementById('alarm');

// Web Audio API for generating alarm sounds
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Generate an attention-grabbing beep pattern
function playBeepPattern() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Create oscillator for beep
  const frequencies = [880, 1100, 880, 1100]; // Alternating tones
  const duration = 0.15;
  const gap = 0.1;

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, now + i * (duration + gap));
    gain.gain.linearRampToValueAtTime(0.3, now + i * (duration + gap) + 0.01);
    gain.gain.setValueAtTime(0.3, now + i * (duration + gap) + duration - 0.01);
    gain.gain.linearRampToValueAtTime(0, now + i * (duration + gap) + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * (duration + gap));
    osc.stop(now + i * (duration + gap) + duration);
  });
}

// Generate a more annoying alarm for nuclear mode
function playNuclearAlarm() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Siren effect
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now + i * 0.6);
    osc.frequency.linearRampToValueAtTime(800, now + i * 0.6 + 0.3);
    osc.frequency.linearRampToValueAtTime(400, now + i * 0.6 + 0.6);

    gain.gain.setValueAtTime(0, now + i * 0.6);
    gain.gain.linearRampToValueAtTime(0.4, now + i * 0.6 + 0.05);
    gain.gain.setValueAtTime(0.4, now + i * 0.6 + 0.55);
    gain.gain.linearRampToValueAtTime(0, now + i * 0.6 + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * 0.6);
    osc.stop(now + i * 0.6 + 0.6);
  }
}

// Gentle reminder chime
function playChime() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 523.25; // C5

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.5);
}

// White noise burst
function playWhiteNoiseBurst(durationMs = 1000) {
  const ctx = getAudioContext();
  const bufferSize = ctx.sampleRate * (durationMs / 1000);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffer;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

  source.connect(gain);
  gain.connect(ctx.destination);

  source.start();
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message);

  switch (message.type) {
    case 'PLAY_ALARM':
      playBeepPattern();
      sendResponse({ success: true });
      break;

    case 'PLAY_NUCLEAR':
      playNuclearAlarm();
      sendResponse({ success: true });
      break;

    case 'PLAY_CHIME':
      playChime();
      sendResponse({ success: true });
      break;

    case 'PLAY_WHITE_NOISE':
      playWhiteNoiseBurst(message.duration || 1000);
      sendResponse({ success: true });
      break;

    case 'PING':
      sendResponse({ success: true, ready: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true;
});

console.log('[FocusDJ] Offscreen document ready for audio playback');
