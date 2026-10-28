// Time tracking. Counts time on the active tab's site while Brave is focused and
// you're not idle (an audible tab counts even when idle, so watching videos is tracked).
//
// MV3 service workers can be killed at any time, so the open session lives in
// chrome.storage.session and is flushed into daily totals on every relevant event
// and on a one-minute alarm.

import {
  RETENTION_DAYS,
  USAGE_PREFIX,
  dayKey,
  emptyDay,
  hostOf,
  lastDays,
  siteStats,
  splitByHour,
} from './usage.js';

const IDLE_SECONDS = 60;
// Gaps longer than this mean the computer slept or the worker stalled; don't count them.
const MAX_GAP_MS = 2 * 60 * 1000;
const ALARM = 'usage-tick';

chrome.idle.setDetectionInterval(IDLE_SECONDS);

let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn).catch((e) => console.error('Site Blocker tracker:', e)));

/** Loads the given days, lets `edit` mutate them, and writes them back. */
async function editDays(dates, edit) {
  const keys = [...new Set(dates)].map((d) => USAGE_PREFIX + d);
  const stored = await chrome.storage.local.get(keys);
  const days = Object.fromEntries(keys.map((k) => [k.slice(USAGE_PREFIX.length), stored[k] ?? emptyDay()]));
  edit(days);
  await chrome.storage.local.set(
    Object.fromEntries(Object.entries(days).map(([d, record]) => [USAGE_PREFIX + d, record])),
  );
}

async function activeHost() {
  const state = await chrome.idle.queryState(IDLE_SECONDS);
  if (state === 'locked') return null;
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab || (state === 'idle' && !tab.audible)) return null;
  return hostOf(tab.url);
}

/** Closes the open session (crediting its time) and opens one for whatever is active now. */
async function tick() {
  const now = Date.now();
  const { session } = await chrome.storage.session.get('session');
  const host = await activeHost();
  await chrome.storage.session.set({ session: host ? { host, start: now } : null });

  const chunks = session ? splitByHour(session.start, Math.min(now, session.start + MAX_GAP_MS)) : [];
  const newVisit = host && host !== session?.host;
  if (!chunks.length && !newVisit) return;

  await editDays([...chunks.map((c) => c.day), dayKey(now)], (days) => {
    for (const { day, hour, ms } of chunks) {
      siteStats(days[day], session.host).time += ms;
      days[day].hours[hour] += ms;
    }
    if (newVisit) siteStats(days[dayKey(now)], host).visits++;
  });
}

async function prune() {
  const keep = new Set(lastDays(RETENTION_DAYS).map((d) => USAGE_PREFIX + d));
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter((k) => k.startsWith(USAGE_PREFIX) && !keep.has(k));
  if (stale.length) await chrome.storage.local.remove(stale);
}

export const flushUsage = () => serial(tick);

export function recordBlocked(url) {
  const host = hostOf(url);
  if (!host) return Promise.resolve();
  const today = dayKey(Date.now());
  return serial(() => editDays([today], (days) => siteStats(days[today], host).blocked++));
}

function start() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  serial(prune);
  flushUsage();
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === ALARM && flushUsage());
chrome.tabs.onActivated.addListener(flushUsage);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || 'audible' in info)) flushUsage();
});
chrome.windows.onFocusChanged.addListener(flushUsage);
chrome.idle.onStateChanged.addListener(flushUsage);

// Extension pages ask for a flush before reading stats, and report blocked attempts.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flush-usage') flushUsage().then(() => sendResponse(true));
  else if (msg?.type === 'blocked') recordBlocked(msg.url).then(() => sendResponse(true));
  else return false;
  return true;
});
