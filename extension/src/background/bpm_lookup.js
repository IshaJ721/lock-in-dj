// BPM Lookup Service
// Uses multiple strategies: SERP API, Groq inference, and genre heuristics

// Fallback BPM ranges by genre keywords
const GENRE_BPM_HEURISTICS = {
  'lofi': { min: 70, max: 90, avg: 80 },
  'lo-fi': { min: 70, max: 90, avg: 80 },
  'chill': { min: 80, max: 100, avg: 90 },
  'ambient': { min: 60, max: 80, avg: 70 },
  'classical': { min: 60, max: 120, avg: 90 },
  'jazz': { min: 80, max: 140, avg: 110 },
  'electronic': { min: 120, max: 150, avg: 128 },
  'edm': { min: 128, max: 150, avg: 140 },
  'house': { min: 120, max: 130, avg: 125 },
  'techno': { min: 130, max: 150, avg: 140 },
  'hip hop': { min: 85, max: 115, avg: 95 },
  'hip-hop': { min: 85, max: 115, avg: 95 },
  'rap': { min: 85, max: 115, avg: 95 },
  'rock': { min: 110, max: 140, avg: 120 },
  'pop': { min: 100, max: 130, avg: 115 },
  'focus': { min: 80, max: 120, avg: 100 },
  'study': { min: 70, max: 100, avg: 85 },
  'concentration': { min: 70, max: 100, avg: 85 },
  'beats': { min: 80, max: 100, avg: 90 },
  'instrumental': { min: 80, max: 120, avg: 100 },
  'piano': { min: 60, max: 100, avg: 80 },
  'acoustic': { min: 80, max: 120, avg: 100 },
  'synthwave': { min: 100, max: 130, avg: 115 },
  'retrowave': { min: 100, max: 130, avg: 115 },
  'drum and bass': { min: 160, max: 180, avg: 170 },
  'dnb': { min: 160, max: 180, avg: 170 },
  'dubstep': { min: 140, max: 150, avg: 145 },
  'trap': { min: 130, max: 150, avg: 140 },
  'r&b': { min: 70, max: 100, avg: 85 },
  'soul': { min: 70, max: 100, avg: 85 },
  'funk': { min: 100, max: 130, avg: 115 },
  'disco': { min: 110, max: 130, avg: 120 },
  'reggae': { min: 60, max: 90, avg: 75 },
  'metal': { min: 120, max: 180, avg: 140 },
  'punk': { min: 140, max: 180, avg: 160 },
  'country': { min: 90, max: 120, avg: 105 },
  'folk': { min: 80, max: 120, avg: 100 },
  'indie': { min: 100, max: 140, avg: 120 },
  'alternative': { min: 100, max: 140, avg: 120 },
};

// Rate limiting
const rateLimits = {
  serp: { requests: [], maxPerMinute: 20 },
  groq: { requests: [], maxPerMinute: 30 },
};

function checkRateLimit(apiName) {
  const now = Date.now();
  const limit = rateLimits[apiName];
  limit.requests = limit.requests.filter(t => now - t < 60000);

  if (limit.requests.length >= limit.maxPerMinute) {
    return false;
  }

  limit.requests.push(now);
  return true;
}

/**
 * Get API key from chrome storage
 */
async function getApiKey(keyType) {
  try {
    const result = await chrome.storage.local.get(`apiKey_${keyType}`);
    return result[`apiKey_${keyType}`] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Primary BPM lookup - tries multiple strategies
 */
export async function lookupBpm(title, artist) {
  const strategies = [
    () => lookupViaSerpApi(title, artist),
    () => lookupViaGroq(title, artist),
    () => estimateFromTitleKeywords(title, artist),
  ];

  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result && result.bpm > 0) {
        console.log('[BPM Lookup] Found:', result);
        return result;
      }
    } catch (err) {
      console.warn('[BPM Lookup] Strategy failed:', err.message);
    }
  }

  // Fallback: return null
  return { bpm: null, confidence: 0, source: 'none' };
}

/**
 * Strategy 1: Use SERP API to search for track BPM
 */
async function lookupViaSerpApi(title, artist) {
  const apiKey = await getApiKey('serp');
  if (!apiKey) return null;

  if (!checkRateLimit('serp')) {
    console.warn('[BPM Lookup] SERP rate limit exceeded');
    return null;
  }

  const query = `${title} ${artist} BPM tempo`;

  try {
    const response = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const bpm = extractBpmFromSerpResults(data);

    if (bpm) {
      return { bpm, confidence: 0.85, source: 'serp' };
    }
  } catch (err) {
    console.error('[SERP BPM Lookup]', err);
  }

  return null;
}

/**
 * Extract BPM from SERP results using regex patterns
 */
function extractBpmFromSerpResults(serpData) {
  const patterns = [
    /(\d{2,3})\s*bpm/i,
    /tempo[:\s]+(\d{2,3})/i,
    /(\d{2,3})\s*beats?\s*per\s*min/i,
    /bpm[:\s]+(\d{2,3})/i,
  ];

  // Search in snippets and titles
  const textSources = [
    ...(serpData.organic_results || []).map(r => r.snippet),
    ...(serpData.organic_results || []).map(r => r.title),
    serpData.answer_box?.answer,
    serpData.answer_box?.snippet,
  ].filter(Boolean);

  for (const text of textSources) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const bpm = parseInt(match[1], 10);
        // Validate reasonable BPM range
        if (bpm >= 40 && bpm <= 220) {
          return bpm;
        }
      }
    }
  }

  return null;
}

/**
 * Strategy 2: Use Groq to infer BPM from track context
 */
async function lookupViaGroq(title, artist) {
  const apiKey = await getApiKey('groq');
  if (!apiKey) return null;

  if (!checkRateLimit('groq')) {
    console.warn('[BPM Lookup] Groq rate limit exceeded');
    return null;
  }

  const prompt = `Given the song "${title}" by ${artist}, estimate its BPM (beats per minute).
Respond with ONLY a JSON object: {"bpm": <number>, "confidence": <0-1>, "genre": "<estimated genre>"}
If you're unsure, use confidence 0.5 or lower. Only respond with the JSON, nothing else.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse JSON response
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.bpm >= 40 && parsed.bpm <= 220) {
        return {
          bpm: parsed.bpm,
          confidence: (parsed.confidence || 0.5) * 0.7, // Reduce confidence for AI estimates
          source: 'groq',
          estimatedGenre: parsed.genre,
        };
      }
    }
  } catch (err) {
    console.error('[Groq BPM Lookup]', err);
  }

  return null;
}

/**
 * Strategy 3: Estimate BPM from title/artist keywords (fallback)
 */
function estimateFromTitleKeywords(title, artist) {
  const combined = `${title} ${artist}`.toLowerCase();

  for (const [keyword, range] of Object.entries(GENRE_BPM_HEURISTICS)) {
    if (combined.includes(keyword)) {
      return {
        bpm: range.avg,
        confidence: 0.4,
        source: 'heuristic',
        estimatedGenre: keyword,
      };
    }
  }

  return null;
}

/**
 * Batch lookup for multiple tracks (more efficient)
 */
export async function batchLookupBpm(tracks) {
  const results = [];

  // Rate limit: max 10 lookups per batch
  const batch = tracks.slice(0, 10);

  for (const track of batch) {
    const result = await lookupBpm(track.title, track.artist);
    results.push({ ...track, ...result });

    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

/**
 * Get BPM range category
 */
export function getBpmRange(bpm) {
  if (!bpm) return null;
  if (bpm < 90) return 'slow';
  if (bpm < 120) return 'moderate';
  if (bpm < 140) return 'upbeat';
  return 'fast';
}

/**
 * Get center BPM for a range
 */
export function getBpmRangeCenter(range) {
  const centers = { slow: 75, moderate: 105, upbeat: 130, fast: 160 };
  return centers[range] || 100;
}
