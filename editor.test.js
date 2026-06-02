import { vi, describe, test, expect, beforeEach, beforeAll } from 'vitest';

// editor.js is loaded dynamically inside beforeAll so that vitest.setup.js
// has already populated the DOM before editor.js runs its top-level
// getElementById() calls.
let execCmd, execCommandWithArg, updateToolbarState, toggleSource,
    copyText, cutText, pasteText, openUrlBar, confirmUrl,
    showUrlError, insertImageFromUrl, closeUrlBar, clearAll,
    exportHTML, toggleEdit, toggleMarkdown, setToolbarDisabled, updateCounter,
    updateEditorActions;

beforeAll(async () => {
  const mod = await import('./editor.js');
  // Vite re-exports CJS module.exports properties as named ESM exports.
  // Fallback to .default in case the environment wraps it differently.
  const fns = mod.execCmd ? mod : mod.default;
  ({
    execCmd, execCommandWithArg, updateToolbarState, toggleSource,
    copyText, cutText, pasteText, openUrlBar, confirmUrl,
    showUrlError, insertImageFromUrl, closeUrlBar, clearAll,
    exportHTML, toggleEdit, toggleMarkdown, setToolbarDisabled, updateCounter,
    updateEditorActions,
  } = fns);
});

// ---------------------------------------------------------------------------
// execCmd
// ---------------------------------------------------------------------------
describe('execCmd', () => {
  beforeEach(() => document.execCommand.mockClear());

  test('calls document.execCommand with the command and null value', () => {
    execCmd('bold');
    expect(document.execCommand).toHaveBeenCalledWith('bold', false, null);
  });

  test('works for arbitrary commands', () => {
    execCmd('undo');
    expect(document.execCommand).toHaveBeenCalledWith('undo', false, null);
  });
});

// ---------------------------------------------------------------------------
// execCommandWithArg
// ---------------------------------------------------------------------------
describe('execCommandWithArg', () => {
  beforeEach(() => document.execCommand.mockClear());

  test('passes the argument to document.execCommand', () => {
    execCommandWithArg('foreColor', '#ff0000');
    expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, '#ff0000');
  });

  test('passes a URL argument for createLink', () => {
    execCommandWithArg('createLink', 'https://example.com');
    expect(document.execCommand).toHaveBeenCalledWith('createLink', false, 'https://example.com');
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------
describe('clearAll', () => {
  test('empties the editor innerHTML', () => {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '<p>Some content</p>';
    clearAll();
    expect(editorEl.innerHTML).toBe('');
  });

  test('works when the editor is already empty', () => {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '';
    clearAll();
    expect(editorEl.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// toggleEdit  (state flows ON → OFF → ON across the two tests)
// ---------------------------------------------------------------------------
describe('toggleEdit', () => {
  test('switches from edit ON to OFF', () => {
    const editorEl = document.getElementById('editor');
    const btn = document.getElementById('btn-toggle-edit');

    toggleEdit(); // ON → OFF

    expect(editorEl.contentEditable).toBe('false');
    expect(btn.textContent).toBe('Editing: OFF');
    expect(btn.classList.contains('btn-success')).toBe(false);
    expect(btn.classList.contains('btn-outline-danger')).toBe(true);
  });

  test('switches from edit OFF back to ON', () => {
    const editorEl = document.getElementById('editor');
    const btn = document.getElementById('btn-toggle-edit');

    toggleEdit(); // OFF → ON

    expect(editorEl.contentEditable).toBe('true');
    expect(btn.textContent).toBe('Editing: ON');
    expect(btn.classList.contains('btn-success')).toBe(true);
    expect(btn.classList.contains('btn-outline-danger')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleSource  (state flows rendered → source → rendered)
// ---------------------------------------------------------------------------
describe('toggleSource', () => {
  test('converts innerHTML to raw text (show source)', () => {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '<p>Hello</p>';

    toggleSource();

    expect(editorEl.textContent).toBe('<p>Hello</p>');
    expect(editorEl.contentEditable).toBe('false');
  });

  test('converts raw text back to innerHTML (hide source)', () => {
    const editorEl = document.getElementById('editor');

    toggleSource();

    expect(editorEl.innerHTML).toBe('<p>Hello</p>');
    expect(editorEl.contentEditable).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// showUrlError
// ---------------------------------------------------------------------------
describe('showUrlError', () => {
  test('displays the error message', () => {
    showUrlError('Bad URL');
    const errEl = document.getElementById('url-error');
    expect(errEl.textContent).toBe('Bad URL');
    expect(errEl.style.display).toBe('inline');
  });

  test('overwrites a previously shown error', () => {
    showUrlError('First error');
    showUrlError('Second error');
    expect(document.getElementById('url-error').textContent).toBe('Second error');
  });
});

// ---------------------------------------------------------------------------
// closeUrlBar
// ---------------------------------------------------------------------------
describe('closeUrlBar', () => {
  test('hides the url-bar', () => {
    document.getElementById('url-bar').style.display = 'flex';
    closeUrlBar();
    expect(document.getElementById('url-bar').style.display).toBe('none');
  });

  test('hides the url-error', () => {
    document.getElementById('url-error').style.display = 'inline';
    closeUrlBar();
    expect(document.getElementById('url-error').style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// openUrlBar
// ---------------------------------------------------------------------------
describe('openUrlBar', () => {
  beforeEach(() => closeUrlBar());

  test('makes the url-bar visible', () => {
    openUrlBar('link');
    expect(document.getElementById('url-bar').style.display).toBe('flex');
  });

  test('resets the input value to https://', () => {
    document.getElementById('url-input').value = 'old value';
    openUrlBar('link');
    expect(document.getElementById('url-input').value).toBe('https://');
  });

  test('accepts image mode without error', () => {
    expect(() => openUrlBar('image')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// confirmUrl
// ---------------------------------------------------------------------------
describe('confirmUrl', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
    closeUrlBar();
  });

  test('calls createLink when mode is link', () => {
    openUrlBar('link');
    document.getElementById('url-input').value = 'https://example.com';
    confirmUrl();
    expect(document.execCommand).toHaveBeenCalledWith('createLink', false, 'https://example.com');
  });

  test('does not call execCommand when URL is empty', () => {
    openUrlBar('link');
    document.getElementById('url-input').value = '';
    confirmUrl();
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  test('closes the url-bar after confirming', () => {
    openUrlBar('link');
    document.getElementById('url-input').value = 'https://example.com';
    confirmUrl();
    expect(document.getElementById('url-bar').style.display).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// insertImageFromUrl
// ---------------------------------------------------------------------------
describe('insertImageFromUrl', () => {
  beforeEach(() => document.execCommand.mockClear());

  test('calls insertImage when the image loads successfully', () => {
    const url = 'https://example.com/image.png';
    const OriginalImage = globalThis.Image;
    globalThis.Image = class {
      set src(_) { if (this.onload) this.onload(); }
    };

    insertImageFromUrl(url);

    expect(document.execCommand).toHaveBeenCalledWith('insertImage', false, url);
    globalThis.Image = OriginalImage;
  });

  test('shows an error when the image fails to load', () => {
    const OriginalImage = globalThis.Image;
    globalThis.Image = class {
      set src(_) { if (this.onerror) this.onerror(); }
    };

    insertImageFromUrl('https://bad.example/image.png');

    expect(document.getElementById('url-error').textContent).toContain('Could not load image');
    globalThis.Image = OriginalImage;
  });
});

// ---------------------------------------------------------------------------
// updateToolbarState
// ---------------------------------------------------------------------------
describe('updateToolbarState', () => {
  test('adds active class to buttons whose command state is true', () => {
    document.queryCommandState.mockImplementation((cmd) => cmd === 'bold');
    updateToolbarState();
    expect(document.getElementById('btn-bold').classList.contains('active')).toBe(true);
    expect(document.getElementById('btn-italic').classList.contains('active')).toBe(false);
  });

  test('removes active class when command state is false', () => {
    document.queryCommandState.mockReturnValue(false);
    updateToolbarState();
    expect(document.getElementById('btn-bold').classList.contains('active')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportHTML
// ---------------------------------------------------------------------------
describe('exportHTML', () => {
  test('creates a blob URL, sets download filename, clicks anchor, revokes URL', () => {
    document.getElementById('editor').innerHTML = '<p>Test</p>';

    const mockAnchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => mockAnchor);
    globalThis.URL.createObjectURL.mockClear();
    globalThis.URL.revokeObjectURL.mockClear();

    exportHTML();

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockAnchor.download).toBe('document.html');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  test('wraps editor content in a complete HTML document', async () => {
    document.getElementById('editor').innerHTML = '<p>Hello world</p>';

    let capturedBlob;
    globalThis.URL.createObjectURL.mockImplementationOnce((b) => {
      capturedBlob = b;
      return 'blob:mock';
    });
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => ({
      href: '', download: '', click: vi.fn(),
    }));

    exportHTML();

    // jsdom's Blob does not implement .text(); use FileReader instead.
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(capturedBlob);
    });
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('<p>Hello world</p>');
  });
});

// ---------------------------------------------------------------------------
// Clipboard: copyText, cutText, pasteText
// ---------------------------------------------------------------------------
describe('copyText', () => {
  beforeEach(() => navigator.clipboard.writeText.mockClear());

  test('writes selected text to the clipboard', async () => {
    globalThis.getSelection = vi.fn().mockReturnValue({ toString: () => 'hello' });
    await copyText();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  test('does nothing when no text is selected', async () => {
    globalThis.getSelection = vi.fn().mockReturnValue({ toString: () => '' });
    await copyText();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe('cutText', () => {
  beforeEach(() => {
    navigator.clipboard.writeText.mockClear();
    document.execCommand.mockClear();
  });

  test('writes selected text to clipboard and deletes it', async () => {
    globalThis.getSelection = vi.fn().mockReturnValue({ toString: () => 'cut me' });
    await cutText();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('cut me');
    expect(document.execCommand).toHaveBeenCalledWith('delete');
  });

  test('does nothing when no text is selected', async () => {
    globalThis.getSelection = vi.fn().mockReturnValue({ toString: () => '' });
    await cutText();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
  });
});

describe('pasteText', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
    navigator.clipboard.readText.mockClear();
    globalThis.getSelection = vi.fn().mockReturnValue({
      toString: () => '',
      rangeCount: 0,
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      getRangeAt: vi.fn(),
      anchorNode: null,
    });
  });

  test('reads from clipboard and inserts the text', async () => {
    navigator.clipboard.readText.mockResolvedValue('pasted content');
    await pasteText();
    expect(navigator.clipboard.readText).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'pasted content');
  });

  test('does not throw when clipboard read is denied', async () => {
    navigator.clipboard.readText.mockRejectedValue(new Error('denied'));
    await expect(pasteText()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// foreColor persistence
// ---------------------------------------------------------------------------
describe('foreColor persistence on keydown', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
    globalThis.getSelection = vi.fn().mockReturnValue({
      isCollapsed: true,
      rangeCount: 1,
      toString: () => '',
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      getRangeAt: vi.fn().mockReturnValue({ cloneRange: vi.fn().mockReturnValue({}) }),
      anchorNode: document.getElementById('editor'),
    });
  });

  test('re-applies tracked foreColor before each typed character', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );

    expect(document.execCommand).toHaveBeenCalledWith('foreColor', false, '#ff0000');
  });

  test('does not apply foreColor when a Ctrl modifier is held (e.g. Ctrl+B)', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
    );

    expect(document.execCommand).not.toHaveBeenCalled();
  });

  test('does not apply foreColor for non-character keys (e.g. Shift)', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }),
    );

    expect(document.execCommand).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setToolbarDisabled
// ---------------------------------------------------------------------------
describe('setToolbarDisabled', () => {
  afterEach(() => setToolbarDisabled(false));

  test('disables all toolbar buttons', () => {
    setToolbarDisabled(true);
    expect(document.getElementById('btn-bold').disabled).toBe(true);
    expect(document.getElementById('btn-italic').disabled).toBe(true);
    expect(document.getElementById('btn-toggle-edit').disabled).toBe(true);
  });

  test('re-enables all toolbar buttons', () => {
    setToolbarDisabled(true);
    setToolbarDisabled(false);
    expect(document.getElementById('btn-bold').disabled).toBe(false);
    expect(document.getElementById('btn-italic').disabled).toBe(false);
  });

  test('keeps the specified button enabled while disabling the rest', () => {
    setToolbarDisabled(true, 'btn-source');
    expect(document.getElementById('btn-source').disabled).toBe(false);
    expect(document.getElementById('btn-bold').disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toggleSource — toolbar disable behaviour
// ---------------------------------------------------------------------------
describe('toggleSource toolbar behaviour', () => {
  test('disables all toolbar buttons except btn-source when entering source mode', () => {
    document.getElementById('editor').innerHTML = '<p>test</p>';
    toggleSource(); // ON
    expect(document.getElementById('btn-bold').disabled).toBe(true);
    expect(document.getElementById('btn-source').disabled).toBe(false);
    toggleSource(); // OFF — cleanup
  });

  test('re-enables toolbar buttons when exiting source mode', () => {
    toggleSource(); // ON
    toggleSource(); // OFF
    expect(document.getElementById('btn-bold').disabled).toBe(false);
    expect(document.getElementById('btn-source').disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateCounter
// ---------------------------------------------------------------------------
describe('updateCounter', () => {
  beforeEach(() => { document.getElementById('editor').innerHTML = ''; });

  test('shows zero counts for an empty editor', () => {
    updateCounter();
    expect(document.getElementById('editor-counter').textContent).toBe('Words: 0 | Characters: 0');
  });

  test('counts words correctly', () => {
    document.getElementById('editor').innerHTML = 'hello world foo';
    updateCounter();
    expect(document.getElementById('editor-counter').textContent).toContain('Words: 3');
  });

  test('counts characters correctly', () => {
    document.getElementById('editor').innerHTML = 'hello';
    updateCounter();
    expect(document.getElementById('editor-counter').textContent).toContain('Characters: 5');
  });
});

// ---------------------------------------------------------------------------
// toggleMarkdown
// ---------------------------------------------------------------------------
describe('toggleMarkdown', () => {
  afterEach(() => {
    // Ensure we leave markdown mode OFF after every test
    const pane = document.getElementById('markdown-pane');
    if (!pane.classList.contains('d-none')) toggleMarkdown();
    setToolbarDisabled(false);
  });

  test('hides editor and counter, shows markdown pane', () => {
    toggleMarkdown();
    expect(document.getElementById('editor').classList.contains('d-none')).toBe(true);
    expect(document.getElementById('editor-counter').classList.contains('d-none')).toBe(true);
    expect(document.getElementById('markdown-pane').classList.contains('d-none')).toBe(false);
  });

  test('disables toolbar buttons but keeps btn-markdown enabled', () => {
    toggleMarkdown();
    expect(document.getElementById('btn-bold').disabled).toBe(true);
    expect(document.getElementById('btn-markdown').disabled).toBe(false);
  });

  test('switches btn-markdown to active style', () => {
    toggleMarkdown();
    const btn = document.getElementById('btn-markdown');
    expect(btn.classList.contains('btn-primary')).toBe(true);
    expect(btn.classList.contains('btn-outline-secondary')).toBe(false);
  });

  test('restores editor and counter, hides markdown pane when toggled off', () => {
    toggleMarkdown(); // ON
    toggleMarkdown(); // OFF
    expect(document.getElementById('editor').classList.contains('d-none')).toBe(false);
    expect(document.getElementById('editor-counter').classList.contains('d-none')).toBe(false);
    expect(document.getElementById('markdown-pane').classList.contains('d-none')).toBe(true);
  });

  test('restores btn-markdown to outline style when toggled off', () => {
    toggleMarkdown(); // ON
    toggleMarkdown(); // OFF
    const btn = document.getElementById('btn-markdown');
    expect(btn.classList.contains('btn-outline-secondary')).toBe(true);
    expect(btn.classList.contains('btn-primary')).toBe(false);
  });

  test('re-enables toolbar buttons when toggled off', () => {
    toggleMarkdown(); // ON
    toggleMarkdown(); // OFF
    expect(document.getElementById('btn-bold').disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateEditorActions
// ---------------------------------------------------------------------------
describe('updateEditorActions', () => {
  beforeEach(() => {
    document.getElementById('editor').innerHTML = '';
    document.getElementById('btn-print').disabled = false;
    document.getElementById('btn-export').disabled = false;
  });

  test('disables print and export when editor is empty', () => {
    updateEditorActions();
    expect(document.getElementById('btn-print').disabled).toBe(true);
    expect(document.getElementById('btn-export').disabled).toBe(true);
  });

  test('enables print and export when editor has content', () => {
    document.getElementById('editor').innerHTML = '<p>Hello</p>';
    updateEditorActions();
    expect(document.getElementById('btn-print').disabled).toBe(false);
    expect(document.getElementById('btn-export').disabled).toBe(false);
  });

  test('disables buttons again after clearAll empties the editor', () => {
    document.getElementById('editor').innerHTML = '<p>Hello</p>';
    updateEditorActions();
    clearAll();
    expect(document.getElementById('btn-print').disabled).toBe(true);
    expect(document.getElementById('btn-export').disabled).toBe(true);
  });
});
