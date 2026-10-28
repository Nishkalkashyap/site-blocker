import { findMatch } from './lib/patterns.js';
import { enforcedEntries } from './lib/settings.js';

// The background rules put the original URL in the fragment: blocked.html#<url>
const url = location.hash.slice(1);
if (url) {
  document.getElementById('url').textContent = url;
  const match = findMatch(url, await enforcedEntries());
  if (match) document.getElementById('rule').textContent = `Blocked by: ${match.label}`;
  // Count each attempt once, not on every reload of this page.
  if (!sessionStorage.getItem('counted')) {
    sessionStorage.setItem('counted', '1');
    chrome.runtime.sendMessage({ type: 'blocked', url });
  }
}

document.getElementById('close').addEventListener('click', async () => {
  const tab = await chrome.tabs.getCurrent();
  chrome.tabs.remove(tab.id);
});
document.getElementById('back').addEventListener('click', () => history.back());
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
