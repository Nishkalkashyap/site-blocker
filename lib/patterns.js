// Pure pattern logic (no chrome.* APIs) so it can be unit-tested in Node.

// Quick-toggle sites. Each preset is a list of glob patterns (see globToRegex).
export const PRESETS = [
  { id: 'youtube', name: 'YouTube', patterns: ['youtube.com', 'youtu.be'] },
  { id: 'reddit', name: 'Reddit', patterns: ['reddit.com', 'redd.it'] },
  { id: 'twitter', name: 'X / Twitter', patterns: ['x.com', 'twitter.com'] },
  { id: 'facebook', name: 'Facebook', patterns: ['facebook.com', 'fb.com'] },
  { id: 'instagram', name: 'Instagram', patterns: ['instagram.com'] },
  { id: 'tiktok', name: 'TikTok', patterns: ['tiktok.com'] },
  { id: 'netflix', name: 'Netflix', patterns: ['netflix.com'] },
  { id: 'twitch', name: 'Twitch', patterns: ['twitch.tv'] },
  { id: 'linkedin', name: 'LinkedIn', patterns: ['linkedin.com'] },
  { id: 'hackernews', name: 'Hacker News', patterns: ['news.ycombinator.com'] },
  { id: 'pinterest', name: 'Pinterest', patterns: ['pinterest.com'] },
  { id: 'tumblr', name: 'Tumblr', patterns: ['tumblr.com'] },
  { id: 'primevideo', name: 'Prime Video', patterns: ['primevideo.com'] },
  { id: 'disneyplus', name: 'Disney+', patterns: ['disneyplus.com'] },
  { id: 'hulu', name: 'Hulu', patterns: ['hulu.com'] },
  { id: 'ninegag', name: '9GAG', patterns: ['9gag.com'] },
];

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\\/]/g, '\\$&');

// Escapes everything except `*`, which becomes `wildcard`.
const globPart = (s, wildcard) => s.split('*').map(escapeRegex).join(wildcard);

/**
 * Converts a glob URL pattern into a regex source matched against the full URL.
 *
 *   example.com            example.com and every subdomain, any path
 *   *.example.com          subdomains only (not example.com itself)
 *   *tube.com              any host ending in "tube.com" (youtube.com, mytube.com, ...)
 *   reddit.*               reddit.com, reddit.co.uk, ...
 *   example.com/path       URLs whose path starts with /path
 *   example.com/watch*v=   `*` matches anything, including `/`
 *
 * A leading scheme (http://, https://, *://) is ignored; http and https are both matched.
 */
export function globToRegex(glob) {
  const p = glob.trim().replace(/^(?:\*|https?):\/\//i, '');
  if (/\s/.test(p)) throw new Error('Patterns cannot contain spaces');

  const split = p.search(/[/?#]/);
  const host = split === -1 ? p : p.slice(0, split);
  const rest = split === -1 ? '' : p.slice(split);
  if (!host || host === '*.') throw new Error('Missing domain');

  let hostRe;
  if (host.startsWith('*.')) {
    hostRe = '(?:[^/?#]+\\.)' + globPart(host.slice(2), '[^/?#]*');
  } else if (host.startsWith('*')) {
    hostRe = globPart(host, '[^/?#]*');
  } else {
    hostRe = '(?:[^/?#]+\\.)?' + globPart(host, '[^/?#]*');
  }
  if (!host.includes(':')) hostRe += '(?::\\d+)?';

  // No path: stop at the end of the host so "x.com" doesn't match "x.com.evil.org".
  const tail = rest ? globPart(rest, '.*') : '(?:[/?#]|$)';
  return '^https?://' + hostRe + tail;
}

/**
 * Compiles one user-entered line. `/.../` is a raw regex tested against the full URL;
 * anything else is a glob. Throws on invalid input.
 */
export function compilePattern(text) {
  const t = text.trim();
  if (t.length > 2 && t.startsWith('/') && t.endsWith('/')) {
    const source = t.slice(1, -1);
    new RegExp(source, 'i'); // throws SyntaxError on bad input
    return source;
  }
  return globToRegex(t);
}

/**
 * Parses the custom pattern textarea: one pattern per line, blank lines and
 * lines starting with `#` are ignored.
 */
export function parseCustomList(text) {
  const out = [];
  (text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    try {
      out.push({ line: i + 1, label: line, source: compilePattern(line) });
    } catch (e) {
      out.push({ line: i + 1, label: line, error: e.message });
    }
  });
  return out;
}

/** All active, valid entries ({ label, source }) for the given settings. */
export function activeEntries({ presets = {}, custom = '' }) {
  const entries = [];
  for (const preset of PRESETS) {
    if (!presets[preset.id]) continue;
    for (const pattern of preset.patterns) {
      entries.push({ label: preset.name, source: globToRegex(pattern) });
    }
  }
  for (const entry of parseCustomList(custom)) {
    if (!entry.error) entries.push({ label: entry.label, source: entry.source });
  }
  return entries;
}

/** Wraps a pattern so it matches the whole URL, letting `\0` substitute the full original URL. */
export const toDnrRegex = (source) => `^.*(?:${source}).*$`;

export function findMatch(url, entries) {
  if (!/^https?:/i.test(url || '')) return null;
  return entries.find((e) => new RegExp(e.source, 'i').test(url)) || null;
}
