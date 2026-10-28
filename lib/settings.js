import { activeEntries, toDnrRegex } from './patterns.js';

// Settings live in chrome.storage.sync as { presets: { [id]: boolean }, custom: string }.

const DEFAULTS = { presets: { youtube: true }, custom: '' };

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(['presets', 'custom']);
  return {
    presets: stored.presets ?? DEFAULTS.presets,
    custom: stored.custom ?? DEFAULTS.custom,
  };
}

export const saveSettings = (partial) => chrome.storage.sync.set(partial);

/** Appends a pattern to the custom list unless it's already there. */
export async function addCustomPattern(pattern) {
  const { custom } = await loadSettings();
  if (custom.split('\n').some((l) => l.trim() === pattern)) return;
  await saveSettings({ custom: custom.trim() ? `${custom.trimEnd()}\n${pattern}` : pattern });
}

export const blockedPageUrl = (url) => chrome.runtime.getURL('blocked.html') + '#' + url;

/** Returns null if Chrome's RE2 engine accepts the rule regex, else a human-readable reason. */
export async function dnrRegexProblem(regex) {
  const { isSupported, reason } = await chrome.declarativeNetRequest.isRegexSupported({
    regex,
    isCaseSensitive: false,
  });
  if (isSupported) return null;
  return reason === 'memoryLimitExceeded'
    ? 'Regex is too large'
    : 'Regex uses syntax the browser does not support (e.g. lookaheads or backreferences)';
}

/** Active entries the browser can actually enforce (skips regexes RE2 rejects). */
export async function supportedEntries(settings) {
  const entries = [];
  for (const entry of activeEntries(settings)) {
    if (!(await dnrRegexProblem(toDnrRegex(entry.source)))) entries.push(entry);
  }
  return entries;
}

/** Entries currently installed as blocking rules; cheaper than supportedEntries for hot paths. */
export async function enforcedEntries() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const installed = new Set(rules.map((r) => r.condition.regexFilter));
  return activeEntries(await loadSettings()).filter((e) => installed.has(toDnrRegex(e.source)));
}
