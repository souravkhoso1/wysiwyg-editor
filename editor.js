var showingSourceCode = false;
var isInEditMode = true;
var isMarkdownMode = false;
var editor = document.getElementById('editor');
var savedRange = null;
var currentForeColor = null;
var STORAGE_KEY = 'richtext-online-content';
var saveTimer = null;

(function restoreFromStorage() {
	try {
		var saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			editor.innerHTML = saved;
			updateCounter();
			updateEditorActions();
		}
	} catch (e) {}
})();

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

function getVideoEmbedUrl(url) {
	var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
	if (ytMatch) return 'https://www.youtube.com/embed/' + ytMatch[1];
	var vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
	if (vimeoMatch) return 'https://player.vimeo.com/video/' + vimeoMatch[1];
	return null;
}

function insertVideo(url) {
	var embedUrl = getVideoEmbedUrl(url);
	if (!embedUrl) {
		openUrlBar('video');
		showUrlError('Unsupported URL — paste a YouTube or Vimeo link.');
		return;
	}
	restoreSelection();
	document.execCommand('insertHTML', false,
		'<div class="video-embed" contenteditable="false">' +
		'<iframe src="' + embedUrl + '" width="560" height="315" ' +
		'frameborder="0" allowfullscreen loading="lazy"></iframe>' +
		'</div><p></p>'
	);
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
	} else if (mode === 'video') {
		insertVideo(url);
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

function insertImageFromFile(input) {
	var file = input.files && input.files[0];
	if (!file) return;
	var reader = new FileReader();
	reader.onload = function(e) {
		restoreSelection();
		document.execCommand('insertImage', false, e.target.result);
	};
	reader.readAsDataURL(file);
	input.value = '';
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
	['btn-print', 'btn-export', 'btn-export-pdf'].forEach(function(id) {
		var btn = document.getElementById(id);
		if (btn) btn.disabled = empty;
	});
}

function cleanPastedHtml(html) {
	return html
		.replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, '')   // Word <o:p> tags
		.replace(/<\/?(o|w|m):[^>]*>/gi, '')              // remaining Office namespace tags
		.replace(/\s*mso-[^:;}"']+:[^;}"']+;?/gi, '')    // MSO CSS properties
		.replace(/\s*MARGIN:\s*0[^;]*;?/gi, '')           // Word default margin resets
		.replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '') // conditional comments
		.replace(/<!--.*?-->/gs, '')                       // remaining HTML comments
		.replace(/<span\s*style="\s*"[^>]*>/gi, '<span>') // empty style attrs on span
		.replace(/<span>(<\/span>)?/gi, '$1')             // now-empty spans
		.replace(/style="[^"]*font-family[^"]*"/gi, '')   // strip font-family (Word fonts)
		.replace(/\s{2,}/g, ' ');                         // collapse whitespace
}

editor.addEventListener('paste', function(e) {
	var html = e.clipboardData && e.clipboardData.getData('text/html');
	if (!html) return;
	e.preventDefault();
	var cleaned = cleanPastedHtml(html);
	document.execCommand('insertHTML', false, cleaned);
});

editor.addEventListener('input', function() {
	updateCounter();
	updateEditorActions();
	clearTimeout(saveTimer);
	saveTimer = setTimeout(function() {
		try { localStorage.setItem(STORAGE_KEY, editor.innerHTML); } catch (e) {}
	}, 500);
});

function clearAll() {
	editor.focus();
	document.execCommand('selectAll');
	document.execCommand('delete');
	currentForeColor = null;
	try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
	updateCounter();
	updateEditorActions();
}

function exportPDF() {
	var win = window.open('', '_blank');
	if (!win) return;
	win.document.write(
		'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Document</title>' +
		'<style>body{font-family:sans-serif;padding:2cm;line-height:1.6;max-width:800px;margin:auto}' +
		'img{max-width:100%}table{border-collapse:collapse;width:100%}' +
		'td,th{border:1px solid #ccc;padding:8px}' +
		'pre{background:#f0f0f0;padding:1em;border-radius:4px;white-space:pre-wrap}' +
		'blockquote{border-left:4px solid #ccc;margin:0;padding:0 1em;color:#555;font-style:italic}' +
		'</style></head><body>' + editor.innerHTML + '</body></html>'
	);
	win.document.close();
	win.focus();
	win.print();
	win.close();
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
		document.getElementById('markdown-preview').innerHTML = DOMPurify.sanitize(marked.parse(this.value));
	});
}

var isCharPickerOpen = false;

function openCharPicker() {
	var panel = document.getElementById('char-picker');
	isCharPickerOpen = !isCharPickerOpen;
	panel.style.display = isCharPickerOpen ? 'block' : 'none';
}

function closeCharPicker() {
	isCharPickerOpen = false;
	var panel = document.getElementById('char-picker');
	if (panel) panel.style.display = 'none';
}

function insertChar(ch) {
	restoreSelection();
	document.execCommand('insertText', false, ch);
	editor.focus();
}

var isDarkMode = false;

function toggleDarkMode() {
	isDarkMode = !isDarkMode;
	document.body.classList.toggle('dark-mode', isDarkMode);
	var btn = document.getElementById('btn-dark-mode');
	if (btn) {
		btn.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
		btn.title = isDarkMode ? 'Light Mode' : 'Dark Mode';
	}
}

var isFullscreen = false;

var findMatches = [];
var findIndex = -1;
var lastFindTerm = '';

function openFindReplace() {
	var bar = document.getElementById('find-replace-bar');
	bar.style.display = 'block';
	document.getElementById('find-input').focus();
}

function closeFindReplace() {
	document.getElementById('find-replace-bar').style.display = 'none';
	clearFindHighlights();
	findMatches = [];
	findIndex = -1;
	lastFindTerm = '';
	document.getElementById('find-status').textContent = '';
}

function clearFindHighlights() {
	editor.querySelectorAll('mark.find-match').forEach(function(m) {
		var parent = m.parentNode;
		while (m.firstChild) parent.insertBefore(m.firstChild, m);
		parent.removeChild(m);
		parent.normalize();
	});
}

function highlightMatches(term) {
	clearFindHighlights();
	findMatches = [];
	lastFindTerm = term;
	findIndex = -1;
	if (!term) return;
	editor.normalize();
	var walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
	var nodes = [];
	var node;
	while ((node = walker.nextNode())) nodes.push(node);
	var lowerTerm = term.toLowerCase();
	nodes.forEach(function(textNode) {
		var text = textNode.nodeValue;
		var lowerText = text.toLowerCase();
		var lastIndex = 0;
		var idx;
		var frag = document.createDocumentFragment();
		var didSplit = false;
		while ((idx = lowerText.indexOf(lowerTerm, lastIndex)) !== -1) {
			if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
			var mark = document.createElement('mark');
			mark.className = 'find-match';
			mark.textContent = text.slice(idx, idx + term.length);
			findMatches.push(mark);
			frag.appendChild(mark);
			lastIndex = idx + term.length;
			didSplit = true;
		}
		if (didSplit) {
			if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
			textNode.parentNode.replaceChild(frag, textNode);
		}
	});
}

function updateFindStatus() {
	var el = document.getElementById('find-status');
	if (!el) return;
	if (findMatches.length === 0) {
		el.textContent = lastFindTerm ? 'No matches' : '';
	} else {
		el.textContent = (findIndex + 1) + ' of ' + findMatches.length;
	}
}

function scrollToMatch(idx) {
	findMatches.forEach(function(m, i) {
		m.classList.toggle('find-match-current', i === idx);
	});
	if (findMatches[idx] && findMatches[idx].scrollIntoView) {
		findMatches[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
	}
}

function findNext() {
	var term = document.getElementById('find-input').value;
	if (term !== lastFindTerm) highlightMatches(term);
	if (findMatches.length === 0) { updateFindStatus(); return; }
	findIndex = (findIndex + 1) % findMatches.length;
	scrollToMatch(findIndex);
	updateFindStatus();
}

function findPrev() {
	var term = document.getElementById('find-input').value;
	if (term !== lastFindTerm) highlightMatches(term);
	if (findMatches.length === 0) { updateFindStatus(); return; }
	findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
	scrollToMatch(findIndex);
	updateFindStatus();
}

function replaceOne() {
	var term = document.getElementById('find-input').value;
	var replacement = document.getElementById('replace-input').value;
	if (term !== lastFindTerm) highlightMatches(term);
	if (findMatches.length === 0) { updateFindStatus(); return; }
	if (findIndex < 0) findIndex = 0;
	var match = findMatches[findIndex];
	match.parentNode.replaceChild(document.createTextNode(replacement), match);
	var savedIndex = findIndex;
	highlightMatches(term);
	findIndex = findMatches.length > 0 ? Math.min(savedIndex, findMatches.length - 1) : -1;
	if (findIndex >= 0) scrollToMatch(findIndex);
	updateFindStatus();
}

function replaceAll() {
	var term = document.getElementById('find-input').value;
	var replacement = document.getElementById('replace-input').value;
	if (term !== lastFindTerm) highlightMatches(term);
	if (findMatches.length === 0) { updateFindStatus(); return; }
	findMatches.forEach(function(match) {
		match.parentNode.replaceChild(document.createTextNode(replacement), match);
	});
	findMatches = [];
	findIndex = -1;
	lastFindTerm = '';
	var el = document.getElementById('find-status');
	if (el) el.textContent = 'All replaced';
}

function toggleFullscreen() {
	var container = document.querySelector('.container-lg');
	var btn = document.getElementById('btn-fullscreen');
	isFullscreen = !isFullscreen;
	container.classList.toggle('editor-fullscreen', isFullscreen);
	if (btn) {
		btn.innerHTML = isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
		btn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
	}
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

document.addEventListener('keydown', function(e) {
	var mod = e.ctrlKey || e.metaKey;
	if (mod && e.key === 'h') {
		e.preventDefault();
		openFindReplace();
	}
});

document.getElementById('find-input') && document.getElementById('find-input').addEventListener('keydown', function(e) {
	if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); }
	if (e.key === 'Escape') closeFindReplace();
});

(function() {
	var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
	if (!/Mac/i.test(platform)) return;
	document.querySelectorAll('.key-mod').forEach(function(el) {
		el.textContent = '⌘';
	});
	var redoCell = document.getElementById('shortcut-redo');
	if (redoCell) redoCell.innerHTML = '<kbd>⌘ + Shift + Z</kbd>';
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		toggleFullscreen,
		insertImageFromFile,
		exportPDF,
		getVideoEmbedUrl,
		insertVideo,
		openCharPicker,
		closeCharPicker,
		insertChar,
		toggleDarkMode,
		cleanPastedHtml,
		openFindReplace,
		closeFindReplace,
		clearFindHighlights,
		highlightMatches,
		findNext,
		findPrev,
		replaceOne,
		replaceAll,
		updateFindStatus,
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
