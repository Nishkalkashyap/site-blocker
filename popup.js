import { renderPresetGrid } from './lib/preset-grid.js';
import { addCustomPattern } from './lib/settings.js';
import { USAGE_PREFIX, dayKey, formatDuration, summarize } from './lib/usage.js';

renderPresetGrid(document.getElementById('presets'));

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
document.getElementById('open-stats').addEventListener('click', () => {
  chrome.tabs.create({ url: 'stats.html' });
  window.close();
});

// Offer a one-click "block this site" for the active tab's domain.
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.url && /^https?:/i.test(tab.url)) {
  const host = new URL(tab.url).hostname.replace(/^www\./, '');
  const button = document.getElementById('block-current');
  button.textContent = `Block ${host}`;
  button.hidden = false;
  button.addEventListener('click', async () => {
    await addCustomPattern(host);
    window.close();
  });
}

// Today's summary: total time plus the top three sites.
await chrome.runtime.sendMessage({ type: 'flush-usage' });
const date = dayKey(Date.now());
const record = (await chrome.storage.local.get(USAGE_PREFIX + date))[USAGE_PREFIX + date];
const { total, sites } = summarize([{ date, record }]);
document.getElementById('today-total').textContent = formatDuration(total);
document.getElementById('today-top').replaceChildren(
  ...sites
    .filter((s) => s.time >= 60000)
    .slice(0, 3)
    .map((s) => {
      const li = document.createElement('li');
      li.append(
        Object.assign(document.createElement('span'), { textContent: s.host }),
        Object.assign(document.createElement('span'), { textContent: formatDuration(s.time) }),
      );
      return li;
    }),
);
