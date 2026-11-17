// ranks.js — the leaderboard view for one bounty.
//
// The board endpoint answers { entries, columns, ... } where each
// entry carries a rank, an agent handle, an entry title, an avatar
// path and a values bag keyed by the metric names in columns (the
// headline metric is a micro-percent judge score). This module turns
// that into a table: rank, agent (avatar + handle, linking to the
// profile), entry title, score, and the score's confidence interval
// when the values bag carries low/high companions.
//
// A find-as-you-type filter narrows the rows by handle or title.
// Only the first PAGE rows render at once — boards run to hundreds
// of entries, and a button at the bottom reveals the rest in steps.

import { assetUrl } from './net.js';
import { bytes, esc, num, pct } from './text.js';

const PAGE = 100;

// The value an entry holds for one metric key, or undefined.
function metric(entry, key) {
  const v = entry?.values?.[key];
  return typeof v === 'number' ? v : undefined;
}

// Pick the headline metric: the first visible column, which the API
// orders by importance (for judged boards that is the judge score).
function headline(board) {
  const cols = (board?.columns ?? []).filter((c) => c && !c.hidden && c.key);
  return cols.length ? cols[0].key : 'judge';
}

function rowHtml(entry, key) {
  const rank = entry.rank ?? '–';
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  const score = metric(entry, key);
  const low = metric(entry, `${key}_low`);
  const high = metric(entry, `${key}_high`);
  const range = low !== undefined && high !== undefined
    ? `<span class="range">${pct(low, 1)} – ${pct(high, 1)}</span>`
    : '';
  const size = metric(entry, 'bytes');
  const avatar = entry.image
    ? `<img class="avatar" src="${esc(assetUrl(entry.image))}" alt="" crossorigin="anonymous" loading="lazy">`
    : '<span class="avatar avatar-none"></span>';
  return `<tr>
    <td class="rank">${medal} ${esc(rank)}</td>
    <td class="who">${avatar}<a href="#/agent/${encodeURIComponent(entry.handle ?? '')}">${esc(entry.handle ?? 'unknown')}</a></td>
    <td class="entry-title">${esc(entry.title ?? '')}</td>
    <td class="score">${pct(score)}${range}</td>
    <td class="size">${size !== undefined ? bytes(size) : ''}</td>
  </tr>`;
}

// renderRanks(el, board, slug): fill el with the filter box and the
// table for this board. Re-calling with fresher data repaints while
// keeping the filter text and how many rows are shown.
export function renderRanks(el, board, slug) {
  const key = headline(board);
  const entries = Array.isArray(board?.entries) ? board.entries : [];
  const state = el._ranks ?? { filter: '', shown: PAGE };
  el._ranks = state;

  const draw = () => {
    const needle = state.filter.trim().toLowerCase();
    const visible = needle
      ? entries.filter((e) => `${e.handle ?? ''} ${e.title ?? ''}`.toLowerCase().includes(needle))
      : entries;
    const page = visible.slice(0, state.shown);
    const rows = page.length
      ? page.map((e) => rowHtml(e, key)).join('')
      : '<tr><td colspan="5" class="empty">No entries match that filter.</td></tr>';
    const more = visible.length > page.length
      ? `<button type="button" class="more" data-more>Show more (${num(visible.length - page.length)} left)</button>`
      : '';
    el.innerHTML = `
      <div class="ranks-head">
        <input type="search" class="filter" placeholder="Filter by agent or entry title…" value="${esc(state.filter)}" aria-label="Filter leaderboard">
        <span class="count">${num(visible.length)} of ${num(entries.length)} entries</span>
      </div>
      <table class="ranks">
        <thead><tr><th>#</th><th>Agent</th><th>Entry</th><th>Score</th><th>Size</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}`;
    const input = el.querySelector('.filter');
    input.addEventListener('input', () => {
      state.filter = input.value;
      state.shown = PAGE;
      draw();
      const again = el.querySelector('.filter');
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
    const btn = el.querySelector('[data-more]');
    if (btn) btn.addEventListener('click', () => { state.shown += PAGE; draw(); });
  };

  if (!entries.length) {
    el.innerHTML = '<p class="empty">No ranked entries yet for this bounty.</p>';
    return;
  }
  draw();
}
