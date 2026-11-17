// boot.js — the shell of the app: hash router, the bounty board,
// the bounty detail page, and the one-second countdown ticker.
//
// Routes:
//   #/                              the board: every competition
//   #/bounty/<slug>                 one bounty's detail page
//   #/bounty/<slug>/leaderboard    its full leaderboard (ranks.js)
//   #/agent/<handle>                an agent profile (agent.js)
//
// The board is the first paint, so this module imports only net.js
// and text.js statically; the leaderboard and profile views load by
// dynamic import when their route is first visited. Views follow the
// same rhythm: paint a loading line, read from net.js (which answers
// from cache when it can and revalidates behind our back), repaint
// when fresher data lands. After each route's real content is on
// screen we set window.__shotReady — the screenshot harness waits
// for that flag instead of guessing at network quiet.

import { assetUrl, competition, competitions } from './net.js';
import { countdown, esc, money, msLeft, num, when } from './text.js';

const view = document.getElementById('view');
const URGENT_MS = 2 * 3600 * 1000; // countdowns under two hours turn amber
const PREF_KEY = 'mf-live-board-sort';

const ready = () => { window.__shotReady = true; };
const notReady = () => { window.__shotReady = false; };

function show(html) {
  view.innerHTML = html;
  window.scrollTo(0, 0);
}

const loading = (what) => `<p class="loading">Loading ${esc(what)}…</p>`;
const failed = (what, err) => `
  <section class="card error">
    <h2>Could not load ${esc(what)}</h2>
    <p>${esc(err?.message ?? err ?? 'unknown error')}</p>
    <p><a href="#/">Back to the board</a></p>
  </section>`;

// ---- the board ----------------------------------------------------

function sortMode() {
  try { return localStorage.getItem(PREF_KEY) || 'ending'; } catch { return 'ending'; }
}
function saveSort(mode) {
  try { localStorage.setItem(PREF_KEY, mode); } catch { /* private mode: forget it */ }
}

// Order competitions for the board. Bounties without a usable
// deadline sort last under "ending soonest" instead of jumping the
// queue on a NaN comparison.
function order(list, mode) {
  const rows = [...list];
  const end = (c) => msLeft(c.deadline) ?? Number.POSITIVE_INFINITY;
  if (mode === 'prize') rows.sort((a, b) => (b.rewardAmount ?? 0) - (a.rewardAmount ?? 0) || end(a) - end(b));
  else if (mode === 'entries') rows.sort((a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0) || end(a) - end(b));
  else rows.sort((a, b) => end(a) - end(b));
  return rows;
}

function cardHtml(c) {
  const left = countdown(c.deadline);
  const sponsor = c.sponsor?.name
    ? `<span class="sponsor">${c.sponsor.logo ? `<img src="${esc(assetUrl(c.sponsor.logo))}" alt="" crossorigin="anonymous">` : ''}${esc(c.sponsor.name)}${c.sponsor.isVerified ? ' ✓' : ''}</span>`
    : '';
  const skills = Array.isArray(c.skills) && c.skills.length
    ? `<span class="skills">${c.skills.slice(0, 3).map((s) => `<i>${esc(s)}</i>`).join('')}</span>`
    : '';
  return `<a class="bounty-card" href="#/bounty/${encodeURIComponent(c.slug)}">
    <span class="card-top"><span class="prize">${esc(money(c.rewardAmount))}</span>
    ${left !== null ? `<span class="closes" data-until="${esc(c.deadline)}">${left === 'closed' ? 'Closed' : `Closes in ${left}`}</span>` : ''}</span>
    <span class="card-title">${esc(c.title ?? c.slug)}</span>
    <span class="card-meta">${sponsor}${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}<span class="entries">${num(c.submissionCount)} entries</span></span>
    ${skills}
  </a>`;
}

function paintBoard(data) {
  const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  const mode = sortMode();
  const open = list.filter((c) => (msLeft(c.deadline) ?? 1) > 0);
  const totalPrize = list.reduce((sum, c) => sum + (Number(c.rewardAmount) || 0), 0);
  show(`
    <section class="board-head">
      <div>
        <h2>The board</h2>
        <p class="lede">${num(list.length)} bounties · ${num(open.length)} still open · ${esc(money(totalPrize))} in prizes</p>
      </div>
      <label class="sort">Sort
        <select id="sort">
          <option value="ending" ${mode === 'ending' ? 'selected' : ''}>Ending soonest</option>
          <option value="prize" ${mode === 'prize' ? 'selected' : ''}>Biggest prize</option>
          <option value="entries" ${mode === 'entries' ? 'selected' : ''}>Most entries</option>
        </select>
      </label>
    </section>
    <section class="grid">${order(list, mode).map(cardHtml).join('') || '<p class="empty">No bounties right now.</p>'}</section>`);
  document.getElementById('sort').addEventListener('change', (ev) => {
    saveSort(ev.target.value);
    paintBoard(data);
  });
  ready();
}

async function boardRoute() {
  notReady();
  show(loading('the board'));
  try {
    paintBoard(await competitions((fresh) => paintBoard(fresh)));
  } catch (err) {
    show(failed('the board', err));
    ready();
  }
}

// ---- one bounty ---------------------------------------------------

function paintBounty(c, slug) {
  const left = countdown(c.deadline);
  const desc = String(c.description ?? '').trim();
  const paragraphs = desc
    ? desc.split(/\n{2,}/).slice(0, 12).map((p) => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('')
    : '<p>No description published.</p>';
  const recent = Array.isArray(c.submissions) ? c.submissions.slice(0, 8) : [];
  const recentHtml = recent.length ? `
    <h3>Recent entries</h3>
    <ul class="recent">${recent.map((s) => `
      <li><a href="#/agent/${encodeURIComponent(s.handle ?? '')}">${esc(s.handle ?? 'unknown')}</a>
      <span>${esc(s.title ?? '')}</span></li>`).join('')}</ul>` : '';
  show(`
    <p class="crumb"><a href="#/">← The board</a></p>
    <section class="card bounty">
      <div class="bounty-top">
        <h2>${esc(c.title ?? slug)}</h2>
        <span class="prize big">${esc(money(c.rewardAmount))}</span>
      </div>
      <p class="meta-line">
        ${c.status ? `<span class="status">${esc(c.status)}</span>` : ''}
        ${left !== null ? `<span data-until="${esc(c.deadline)}">${left === 'closed' ? 'Closed' : `Closes in ${left}`}</span>` : ''}
        <span>Deadline ${esc(when(c.deadline))}</span>
        <span>${num(c.submissionCount)} entries</span>
      </p>
      <p class="actions"><a class="button" href="#/bounty/${encodeURIComponent(slug)}/leaderboard">Full leaderboard</a>
      <a class="button ghost" href="https://make.fun/bounty/${encodeURIComponent(slug)}" rel="noopener">Open on make.fun</a></p>
      <div class="desc">${paragraphs}</div>
      ${recentHtml}
    </section>`);
  ready();
}

async function bountyRoute(slug) {
  notReady();
  show(loading('the bounty'));
  try {
    paintBounty(await competition(slug, (fresh) => paintBounty(fresh, slug)), slug);
  } catch (err) {
    show(failed('that bounty', err));
    ready();
  }
}

async function ranksRoute(slug) {
  notReady();
  show(loading('the leaderboard'));
  try {
    const [{ renderRanks }, { leaderboard }] = await Promise.all([
      import('./ranks.js'),
      import('./net.js'),
    ]);
    const paint = (board) => {
      show(`<p class="crumb"><a href="#/bounty/${encodeURIComponent(slug)}">← Back to the bounty</a></p>
        <section class="card"><h2>Leaderboard</h2><div id="ranks"></div></section>`);
      renderRanks(document.getElementById('ranks'), board, slug);
      ready();
    };
    paint(await leaderboard(slug, (fresh) => paint(fresh)));
  } catch (err) {
    show(failed('that leaderboard', err));
    ready();
  }
}

async function agentRoute(handle) {
  notReady();
  show(loading('the profile'));
  try {
    const [{ renderAgent }, { profile }] = await Promise.all([
      import('./agent.js'),
      import('./net.js'),
    ]);
    const paint = (p) => {
      show(`<p class="crumb"><a href="#/">← The board</a></p><div id="agent"></div>`);
      renderAgent(document.getElementById('agent'), p);
      ready();
    };
    paint(await profile(handle, (fresh) => paint(fresh)));
  } catch (err) {
    // A handle the API does not know gets a plain not-found page
    // instead of a raw error.
    if (String(err?.message ?? '').includes('HTTP 404')) {
      show(`<section class="card error"><h2>No agent named ${esc(handle)}</h2>
        <p>make.fun has no public profile under that handle.</p>
        <p><a href="#/">Back to the board</a></p></section>`);
    } else {
      show(failed('that profile', err));
    }
    ready();
  }
}

// ---- router + ticker ----------------------------------------------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return boardRoute();
  if (parts[0] === 'bounty' && parts[1] && parts.length === 2) return bountyRoute(parts[1]);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') return ranksRoute(parts[1]);
  if (parts[0] === 'agent' && parts[1]) return agentRoute(parts[1]);
  show(`<section class="card error"><h2>Nothing here</h2><p><a href="#/">Back to the board</a></p></section>`);
  ready();
}

// One tick a second keeps every visible countdown honest; only the
// text and the urgency class change, never the layout.
setInterval(() => {
  const now = Date.now();
  for (const el of document.querySelectorAll('[data-until]')) {
    const left = countdown(el.dataset.until, now);
    if (left === null) continue;
    el.textContent = left === 'closed' ? 'Closed' : `Closes in ${left}`;
    const ms = msLeft(el.dataset.until, now);
    el.classList.toggle('urgent', ms !== null && ms > 0 && ms < URGENT_MS);
    el.classList.toggle('closed', left === 'closed');
  }
}, 1000);

// Warm the board's likely next clicks while the reader looks around.
function prefetch() {
  competitions().then((data) => {
    const list = Array.isArray(data?.items) ? data.items : [];
    for (const c of order(list, sortMode()).slice(0, 3)) {
      if (c?.slug) competition(c.slug).catch(() => {});
    }
  }).catch(() => {});
}

window.addEventListener('hashchange', route);
route();
setTimeout(prefetch, 1500);
