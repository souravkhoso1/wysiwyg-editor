import { vi } from 'vitest';

// Minimal DOM that mirrors index.html — must exist before editor.js loads
// so its top-level getElementById() calls resolve to real elements.
document.body.innerHTML = `
  <div id="toolbar">
    <button id="btn-bold"          class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-italic"        class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-underline"     class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-strikeThrough" class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-source"        class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-markdown"      class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-toggle-edit"   class="btn btn-sm btn-success">Editing: ON</button>
    <button id="btn-print"         class="btn btn-sm btn-outline-secondary" disabled></button>
    <button id="btn-export"        class="btn btn-sm btn-outline-secondary" disabled></button>
    <button id="btn-export-pdf"    class="btn btn-sm btn-outline-secondary" disabled></button>
    <button id="btn-dark-mode"     class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-fullscreen"    class="btn btn-sm btn-outline-secondary"></button>
  </div>
  <div class="container-lg">
    <div id="url-bar" style="display:none;">
      <input type="text" id="url-input" value="" />
      <div id="url-error" style="display:none;"></div>
    </div>
    <div id="find-replace-bar" style="display:none;">
      <input type="text" id="find-input" value="" />
      <input type="text" id="replace-input" value="" />
      <span id="find-status"></span>
    </div>
    <div id="editor" contenteditable="true"></div>
    <div id="markdown-pane" class="d-none">
      <textarea id="markdown-input"></textarea>
      <div id="markdown-preview"></div>
    </div>
    <div id="editor-counter">Words: 0 | Characters: 0</div>
  </div>
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

globalThis.DOMPurify = { sanitize: vi.fn(function(html) { return html; }) };

// localStorage is not available in jsdom under vitest 4 without --localstorage-file
const _lsStore = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem:    (k) => Object.prototype.hasOwnProperty.call(_lsStore, k) ? _lsStore[k] : null,
    setItem:    (k, v) => { _lsStore[k] = String(v); },
    removeItem: (k) => { delete _lsStore[k]; },
    clear:      () => { Object.keys(_lsStore).forEach(k => delete _lsStore[k]); },
  },
  configurable: true,
});
localStorage.clear();
