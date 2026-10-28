import { findMatch, toDnrRegex } from './lib/patterns.js';
import { blockedPageUrl, enforcedEntries, loadSettings, supportedEntries } from './lib/settings.js';
import './lib/tracker.js';

// Network-level blocking: one redirect rule per pattern, rebuilt whenever settings change.
async function syncRules() {
  const entries = await supportedEntries(await loadSettings());
  const addRules = entries.map((entry, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: chrome.runtime.getURL('blocked.html') + '#\\0' },
    },
    condition: {
      regexFilter: toDnrRegex(entry.source),
      isUrlFilterCaseSensitive: false,
      resourceTypes: ['main_frame'],
    },
  }));
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  // Also catch tabs that are already open on a newly blocked site.
  for (const tab of await chrome.tabs.query({})) {
    if (findMatch(tab.url, entries)) chrome.tabs.update(tab.id, { url: blockedPageUrl(tab.url) });
  }
}

// Serialize syncs so overlapping updates never race on rule IDs.
let pending = Promise.resolve();
const queueSync = () => {
  pending = pending.then(syncRules).catch((e) => console.error('Site Blocker: sync failed', e));
};

chrome.runtime.onInstalled.addListener(queueSync);
chrome.runtime.onStartup.addListener(queueSync);
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') queueSync();
});

// Single-page apps (YouTube, Reddit, ...) change URLs without a network navigation,
// so path-based patterns like "youtube.com/shorts" need this check too.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || !/^https?:/i.test(changeInfo.url)) return;
  const match = findMatch(changeInfo.url, await enforcedEntries());
  if (match) chrome.tabs.update(tabId, { url: blockedPageUrl(changeInfo.url) });
});
