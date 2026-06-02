import { vi } from 'vitest';

// Minimal DOM that mirrors index.html — must exist before editor.js loads
// so its top-level getElementById() calls resolve to real elements.
document.body.innerHTML = `
  <div id="toolbar">
    <button id="btn-bold"          class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-italic"        class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-underline"     class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-strikeThrough" class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-toggle-edit"   class="btn btn-sm btn-success">Editing: ON</button>
  </div>
  <div id="url-bar" style="display:none;">
    <input type="text" id="url-input" value="" />
    <div id="url-error" style="display:none;"></div>
  </div>
  <div id="editor" contenteditable="true"></div>
`;

document.execCommand      = vi.fn().mockReturnValue(true);
document.queryCommandState = vi.fn().mockReturnValue(false);

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText:  vi.fn().mockResolvedValue('clipboard text'),
  },
  configurable: true,
});

globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
globalThis.URL.revokeObjectURL = vi.fn();
