var showingSourceCode = false;
var isInEditMode = true;
var isMarkdownMode = false;
var editor = document.getElementById('editor');
var savedRange = null;
var currentForeColor = null;

document.addEventListener('selectionchange', function() {
	var sel = window.getSelection();
	if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
		savedRange = sel.getRangeAt(0).cloneRange();
		updateToolbarState();
	}
});

var FORMAT_CMDS = ['bold', 'italic', 'underline', 'strikeThrough'];

function updateToolbarState() {
	FORMAT_CMDS.forEach(function(cmd) {
		var btn = document.getElementById('btn-' + cmd);
		if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
	});
}

function restoreSelection() {
	editor.focus();
	if (savedRange) {
		var sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(savedRange);
	}
}

function execCmd(command) {
	restoreSelection();
	document.execCommand(command, false, null);
}

function execCommandWithArg(command, arg) {
	restoreSelection();
	if (command === 'foreColor') currentForeColor = arg;
	document.execCommand(command, false, arg);
}

editor.addEventListener('beforeinput', function(e) {
	if (e.inputType !== 'insertText' || !e.data || !currentForeColor) return;
	e.preventDefault();
	var escaped = e.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	document.execCommand('insertHTML', false, '<font color="' + currentForeColor + '">' + escaped + '</font>');
});

function setToolbarDisabled(disabled, keepEnabledId) {
	document.getElementById('toolbar').querySelectorAll('button, select').forEach(function(el) {
		if (keepEnabledId && el.id === keepEnabledId) return;
		el.disabled = disabled;
	});
}

function toggleSource() {
	if (showingSourceCode) {
		editor.innerHTML = editor.textContent;
		editor.contentEditable = 'true';
		showingSourceCode = false;
		setToolbarDisabled(false);
		updateCounter();
		updateEditorActions();
	} else {
		editor.textContent = editor.innerHTML;
		editor.contentEditable = 'false';
		showingSourceCode = true;
		setToolbarDisabled(true, 'btn-source');
	}
}

async function copyText() {
	var sel = window.getSelection();
	if (sel && sel.toString()) {
		await navigator.clipboard.writeText(sel.toString());
	}
}

async function pasteText() {
	try {
		var text = await navigator.clipboard.readText();
		restoreSelection();
		document.execCommand('insertText', false, text);
	} catch (err) {
		// clipboard read permission denied or clipboard empty
	}
}

async function cutText() {
	var sel = window.getSelection();
	if (sel && sel.toString()) {
		await navigator.clipboard.writeText(sel.toString());
		document.execCommand('delete');
	}
}

var urlMode = null;

function openUrlBar(mode) {
	savedRange = savedRange || (window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0).cloneRange() : null);
	urlMode = mode;
	var bar = document.getElementById('url-bar');
	var input = document.getElementById('url-input');
	input.value = 'https://';
	bar.style.display = 'flex';
	input.focus();
	input.select();
}

function confirmUrl() {
	var url = document.getElementById('url-input').value.trim();
	var mode = urlMode;
	closeUrlBar();
	if (!url || !mode) return;
	if (mode === 'link') {
		execCommandWithArg('createLink', url);
	} else if (mode === 'image') {
		insertImageFromUrl(url);
	}
}

function showUrlError(msg) {
	var el = document.getElementById('url-error');
	el.textContent = msg;
	el.style.display = 'inline';
}

function insertImageFromUrl(url) {
	var img = new Image();
	img.onload = function() {
		execCommandWithArg('insertImage', url);
	};
	img.onerror = function() {
		openUrlBar('image');
		showUrlError('Could not load image — please check the URL.');
	};
	img.src = url;
}

function closeUrlBar() {
	document.getElementById('url-bar').style.display = 'none';
	document.getElementById('url-error').style.display = 'none';
	urlMode = null;
}

document.getElementById('url-input').addEventListener('keydown', function(e) {
	if (e.key === 'Enter') confirmUrl();
	if (e.key === 'Escape') closeUrlBar();
});

function updateCounter() {
	var el = document.getElementById('editor-counter');
	if (!el) return;
	var text = editor.textContent || '';
	var words = text.trim() ? text.trim().split(/\s+/).length : 0;
	el.textContent = 'Words: ' + words + ' | Characters: ' + text.length;
}

function updateEditorActions() {
	var empty = editor.textContent.trim() === '';
	var btnPrint = document.getElementById('btn-print');
	var btnExport = document.getElementById('btn-export');
	if (btnPrint) btnPrint.disabled = empty;
	if (btnExport) btnExport.disabled = empty;
}

editor.addEventListener('input', function() {
	updateCounter();
	updateEditorActions();
});

function clearAll() {
	editor.focus();
	document.execCommand('selectAll');
	document.execCommand('delete');
	updateCounter();
	updateEditorActions();
}

function exportHTML() {
	var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + editor.innerHTML + '</body></html>';
	var blob = new Blob([html], { type: 'text/html' });
	var a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'document.html';
	a.click();
	URL.revokeObjectURL(a.href);
}

function toggleMarkdown() {
	var editorEl = document.getElementById('editor');
	var counterEl = document.getElementById('editor-counter');
	var markdownPane = document.getElementById('markdown-pane');
	var btn = document.getElementById('btn-markdown');

	isMarkdownMode = !isMarkdownMode;

	if (isMarkdownMode) {
		editorEl.classList.add('d-none');
		counterEl.classList.add('d-none');
		markdownPane.classList.remove('d-none');
		btn.classList.replace('btn-outline-secondary', 'btn-primary');
		setToolbarDisabled(true, 'btn-markdown');
		document.getElementById('markdown-input').focus();
	} else {
		editorEl.classList.remove('d-none');
		counterEl.classList.remove('d-none');
		markdownPane.classList.add('d-none');
		btn.classList.replace('btn-primary', 'btn-outline-secondary');
		setToolbarDisabled(false);
	}
}

var mdInput = document.getElementById('markdown-input');
if (mdInput) {
	mdInput.addEventListener('input', function() {
		document.getElementById('markdown-preview').innerHTML = marked.parse(this.value);
	});
}

function toggleEdit() {
	var btn = document.getElementById('btn-toggle-edit');
	if (isInEditMode) {
		editor.contentEditable = 'false';
		isInEditMode = false;
		btn.textContent = 'Editing: OFF';
		btn.classList.replace('btn-success', 'btn-outline-danger');
		setToolbarDisabled(true, 'btn-toggle-edit');
	} else {
		editor.contentEditable = 'true';
		isInEditMode = true;
		btn.textContent = 'Editing: ON';
		btn.classList.replace('btn-outline-danger', 'btn-success');
		setToolbarDisabled(false);
		updateEditorActions();
	}
}

(function() {
	if (!/Mac/i.test(navigator.platform)) return;
	document.querySelectorAll('.key-mod').forEach(function(el) {
		el.textContent = '⌘';
	});
	var redoCell = document.getElementById('shortcut-redo');
	if (redoCell) redoCell.innerHTML = '<kbd>⌘ + Shift + Z</kbd>';
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		execCmd,
		execCommandWithArg,
		updateToolbarState,
		restoreSelection,
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
		toggleMarkdown,
		setToolbarDisabled,
		updateCounter,
		updateEditorActions,
	};
}
