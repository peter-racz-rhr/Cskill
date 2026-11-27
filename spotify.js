/* Globe Tunes × Spotify
   - Login with Authorization Code + PKCE (no server, no secret): needs a Client ID in config.js.
   - Desktop + Premium: full songs play in the page through the Web Playback SDK.
   - Everyone else (free accounts, phones — the SDK doesn't run on mobile browsers): previews
     keep playing here, with "Full song in Spotify" links and "Save to Spotify" playlists.
   Exposes window.GTSpotify. */
{
const CFG = window.GT_CONFIG || {};
const CLIENT_ID = (CFG.spotifyClientId || '').trim();
const REDIRECT = location.origin + location.pathname;
const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-modify-private playlist-modify-public';
const KEY = 'gt-spotify';
const API = 'https://api.spotify.com/v1';

const store = {
  get(){ try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v){ try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} }
};
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

let tok = store.get();          // { access, refresh, exp }
let me = null;                  // profile
let player = null, deviceId = null, sdkReady = false;
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f(api.state()); } catch {} });

/* ---------- auth ---------- */
async function login(){
  if (!CLIENT_ID) throw new Error('not_configured');
  const verifier = randomString(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(12);
  try { sessionStorage.setItem('gt-sp-verifier', verifier); sessionStorage.setItem('gt-sp-state', state); } catch {}
  const u = new URL('https://accounts.spotify.com/authorize');
  Object.entries({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES,
                   code_challenge_method: 'S256', code_challenge: challenge, state }).forEach(([k, v]) => u.searchParams.set(k, v));
  location.assign(u.toString());
}
async function tokenRequest(body){
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body })
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  tok = { access: j.access_token, refresh: j.refresh_token || tok?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
  store.set(tok);
}
async function handleRedirect(){
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return;
  const code = p.get('code'), state = p.get('state');
  let verifier = null, expected = null;
  try { verifier = sessionStorage.getItem('gt-sp-verifier'); expected = sessionStorage.getItem('gt-sp-state'); } catch {}
  history.replaceState(null, '', REDIRECT);          // clean the URL either way
  if (!code || !verifier || state !== expected) return;
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier });
}
async function access(){
  if (!tok) return null;
  if (Date.now() > tok.exp){
    try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh }); }
    catch { logout(); return null; }
  }
  return tok.access;
}
function logout(){ tok = null; me = null; store.set(null); try { player?.disconnect(); } catch {} player = null; deviceId = null; sdkReady = false; emit(); }

async function call(path, opts = {}){
  const t = await access(); if (!t) throw new Error('not_connected');
  const r = await fetch(path.startsWith('http') ? path : API + path, {
    ...opts, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (r.status === 401){ logout(); throw new Error('expired'); }
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

/* ---------- in-page player (desktop browsers, Premium only) ---------- */
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function loadSDK(){
  if (mobile || me?.product !== 'premium' || window.Spotify) return;
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({ name: 'Globe Tunes', getOAuthToken: cb => access().then(t => t && cb(t)), volume: 0.8 });
    player.addListener('ready', ({ device_id }) => { deviceId = device_id; sdkReady = true; emit(); });
    player.addListener('not_ready', () => { sdkReady = false; emit(); });
    player.addListener('authentication_error', logout);
    player.addListener('account_error', () => { sdkReady = false; emit(); });
    player.addListener('player_state_changed', s => api._onState?.(s));
    player.connect();
  };
  const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; document.head.append(s);
}

/* ---------- catalogue ---------- */
const matchCache = new Map();
async function match(t, market){
  const k = t.n + '|' + t.a;
  if (matchCache.has(k)) return matchCache.get(k);
  const clean = s => s.replace(/\(feat\.[^)]*\)|\[[^\]]*\]|\(with[^)]*\)/gi, '').replace(/["']/g, '').trim();
  const artist = t.a.split(/,|&| x | feat\.| and /i)[0].trim();
  const q = `track:${clean(t.n)} artist:${artist}`;
  let item = null;
  try {
    const j = await call(`/search?type=track&limit=1&q=${encodeURIComponent(q)}&market=${encodeURIComponent(market || 'from_token')}`);
    item = j?.tracks?.items?.[0] || null;
    if (!item){ const j2 = await call(`/search?type=track&limit=1&q=${encodeURIComponent(clean(t.n) + ' ' + artist)}`); item = j2?.tracks?.items?.[0] || null; }
  } catch {}
  const out = item ? { uri: item.uri, id: item.id, url: item.external_urls?.spotify, ms: item.duration_ms } : null;
  matchCache.set(k, out);
  return out;
}

const api = {
  configured: !!CLIENT_ID,
  connected: () => !!tok,
  premium: () => me?.product === 'premium',
  canPlayFull: () => sdkReady && !!deviceId,
  name: () => me?.display_name || '',
  state: () => ({ configured: !!CLIENT_ID, connected: !!tok, premium: me?.product === 'premium', full: sdkReady, mobile, name: me?.display_name || '' }),
  onChange(f){ listeners.add(f); f(api.state()); return () => listeners.delete(f); },
  login, logout, match,
  async playFull(t, market){
    if (!api.canPlayFull()) return null;
    const m = await match(t, market); if (!m) return null;
    await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify({ uris: [m.uri] }) });
    return m;
  },
  pause: () => player?.pause(), resume: () => player?.resume(), toggle: () => player?.togglePlay(),
  seek: ms => player?.seek(ms), current: () => player?.getCurrentState(),
  async savePlaylist(name, description, tracks, market){
    const uris = [];
    for (const t of tracks){ const m = await match(t, market); if (m) uris.push(m.uri); }
    if (!uris.length) throw new Error('no_matches');
    const pl = await call(`/users/${encodeURIComponent(me.id)}/playlists`, { method: 'POST', body: JSON.stringify({ name, description, public: false }) });
    await call(`/playlists/${pl.id}/tracks`, { method: 'POST', body: JSON.stringify({ uris: uris.slice(0, 100) }) });
    return { url: pl.external_urls?.spotify, count: uris.length, of: tracks.length };
  },
  _onState: null
};
window.GTSpotify = api;

/* ---------- boot ---------- */
(async () => {
  if (!CLIENT_ID){ emit(); return; }
  try { await handleRedirect(); } catch {}
  if (tok){ try { me = await call('/me'); loadSDK(); } catch {} }
  emit();
})();
}
