// Spotify OAuth PKCE flow for Chrome extension
// No backend required - all client-side

import { getSpotifyTokens, setSpotifyTokens } from '../storage.js';

// You'll need to register an app at https://developer.spotify.com/dashboard
// Set redirect URI to: https://<extension-id>.chromiumapp.org/callback
const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID'; // TODO: Replace with your client ID
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

/**
 * Generate random string for PKCE
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

/**
 * Generate code challenge from verifier (PKCE S256)
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Get redirect URI for this extension
 */
function getRedirectUri() {
  return chrome.identity.getRedirectURL('callback');
}

/**
 * Start OAuth flow with PKCE
 */
export async function startAuthFlow() {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  // Store verifier for token exchange
  await chrome.storage.local.set({ spotify_pkce: { codeVerifier, state } });

  const redirectUri = getRedirectUri();
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        try {
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          // Verify state
          const stored = await chrome.storage.local.get('spotify_pkce');
          if (returnedState !== stored.spotify_pkce?.state) {
            reject(new Error('State mismatch - possible CSRF attack'));
            return;
          }

          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, stored.spotify_pkce.codeVerifier);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Exchange authorization code for access/refresh tokens
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await setSpotifyTokens(tokens);
  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken() {
  const tokens = await getSpotifyTokens();

  if (!tokens.refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();
  const newTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken, // Keep old if not returned
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await setSpotifyTokens(newTokens);
  return newTokens;
}

/**
 * Get valid access token (refreshes if needed)
 */
export async function getValidAccessToken() {
  let tokens = await getSpotifyTokens();

  if (!tokens.accessToken) {
    throw new Error('Not authenticated with Spotify');
  }

  // Refresh if expired or expiring soon (within 5 minutes)
  if (tokens.expiresAt && tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    tokens = await refreshAccessToken();
  }

  return tokens.accessToken;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const tokens = await getSpotifyTokens();
  return !!tokens.accessToken;
}

/**
 * Logout - clear tokens
 */
export async function logout() {
  await setSpotifyTokens({
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });
}
