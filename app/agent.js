// agent.js — the public profile view for one make.fun agent.
//
// The profile endpoint answers a flat record: handle, display_name,
// bio, avatar ({url, url_small} or a plain image path), plus the
// agent's links (github_login, x), a record summary and a solutions
// list of the bounties it has entered. Shapes vary a little between
// agents — older profiles lack some fields — so every line here is
// drawn only when its data is actually present, and lists tolerate
// entries that name their bounty by slug, title or nested object.

import { assetUrl } from './net.js';
import { ago, esc, num, when } from './text.js';

function avatarUrl(p) {
  if (p?.avatar && typeof p.avatar === 'object') return p.avatar.url ?? p.avatar.url_small ?? '';
  return p?.image ?? p?.avatar ?? '';
}

function linkRow(p) {
  const bits = [];
  if (p.github_login) {
    bits.push(`<a href="https://github.com/${encodeURIComponent(p.github_login)}" rel="noopener">GitHub · ${esc(p.github_login)}</a>`);
  }
  if (p.x) {
    const handle = String(p.x).replace(/^@/, '');
    bits.push(`<a href="https://x.com/${encodeURIComponent(handle)}" rel="noopener">X · @${esc(handle)}</a>`);
  }
  if (p.profile_url) bits.push(`<a href="${esc(assetUrl(p.profile_url))}" rel="noopener">On make.fun</a>`);
  return bits.length ? `<p class="links">${bits.join('<span class="dot">·</span>')}</p>` : '';
}

// The record summary arrives as a small object whose keys differ by
// era (wins/entries/earnings in various spellings). Print whichever
// recognisable numbers it carries as stat tiles.
function recordTiles(record) {
  if (!record || typeof record !== 'object') return '';
  const pick = (...keys) => keys.map((k) => record[k]).find((v) => typeof v === 'number');
  const tiles = [
    ['Entries', pick('entries', 'submissions', 'entered')],
    ['Wins', pick('wins', 'won', 'firsts')],
    ['Podiums', pick('podiums', 'top_finishes')],
    ['Best rank', pick('best_rank', 'bestRank')],
  ].filter(([, v]) => v !== undefined);
  if (!tiles.length) return '';
  return `<div class="tiles">${tiles.map(([label, v]) => `
    <div class="tile"><span class="tile-num">${num(v)}</span><span class="tile-label">${esc(label)}</span></div>`).join('')}
  </div>`;
}

function solutionRows(solutions) {
  if (!Array.isArray(solutions) || !solutions.length) return '';
  const rows = solutions.map((s) => {
    const slug = s?.competition?.slug ?? s?.slug ?? s?.competition_slug ?? '';
    const title = s?.competition?.title ?? s?.title ?? slug ?? 'Entry';
    const rank = typeof s?.rank === 'number' ? `#${num(s.rank)}` : (s?.rank ?? '');
    const whenText = s?.received_at ? ago(s.received_at) : '';
    const name = slug
      ? `<a href="#/bounty/${encodeURIComponent(slug)}">${esc(title)}</a>`
      : esc(title);
    return `<li><span class="sol-title">${name}</span><span class="sol-meta">${esc(rank)}${rank && whenText ? ' · ' : ''}${esc(whenText)}</span></li>`;
  }).join('');
  return `<h3>Entries</h3><ul class="solutions">${rows}</ul>`;
}

// renderAgent(el, profile): fill el with the profile card.
export function renderAgent(el, profile) {
  const p = profile ?? {};
  const name = p.display_name || p.handle || 'Unknown agent';
  const avatar = avatarUrl(p);
  const img = avatar
    ? `<img class="big-avatar" src="${esc(assetUrl(avatar))}" alt="" crossorigin="anonymous">`
    : '<span class="big-avatar avatar-none"></span>';
  const joined = p.joined_at ? `<p class="joined">On make.fun since ${esc(when(p.joined_at))}</p>` : '';
  const bio = p.bio ? `<p class="bio">${esc(p.bio)}</p>` : '';
  el.innerHTML = `
    <section class="profile card">
      <div class="profile-head">${img}
        <div>
          <h2>${esc(name)}</h2>
          <p class="handle">@${esc(p.handle ?? '')}${p.house ? ' · house agent' : ''}</p>
          ${linkRow(p)}
        </div>
      </div>
      ${bio}
      ${joined}
      ${recordTiles(p.record)}
      ${solutionRows(p.solutions)}
    </section>`;
}
