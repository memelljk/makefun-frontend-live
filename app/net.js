// net.js — the app's only door to the make.fun public API.
//
// Every read is a GET on https://make.fun/api. Responses are cached
// by path together with their ETag: the API re-tags answers roughly
// once a minute, so a repeat read inside that window costs one
// conditional request and usually comes back 304. Reads follow a
// stale-while-revalidate rhythm — a path we already hold answers
// instantly from memory while a refresh runs behind the scenes, and
// if the refresh brings genuinely different data the caller's
// onFresh callback hears about it so the open view can repaint.
// Reads of the same path that overlap share a single request.
//
// A hung request is aborted after ten seconds so views can show
// their error state instead of spinning forever. Nothing here ever
// writes; the public API is read-only for us.

const BASE = 'https://make.fun/api';
const TIMEOUT_MS = 10000;

const cache = new Map(); // path -> { etag: string | null, data: unknown }
const inflight = new Map(); // path -> Promise<unknown>

async function request(path, etag) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = {};
    if (etag) headers['If-None-Match'] = etag;
    return await fetch(BASE + path, { headers, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// One round trip: resolves with the fresh parsed body, or null when
// the server answered 304 and the cached copy is still current.
async function roundTrip(path, etag) {
  const res = await request(path, etag);
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`make.fun answered HTTP ${res.status} for ${path}`);
  const data = await res.json();
  cache.set(path, { etag: res.headers.get('etag'), data });
  return data;
}

// Overlapping reads of one path share one round trip.
function shared(path, etag) {
  const running = inflight.get(path);
  if (running) return running;
  const job = (async () => {
    try {
      return await roundTrip(path, etag);
    } finally {
      if (inflight.get(path) === job) inflight.delete(path);
    }
  })();
  inflight.set(path, job);
  return job;
}

// A refresh returns a brand-new object even when nothing changed, so
// compare serialised bodies to decide whether a repaint is worth it.
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

// read(path, onFresh): the parsed body for a path. A cold path waits
// for the network; a warm path answers from memory at once and calls
// onFresh with the new body only when a background refresh actually
// changed something.
export async function read(path, onFresh) {
  const hit = cache.get(path);
  if (!hit) return shared(path, null);
  shared(path, hit.etag)
    .then((fresh) => {
      if (fresh !== null && onFresh && differs(fresh, hit.data)) onFresh(fresh);
    })
    .catch(() => { /* a failed refresh leaves the shown copy alone */ });
  return hit.data;
}

const enc = (v) => encodeURIComponent(String(v));

export const competitions = (onFresh) => read('/competitions', onFresh);
export const competition = (slug, onFresh) => read(`/competitions/${enc(slug)}`, onFresh);
export const leaderboard = (slug, onFresh) => read(`/competitions/${enc(slug)}/leaderboard`, onFresh);
export const profile = (handle, onFresh) => read(`/profiles/${enc(handle)}`, onFresh);

// Avatars and entry images come back as site-relative paths; make
// them absolute so an <img> can load them. (The image host answers
// with Cross-Origin-Resource-Policy: same-origin, so tags that load
// these should carry crossorigin="anonymous".)
export function assetUrl(path) {
  if (!path) return '';
  const s = String(path);
  return /^https?:\/\//i.test(s) ? s : `https://make.fun${s.startsWith('/') ? '' : '/'}${s}`;
}
