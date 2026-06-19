import { vi, describe, test, expect, beforeEach, afterEach, beforeAll } from 'vitest';

// editor.js is loaded dynamically inside beforeAll so that vitest.setup.js
// has already populated the DOM before editor.js runs its top-level
// getElementById() calls.
let execCmd, execCommandWithArg, updateToolbarState, toggleSource,
    copyText, cutText, pasteText, openUrlBar, confirmUrl,
    showUrlError, insertImageFromUrl, closeUrlBar, clearAll,
    exportHTML, exportPDF, toggleEdit, toggleMarkdown, setToolbarDisabled, updateCounter,
    updateEditorActions, toggleFullscreen, insertImageFromFile,
    openFindReplace, closeFindReplace, clearFindHighlights, highlightMatches,
    findNext, findPrev, replaceOne, replaceAll, updateFindStatus,
    cleanPastedHtml, toggleDarkMode,
    openCharPicker, closeCharPicker, insertChar,
    getVideoEmbedUrl, insertVideo,
    insertTable, tableAddRowAfter, tableDeleteRow, tableAddColAfter, tableDeleteCol;

beforeAll(async () => {
  const mod = await import('./editor.js');
  const fns = mod.execCmd ? mod : mod.default;
  ({
    execCmd, execCommandWithArg, updateToolbarState, toggleSource,
    copyText, cutText, pasteText, openUrlBar, confirmUrl,
    showUrlError, insertImageFromUrl, closeUrlBar, clearAll,
    exportHTML, toggleEdit, toggleMarkdown, setToolbarDisabled, updateCounter,
    updateEditorActions, toggleFullscreen, insertImageFromFile, exportPDF,
    openFindReplace, closeFindReplace, clearFindHighlights, highlightMatches,
    findNext, findPrev, replaceOne, replaceAll, updateFindStatus,
    cleanPastedHtml, toggleDarkMode,
    openCharPicker, closeCharPicker, insertChar,
    getVideoEmbedUrl, insertVideo,
    insertTable, tableAddRowAfter, tableDeleteRow, tableAddColAfter, tableDeleteCol,
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
  beforeEach(() => document.execCommand.mockClear());

  test('uses selectAll + delete so the action is undoable via Ctrl+Z', () => {
    document.getElementById('editor').innerHTML = '<p>Some content</p>';
    clearAll();
    expect(document.execCommand).toHaveBeenCalledWith('selectAll');
    expect(document.execCommand).toHaveBeenCalledWith('delete');
  });

  test('does not throw when editor is already empty', () => {
    document.getElementById('editor').innerHTML = '';
    expect(() => clearAll()).not.toThrow();
  });

  test('removes saved content from localStorage', () => {
    localStorage.setItem('richtext-online-content', '<p>old</p>');
    clearAll();
    expect(localStorage.getItem('richtext-online-content')).toBeNull();
  });

  test('resets active fore-colour so new text after clear has no forced colour', () => {
    execCommandWithArg('foreColor', '#ff0000');
    clearAll();
    document.execCommand.mockClear();
    document.getElementById('editor').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }),
    );
    expect(document.execCommand).not.toHaveBeenCalled();
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

  test('disables toolbar buttons (except the edit toggle) when switching to edit OFF', () => {
    toggleEdit(); // ON → OFF
    expect(document.getElementById('btn-bold').disabled).toBe(true);
    expect(document.getElementById('btn-toggle-edit').disabled).toBe(false);
    toggleEdit(); // cleanup
  });

  test('re-enables toolbar buttons when switching back to edit ON', () => {
    toggleEdit(); // ON → OFF
    toggleEdit(); // OFF → ON
    expect(document.getElementById('btn-bold').disabled).toBe(false);
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
// insertImageFromFile
// ---------------------------------------------------------------------------
describe('insertImageFromFile', () => {
  beforeEach(() => document.execCommand.mockClear());

  test('reads file as data URL and inserts it as an image', () => {
    const OriginalFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,abc' } }); }
    };

    insertImageFromFile({ files: [new Blob([''], { type: 'image/png' })], value: '' });

    expect(document.execCommand).toHaveBeenCalledWith('insertImage', false, 'data:image/png;base64,abc');
    globalThis.FileReader = OriginalFileReader;
  });

  test('does nothing when no file is selected', () => {
    insertImageFromFile({ files: [] });
    expect(document.execCommand).not.toHaveBeenCalled();
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
// exportPDF
// ---------------------------------------------------------------------------
describe('exportPDF', () => {
  test('opens a new window and calls print on it', () => {
    const mockWin = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn() };
    globalThis.window.open = vi.fn().mockReturnValue(mockWin);
    document.getElementById('editor').innerHTML = '<p>PDF content</p>';

    exportPDF();

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mockWin.document.write).toHaveBeenCalledWith(expect.stringContaining('<p>PDF content</p>'));
    expect(mockWin.print).toHaveBeenCalled();
  });

  test('does nothing when window.open is blocked (returns null)', () => {
    globalThis.window.open = vi.fn().mockReturnValue(null);
    expect(() => exportPDF()).not.toThrow();
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
describe('foreColor persistence on beforeinput', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
  });

  test('inserts character wrapped in font tag with tracked foreColor', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertText', data: 'a', bubbles: true, cancelable: true }),
    );

    expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false, '<font color="#ff0000">a</font>');
  });

  test('escapes HTML special characters in typed data', () => {
    execCommandWithArg('foreColor', '#00ff00');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertText', data: '<b>', bubbles: true, cancelable: true }),
    );

    expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false, '<font color="#00ff00">&lt;b&gt;</font>');
  });

  test('does not intercept non-insertText input events', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }),
    );

    expect(document.execCommand).not.toHaveBeenCalled();
  });

  test('does not intercept when input data is null', () => {
    execCommandWithArg('foreColor', '#ff0000');
    document.execCommand.mockClear();

    document.getElementById('editor').dispatchEvent(
      new InputEvent('beforeinput', { inputType: 'insertText', data: null, bubbles: true, cancelable: true }),
    );

    expect(document.execCommand).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggleFullscreen
// ---------------------------------------------------------------------------
describe('toggleFullscreen', () => {
  afterEach(() => {
    const c = document.querySelector('.container-lg');
    if (c && c.classList.contains('editor-fullscreen')) toggleFullscreen();
  });

  test('adds editor-fullscreen class to container when entering fullscreen', () => {
    toggleFullscreen();
    expect(document.querySelector('.container-lg').classList.contains('editor-fullscreen')).toBe(true);
  });

  test('removes editor-fullscreen class when exiting fullscreen', () => {
    toggleFullscreen(); // enter
    toggleFullscreen(); // exit
    expect(document.querySelector('.container-lg').classList.contains('editor-fullscreen')).toBe(false);
  });

  test('swaps button icon between expand and compress', () => {
    const btn = document.getElementById('btn-fullscreen');
    toggleFullscreen();
    expect(btn.innerHTML).toContain('fa-compress');
    toggleFullscreen();
    expect(btn.innerHTML).toContain('fa-expand');
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

  test('refreshes counter and print/export state when exiting source mode', () => {
    document.getElementById('editor').innerHTML = '';
    document.getElementById('btn-print').disabled = false;
    toggleSource(); // ON
    toggleSource(); // OFF
    expect(document.getElementById('editor-counter').textContent).toContain('Words: 0');
    expect(document.getElementById('btn-print').disabled).toBe(true);
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
    document.getElementById('btn-export-pdf').disabled = false;
  });

  test('disables print, export, and export-pdf when editor is empty', () => {
    updateEditorActions();
    expect(document.getElementById('btn-print').disabled).toBe(true);
    expect(document.getElementById('btn-export').disabled).toBe(true);
    expect(document.getElementById('btn-export-pdf').disabled).toBe(true);
  });

  test('enables print, export, and export-pdf when editor has content', () => {
    document.getElementById('editor').innerHTML = '<p>Hello</p>';
    updateEditorActions();
    expect(document.getElementById('btn-print').disabled).toBe(false);
    expect(document.getElementById('btn-export').disabled).toBe(false);
    expect(document.getElementById('btn-export-pdf').disabled).toBe(false);
  });

  test('disables buttons again once content is removed', () => {
    document.getElementById('editor').innerHTML = '<p>Hello</p>';
    updateEditorActions();
    document.getElementById('editor').innerHTML = '';
    updateEditorActions();
    expect(document.getElementById('btn-print').disabled).toBe(true);
    expect(document.getElementById('btn-export').disabled).toBe(true);
    expect(document.getElementById('btn-export-pdf').disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// exportPDF
// ---------------------------------------------------------------------------
describe('exportPDF', () => {
  let mockWin;

  beforeEach(() => {
    mockWin = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    globalThis.window = globalThis.window || {};
    vi.spyOn(window, 'open').mockReturnValue(mockWin);
    document.getElementById('editor').innerHTML = '<p>Hello PDF</p>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('opens a new window and calls print', () => {
    exportPDF();
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mockWin.document.write).toHaveBeenCalled();
    expect(mockWin.print).toHaveBeenCalled();
    expect(mockWin.close).toHaveBeenCalled();
  });

  test('writes editor content into the new window', () => {
    exportPDF();
    const written = mockWin.document.write.mock.calls[0][0];
    expect(written).toContain('Hello PDF');
  });

  test('does nothing if window.open returns null (popup blocked)', () => {
    window.open.mockReturnValue(null);
    expect(() => exportPDF()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Find & Replace
// ---------------------------------------------------------------------------
describe('highlightMatches', () => {
  beforeEach(() => {
    closeFindReplace();
    document.getElementById('editor').innerHTML = 'hello world hello';
    document.getElementById('find-input').value = '';
  });

  afterEach(() => {
    closeFindReplace();
  });

  test('wraps all case-insensitive matches in mark.find-match elements', () => {
    highlightMatches('hello');
    const marks = document.getElementById('editor').querySelectorAll('mark.find-match');
    expect(marks.length).toBe(2);
  });

  test('leaves editor unchanged when search term is empty', () => {
    highlightMatches('');
    const marks = document.getElementById('editor').querySelectorAll('mark.find-match');
    expect(marks.length).toBe(0);
  });

  test('is case-insensitive', () => {
    document.getElementById('editor').innerHTML = 'Hello HELLO hello';
    highlightMatches('hello');
    const marks = document.getElementById('editor').querySelectorAll('mark.find-match');
    expect(marks.length).toBe(3);
  });
});

describe('clearFindHighlights', () => {
  beforeEach(() => { closeFindReplace(); });
  afterEach(() => { closeFindReplace(); });

  test('removes mark elements and restores plain text', () => {
    document.getElementById('editor').innerHTML = 'hello world hello';
    highlightMatches('hello');
    clearFindHighlights();
    const marks = document.getElementById('editor').querySelectorAll('mark.find-match');
    expect(marks.length).toBe(0);
    expect(document.getElementById('editor').textContent).toBe('hello world hello');
  });
});

describe('findNext / findPrev', () => {
  beforeEach(() => {
    closeFindReplace();
    document.getElementById('editor').innerHTML = 'foo bar foo baz foo';
    document.getElementById('find-input').value = 'foo';
  });

  afterEach(() => {
    closeFindReplace();
  });

  test('findNext advances through matches and updates status', () => {
    findNext();
    expect(document.getElementById('find-status').textContent).toBe('1 of 3');
    findNext();
    expect(document.getElementById('find-status').textContent).toBe('2 of 3');
  });

  test('findNext wraps around to first match after the last', () => {
    findNext(); findNext(); findNext();
    expect(document.getElementById('find-status').textContent).toBe('3 of 3');
    findNext();
    expect(document.getElementById('find-status').textContent).toBe('1 of 3');
  });

  test('findPrev shows "No matches" for term not in editor', () => {
    document.getElementById('find-input').value = 'zzz';
    findPrev();
    expect(document.getElementById('find-status').textContent).toBe('No matches');
  });
});

describe('replaceOne', () => {
  beforeEach(() => {
    closeFindReplace();
    document.getElementById('editor').innerHTML = 'cat sat cat';
    document.getElementById('find-input').value = 'cat';
    document.getElementById('replace-input').value = 'dog';
  });

  afterEach(() => {
    closeFindReplace();
  });

  test('replaces the current match', () => {
    findNext();
    replaceOne();
    expect(document.getElementById('editor').textContent).toContain('dog');
    expect(document.getElementById('editor').textContent).toContain('cat');
  });

  test('reduces match count by one after replacement', () => {
    findNext();
    replaceOne();
    expect(document.getElementById('find-status').textContent).toBe('1 of 1');
  });
});

describe('replaceAll', () => {
  beforeEach(() => {
    closeFindReplace();
    document.getElementById('editor').innerHTML = 'cat sat cat mat cat';
    document.getElementById('find-input').value = 'cat';
    document.getElementById('replace-input').value = 'dog';
  });

  afterEach(() => {
    closeFindReplace();
  });

  test('replaces every occurrence', () => {
    replaceAll();
    expect(document.getElementById('editor').textContent).not.toContain('cat');
    expect(document.getElementById('editor').textContent).toBe('dog sat dog mat dog');
  });

  test('sets status to "All replaced"', () => {
    replaceAll();
    expect(document.getElementById('find-status').textContent).toBe('All replaced');
  });
});

describe('openFindReplace / closeFindReplace', () => {
  test('openFindReplace shows the panel', () => {
    openFindReplace();
    expect(document.getElementById('find-replace-bar').style.display).toBe('block');
  });

  test('closeFindReplace hides the panel and clears status', () => {
    openFindReplace();
    document.getElementById('find-status').textContent = '2 of 5';
    closeFindReplace();
    expect(document.getElementById('find-replace-bar').style.display).toBe('none');
    expect(document.getElementById('find-status').textContent).toBe('');
  });
});

// ---------------------------------------------------------------------------
// cleanPastedHtml
// ---------------------------------------------------------------------------
describe('cleanPastedHtml', () => {
  test('removes Word <o:p> tags and their content', () => {
    const result = cleanPastedHtml('<p>Hello<o:p></o:p></p>');
    expect(result).not.toContain('<o:p>');
    expect(result).toContain('Hello');
  });

  test('strips MSO CSS properties from style attributes', () => {
    const result = cleanPastedHtml('<p style="mso-margin-top:0cm; color:red;">text</p>');
    expect(result).not.toContain('mso-margin-top');
    expect(result).toContain('color:red');
  });

  test('removes Word conditional comments', () => {
    const result = cleanPastedHtml('<!--[if gte mso 9]><xml>junk</xml><![endif]-->text');
    expect(result).not.toContain('[if');
    expect(result).toContain('text');
  });

  test('strips Office namespace opening and closing tags', () => {
    const html = '<w:sdt><w:sdtPr/></w:sdt><p>body</p>';
    const result = cleanPastedHtml(html);
    expect(result).not.toContain('<w:');
    expect(result).toContain('body');
  });

  test('passes through clean HTML unchanged (no junk removed)', () => {
    const clean = '<p><strong>Hello</strong> <em>world</em></p>';
    const result = cleanPastedHtml(clean);
    expect(result).toContain('<strong>Hello</strong>');
    expect(result).toContain('<em>world</em>');
  });
});

// ---------------------------------------------------------------------------
// toggleDarkMode
// ---------------------------------------------------------------------------
describe('toggleDarkMode', () => {
  afterEach(() => {
    if (document.body.classList.contains('dark-mode')) toggleDarkMode();
  });

  test('adds dark-mode class to body on first toggle', () => {
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  test('removes dark-mode class on second toggle', () => {
    toggleDarkMode();
    toggleDarkMode();
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  test('updates btn-dark-mode icon to sun in dark mode', () => {
    toggleDarkMode();
    expect(document.getElementById('btn-dark-mode').innerHTML).toContain('fa-sun');
  });

  test('restores moon icon when switching back to light mode', () => {
    toggleDarkMode();
    toggleDarkMode();
    expect(document.getElementById('btn-dark-mode').innerHTML).toContain('fa-moon');
  });
});

// ---------------------------------------------------------------------------
// Special characters / emoji picker
// ---------------------------------------------------------------------------
describe('openCharPicker / closeCharPicker', () => {
  afterEach(() => { closeCharPicker(); });

  test('openCharPicker shows the panel on first call', () => {
    openCharPicker();
    expect(document.getElementById('char-picker').style.display).toBe('block');
  });

  test('openCharPicker toggles the panel closed on second call', () => {
    openCharPicker();
    openCharPicker();
    expect(document.getElementById('char-picker').style.display).toBe('none');
  });

  test('closeCharPicker hides the panel', () => {
    openCharPicker();
    closeCharPicker();
    expect(document.getElementById('char-picker').style.display).toBe('none');
  });
});

describe('insertChar', () => {
  beforeEach(() => { document.execCommand.mockClear(); });

  test('calls insertText execCommand with the given character', () => {
    insertChar('©');
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '©');
  });

  test('calls insertText with emoji character', () => {
    insertChar('🎉');
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '🎉');
  });
});

// ---------------------------------------------------------------------------
// Video embed
// ---------------------------------------------------------------------------
describe('getVideoEmbedUrl', () => {
  test('converts YouTube watch URL to embed URL', () => {
    const result = getVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts youtu.be short URL to embed URL', () => {
    const result = getVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  test('converts Vimeo URL to embed URL', () => {
    const result = getVideoEmbedUrl('https://vimeo.com/123456789');
    expect(result).toBe('https://player.vimeo.com/video/123456789');
  });

  test('returns null for unsupported URL', () => {
    expect(getVideoEmbedUrl('https://example.com/video')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(getVideoEmbedUrl('')).toBeNull();
  });
});

describe('insertVideo', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
    document.getElementById('editor').innerHTML = '';
    document.getElementById('url-input').value = '';
    document.getElementById('url-error').style.display = 'none';
  });

  test('inserts iframe HTML for a valid YouTube URL', () => {
    insertVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const call = document.execCommand.mock.calls.find(c => c[0] === 'insertHTML');
    expect(call).toBeTruthy();
    expect(call[2]).toContain('youtube.com/embed/dQw4w9WgXcQ');
    expect(call[2]).toContain('<iframe');
  });

  test('shows error and reopens URL bar for an unsupported URL', () => {
    insertVideo('https://example.com/not-a-video');
    expect(document.getElementById('url-error').style.display).toBe('inline');
  });
});

// ---------------------------------------------------------------------------
// Table support
// ---------------------------------------------------------------------------
describe('insertTable', () => {
  beforeEach(() => { document.execCommand.mockClear(); });

  test('calls insertHTML with a table containing the right row/col count', () => {
    insertTable(2, 3);
    const call = document.execCommand.mock.calls.find(c => c[0] === 'insertHTML');
    expect(call).toBeTruthy();
    const html = call[2];
    expect(html).toContain('<table>');
    const tdCount = (html.match(/<td/g) || []).length;
    const thCount = (html.match(/<th/g) || []).length;
    expect(thCount).toBe(3);
    expect(tdCount).toBe(3);
  });

  test('first row uses <th> cells', () => {
    insertTable(3, 2);
    const call = document.execCommand.mock.calls.find(c => c[0] === 'insertHTML');
    expect(call[2]).toContain('<th>');
  });
});

describe('tableAddRowAfter / tableDeleteRow', () => {
  function buildTable(rows, cols) {
    var html = '<table><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += r === 0 ? '<th>h</th>' : '<td>x</td>';
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function mockCellFocus(rowIndex, colIndex) {
    const table = document.getElementById('editor').querySelector('table');
    const cell = table.rows[rowIndex].cells[colIndex];
    vi.spyOn(window, 'getSelection').mockReturnValue({ rangeCount: 1, anchorNode: cell });
  }

  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => {
    document.getElementById('editor').innerHTML = buildTable(2, 3);
  });

  test('tableAddRowAfter adds a row below the current row', () => {
    mockCellFocus(0, 0);
    tableAddRowAfter();
    expect(document.getElementById('editor').querySelector('table').rows.length).toBe(3);
  });

  test('tableDeleteRow removes the current row', () => {
    mockCellFocus(1, 0);
    tableDeleteRow();
    expect(document.getElementById('editor').querySelector('table').rows.length).toBe(1);
  });

  test('tableDeleteRow removes the whole table when only one row remains', () => {
    document.getElementById('editor').innerHTML = buildTable(1, 2);
    mockCellFocus(0, 0);
    tableDeleteRow();
    expect(document.getElementById('editor').querySelector('table')).toBeNull();
  });
});

describe('tableAddColAfter / tableDeleteCol', () => {
  function buildTable(rows, cols) {
    var html = '<table><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td>x</td>';
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function mockCellFocus(rowIndex, colIndex) {
    const table = document.getElementById('editor').querySelector('table');
    const cell = table.rows[rowIndex].cells[colIndex];
    vi.spyOn(window, 'getSelection').mockReturnValue({ rangeCount: 1, anchorNode: cell });
  }

  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => {
    document.getElementById('editor').innerHTML = buildTable(2, 3);
  });

  test('tableAddColAfter adds a column after the current one', () => {
    mockCellFocus(0, 1);
    tableAddColAfter();
    expect(document.getElementById('editor').querySelector('table').rows[0].cells.length).toBe(4);
  });

  test('tableDeleteCol removes the current column', () => {
    mockCellFocus(0, 2);
    tableDeleteCol();
    expect(document.getElementById('editor').querySelector('table').rows[0].cells.length).toBe(2);
  });

  test('tableDeleteCol removes the whole table when only one column remains', () => {
    document.getElementById('editor').innerHTML = buildTable(2, 1);
    mockCellFocus(0, 0);
    tableDeleteCol();
    expect(document.getElementById('editor').querySelector('table')).toBeNull();
  });
});
