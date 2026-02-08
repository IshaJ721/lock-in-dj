// Activity Tracker - Content Script
// Injected into ALL pages to track mouse movement, typing, scrolling
// Reports activity signals back to service worker

console.log('[FocusDJ] Activity tracker loaded on:', window.location.hostname);

// ============================================================
// Activity State
// ============================================================

let lastMouseMove = Date.now();
let lastKeyPress = Date.now();
let lastScroll = Date.now();
let keyPressCount = 0;
let scrollCount = 0;
let mouseIdleMs = 0;

const REPORT_INTERVAL = 5000; // Report every 5 seconds

// ============================================================
// Event Listeners
// ============================================================

// Mouse movement
document.addEventListener('mousemove', () => {
  const now = Date.now();
  mouseIdleMs = 0; // Reset idle
  lastMouseMove = now;
}, { passive: true });

// Keyboard activity
document.addEventListener('keydown', () => {
  lastKeyPress = Date.now();
  keyPressCount++;
}, { passive: true });

// Scroll activity (doomscroll detection)
document.addEventListener('scroll', () => {
  lastScroll = Date.now();
  scrollCount++;
}, { passive: true });

// Click activity
document.addEventListener('click', () => {
  lastMouseMove = Date.now();
}, { passive: true });

// ============================================================
// Periodic Reporting
// ============================================================

function reportActivity() {
  const now = Date.now();

  const report = {
    type: 'ACTIVITY_REPORT',
    hostname: window.location.hostname,
    url: window.location.href,
    timestamp: now,
    signals: {
      // Time since last activity
      msSinceMouseMove: now - lastMouseMove,
      msSinceKeyPress: now - lastKeyPress,
      msSinceScroll: now - lastScroll,

      // Activity counts (reset after report)
      keyPressCount: keyPressCount,
      scrollCount: scrollCount,

      // Derived signals
      isIdle: (now - lastMouseMove > 30000) && (now - lastKeyPress > 30000),
      isActivelyTyping: keyPressCount > 10, // More than 10 keys in 5s = typing
      isScrolling: scrollCount > 5, // More than 5 scrolls in 5s = scrolling
    }
  };

  // Reset counts
  keyPressCount = 0;
  scrollCount = 0;

  // Send to service worker
  chrome.runtime.sendMessage(report).catch(() => {
    // Extension might not be ready, ignore
  });
}

// Report every 5 seconds
setInterval(reportActivity, REPORT_INTERVAL);

// Also report when page becomes visible/hidden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastMouseMove = Date.now();
    reportActivity();
  }
});

// Initial report
setTimeout(reportActivity, 1000);
