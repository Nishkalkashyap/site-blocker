import { findMatch, parseCustomList, toDnrRegex } from './lib/patterns.js';
import { renderPresetGrid } from './lib/preset-grid.js';
import { dnrRegexProblem, loadSettings, saveSettings, supportedEntries } from './lib/settings.js';

const presetsEl = document.getElementById('presets');
const customEl = document.getElementById('custom');
const saveEl = document.getElementById('save');
const statusEl = document.getElementById('status');
const problemsEl = document.getElementById('problems');
const testUrlEl = document.getElementById('test-url');
const testResultEl = document.getElementById('test-result');

customEl.value = (await loadSettings()).custom;
renderPresetGrid(presetsEl);

async function findProblems(text) {
  const problems = [];
  for (const entry of parseCustomList(text)) {
    const reason = entry.error ?? (await dnrRegexProblem(toDnrRegex(entry.source)));
    if (reason) problems.push(`Line ${entry.line} (${entry.label}): ${reason}`);
  }
  return problems;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

saveEl.addEventListener('click', async () => {
  saveEl.disabled = true;
  const problems = await findProblems(customEl.value);
  await saveSettings({ custom: customEl.value });
  problemsEl.replaceChildren(
    ...problems.map((p) => Object.assign(document.createElement('li'), { textContent: p })),
  );
  if (problems.length) setStatus('Saved. Lines with problems are skipped:', 'warn');
  else setStatus('Saved.', 'ok');
  saveEl.disabled = false;
  runTest();
});

customEl.addEventListener('input', () => setStatus('Unsaved changes', 'warn'));
customEl.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    saveEl.click();
  }
});

async function runTest() {
  let url = testUrlEl.value.trim();
  if (!url) {
    testResultEl.textContent = '';
    return;
  }
  if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
  const match = findMatch(url, await supportedEntries(await loadSettings()));
  testResultEl.textContent = match ? `Blocked by: ${match.label}` : 'Not blocked';
  testResultEl.className = `status ${match ? 'warn' : 'ok'}`;
}
testUrlEl.addEventListener('input', runTest);

// Keep the page in sync if settings change elsewhere (e.g. the popup).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.presets) renderPresetGrid(presetsEl);
  if (changes.custom && statusEl.textContent !== 'Unsaved changes') {
    customEl.value = changes.custom.newValue ?? '';
  }
  runTest();
});
