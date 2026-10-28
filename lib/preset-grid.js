import { PRESETS } from './patterns.js';
import { loadSettings, saveSettings } from './settings.js';

/** Renders a checkbox per preset into `container`, persisting changes immediately. */
export async function renderPresetGrid(container) {
  const { presets } = await loadSettings();
  container.replaceChildren(
    ...PRESETS.map((preset) => {
      const label = document.createElement('label');
      label.className = 'preset';
      label.title = preset.patterns.join(', ');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!presets[preset.id];
      box.addEventListener('change', async () => {
        const current = (await loadSettings()).presets;
        await saveSettings({ presets: { ...current, [preset.id]: box.checked } });
      });
      label.append(box, preset.name);
      return label;
    }),
  );
}
