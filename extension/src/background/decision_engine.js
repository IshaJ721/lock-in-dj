// Decision engine: state machine + multi-armed bandit for intervention selection

/**
 * Intervention types (ordered by intensity)
 */
export const INTERVENTIONS = {
  BOOST_ENERGY: 'BOOST_ENERGY',       // Skip to higher energy track
  SWITCH_PLAYLIST: 'SWITCH_PLAYLIST', // Change to focus playlist
  PATTERN_BREAK: 'PATTERN_BREAK',     // Short pause then resume
  DUCK_VOLUME: 'DUCK_VOLUME',         // Lower volume to reduce distraction
  WHITE_NOISE: 'WHITE_NOISE',         // White noise burst for attention
  SMART_RECOMMEND: 'SMART_RECOMMEND', // AI-powered track recommendation based on BPM-focus correlation
  VIOLA_POPUP: 'VIOLA_POPUP',         // Show Viola chatbot popup
  NUCLEAR: 'NUCLEAR',                 // Max volume blast for doomscrolling
};

/**
 * Cooldown periods by mode (ms)
 * Stricter modes = more frequent interventions
 */
const COOLDOWNS = {
  gentle: 60_000,  // 60s - more patience
  normal: 30_000,  // 30s
  strict: 10_000,  // 10s - rapid response
};

/**
 * Focus thresholds by mode (trigger intervention if below)
 * Higher = more sensitive
 */
const THRESHOLDS = {
  gentle: 45,   // lenient
  normal: 60,   // moderate
  strict: 75,   // very sensitive - intervene early
};

/**
 * Trend sensitivity by mode (trigger if dropping faster than this)
 */
const TREND_THRESHOLDS = {
  gentle: -15,  // only intervene on rapid drops
  normal: -10,
  strict: -5,   // intervene on any noticeable drop
};

/**
 * Check if we should intervene based on current state
 */
export function shouldIntervene(state, now) {
  const { session, metrics, lastIntervention } = state;

  // Not in active session
  if (!session.active || session.phase !== 'study') {
    return { should: false, reason: 'not_studying' };
  }

  // Cooldown check
  const cooldown = COOLDOWNS[session.mode];
  if (lastIntervention && now - lastIntervention.appliedAt < cooldown) {
    return { should: false, reason: 'cooldown' };
  }

  // Focus is low
  const threshold = THRESHOLDS[session.mode];
  if (metrics.focusScore < threshold) {
    return { should: true, reason: 'low_focus' };
  }

  // Focus is dropping (mode-specific sensitivity)
  const trendThreshold = TREND_THRESHOLDS[session.mode] || -10;
  if (metrics.trendDelta < trendThreshold) {
    return { should: true, reason: 'dropping_focus' };
  }

  // Strict mode: intervene on any doomscrolling regardless of score
  if (session.mode === 'strict' && state.signals?.isDoomscrolling) {
    return { should: true, reason: 'doomscrolling' };
  }

  return { should: false, reason: 'focused' };
}

/**
 * UCB1 algorithm for selecting intervention arm
 * Balances exploitation (what worked) with exploration (trying new things)
 */
export function selectArmUCB(policy, excludeNuclear = true) {
  const arms = Object.entries(policy.arms);
  const totalN = arms.reduce((sum, [_, arm]) => sum + arm.n, 0);

  let best = null;
  let bestScore = -Infinity;

  for (const [name, arm] of arms) {
    // Skip nuclear unless explicitly allowed
    if (excludeNuclear && name === 'NUCLEAR') continue;

    // UCB1 formula: value + exploration bonus
    const explorationBonus = Math.sqrt((2 * Math.log(totalN + 1)) / arm.n);
    const ucbScore = arm.value + explorationBonus;

    if (ucbScore > bestScore) {
      bestScore = ucbScore;
      best = name;
    }
  }

  return best || 'BOOST_ENERGY'; // fallback
}

/**
 * Select intervention based on context
 * Escalates if previous interventions didn't work
 */
export function selectIntervention(state, isDoomscrolling) {
  const { session, policy, settings, lastIntervention } = state;

  // Check if we're escalating (previous intervention didn't help)
  const isEscalating = lastIntervention &&
    (Date.now() - lastIntervention.appliedAt < 60000) && // Within last minute
    lastIntervention.type !== INTERVENTIONS.VIOLA_POPUP &&
    lastIntervention.type !== INTERVENTIONS.NUCLEAR;

  // Nuclear only for doomscrolling in strict mode with it enabled
  if (isDoomscrolling && session.mode === 'strict' && settings.nuclearEnabled) {
    return INTERVENTIONS.NUCLEAR;
  }

  // If escalating and still distracted, show Viola popup
  if (isEscalating && state.metrics.focusScore < 50) {
    return INTERVENTIONS.VIOLA_POPUP;
  }

  // White noise for severe distraction
  if (state.metrics.focusScore < 30 && isDoomscrolling) {
    return INTERVENTIONS.WHITE_NOISE;
  }

  // AUTO MUSIC SWITCH: If enabled and focus is below threshold, use smart recommend
  // BUT: Skip if user is actively on a bad site (doomscrolling) - let alarm handle it
  const autoMusicEnabled = settings.autoMusicSwitch !== false; // Default true
  const autoThreshold = settings.autoMusicThreshold || 50;
  const onBadSite = isDoomscrolling || ['socialMedia', 'entertainment', 'games', 'blocked'].includes(state.signals?.currentCategory);

  if (autoMusicEnabled && state.metrics.focusScore < autoThreshold && !onBadSite) {
    // Prioritize music switching when focus is low and user is not actively doomscrolling
    return INTERVENTIONS.SMART_RECOMMEND;
  }

  // Otherwise use bandit to select best intervention
  return selectArmUCB(policy, true);
}

/**
 * Get escalation level based on recent interventions
 */
export function getEscalationLevel(state) {
  const recentInterventions = state.history
    .filter(h => h.intervention && (Date.now() - h.timestamp) < 300000) // Last 5 min
    .length;

  if (recentInterventions >= 4) return 'high';
  if (recentInterventions >= 2) return 'medium';
  return 'low';
}

/**
 * Update bandit arm after observing outcome
 * Uses incremental mean update
 */
export function updateBanditArm(policy, armName, reward) {
  const arm = policy.arms[armName];
  if (!arm) return policy;

  // Incremental mean: new_mean = old_mean + (reward - old_mean) / n
  arm.n += 1;
  arm.value = arm.value + (reward - arm.value) / arm.n;

  return policy;
}

/**
 * Convert focus delta to reward (0-1 scale)
 * delta of -15 = 0, delta of +15 = 1
 */
export function deltaToReward(focusDelta) {
  return Math.max(0, Math.min(1, (focusDelta + 15) / 30));
}

/**
 * Evaluate the outcome of an intervention
 * Should be called ~45s after intervention
 */
export function evaluateIntervention(state, currentScore) {
  const { lastIntervention, policy } = state;

  if (!lastIntervention) {
    return { evaluated: false };
  }

  const delta = currentScore - lastIntervention.preScore;
  const reward = deltaToReward(delta);

  const updatedPolicy = updateBanditArm(policy, lastIntervention.type, reward);

  return {
    evaluated: true,
    delta,
    reward,
    policy: updatedPolicy,
    interventionType: lastIntervention.type,
  };
}

/**
 * Get intervention intensity description (for UI)
 */
export function getInterventionDescription(type) {
  switch (type) {
    case INTERVENTIONS.BOOST_ENERGY:
      return 'Boosting music energy';
    case INTERVENTIONS.SWITCH_PLAYLIST:
      return 'Switching to focus playlist';
    case INTERVENTIONS.PATTERN_BREAK:
      return 'Pattern break audio cue';
    case INTERVENTIONS.SMART_RECOMMEND:
      return 'Playing AI-recommended track';
    case INTERVENTIONS.NUCLEAR:
      return 'WAKE UP! (Doomscroll detected)';
    default:
      return 'Adjusting music';
  }
}
