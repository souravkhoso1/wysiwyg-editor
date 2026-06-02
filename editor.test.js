// Minimal DOM matching what index.html provides — must be set up before requiring editor.js
// so that the top-level getElementById() calls inside the module find real elements.
document.body.innerHTML = `
  <div id="toolbar">
    <button id="btn-bold"         class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-italic"       class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-underline"    class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-strikeThrough" class="btn btn-sm btn-outline-secondary"></button>
    <button id="btn-toggle-edit"  class="btn btn-sm btn-success">Editing: ON</button>
  </div>
  <div id="url-bar" style="display:none;">
    <input type="text" id="url-input" value="" />
    <div id="url-error" style="display:none;"></div>
  </div>
  <div id="editor" contenteditable="true"></div>
`;

// Mock browser APIs that jsdom does not implement
document.execCommand = jest.fn().mockReturnValue(true);
document.queryCommandState = jest.fn().mockReturnValue(false);

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText:  jest.fn().mockResolvedValue('clipboard text'),
  },
  configurable: true,
});

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
global.URL.revokeObjectURL = jest.fn();

// Load module after DOM + mocks are in place
const {
  execCmd,
  execCommandWithArg,
  updateToolbarState,
  toggleSource,
  copyText,
  cutText,
  pasteText,
  openUrlBar,
  confirmUrl,
  showUrlError,
  insertImageFromUrl,
  closeUrlBar,
  clearAll,
  exportHTML,
  toggleEdit,
} = require('./editor');

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
// toggleEdit  (state flows: ON → OFF → ON across the two tests)
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
// toggleSource  (state flows: rendered → source → rendered)
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
    // Mock Image so onload fires synchronously
    const OriginalImage = global.Image;
    global.Image = class {
      set src(_) { if (this.onload) this.onload(); }
    };

    insertImageFromUrl(url);

    expect(document.execCommand).toHaveBeenCalledWith('insertImage', false, url);
    global.Image = OriginalImage;
  });

  test('shows an error when the image fails to load', () => {
    const OriginalImage = global.Image;
    global.Image = class {
      set src(_) { if (this.onerror) this.onerror(); }
    };

    insertImageFromUrl('https://bad-url.example/image.png');

    expect(document.getElementById('url-error').textContent).toContain('Could not load image');
    global.Image = OriginalImage;
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
  test('creates a blob URL, sets download filename, clicks the anchor, and revokes the URL', () => {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '<p>Test</p>';

    const mockAnchor = { href: '', download: '', click: jest.fn() };
    jest.spyOn(document, 'createElement').mockImplementationOnce(() => mockAnchor);
    global.URL.createObjectURL.mockClear();
    global.URL.revokeObjectURL.mockClear();

    exportHTML();

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockAnchor.download).toBe('document.html');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  test('wraps editor content in a complete HTML document', () => {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '<p>Hello world</p>';

    // Capture the Blob passed to createObjectURL
    let capturedBlob;
    global.URL.createObjectURL.mockImplementationOnce((b) => { capturedBlob = b; return 'blob:mock'; });
    jest.spyOn(document, 'createElement').mockImplementationOnce(() => ({ href: '', download: '', click: jest.fn() }));

    exportHTML();

    return capturedBlob.text().then((text) => {
      expect(text).toContain('<!DOCTYPE html>');
      expect(text).toContain('<p>Hello world</p>');
    });
  });
});

// ---------------------------------------------------------------------------
// Clipboard: copyText, cutText, pasteText
// ---------------------------------------------------------------------------
describe('copyText', () => {
  beforeEach(() => navigator.clipboard.writeText.mockClear());

  test('writes selected text to the clipboard', async () => {
    global.getSelection = jest.fn().mockReturnValue({ toString: () => 'hello' });
    await copyText();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  test('does nothing when no text is selected', async () => {
    global.getSelection = jest.fn().mockReturnValue({ toString: () => '' });
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
    global.getSelection = jest.fn().mockReturnValue({ toString: () => 'cut me' });
    await cutText();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('cut me');
    expect(document.execCommand).toHaveBeenCalledWith('delete');
  });

  test('does nothing when no text is selected', async () => {
    global.getSelection = jest.fn().mockReturnValue({ toString: () => '' });
    await cutText();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
  });
});

describe('pasteText', () => {
  beforeEach(() => {
    document.execCommand.mockClear();
    navigator.clipboard.readText.mockClear();
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
