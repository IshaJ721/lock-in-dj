// FocusDJ Camera - Vision-based focus detection
// Uses FaceDetector API when available, falls back to heuristics

(function() {
  'use strict';

  // DOM Elements
  var video = document.getElementById('video');
  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var startBtn = document.getElementById('startBtn');
  var stopBtn = document.getElementById('stopBtn');
  var statusMessage = document.getElementById('statusMessage');
  var stats = document.getElementById('stats');
  var statusOverlay = document.getElementById('statusOverlay');
  var statusText = document.getElementById('statusText');
  var attentionScoreEl = document.getElementById('attentionScore');
  var faceStatusEl = document.getElementById('faceStatus');
  var gazeStatusEl = document.getElementById('gazeStatus');
  var detectionInfo = document.getElementById('detectionInfo');

  // State
  var stream = null;
  var isRunning = false;
  var detectionInterval = null;
  var faceDetector = null;
  var useFaceDetector = false;

  // Detection metrics
  var lastDetectionTime = Date.now();
  var faceDetectedCount = 0;
  var faceNotDetectedCount = 0;
  var lastFaceBox = null;
  var faceHistory = []; // Track last N face positions
  var lookingAwayStartTime = null;
  var faceMissingStartTime = null;

  // Thresholds
  var FACE_MISSING_THRESHOLD_MS = 3000; // 3 seconds before "away"
  var LOOKING_AWAY_THRESHOLD_MS = 2000; // 2 seconds before "distracted"
  var DETECTION_INTERVAL_MS = 200;

  // Initialize FaceDetector if available
  async function initFaceDetector() {
    if ('FaceDetector' in window) {
      try {
        faceDetector = new FaceDetector({
          fastMode: true,
          maxDetectedFaces: 1
        });
        useFaceDetector = true;
        console.log('[Camera] Using native FaceDetector API');
        return true;
      } catch (e) {
        console.log('[Camera] FaceDetector init failed:', e);
      }
    }
    console.log('[Camera] FaceDetector not available, using fallback');
    return false;
  }

  // Start camera
  async function startCamera() {
    console.log('[Camera] Starting...');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported');
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      video.srcObject = stream;
      await video.play();

      // Setup canvas
      if (canvas) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      // Try to init FaceDetector
      await initFaceDetector();

      // Update UI
      isRunning = true;
      lastDetectionTime = Date.now();
      faceDetectedCount = 0;
      faceNotDetectedCount = 0;
      faceMissingStartTime = null;
      lookingAwayStartTime = null;

      statusMessage.classList.add('hidden');
      stats.classList.remove('hidden');
      statusOverlay.classList.remove('hidden');
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      detectionInfo.classList.remove('hidden');
      detectionInfo.textContent = useFaceDetector ?
        'Using Chrome FaceDetector API' :
        'Using motion-based detection (enable chrome://flags/#enable-experimental-web-platform-features for better accuracy)';

      // Start detection loop
      detectionInterval = setInterval(runDetection, DETECTION_INTERVAL_MS);

      // Notify extension
      try {
        chrome.runtime.sendMessage({ type: 'CAMERA_STARTED' });
      } catch (e) {}

    } catch (err) {
      console.error('[Camera] Error:', err);
      statusMessage.innerHTML = '<p style="color: #ef4444;">Error: ' + err.message + '</p>';
    }
  }

  // Stop camera
  function stopCamera() {
    console.log('[Camera] Stopping...');
    isRunning = false;

    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }

    if (stream) {
      stream.getTracks().forEach(function(track) { track.stop(); });
      stream = null;
    }

    video.srcObject = null;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    statusMessage.innerHTML = '<p>Camera stopped. Click Start to resume.</p>';
    statusMessage.classList.remove('hidden');
    stats.classList.add('hidden');
    statusOverlay.classList.add('hidden');
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    detectionInfo.classList.add('hidden');

    try {
      chrome.runtime.sendMessage({ type: 'CAMERA_STOPPED' });
    } catch (e) {}
  }

  // Main detection loop
  async function runDetection() {
    if (!isRunning || !video.videoWidth) return;

    var now = Date.now();
    var result;

    if (useFaceDetector && faceDetector) {
      result = await detectWithFaceAPI();
    } else {
      result = detectWithHeuristics();
    }

    // Process result
    processDetectionResult(result, now);
  }

  // Detect using Chrome's FaceDetector API
  async function detectWithFaceAPI() {
    try {
      var faces = await faceDetector.detect(video);

      if (faces.length > 0) {
        var face = faces[0];
        var box = face.boundingBox;

        // Draw face box
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = 'rgba(255, 107, 157, 0.8)';
          ctx.lineWidth = 3;
          // Mirror the box
          ctx.strokeRect(
            canvas.width - box.x - box.width,
            box.y,
            box.width,
            box.height
          );
        }

        // Check if looking away based on face position
        var centerX = box.x + box.width / 2;
        var centerY = box.y + box.height / 2;
        var frameCenter = { x: video.videoWidth / 2, y: video.videoHeight / 2 };

        // If face is too far from center, might be looking away
        var offsetX = Math.abs(centerX - frameCenter.x) / video.videoWidth;
        var offsetY = Math.abs(centerY - frameCenter.y) / video.videoHeight;

        var lookingAway = offsetX > 0.35 || offsetY > 0.35;

        // Track face movement for engagement
        var isEngaged = true;
        if (lastFaceBox) {
          var movement = Math.abs(box.x - lastFaceBox.x) + Math.abs(box.y - lastFaceBox.y);
          // Very little movement for extended time might mean zoned out
          faceHistory.push(movement);
          if (faceHistory.length > 20) faceHistory.shift();

          var avgMovement = faceHistory.reduce(function(a,b) { return a+b; }, 0) / faceHistory.length;
          // But we don't penalize stillness - being still and focused is fine
        }

        lastFaceBox = { x: box.x, y: box.y, width: box.width, height: box.height };

        return {
          faceDetected: true,
          lookingAway: lookingAway,
          confidence: 0.9,
          faceBox: box
        };
      } else {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return {
          faceDetected: false,
          lookingAway: false,
          confidence: 0.9
        };
      }
    } catch (e) {
      console.error('[Camera] FaceDetector error:', e);
      return detectWithHeuristics();
    }
  }

  // Fallback detection using image analysis
  function detectWithHeuristics() {
    if (!ctx) return { faceDetected: false, lookingAway: false, confidence: 0.3 };

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Analyze center region for skin tones (rough face detection)
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var sampleSize = 100;

    var imageData = ctx.getImageData(
      centerX - sampleSize/2,
      centerY - sampleSize/2,
      sampleSize,
      sampleSize
    );

    var skinPixels = 0;
    var totalPixels = 0;

    for (var i = 0; i < imageData.data.length; i += 16) { // Sample every 4th pixel
      var r = imageData.data[i];
      var g = imageData.data[i + 1];
      var b = imageData.data[i + 2];

      // Simple skin tone detection
      // Skin typically has R > G > B with certain ratios
      if (r > 60 && g > 40 && b > 20 &&
          r > g && g > b &&
          r - g > 10 && r - b > 20 &&
          Math.abs(r - g) < 100) {
        skinPixels++;
      }
      totalPixels++;
    }

    var skinRatio = skinPixels / totalPixels;
    var faceDetected = skinRatio > 0.15; // At least 15% skin tones in center

    // Clear canvas after analysis
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw indicator
    if (faceDetected) {
      ctx.strokeStyle = 'rgba(255, 107, 157, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(centerX - 60, centerY - 80, 120, 160);
    }

    return {
      faceDetected: faceDetected,
      lookingAway: false, // Can't determine with this method
      confidence: 0.5,
      skinRatio: skinRatio
    };
  }

  // Process detection result and update UI
  function processDetectionResult(result, now) {
    var deltaMs = now - lastDetectionTime;
    lastDetectionTime = now;

    // Update face tracking
    if (result.faceDetected) {
      faceDetectedCount++;
      faceNotDetectedCount = 0;
      faceMissingStartTime = null;
    } else {
      faceNotDetectedCount++;
      faceDetectedCount = 0;
      if (!faceMissingStartTime) {
        faceMissingStartTime = now;
      }
    }

    // Update looking away tracking
    if (result.lookingAway) {
      if (!lookingAwayStartTime) {
        lookingAwayStartTime = now;
      }
    } else {
      lookingAwayStartTime = null;
    }

    // Determine state
    var faceMissingMs = faceMissingStartTime ? (now - faceMissingStartTime) : 0;
    var lookingAwayMs = lookingAwayStartTime ? (now - lookingAwayStartTime) : 0;

    var isFacePresent = result.faceDetected || faceNotDetectedCount < 5; // Brief gaps OK
    var isLookingAway = lookingAwayMs > LOOKING_AWAY_THRESHOLD_MS;
    var isAway = faceMissingMs > FACE_MISSING_THRESHOLD_MS;

    // Calculate attention score
    var attention = 1.0;

    if (isAway) {
      // Face missing for a while
      attention = Math.max(0, 1 - (faceMissingMs / 30000)); // Decay over 30s
    } else if (isLookingAway) {
      // Looking away
      attention = Math.max(0.3, 1 - (lookingAwayMs / 10000)); // Decay over 10s, min 0.3
    } else if (!result.faceDetected) {
      // Brief face loss
      attention = 0.8;
    }

    // Update UI
    updateUI(isFacePresent, isLookingAway, isAway, attention);

    // Send to extension
    sendSignal(isFacePresent, isLookingAway || isAway, attention, faceMissingMs, lookingAwayMs);
  }

  // Update UI elements
  function updateUI(facePresent, lookingAway, isAway, attention) {
    var score = Math.round(attention * 100);

    // Attention score
    attentionScoreEl.textContent = score + '%';
    attentionScoreEl.className = 'stat-value ' + (score >= 70 ? 'good' : score >= 40 ? 'warning' : 'bad');

    // Face status
    faceStatusEl.textContent = facePresent ? 'Yes' : 'No';
    faceStatusEl.className = 'stat-value ' + (facePresent ? 'good' : 'bad');

    // Gaze/Status
    if (isAway) {
      gazeStatusEl.textContent = 'Away';
      gazeStatusEl.className = 'stat-value bad';
      statusOverlay.className = 'status-overlay away';
      statusText.textContent = 'Away from screen';
    } else if (lookingAway) {
      gazeStatusEl.textContent = 'Distracted';
      gazeStatusEl.className = 'stat-value warning';
      statusOverlay.className = 'status-overlay distracted';
      statusText.textContent = 'Looking away';
    } else if (facePresent) {
      gazeStatusEl.textContent = 'Focused';
      gazeStatusEl.className = 'stat-value good';
      statusOverlay.className = 'status-overlay focused';
      statusText.textContent = 'Focused';
    } else {
      gazeStatusEl.textContent = '...';
      gazeStatusEl.className = 'stat-value warning';
      statusOverlay.className = 'status-overlay distracted';
      statusText.textContent = 'Detecting...';
    }
  }

  // Send signal to extension
  function sendSignal(facePresent, lookingAway, attention, faceMissingMs, lookingAwayMs) {
    try {
      chrome.runtime.sendMessage({
        type: 'VISION_SIGNAL',
        facePresent: facePresent,
        lookingAway: lookingAway,
        attentionScore: attention,
        faceMissingMs: faceMissingMs,
        lookingAwayMs: lookingAwayMs,
        timestamp: Date.now()
      });
    } catch (e) {}
  }

  // Event Listeners
  if (startBtn) {
    startBtn.addEventListener('click', startCamera);
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', stopCamera);
  }

  window.addEventListener('beforeunload', function() {
    if (isRunning) stopCamera();
  });

  console.log('[Camera] Initialized');

})();
