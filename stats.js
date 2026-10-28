import { findMatch } from './lib/patterns.js';
import { addCustomPattern, loadSettings, supportedEntries } from './lib/settings.js';
import { USAGE_PREFIX, formatDuration, lastDays, summarize } from './lib/usage.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let range = localStorage.getItem('statsRange') || 'today';

function rangeDates() {
  if (range === 'today') return lastDays(1);
  if (range === 'yesterday') return lastDays(2).slice(0, 1);
  return lastDays(Number(range));
}

const parseDate = (date) => new Date(`${date}T12:00:00`);
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Round y-axis step so the chart gets at most 4 gridlines above zero. */
function niceTicks(maxMs) {
  const steps = [1, 5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720].map((m) => m * 60000);
  const step = steps.find((s) => maxMs / s <= 4) ?? steps.at(-1);
  const count = Math.max(1, Math.ceil(maxMs / step));
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function renderChart(summary, dates) {
  const single = dates.length === 1;
  const points = single
    ? summary.hours.map((ms, h) => ({
        value: ms,
        title: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`,
        axis: h % 3 === 0 ? hourLabel(h) : '',
      }))
    : summary.daily.map(({ date, time }, i) => {
        const d = parseDate(date);
        const every = dates.length > 10 ? 5 : 1;
        const fromEnd = dates.length - 1 - i;
        return {
          value: time,
          title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          axis:
            fromEnd % every !== 0
              ? ''
              : dates.length > 10
                ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : d.toLocaleDateString(undefined, { weekday: 'short' }),
        };
      });

  $('chart-title').textContent = single ? 'Time by hour' : 'Time per day';
  const ticks = niceTicks(Math.max(...points.map((p) => p.value), 60000));
  const top = ticks.at(-1);

  $('y-axis').replaceChildren(
    ...ticks.map((t) => el('span', { textContent: t ? formatDuration(t) : '0', style: `bottom:${(t / top) * 100}%` })),
  );
  const tooltip = $('tooltip');
  $('plot').replaceChildren(
    ...ticks.slice(1).map((t) => el('div', { className: 'gridline', style: `bottom:${(t / top) * 100}%` })),
    ...points.map((p) => {
      const slot = el('div', { className: 'slot' });
      if (p.value > 0) slot.append(el('div', { className: 'col', style: `height:${(p.value / top) * 100}%` }));
      slot.addEventListener('mouseenter', () => {
        tooltip.replaceChildren(el('strong', { textContent: formatDuration(p.value) }), p.title);
        tooltip.hidden = false;
      });
      slot.addEventListener('mousemove', (e) => {
        const card = tooltip.parentElement.getBoundingClientRect();
        const x = Math.min(e.clientX - card.left + 12, card.width - tooltip.offsetWidth - 8);
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${e.clientY - card.top - tooltip.offsetHeight - 10}px`;
      });
      slot.addEventListener('mouseleave', () => (tooltip.hidden = true));
      return slot;
    }),
  );
  $('x-axis').replaceChildren(...points.map((p) => el('span', { textContent: p.axis })));
}

function faviconUrl(host) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', `https://${host}`);
  url.searchParams.set('size', '32');
  return url.toString();
}

async function renderSites(summary) {
  const entries = await supportedEntries(await loadSettings());
  const sites = summary.sites.filter((s) => s.time >= 1000 || s.blocked);
  const maxTime = Math.max(...sites.map((s) => s.time), 1);
  $('empty').hidden = sites.length > 0;
  $('sites').hidden = sites.length === 0;
  $('sites').tBodies[0].replaceChildren(
    ...sites.map((s) => {
      const blocked = findMatch(`https://${s.host}/`, entries);
      const action = blocked
        ? el('span', { className: 'is-blocked', textContent: 'Blocked' })
        : el('button', { textContent: 'Block', onclick: () => addCustomPattern(s.host) });
      const icon = el('img', { src: faviconUrl(s.host), alt: '' });
      return el(
        'tr',
        {},
        el('td', {}, el('div', { className: 'site-name' }, icon, el('span', { textContent: s.host, title: s.host }))),
        el(
          'td',
          {},
          el(
            'div',
            { className: 'time-cell' },
            el('div', { className: 'bar-track' }, el('div', { className: 'bar', style: `width:${(s.time / maxTime) * 100}%` })),
            el('span', { textContent: formatDuration(s.time) }),
          ),
        ),
        el('td', { className: 'num', textContent: summary.total ? `${Math.round((s.time / summary.total) * 100)}%` : '–' }),
        el('td', { className: 'num', textContent: s.visits }),
        el('td', { className: 'num', textContent: s.blocked }),
        el('td', {}, action),
      );
    }),
  );
}

function renderTiles(summary, dates) {
  $('tile-total').textContent = formatDuration(summary.total);
  if (dates.length > 1) {
    // Average over days that have any activity, so a fresh install isn't diluted by empty days.
    const active = summary.daily.filter((d) => d.time > 0).length || 1;
    $('tile-second-label').textContent = 'Daily average';
    $('tile-second').textContent = formatDuration(summary.total / active);
  } else {
    $('tile-second-label').textContent = 'Sites visited';
    $('tile-second').textContent = summary.sites.filter((s) => s.time >= 1000).length;
  }
  const top = summary.sites[0];
  $('tile-top').textContent = top?.time ? top.host : '–';
  $('tile-top').title = top?.host ?? '';
  $('tile-top-sub').textContent = top?.time ? formatDuration(top.time) : '';
  $('tile-blocked').textContent = summary.blocked;
}

async function render() {
  for (const b of document.querySelectorAll('#range button')) {
    b.setAttribute('aria-selected', String(b.dataset.range === range));
  }
  const dates = rangeDates();
  const stored = await chrome.storage.local.get(dates.map((d) => USAGE_PREFIX + d));
  const summary = summarize(dates.map((date) => ({ date, record: stored[USAGE_PREFIX + date] })));
  renderTiles(summary, dates);
  renderChart(summary, dates);
  await renderSites(summary);
}

$('range').addEventListener('click', (e) => {
  const value = e.target.closest('button')?.dataset.range;
  if (!value) return;
  range = value;
  localStorage.setItem('statsRange', range);
  render();
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete all tracked usage data? This cannot be undone.')) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(USAGE_PREFIX)));
});

// Re-render when usage is flushed (every minute) or block settings change.
let pendingRender;
chrome.storage.onChanged.addListener(() => {
  clearTimeout(pendingRender);
  pendingRender = setTimeout(render, 200);
});

await chrome.runtime.sendMessage({ type: 'flush-usage' });
render();
