// Decision engine: state machine + multi-armed bandit for intervention selection

/**
 * Intervention types (ordered by intensity)
 */
export const INTERVENTIONS = {
  BOOST_ENERGY: 'BOOST_ENERGY',       // Skip to higher energy track
  SWITCH_PLAYLIST: 'SWITCH_PLAYLIST', // Change to focus playlist
  PATTERN_BREAK: 'PATTERN_BREAK',     // Short audio cue
  NUCLEAR: 'NUCLEAR',                 // Annoying sound for doomscrolling
};

/**
 * Cooldown periods by mode (ms)
 */
const COOLDOWNS = {
  gentle: 45_000,  // 45s
  normal: 30_000,  // 30s
  strict: 15_000,  // 15s
};

/**
 * Focus thresholds by mode (trigger intervention if below)
 */
const THRESHOLDS = {
  gentle: 50,
  normal: 60,
  strict: 70,
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

  // Focus is dropping rapidly (more than 10 points in 30s)
  if (metrics.trendDelta < -10) {
    return { should: true, reason: 'dropping_focus' };
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
 */
export function selectIntervention(state, isDoomscrolling) {
  const { session, policy, settings } = state;

  // Nuclear only for doomscrolling in strict mode with it enabled
  if (isDoomscrolling && session.mode === 'strict' && settings.nuclearEnabled) {
    return INTERVENTIONS.NUCLEAR;
  }

  // Otherwise use bandit to select best intervention
  return selectArmUCB(policy, true);
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
    case INTERVENTIONS.NUCLEAR:
      return 'WAKE UP! (Doomscroll detected)';
    default:
      return 'Adjusting music';
  }
}
