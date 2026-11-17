// text.js — small pure helpers that turn API values into the words
// and numbers the views print. No DOM, no network: every function
// takes plain data and returns a string, so the same code formats a
// board card, a leaderboard row and a profile alike.
//
// The API speaks in a few dialects this file smooths over:
//   - money arrives as plain USD numbers (rewardAmount: 1666);
//   - judge scores arrive as micro-percents (956066 means 95.6066%);
//   - times arrive as ISO strings that may be missing or invalid.
// Anything unusable becomes a dash instead of "NaN" or "undefined".

const DASH = '–';

const group = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// Escape a value for safe interpolation into HTML text or attributes.
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// A whole number with thousands separators, or a dash.
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? group.format(n) : DASH;
}

// A USD amount the way the board prints prizes: $1,666.
export function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${group.format(n)}` : DASH;
}

// A micro-percent score (parts per million of 100%) as "95.61%".
export function pct(micro, digits = 2) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return DASH;
  return `${(n / 10000).toFixed(digits)}%`;
}

// A byte count in human units: 936439 -> "914 KB".
export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Split a millisecond span into the two largest units worth printing:
// "2d 4h", "3h 12m", "45s". Negative spans clamp to zero.
function span(ms) {
  const t = Math.max(0, Math.floor(ms));
  if (t >= DAY) return `${Math.floor(t / DAY)}d ${Math.floor((t % DAY) / HOUR)}h`;
  if (t >= HOUR) return `${Math.floor(t / HOUR)}h ${Math.floor((t % HOUR) / MIN)}m`;
  if (t >= MIN) return `${Math.floor(t / MIN)}m ${Math.floor((t % MIN) / 1000)}s`;
  return `${Math.floor(t / 1000)}s`;
}

// Time left until an ISO deadline: "closes in 3h 12m", or "closed".
// Returns null when the input is not a usable date, so callers can
// hide the line entirely instead of printing a guess.
export function countdown(iso, now = Date.now()) {
  const end = Date.parse(iso ?? '');
  if (!Number.isFinite(end)) return null;
  return end > now ? span(end - now) : 'closed';
}

// Milliseconds until an ISO deadline (negative once it has passed),
// or null for an unusable date. The board's ticker uses this to
// decide which countdowns deserve the urgent styling.
export function msLeft(iso, now = Date.now()) {
  const end = Date.parse(iso ?? '');
  return Number.isFinite(end) ? end - now : null;
}

// "3 days ago" style age for a past ISO timestamp.
export function ago(iso, now = Date.now()) {
  const then = Date.parse(iso ?? '');
  if (!Number.isFinite(then)) return DASH;
  return then > now ? 'just now' : `${span(now - then)} ago`;
}

// A calendar date for detail pages: "17 Nov 2026, 12:30 UTC".
export function when(iso) {
  const d = new Date(iso ?? '');
  if (Number.isNaN(d.getTime())) return DASH;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
