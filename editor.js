var showingSourceCode = false;
var isInEditMode = true;
var editor = document.getElementById('editor');
var savedRange = null;

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
	document.execCommand(command, false, arg);
}

function toggleSource() {
	if (showingSourceCode) {
		editor.innerHTML = editor.textContent;
		editor.contentEditable = 'true';
		showingSourceCode = false;
	} else {
		editor.textContent = editor.innerHTML;
		editor.contentEditable = 'false';
		showingSourceCode = true;
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

function clearAll() {
	editor.innerHTML = '';
	editor.focus();
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

function toggleEdit() {
	var btn = document.getElementById('btn-toggle-edit');
	if (isInEditMode) {
		editor.contentEditable = 'false';
		isInEditMode = false;
		btn.textContent = 'Editing: OFF';
		btn.classList.replace('btn-success', 'btn-outline-danger');
	} else {
		editor.contentEditable = 'true';
		isInEditMode = true;
		btn.textContent = 'Editing: ON';
		btn.classList.replace('btn-outline-danger', 'btn-success');
	}
}
