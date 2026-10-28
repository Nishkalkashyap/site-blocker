// Pure usage-data helpers (no chrome.* APIs) so they can be unit-tested in Node.
//
// Storage: one chrome.storage.local key per local day, "usage:YYYY-MM-DD" =>
//   { sites: { [host]: { time: ms, visits: n, blocked: n } }, hours: [24 x ms] }

export const USAGE_PREFIX = 'usage:';
export const RETENTION_DAYS = 90;

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The last `count` local days ending today, oldest first, as YYYY-MM-DD. */
export function lastDays(count, now = Date.now()) {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) =>
    dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (count - 1 - i), 12)),
  );
}

/** Hostname without "www.", or null for non-web URLs. */
export function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

/** Splits [start, end) at local hour boundaries into { day, hour, ms } chunks. */
export function splitByHour(start, end) {
  const chunks = [];
  for (let t = start; t < end; ) {
    const d = new Date(t);
    const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    const stop = Math.min(end, nextHour);
    chunks.push({ day: dayKey(t), hour: d.getHours(), ms: stop - t });
    t = stop;
  }
  return chunks;
}

export const emptyDay = () => ({ sites: {}, hours: Array(24).fill(0) });

export const siteStats = (day, host) => (day.sites[host] ??= { time: 0, visits: 0, blocked: 0 });

/**
 * Combines day records ({ date, record } pairs, oldest first) into totals:
 * per-site (sorted by time), per-day, and per-hour.
 */
export function summarize(days) {
  const sites = {};
  const hours = Array(24).fill(0);
  const daily = [];
  let total = 0;
  let blocked = 0;
  for (const { date, record } of days) {
    let dayTotal = 0;
    for (const [host, s] of Object.entries(record?.sites ?? {})) {
      const agg = (sites[host] ??= { host, time: 0, visits: 0, blocked: 0 });
      agg.time += s.time;
      agg.visits += s.visits;
      agg.blocked += s.blocked;
      dayTotal += s.time;
      blocked += s.blocked;
    }
    (record?.hours ?? []).forEach((ms, h) => (hours[h] += ms));
    daily.push({ date, time: dayTotal });
    total += dayTotal;
  }
  return {
    total,
    blocked,
    daily,
    hours,
    sites: Object.values(sites).sort((a, b) => b.time - a.time || b.blocked - a.blocked),
  };
}

export function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return ms >= 1000 ? `${Math.floor(ms / 1000)}s` : '0m';
  const h = Math.floor(mins / 60);
  if (!h) return `${mins}m`;
  return mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`;
}
