var showingSourceCode = false;
var isInEditMode = true;
var isMarkdownMode = false;
var editor = document.getElementById('editor');
var savedRange = null;
var currentForeColor = null;
var STORAGE_KEY = 'richtext-online-content';
var saveTimer = null;
var HISTORY_KEY = 'richtext-online-history';
var HISTORY_MAX = 8;
var HISTORY_INTERVAL_MS = 2 * 60 * 1000;
var historyTimer = null;
var lastSnapshotContent = null;

// URL length above which we warn and suggest GitHub Gist
var URL_SHARE_THRESHOLD = 2000;

// ── Usage metrics ────────────────────────────────────────────────────────────

function trackEvent(name, params) {
	if (typeof gtag === 'function') gtag('event', name, params || {});
}

// ── Auth and cloud persistence (Firebase) ────────────────────────────────────

var currentUser = null;
var currentCloudDocId = null;
var currentCloudTitle = null;

function getDb() {
	return firebase.firestore();
}

firebase.auth().onAuthStateChanged(function(user) {
	currentUser = user;
	if (!user) {
		currentCloudDocId = null;
		currentCloudTitle = null;
	}
	updateAccountUI(user);
	updateCloudButtons();
});

function signInWithGoogle() {
	var provider = new firebase.auth.GoogleAuthProvider();
	firebase.auth().signInWithPopup(provider)
		.then(function() { trackEvent('login', { method: 'Google' }); })
		.catch(function(e) {
			if (e.code !== 'auth/cancelled-popup-request' && e.code !== 'auth/popup-closed-by-user') {
				alert('Sign-in failed: ' + e.message);
			}
		});
}

function signOutUser() {
	firebase.auth().signOut().then(function() { trackEvent('logout'); });
}

function updateAccountUI(user) {
	var signInBtn = document.getElementById('btn-signin');
	var widget = document.getElementById('account-widget');
	var btn = document.getElementById('btn-account');
	var menu = document.getElementById('account-menu');
	if (!signInBtn || !widget || !btn || !menu) return;
	menu.innerHTML = '';
	if (user) {
		signInBtn.classList.add('d-none');
		widget.classList.remove('d-none');

		btn.innerHTML = '';
		if (user.photoURL) {
			var img = document.createElement('img');
			img.src = user.photoURL;
			img.alt = '';
			img.style.width = '20px';
			img.style.height = '20px';
			img.style.borderRadius = '50%';
			img.style.objectFit = 'cover';
			btn.appendChild(img);
		} else {
			btn.innerHTML = '<i class="fas fa-circle-user"></i>';
		}
		btn.title = user.displayName || user.email || 'Account';

		var emailItem = document.createElement('li');
		var emailText = document.createElement('span');
		emailText.className = 'dropdown-item-text small text-muted';
		emailText.textContent = user.email || '';
		emailItem.appendChild(emailText);

		var docsItem = document.createElement('li');
		var docsBtn = document.createElement('button');
		docsBtn.className = 'dropdown-item';
		docsBtn.textContent = 'My Documents';
		docsBtn.onclick = openDocumentsModal;
		docsItem.appendChild(docsBtn);

		var dividerItem = document.createElement('li');
		dividerItem.innerHTML = '<hr class="dropdown-divider">';

		var signOutItem = document.createElement('li');
		var signOutBtn = document.createElement('button');
		signOutBtn.className = 'dropdown-item';
		signOutBtn.textContent = 'Sign out';
		signOutBtn.onclick = signOutUser;
		signOutItem.appendChild(signOutBtn);

		menu.appendChild(emailItem);
		menu.appendChild(docsItem);
		menu.appendChild(dividerItem);
		menu.appendChild(signOutItem);
	} else {
		signInBtn.classList.remove('d-none');
		widget.classList.add('d-none');
	}
}

function updateCloudButtons() {
	var btn = document.getElementById('btn-cloud-save');
	if (btn) btn.disabled = editor.textContent.trim() === '' || !currentUser;
}

function deriveDefaultTitle() {
	var heading = editor.querySelector('h1, h2, h3');
	var text = (heading ? heading.textContent : editor.textContent).trim().replace(/\s+/g, ' ');
	return text.slice(0, 60) || 'Untitled document';
}

function openCloudSaveModal() {
	if (!currentUser) { signInWithGoogle(); return; }
	if (!editor.textContent.trim()) return;
	document.getElementById('cloud-save-title').value = currentCloudTitle || deriveDefaultTitle();
	document.getElementById('cloud-save-as-new').style.display = currentCloudDocId ? '' : 'none';
	document.getElementById('cloud-save-error').style.display = 'none';
	new bootstrap.Modal(document.getElementById('cloudSaveModal')).show();
}

async function saveToCloud(asNew) {
	if (!currentUser) return;
	var title = document.getElementById('cloud-save-title').value.trim() || 'Untitled document';
	var errorEl = document.getElementById('cloud-save-error');
	var btn = document.getElementById('btn-confirm-cloud-save');
	errorEl.style.display = 'none';
	btn.disabled = true;
	try {
		var db = getDb();
		var payload = {
			ownerId: currentUser.uid,
			title: title,
			content: editor.innerHTML,
			updatedAt: firebase.firestore.FieldValue.serverTimestamp()
		};
		if (currentCloudDocId && !asNew) {
			await db.collection('documents').doc(currentCloudDocId).set(payload, { merge: true });
		} else {
			payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
			var ref = await db.collection('documents').add(payload);
			currentCloudDocId = ref.id;
		}
		currentCloudTitle = title;
		trackEvent('document_save_cloud', { method: asNew ? 'new_copy' : 'save' });
		var modalEl = document.getElementById('cloudSaveModal');
		var modal = bootstrap.Modal.getInstance(modalEl);
		if (modal) modal.hide();
	} catch (e) {
		errorEl.textContent = e.message || 'Failed to save document.';
		errorEl.style.display = '';
	} finally {
		btn.disabled = false;
	}
}

function openDocumentsModal() {
	if (!currentUser) return;
	var listEl = document.getElementById('cloud-docs-list');
	var emptyEl = document.getElementById('cloud-docs-empty');
	var loadingEl = document.getElementById('cloud-docs-loading');
	listEl.innerHTML = '';
	emptyEl.style.display = 'none';
	loadingEl.style.display = '';
	new bootstrap.Modal(document.getElementById('documentsModal')).show();
	getDb().collection('documents')
		.where('ownerId', '==', currentUser.uid)
		.orderBy('updatedAt', 'desc')
		.get()
		.then(function(snapshot) {
			loadingEl.style.display = 'none';
			if (snapshot.empty) {
				emptyEl.style.display = '';
				return;
			}
			snapshot.forEach(function(doc) {
				renderCloudDocRow(doc.id, doc.data());
			});
		})
		.catch(function(e) {
			loadingEl.style.display = 'none';
			emptyEl.textContent = 'Could not load documents: ' + e.message;
			emptyEl.style.display = '';
		});
}

function renderCloudDocRow(docId, data) {
	var listEl = document.getElementById('cloud-docs-list');
	var item = document.createElement('div');
	item.className = 'list-group-item d-flex justify-content-between align-items-center gap-2';

	var info = document.createElement('div');
	info.className = 'flex-grow-1 overflow-hidden';
	var titleEl = document.createElement('div');
	titleEl.className = 'fw-semibold small text-truncate';
	titleEl.textContent = data.title || 'Untitled document';
	var timeEl = document.createElement('div');
	timeEl.className = 'text-muted small';
	timeEl.textContent = data.updatedAt ? relativeTime(data.updatedAt.toMillis()) : '';
	info.appendChild(titleEl);
	info.appendChild(timeEl);

	var actions = document.createElement('div');
	actions.className = 'd-flex gap-1 flex-shrink-0';
	var openBtn = document.createElement('button');
	openBtn.className = 'btn btn-sm btn-outline-primary';
	openBtn.textContent = 'Open';
	openBtn.onclick = function() { loadCloudDocument(docId, data.title); };
	var delBtn = document.createElement('button');
	delBtn.className = 'btn btn-sm btn-outline-danger';
	delBtn.innerHTML = '<i class="fas fa-trash"></i>';
	delBtn.onclick = function() { deleteCloudDocument(docId, item); };
	actions.appendChild(openBtn);
	actions.appendChild(delBtn);

	item.appendChild(info);
	item.appendChild(actions);
	listEl.appendChild(item);
}

function loadCloudDocument(docId, title) {
	getDb().collection('documents').doc(docId).get().then(function(doc) {
		if (!doc.exists) return;
		var data = doc.data();
		editor.innerHTML = DOMPurify.sanitize(data.content || '');
		currentCloudDocId = docId;
		currentCloudTitle = data.title || title;
		dismissSharedBanner();
		history.replaceState(null, '', location.pathname);
		try { localStorage.setItem(STORAGE_KEY, editor.innerHTML); } catch (e) {}
		updateCounter();
		updateEditorActions();
		trackEvent('document_load_cloud');
		var modalEl = document.getElementById('documentsModal');
		var modal = bootstrap.Modal.getInstance(modalEl);
		if (modal) modal.hide();
	});
}

function deleteCloudDocument(docId, rowEl) {
	if (!confirm('Delete this document? This cannot be undone.')) return;
	getDb().collection('documents').doc(docId).delete().then(function() {
		if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
		if (currentCloudDocId === docId) currentCloudDocId = null;
		trackEvent('document_delete_cloud');
		var listEl = document.getElementById('cloud-docs-list');
		if (listEl && !listEl.children.length) {
			document.getElementById('cloud-docs-empty').style.display = '';
		}
	});
}

(function initContent() {
	var params = new URLSearchParams(window.location.search);
	var gistId = params.get('gist');
	var hash = window.location.hash;
	if (gistId) {
		restoreFromGist(gistId);
	} else if (hash && hash.startsWith('#v1:')) {
		restoreFromHash(hash.slice(4));
	} else {
		restoreFromStorage();
	}
	updateCounter();
	updateEditorActions();
})();

function restoreFromStorage() {
	try {
		var saved = localStorage.getItem(STORAGE_KEY);
		if (saved) editor.innerHTML = saved;
	} catch (e) {}
}

function restoreFromHash(compressed) {
	try {
		var html = LZString.decompressFromEncodedURIComponent(compressed);
		if (html) {
			editor.innerHTML = DOMPurify.sanitize(html);
			showSharedBanner();
			return;
		}
	} catch (e) {}
	restoreFromStorage();
}

function restoreFromGist(gistId) {
	editor.innerHTML = '<p class="text-muted"><em>Loading shared document…</em></p>';
	fetch('https://api.github.com/gists/' + gistId)
		.then(function(r) { return r.json(); })
		.then(function(data) {
			var files = data.files;
			var file = files && (files['document.html'] || Object.values(files)[0]);
			if (file && file.content) {
				editor.innerHTML = DOMPurify.sanitize(file.content);
				updateCounter();
				updateEditorActions();
				showSharedBanner();
			} else {
				editor.innerHTML = '<p class="text-danger">Could not load the shared document.</p>';
			}
		})
		.catch(function() {
			editor.innerHTML = '<p class="text-danger">Could not load the shared document.</p>';
		});
}

function showSharedBanner() {
	var banner = document.getElementById('shared-banner');
	if (banner) banner.classList.remove('d-none');
}

function dismissSharedBanner() {
	var banner = document.getElementById('shared-banner');
	if (banner) banner.classList.add('d-none');
}

function newDocument() {
	trackEvent('new_document');
	editor.innerHTML = '';
	history.replaceState(null, '', location.pathname);
	dismissSharedBanner();
	try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
	clearHistory();
	updateCounter();
	updateEditorActions();
}

// ── Version history ──────────────────────────────────────────────────────────

function getHistory() {
	try {
		var raw = localStorage.getItem(HISTORY_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch (e) {
		return [];
	}
}

function setHistory(list) {
	try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) {}
}

function clearHistory() {
	lastSnapshotContent = null;
	try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
}

function takeSnapshot(content) {
	content = content !== undefined ? content : editor.innerHTML;
	if (!content || !content.trim()) return;
	if (content === lastSnapshotContent) return;
	var list = getHistory();
	list.push({ time: Date.now(), content: content });
	while (list.length > HISTORY_MAX) list.shift();
	setHistory(list);
	lastSnapshotContent = content;
}

function scheduleHistorySnapshot() {
	if (historyTimer) return;
	historyTimer = setTimeout(function() {
		historyTimer = null;
		takeSnapshot();
	}, HISTORY_INTERVAL_MS);
}

function relativeTime(timestamp) {
	var diff = Math.max(0, Date.now() - timestamp);
	var mins = Math.round(diff / 60000);
	if (mins < 1) return 'Just now';
	if (mins === 1) return '1 minute ago';
	if (mins < 60) return mins + ' minutes ago';
	var hours = Math.round(mins / 60);
	if (hours === 1) return '1 hour ago';
	if (hours < 24) return hours + ' hours ago';
	var days = Math.round(hours / 24);
	if (days === 1) return 'Yesterday';
	return days + ' days ago';
}

function snapshotPreviewText(content) {
	var div = document.createElement('div');
	div.innerHTML = content;
	var text = (div.textContent || '').trim().replace(/\s+/g, ' ');
	return text.length > 120 ? text.slice(0, 120) + '…' : (text || '(empty document)');
}

function openHistoryModal() {
	trackEvent('open_history');
	takeSnapshot(); // capture current state so it's not lost when restoring
	renderHistoryList();
	new bootstrap.Modal(document.getElementById('historyModal')).show();
}

function renderHistoryList() {
	var listEl = document.getElementById('history-list');
	var emptyEl = document.getElementById('history-empty');
	if (!listEl) return;
	var list = getHistory().slice().reverse(); // newest first
	listEl.innerHTML = '';
	if (list.length === 0) {
		emptyEl.style.display = '';
		return;
	}
	emptyEl.style.display = 'none';
	list.forEach(function(snap) {
		var item = document.createElement('div');
		item.className = 'list-group-item d-flex justify-content-between align-items-center gap-2';
		var info = document.createElement('div');
		info.className = 'flex-grow-1 overflow-hidden';
		var timeEl = document.createElement('div');
		timeEl.className = 'fw-semibold small';
		timeEl.textContent = relativeTime(snap.time);
		var previewEl = document.createElement('div');
		previewEl.className = 'text-muted small text-truncate';
		previewEl.textContent = snapshotPreviewText(snap.content);
		info.appendChild(timeEl);
		info.appendChild(previewEl);
		var btn = document.createElement('button');
		btn.className = 'btn btn-sm btn-outline-primary flex-shrink-0';
		btn.textContent = 'Restore';
		btn.onclick = function() { restoreSnapshot(snap.time); };
		item.appendChild(info);
		item.appendChild(btn);
		listEl.appendChild(item);
	});
}

function restoreSnapshot(timestamp) {
	var list = getHistory();
	var snap = list.find(function(s) { return s.time === timestamp; });
	if (!snap) return;
	trackEvent('restore_snapshot');
	// Preserve current content as a snapshot before overwriting, so restoring is non-destructive.
	takeSnapshot();
	editor.innerHTML = DOMPurify.sanitize(snap.content);
	lastSnapshotContent = editor.innerHTML;
	try { localStorage.setItem(STORAGE_KEY, editor.innerHTML); } catch (e) {}
	updateCounter();
	updateEditorActions();
	var modalEl = document.getElementById('historyModal');
	var modal = bootstrap.Modal.getInstance(modalEl);
	if (modal) modal.hide();
}

// ── Share modal ──────────────────────────────────────────────────────────────

function openShareModal() {
	if (!editor.textContent.trim()) return;
	trackEvent('open_share');
	var compressed = LZString.compressToEncodedURIComponent(editor.innerHTML);
	var shareUrl = location.origin + location.pathname + '#v1:' + compressed;
	document.getElementById('share-url-input').value = shareUrl;
	document.getElementById('share-copy-feedback').textContent = '';
	var tooLong = shareUrl.length > URL_SHARE_THRESHOLD;
	document.getElementById('share-url-warning').style.display = tooLong ? '' : 'none';
	document.getElementById('share-gist-section').style.display = tooLong ? '' : 'none';
	document.getElementById('gist-error').style.display = 'none';
	document.getElementById('gist-success').style.display = 'none';
	document.getElementById('gist-token-input').value = '';
	new bootstrap.Modal(document.getElementById('shareModal')).show();
}

function copyShareUrl() {
	var url = document.getElementById('share-url-input').value;
	navigator.clipboard.writeText(url).then(function() {
		document.getElementById('share-copy-feedback').textContent = 'Copied!';
		trackEvent('copy_share_url');
	});
}

function showGistSection() {
	document.getElementById('share-gist-section').style.display = '';
}

async function shareViaGist() {
	var token = document.getElementById('gist-token-input').value.trim();
	var errorEl = document.getElementById('gist-error');
	var successEl = document.getElementById('gist-success');
	var btn = document.getElementById('btn-share-gist');
	errorEl.style.display = 'none';
	successEl.style.display = 'none';
	if (!token) {
		errorEl.textContent = 'Please enter a GitHub personal access token.';
		errorEl.style.display = '';
		return;
	}
	btn.disabled = true;
	btn.textContent = 'Creating…';
	try {
		var resp = await fetch('https://api.github.com/gists', {
			method: 'POST',
			headers: {
				'Authorization': 'token ' + token,
				'Content-Type': 'application/json',
				'Accept': 'application/vnd.github+json'
			},
			body: JSON.stringify({
				description: 'RichText.online shared document',
				public: true,
				files: { 'document.html': { content: editor.innerHTML } }
			})
		});
		if (!resp.ok) {
			var err = await resp.json().catch(function() { return {}; });
			throw new Error(err.message || 'GitHub API error (' + resp.status + ')');
		}
		var data = await resp.json();
		var shareUrl = location.origin + location.pathname + '?gist=' + data.id;
		document.getElementById('share-url-input').value = shareUrl;
		document.getElementById('share-url-warning').style.display = 'none';
		document.getElementById('share-gist-section').style.display = 'none';
		successEl.textContent = 'Gist created! URL updated above — copy and share it.';
		successEl.style.display = '';
		trackEvent('share_gist');
	} catch (e) {
		errorEl.textContent = e.message || 'Failed to create Gist.';
		errorEl.style.display = '';
	} finally {
		btn.disabled = false;
		btn.textContent = 'Create Gist';
	}
}

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
	trackEvent('format', { command: command });
	document.execCommand(command, false, null);
}

function execCommandWithArg(command, arg) {
	restoreSelection();
	if (command === 'foreColor') currentForeColor = arg;
	var params = { command: command };
	if (command === 'formatBlock' || command === 'fontName' || command === 'fontSize') params.value = arg;
	trackEvent('format', params);
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
		trackEvent('view_source');
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
	trackEvent('insert_video');
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
		trackEvent('insert_image', { source: 'url' });
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
		trackEvent('insert_image', { source: 'file' });
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
	['btn-print', 'btn-export', 'btn-export-pdf', 'btn-share'].forEach(function(id) {
		var btn = document.getElementById(id);
		if (btn) btn.disabled = empty;
	});
	updateCloudButtons();
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
	scheduleHistorySnapshot();
});

function clearAll() {
	trackEvent('clear_all');
	editor.focus();
	document.execCommand('selectAll');
	document.execCommand('delete');
	currentForeColor = null;
	try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
	clearHistory();
	updateCounter();
	updateEditorActions();
}

function printDocument() {
	trackEvent('print');
	window.print();
}

function exportPDF() {
	trackEvent('export_pdf');
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
	trackEvent('export_html');
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
	trackEvent('toggle_markdown', { enabled: isMarkdownMode });

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

function insertTable(rows, cols) {
	trackEvent('insert_table', { rows: rows, cols: cols });
	var html = '<table><tbody>';
	for (var r = 0; r < rows; r++) {
		html += '<tr>';
		for (var c = 0; c < cols; c++) {
			html += r === 0 ? '<th><br></th>' : '<td><br></td>';
		}
		html += '</tr>';
	}
	html += '</tbody></table><p></p>';
	restoreSelection();
	document.execCommand('insertHTML', false, html);
}

function getTableCell() {
	var sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	var node = sel.anchorNode;
	while (node && node !== editor) {
		if (node.nodeName === 'TD' || node.nodeName === 'TH') return node;
		node = node.parentNode;
	}
	return null;
}

function tableAddRowAfter() {
	var cell = getTableCell();
	if (!cell) return;
	var row = cell.closest('tr');
	var colCount = row.cells.length;
	var newRow = document.createElement('tr');
	for (var i = 0; i < colCount; i++) {
		var td = document.createElement('td');
		td.innerHTML = '<br>';
		newRow.appendChild(td);
	}
	row.parentNode.insertBefore(newRow, row.nextSibling);
}

function tableDeleteRow() {
	var cell = getTableCell();
	if (!cell) return;
	var row = cell.closest('tr');
	var tbody = row.parentNode;
	if (tbody.rows.length === 1) {
		tbody.closest('table').remove();
	} else {
		row.remove();
	}
}

function tableAddColAfter() {
	var cell = getTableCell();
	if (!cell) return;
	var table = cell.closest('table');
	var colIndex = cell.cellIndex;
	Array.from(table.rows).forEach(function(row) {
		var newCell = row.insertCell(colIndex + 1);
		newCell.innerHTML = '<br>';
	});
}

function tableDeleteCol() {
	var cell = getTableCell();
	if (!cell) return;
	var table = cell.closest('table');
	var colIndex = cell.cellIndex;
	if (table.rows[0] && table.rows[0].cells.length === 1) {
		table.remove();
		return;
	}
	Array.from(table.rows).forEach(function(row) {
		if (row.cells[colIndex]) row.deleteCell(colIndex);
	});
}

var isCharPickerOpen = false;

function openCharPicker() {
	var panel = document.getElementById('char-picker');
	isCharPickerOpen = !isCharPickerOpen;
	if (isCharPickerOpen) trackEvent('open_char_picker');
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
	trackEvent('toggle_dark_mode', { enabled: isDarkMode });
	document.documentElement.setAttribute('data-bs-theme', isDarkMode ? 'dark' : 'light');
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
	trackEvent('open_find_replace');
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
	trackEvent('replace_all', { count: findMatches.length });
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
	trackEvent('toggle_fullscreen', { enabled: isFullscreen });
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
		trackEvent('toggle_edit', { enabled: false });
		btn.textContent = 'Editing: OFF';
		btn.classList.replace('btn-success', 'btn-outline-danger');
		setToolbarDisabled(true, 'btn-toggle-edit');
	} else {
		editor.contentEditable = 'true';
		isInEditMode = true;
		trackEvent('toggle_edit', { enabled: true });
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
		insertTable,
		getTableCell,
		tableAddRowAfter,
		tableDeleteRow,
		tableAddColAfter,
		tableDeleteCol,
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
		openShareModal,
		copyShareUrl,
		showGistSection,
		shareViaGist,
		restoreFromHash,
		restoreFromGist,
		newDocument,
		showSharedBanner,
		dismissSharedBanner,
		getHistory,
		setHistory,
		clearHistory,
		takeSnapshot,
		scheduleHistorySnapshot,
		relativeTime,
		snapshotPreviewText,
		openHistoryModal,
		renderHistoryList,
		restoreSnapshot,
		trackEvent,
		printDocument,
		signInWithGoogle,
		signOutUser,
		updateAccountUI,
		updateCloudButtons,
		deriveDefaultTitle,
		openCloudSaveModal,
		saveToCloud,
		openDocumentsModal,
		renderCloudDocRow,
		loadCloudDocument,
		deleteCloudDocument,
	};
}
