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
var EMBED = window.rtEmbed || { embedded: false, host: '', parentOrigin: '' };

// UI strings used from JavaScript. Keep this block strict JSON: tools/build_i18n.py reads it, and each
// translated page overrides these via window.RT_I18N (generated from i18n/<lang>.json).
/* i18n:defaults:start */
var RT_DEFAULTS = {
	"account": "Account",
	"myDocuments": "My Documents",
	"signOut": "Sign out",
	"signInFailed": "Sign-in failed: {msg}",
	"untitledDocument": "Untitled document",
	"saveFailed": "Failed to save document.",
	"loadDocsFailed": "Could not load documents: {msg}",
	"open": "Open",
	"deleteConfirm": "Delete this document? This cannot be undone.",
	"loadingShared": "Loading shared document…",
	"sharedLoadFailed": "Could not load the shared document.",
	"justNow": "Just now",
	"emptyDocument": "(empty document)",
	"restore": "Restore",
	"copied": "Copied!",
	"gistTokenRequired": "Please enter a GitHub personal access token.",
	"creating": "Creating…",
	"createGist": "Create Gist",
	"gistCreated": "Gist created! URL updated above — copy and share it.",
	"gistApiError": "GitHub API error ({status})",
	"gistFailed": "Failed to create Gist.",
	"unsupportedVideo": "Unsupported URL — paste a YouTube or Vimeo link.",
	"imageLoadFailed": "Could not load image — please check the URL.",
	"counter": "Words: {words} | Characters: {chars}",
	"darkMode": "Dark Mode",
	"lightMode": "Light Mode",
	"fullscreen": "Fullscreen",
	"exitFullscreen": "Exit Fullscreen",
	"noMatches": "No matches",
	"matchOf": "{current} of {total}",
	"allReplaced": "All replaced",
	"editingOn": "Editing",
	"editingOff": "Read-only",
	"signInUnavailable": "Sign-in is unavailable: Google services could not be loaded. Check your connection or content blocker and try again.",
	"close": "Close",
	"clipboardBlocked": "Your browser blocked clipboard access. Use Ctrl/Cmd+C, X or V instead.",
	"exportFailed": "Could not create the file. Please try again.",
	"savedLocal": "Saved in this browser",
	"savedCloud": "Saved to your account",
	"cloudDirty": "Changes not saved to your account yet",
	"cloudHint": "You're signed in. Use the cloud button in the toolbar to save this document to your account and open it on any device.",
	"saveLocalFailed": "Couldn't save in this browser: storage is full. Export or copy your work.",
	"otherTabChanged": "This document was changed in another tab. Your version here is kept in Version history.",
	"loadOtherTab": "Load the other version",
	"keepMine": "Keep this version",
	"cloudTooLarge": "This document is too large to save to your account (limit about 1 MB). Remove or shrink large images and try again."
};
/* i18n:defaults:end */

function rtT(key, vars) {
	var overrides = window.RT_I18N || {};
	var str = overrides[key] !== undefined ? overrides[key] : RT_DEFAULTS[key];
	return str.replace(/\{(\w+)\}/g, function(m, name) { return vars && vars[name] !== undefined ? vars[name] : m; });
}

// Writes the draft to localStorage. Returns false (and tells the user) when the browser refuses.
var pauseAutosave = false;
function saveLocal() {
	if (EMBED.embedded || pauseAutosave) return true;
	try {
		localStorage.setItem(STORAGE_KEY, editor.innerHTML);
		return true;
	} catch (e) {
		setSaveStatus('failed');
		return false;
	}
}

// URL length above which we warn and suggest GitHub Gist
var URL_SHARE_THRESHOLD = 2000;

// ── Usage metrics ────────────────────────────────────────────────────────────

function trackEvent(name, params) {
	if (typeof gtag === 'function') gtag('event', name, params || {});
}

// ── HTML sanitising ──────────────────────────────────────────────────────────
// DOMPurify drops <iframe> by default, which erased saved YouTube/Vimeo embeds. Allow iframes, then keep
// only those that point at the two embed URLs insertVideo() can create.

var VIDEO_SRC_RE = /^https:\/\/(www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d+)$/;

function sanitizeHtml(html) {
	var frag = DOMPurify.sanitize(html, {
		ADD_TAGS: ['iframe'],
		ADD_ATTR: ['allowfullscreen', 'frameborder', 'loading', 'contenteditable'],
		RETURN_DOM_FRAGMENT: true
	});
	frag.querySelectorAll('iframe').forEach(function(f) {
		if (!VIDEO_SRC_RE.test(f.getAttribute('src') || '')) f.remove();
	});
	var box = document.createElement('div');
	box.appendChild(frag);
	return box.innerHTML;
}

// ── Auth and cloud persistence (Firebase, loaded on demand) ──────────────────
// The Firebase SDK is about 150 KB, so it only loads when someone signs in, hovers the sign-in button,
// or was signed in on a previous visit. If it can't load (content blockers, restricted networks) the
// editor keeps working and only sign-in is unavailable.

var currentUser = null;
var currentCloudDocId = null;
var currentCloudTitle = null;

var FIREBASE_BASE = 'https://www.gstatic.com/firebasejs/10.13.2/';
var FIREBASE_APP = { file: 'firebase-app-compat.js', integrity: 'sha384-+65NgAKqXr1Nb7sBmV6O09pL8ASqZsi29OE718meKinGAWaa70VE5V6LNjXVBjIA' };
var FIREBASE_MORE = [
	{ file: 'firebase-auth-compat.js', integrity: 'sha384-I1LYojsZ5RM1cOda44Z2h42Qa6YfsQ1XkXxREnhp4ueYBR/4d1pG1K+NZM537Vsj' },
	{ file: 'firebase-firestore-compat.js', integrity: 'sha384-YHSscHG455M7b+d6r5ibTMznxrZxV272bMjXT9ndTgmx05fLR7HsdmcVklhpBSyt' }
];
var FIREBASE_CONFIG = {
	apiKey: 'AIzaSyBsEkDEf1qqDVlQUpsUc5qG_SbPuNPiTQI',
	authDomain: 'richtext-online.firebaseapp.com',
	projectId: 'richtext-online',
	storageBucket: 'richtext-online.firebasestorage.app',
	messagingSenderId: '483792477186',
	appId: '1:483792477186:web:40083f00456bc496e75b1b'
};
var AUTH_HINT_KEY = 'richtext-online-signed-in';
var firebaseLoading = null;

function loadScriptOnce(item) {
	return new Promise(function(resolve, reject) {
		var el = document.createElement('script');
		el.src = FIREBASE_BASE + item.file;
		el.integrity = item.integrity;
		el.crossOrigin = 'anonymous';
		el.onload = resolve;
		el.onerror = function() { reject(new Error('Could not load ' + item.file)); };
		document.head.appendChild(el);
	});
}

function loadFirebase() {
	if (EMBED.embedded) return Promise.reject(new Error('Firebase is not available in embed mode'));
	if (firebaseLoading) return firebaseLoading;
	firebaseLoading = loadScriptOnce(FIREBASE_APP)
		.then(function() { return Promise.all(FIREBASE_MORE.map(loadScriptOnce)); })
		.then(function() {
			if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
			firebase.auth().onAuthStateChanged(function(user) {
				currentUser = user;
				try {
					if (user) localStorage.setItem(AUTH_HINT_KEY, '1');
					else localStorage.removeItem(AUTH_HINT_KEY);
				} catch (e) {}
				if (!user) {
					currentCloudDocId = null;
					currentCloudTitle = null;
				}
				updateAccountUI(user);
				updateCloudButtons();
			});
		})
		.catch(function(e) {
			firebaseLoading = null;
			throw e;
		});
	return firebaseLoading;
}

function prefetchFirebase() {
	loadFirebase().catch(function() {});
}

function getDb() {
	return firebase.firestore();
}

function signInWithGoogle() {
	loadFirebase()
		.then(function() {
			return firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
		})
		.then(function() {
			trackEvent('login', { method: 'Google' });
			showCloudHint();
		})
		.catch(function(e) {
			if (!e || !e.code) {
				alert(rtT('signInUnavailable'));
			} else if (e.code !== 'auth/cancelled-popup-request' && e.code !== 'auth/popup-closed-by-user') {
				alert(rtT('signInFailed', { msg: e.message }));
			}
		});
}

function signOutUser() {
	firebase.auth().signOut().then(function() { trackEvent('logout'); });
}

(function warmUpSignIn() {
	if (EMBED.embedded) return;
	var btn = document.getElementById('btn-signin');
	['pointerenter', 'pointerdown', 'focus', 'touchstart'].forEach(function(type) {
		if (btn) btn.addEventListener(type, prefetchFirebase, { once: true, passive: true });
	});
	try {
		if (localStorage.getItem(AUTH_HINT_KEY) === '1') prefetchFirebase();
	} catch (e) {}
})();

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
		btn.title = user.displayName || user.email || rtT('account');

		var emailItem = document.createElement('li');
		var emailText = document.createElement('span');
		emailText.className = 'dropdown-item-text small text-muted';
		emailText.textContent = user.email || '';
		emailItem.appendChild(emailText);

		var docsItem = document.createElement('li');
		var docsBtn = document.createElement('button');
		docsBtn.className = 'dropdown-item';
		docsBtn.textContent = rtT('myDocuments');
		docsBtn.onclick = openDocumentsModal;
		docsItem.appendChild(docsBtn);

		var dividerItem = document.createElement('li');
		dividerItem.innerHTML = '<hr class="dropdown-divider">';

		var signOutItem = document.createElement('li');
		var signOutBtn = document.createElement('button');
		signOutBtn.className = 'dropdown-item';
		signOutBtn.textContent = rtT('signOut');
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
	return text.slice(0, 60) || rtT('untitledDocument');
}

function openCloudSaveModal() {
	if (!currentUser) { signInWithGoogle(); return; }
	if (!editor.textContent.trim()) return;
	document.getElementById('cloud-save-title').value = currentCloudTitle || deriveDefaultTitle();
	document.getElementById('cloud-save-as-new').style.display = currentCloudDocId ? '' : 'none';
	document.getElementById('cloud-save-error').style.display = 'none';
	new bootstrap.Modal(document.getElementById('cloudSaveModal')).show();
}

// Firestore documents are limited to 1 MiB; leave headroom for the other fields.
var CLOUD_MAX_BYTES = 950000;

async function saveToCloud(asNew) {
	if (!currentUser) return;
	var title = document.getElementById('cloud-save-title').value.trim() || rtT('untitledDocument');
	var errorEl = document.getElementById('cloud-save-error');
	var btn = document.getElementById('btn-confirm-cloud-save');
	errorEl.style.display = 'none';
	btn.disabled = true;
	try {
		var db = getDb();
		var size = new Blob([editor.innerHTML]).size;
		if (size > CLOUD_MAX_BYTES) throw new Error(rtT('cloudTooLarge'));
		var payload = {
			ownerId: currentUser.uid,
			ownerEmail: currentUser.email || null,
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
		setSaveStatus('cloud');
		var modalEl = document.getElementById('cloudSaveModal');
		var modal = bootstrap.Modal.getInstance(modalEl);
		if (modal) modal.hide();
	} catch (e) {
		errorEl.textContent = e.message || rtT('saveFailed');
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
			emptyEl.textContent = rtT('loadDocsFailed', { msg: e.message });
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
	titleEl.textContent = data.title || rtT('untitledDocument');
	var timeEl = document.createElement('div');
	timeEl.className = 'text-muted small';
	timeEl.textContent = data.updatedAt ? relativeTime(data.updatedAt.toMillis()) : '';
	info.appendChild(titleEl);
	info.appendChild(timeEl);

	var actions = document.createElement('div');
	actions.className = 'd-flex gap-1 flex-shrink-0';
	var openBtn = document.createElement('button');
	openBtn.className = 'btn btn-sm btn-outline-primary';
	openBtn.textContent = rtT('open');
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
		editor.innerHTML = sanitizeHtml(data.content || '');
		currentCloudDocId = docId;
		currentCloudTitle = data.title || title;
		dismissSharedBanner();
		history.replaceState(null, '', location.pathname);
		saveLocal();
		updateCounter();
		updateEditorActions();
		trackEvent('document_load_cloud');
		setSaveStatus('cloud');
		var modalEl = document.getElementById('documentsModal');
		var modal = bootstrap.Modal.getInstance(modalEl);
		if (modal) modal.hide();
	});
}

function deleteCloudDocument(docId, rowEl) {
	if (!confirm(rtT('deleteConfirm'))) return;
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

// ── Embed mode ───────────────────────────────────────────────────────────────
// Content comes only from the host page (embed.js). Never read or write the visitor's own
// richtext.online localStorage here, or a host site could see their saved drafts.

var embedChangeTimer = null;

function postToParent(msg) {
	if (!EMBED.parentOrigin || window.parent === window) return;
	msg.rt = 1;
	window.parent.postMessage(msg, EMBED.parentOrigin);
}

function notifyParentOfChange() {
	clearTimeout(embedChangeTimer);
	embedChangeTimer = setTimeout(function() {
		postToParent({ type: 'change', html: editor.innerHTML });
	}, 300);
}

function initEmbedMode() {
	editor.innerHTML = '';
	editor.style.visibility = 'visible';
	window.addEventListener('message', function(e) {
		if (e.source !== window.parent || e.origin !== EMBED.parentOrigin) return;
		var d = e.data;
		if (!d || d.rt !== 1) return;
		if (d.type === 'setHTML') {
			editor.innerHTML = sanitizeHtml(String(d.html || ''));
			updateCounter();
			updateEditorActions();
		} else if (d.type === 'getHTML') {
			postToParent({ type: 'html', id: d.id, html: editor.innerHTML });
		}
	});
	postToParent({ type: 'ready' });
}

(function initContent() {
	if (EMBED.embedded) {
		initEmbedMode();
		updateCounter();
		updateEditorActions();
		return;
	}
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
		if (saved) {
			editor.innerHTML = saved;
			setSaveStatus('local');
		}
	} catch (e) {}
}

function restoreFromHash(compressed) {
	try {
		var html = LZString.decompressFromEncodedURIComponent(compressed);
		if (html) {
			editor.innerHTML = sanitizeHtml(html);
			showSharedBanner();
			return;
		}
	} catch (e) {}
	restoreFromStorage();
}

function showSharedLoadError() {
	editor.innerHTML = '<p class="text-danger"></p>';
	editor.querySelector('p').textContent = rtT('sharedLoadFailed');
}

function restoreFromGist(gistId) {
	editor.innerHTML = '<p class="text-muted"><em></em></p>';
	editor.querySelector('em').textContent = rtT('loadingShared');
	fetch('https://api.github.com/gists/' + gistId)
		.then(function(r) { return r.json(); })
		.then(function(data) {
			var files = data.files;
			var file = files && (files['document.html'] || Object.values(files)[0]);
			if (file && file.content) {
				editor.innerHTML = sanitizeHtml(file.content);
				updateCounter();
				updateEditorActions();
				showSharedBanner();
			} else {
				showSharedLoadError();
			}
		})
		.catch(function() {
			showSharedLoadError();
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
	currentCloudDocId = null;
	currentCloudTitle = null;
	setSaveStatus('');
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
	// History is a convenience: if storage is full, keep fewer snapshots rather than
	// competing with the live draft for space.
	while (list.length) {
		try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); return; } catch (e) { list.shift(); }
	}
	try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
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
	if (mins < 1) return rtT('justNow');
	var rtf = new Intl.RelativeTimeFormat(document.documentElement.lang || 'en', { numeric: 'auto' });
	if (mins < 60) return rtf.format(-mins, 'minute');
	var hours = Math.round(mins / 60);
	if (hours < 24) return rtf.format(-hours, 'hour');
	return rtf.format(-Math.round(hours / 24), 'day');
}

function snapshotPreviewText(content) {
	var div = document.createElement('div');
	div.innerHTML = content;
	var text = (div.textContent || '').trim().replace(/\s+/g, ' ');
	return text.length > 120 ? text.slice(0, 120) + '…' : (text || rtT('emptyDocument'));
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
		btn.textContent = rtT('restore');
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
	editor.innerHTML = sanitizeHtml(snap.content);
	lastSnapshotContent = editor.innerHTML;
	saveLocal();
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
		document.getElementById('share-copy-feedback').textContent = rtT('copied');
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
		errorEl.textContent = rtT('gistTokenRequired');
		errorEl.style.display = '';
		return;
	}
	btn.disabled = true;
	btn.textContent = rtT('creating');
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
			throw new Error(err.message || rtT('gistApiError', { status: resp.status }));
		}
		var data = await resp.json();
		var shareUrl = location.origin + location.pathname + '?gist=' + data.id;
		document.getElementById('share-url-input').value = shareUrl;
		document.getElementById('share-url-warning').style.display = 'none';
		document.getElementById('share-gist-section').style.display = 'none';
		successEl.textContent = rtT('gistCreated');
		successEl.style.display = '';
		trackEvent('share_gist');
	} catch (e) {
		errorEl.textContent = e.message || rtT('gistFailed');
		errorEl.style.display = '';
	} finally {
		btn.disabled = false;
		btn.textContent = rtT('createGist');
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

var colorTrackTimers = {};

function execCommandWithArg(command, arg) {
	restoreSelection();
	if (command === 'foreColor') currentForeColor = arg;
	var params = { command: command };
	if (command === 'formatBlock' || command === 'fontName' || command === 'fontSize') params.value = arg;
	if (command === 'foreColor' || command === 'hiliteColor') {
		clearTimeout(colorTrackTimers[command]);
		colorTrackTimers[command] = setTimeout(function() { trackEvent('format', params); }, 1000);
	} else {
		trackEvent('format', params);
	}
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
		try { await navigator.clipboard.writeText(sel.toString()); } catch (e) { showToast(rtT('clipboardBlocked')); }
	}
}

async function pasteText() {
	try {
		var text = await navigator.clipboard.readText();
		restoreSelection();
		document.execCommand('insertText', false, text);
	} catch (err) {
		showToast(rtT('clipboardBlocked'));
	}
}

async function cutText() {
	var sel = window.getSelection();
	if (sel && sel.toString()) {
		try {
			await navigator.clipboard.writeText(sel.toString());
			document.execCommand('delete');
		} catch (e) { showToast(rtT('clipboardBlocked')); }
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
		showUrlError(rtT('unsupportedVideo'));
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
		showUrlError(rtT('imageLoadFailed'));
	};
	img.src = url;
}

// Large photos are scaled down and re-encoded so they fit in localStorage, the Firestore
// document limit and share links. GIF and SVG are left alone (animation / vector).
var IMAGE_MAX_SIDE = 1600;

function shrinkImage(file, done) {
	var reader = new FileReader();
	reader.onload = function(e) {
		var original = e.target.result;
		if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { done(original); return; }
		var img = new Image();
		img.onload = function() {
			var scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
			var w = Math.max(1, Math.round(img.naturalWidth * scale));
			var h = Math.max(1, Math.round(img.naturalHeight * scale));
			if (scale === 1 && original.length < 200000) { done(original); return; }
			try {
				var canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);
				var out = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.85) : canvas.toDataURL('image/webp', 0.85);
				// Browsers that can't write WebP silently return PNG; keep whichever is smaller.
				done(out.length < original.length ? out : original);
			} catch (err) {
				done(original);
			}
		};
		img.onerror = function() { done(original); };
		img.src = original;
	};
	reader.readAsDataURL(file);
}

function insertImageFromFile(input) {
	var file = input.files && input.files[0];
	if (!file) return;
	shrinkImage(file, function(dataUrl) {
		trackEvent('insert_image', { source: 'file' });
		restoreSelection();
		document.execCommand('insertImage', false, dataUrl);
	});
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
	var el = document.getElementById('counter-text') || document.getElementById('editor-counter');
	if (!el) return;
	var text = editor.textContent || '';
	var words = text.trim() ? text.trim().split(/\s+/).length : 0;
	el.textContent = rtT('counter', { words: words, chars: text.length });
}

function updateEditorActions() {
	var empty = editor.textContent.trim() === '';
	editor.classList.toggle('is-empty', empty && !editor.querySelector('img, table, iframe, hr'));
	['btn-export-menu', 'btn-share'].forEach(function(id) {
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
	if (EMBED.embedded) {
		notifyParentOfChange();
		return;
	}
	if (currentCloudDocId) setSaveStatus('dirty');
	clearTimeout(saveTimer);
	saveTimer = setTimeout(function() {
		if (pauseAutosave) return;
		if (saveLocal() && !currentCloudDocId) setSaveStatus(editor.textContent.trim() ? 'local' : '');
	}, 500);
	scheduleHistorySnapshot();
});

// Another tab saved a different draft. Hold our own autosave until the person chooses,
// and keep our version in history so neither side's work is lost.
window.addEventListener('storage', function(e) {
	if (EMBED.embedded || e.storageArea !== localStorage || e.key !== STORAGE_KEY) return;
	if (document.getElementById('tab-conflict')) return;
	if ((e.newValue || '') === editor.innerHTML) return;
	takeSnapshot();
	pauseAutosave = true;
	var bar = document.createElement('div');
	bar.id = 'tab-conflict';
	bar.className = 'alert alert-warning d-flex align-items-center flex-wrap gap-2 py-2 px-3 mb-2 small';
	bar.setAttribute('role', 'alert');
	var text = document.createElement('span');
	text.style.flex = '1 1 240px';
	text.textContent = rtT('otherTabChanged');
	var load = document.createElement('button');
	load.type = 'button';
	load.className = 'btn btn-sm btn-warning';
	load.textContent = rtT('loadOtherTab');
	var keep = document.createElement('button');
	keep.type = 'button';
	keep.className = 'btn btn-sm btn-outline-secondary';
	keep.textContent = rtT('keepMine');
	function finish() { bar.remove(); pauseAutosave = false; }
	load.addEventListener('click', function() {
		var latest = '';
		try { latest = localStorage.getItem(STORAGE_KEY) || ''; } catch (err) {}
		editor.innerHTML = sanitizeHtml(latest);
		finish();
		updateCounter();
		updateEditorActions();
		setSaveStatus(editor.textContent.trim() ? 'local' : '');
	});
	keep.addEventListener('click', function() {
		finish();
		if (saveLocal() && !currentCloudDocId) setSaveStatus(editor.textContent.trim() ? 'local' : '');
	});
	bar.appendChild(text);
	bar.appendChild(load);
	bar.appendChild(keep);
	var toolbar = document.getElementById('toolbar');
	toolbar.parentNode.insertBefore(bar, toolbar);
});

function clearAll() {
	trackEvent('clear_all');
	editor.focus();
	document.execCommand('selectAll');
	document.execCommand('delete');
	currentForeColor = null;
	if (!EMBED.embedded) {
		try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
		clearHistory();
		if (!currentCloudDocId) setSaveStatus('');
	}
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

// The editor's HTML without transient UI such as find-and-replace highlights.
function exportableHtml() {
	var clone = editor.cloneNode(true);
	clone.querySelectorAll('mark.find-match').forEach(function(m) {
		while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
		m.remove();
	});
	return clone.innerHTML;
}

function downloadBlob(blob, filename) {
	var a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

function exportHTML() {
	trackEvent('export_html');
	var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' + exportableHtml() + '</body></html>';
	downloadBlob(new Blob([html], { type: 'text/html' }), 'document.html');
}

function exportText() {
	trackEvent('export_text');
	downloadBlob(new Blob([editor.innerText], { type: 'text/plain;charset=utf-8' }), 'document.txt');
}

var exporterLoading = null;
function loadExporter() {
	if (window.RTExport) return Promise.resolve();
	if (exporterLoading) return exporterLoading;
	exporterLoading = new Promise(function(resolve, reject) {
		var el = document.createElement('script');
		el.src = '/export.js?v=1';
		el.onload = resolve;
		el.onerror = function() { exporterLoading = null; reject(new Error('Could not load export.js')); };
		document.head.appendChild(el);
	});
	return exporterLoading;
}

function exportMarkdown() {
	trackEvent('export_markdown');
	loadExporter()
		.then(function() { downloadBlob(new Blob([RTExport.toMarkdown(editor)], { type: 'text/markdown;charset=utf-8' }), 'document.md'); })
		.catch(function() { showToast(rtT('exportFailed')); });
}

function exportDocx() {
	trackEvent('export_docx');
	loadExporter()
		.then(function() { return RTExport.toDocx(editor); })
		.then(function(blob) { downloadBlob(blob, 'document.docx'); })
		.catch(function() { showToast(rtT('exportFailed')); });
}

function copyViaSelection() {
	var sel = window.getSelection(), saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null, ok = false;
	var range = document.createRange();
	range.selectNodeContents(editor);
	sel.removeAllRanges();
	sel.addRange(range);
	try { ok = document.execCommand('copy'); } catch (e) {}
	sel.removeAllRanges();
	if (saved) sel.addRange(saved);
	showToast(rtT(ok ? 'copied' : 'clipboardBlocked'));
}

async function copyFormatted() {
	trackEvent('copy_formatted');
	var html = exportableHtml(), text = editor.innerText;
	try {
		if (!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)) throw new Error('unsupported');
		await navigator.clipboard.write([new ClipboardItem({
			'text/html': new Blob([html], { type: 'text/html' }),
			'text/plain': new Blob([text], { type: 'text/plain' })
		})]);
		showToast(rtT('copied'));
	} catch (e) {
		copyViaSelection();
	}
}

async function copyHtml() {
	trackEvent('copy_html');
	try {
		await navigator.clipboard.writeText(exportableHtml());
		showToast(rtT('copied'));
	} catch (e) {
		showToast(rtT('clipboardBlocked'));
	}
}

// ── Small status messages ─────────────────────────────────────────────────────

var toastTimer = null;
function showToast(text) {
	var t = document.getElementById('rt-toast');
	if (!t) {
		t = document.createElement('div');
		t.id = 'rt-toast';
		t.setAttribute('role', 'status');
		t.setAttribute('aria-live', 'polite');
		document.body.appendChild(t);
	}
	t.textContent = text;
	t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2600);
}

// Tells people where their work is: this browser, or their account.
function setSaveStatus(kind) {
	if (EMBED.embedded) return;
	var el = document.getElementById('save-status');
	if (!el) return;
	var key = { local: 'savedLocal', cloud: 'savedCloud', dirty: 'cloudDirty', failed: 'saveLocalFailed' }[kind];
	el.textContent = key ? rtT(key) : '';
	el.classList.toggle('text-warning-emphasis', kind === 'dirty');
	el.classList.toggle('text-danger', kind === 'failed');
}

function showCloudHint() {
	var toolbar = document.getElementById('toolbar');
	if (EMBED.embedded || !toolbar || document.getElementById('cloud-hint')) return;
	var bar = document.createElement('div');
	bar.id = 'cloud-hint';
	bar.className = 'alert alert-success d-flex align-items-center gap-2 py-2 px-3 mb-2 small';
	bar.setAttribute('role', 'status');
	var text = document.createElement('span');
	text.style.flex = '1';
	text.textContent = rtT('cloudHint');
	var close = document.createElement('button');
	close.type = 'button';
	close.className = 'btn-close';
	close.setAttribute('aria-label', rtT('close'));
	var btn = document.getElementById('btn-cloud-save');
	function done() { bar.remove(); if (btn) btn.classList.remove('pulse'); }
	close.addEventListener('click', done);
	bar.appendChild(text);
	bar.appendChild(close);
	toolbar.parentNode.insertBefore(bar, toolbar);
	if (btn) btn.classList.add('pulse');
	setTimeout(done, 20000);
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
var THEME_KEY = 'richtext-online-theme';

function applyDarkMode(on) {
	isDarkMode = on;
	document.documentElement.setAttribute('data-bs-theme', on ? 'dark' : 'light');
	document.body.classList.toggle('dark-mode', on);
	var btn = document.getElementById('btn-dark-mode');
	if (btn) {
		btn.innerHTML = on ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
		btn.title = on ? rtT('lightMode') : rtT('darkMode');
	}
}

function toggleDarkMode() {
	applyDarkMode(!isDarkMode);
	trackEvent('toggle_dark_mode', { enabled: isDarkMode });
	if (!EMBED.embedded) {
		try { localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light'); } catch (e) {}
	}
}

// A saved choice wins; otherwise follow the system setting. Embeds stay light (the host
// page controls them, and we never read the visitor's storage there).
(function initTheme() {
	if (EMBED.embedded) return;
	var saved = null;
	try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
	var dark = saved ? saved === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
	if (dark) applyDarkMode(true);
})();

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
		el.textContent = lastFindTerm ? rtT('noMatches') : '';
	} else {
		el.textContent = rtT('matchOf', { current: findIndex + 1, total: findMatches.length });
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
	if (el) el.textContent = rtT('allReplaced');
}

function toggleFullscreen() {
	var container = document.querySelector('.container-lg');
	var btn = document.getElementById('btn-fullscreen');
	isFullscreen = !isFullscreen;
	trackEvent('toggle_fullscreen', { enabled: isFullscreen });
	container.classList.toggle('editor-fullscreen', isFullscreen);
	if (btn) {
		btn.innerHTML = isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
		btn.title = isFullscreen ? rtT('exitFullscreen') : rtT('fullscreen');
	}
}

function toggleEdit() {
	var btn = document.getElementById('btn-toggle-edit');
	if (isInEditMode) {
		editor.contentEditable = 'false';
		isInEditMode = false;
		trackEvent('toggle_edit', { enabled: false });
		btn.textContent = rtT('editingOff');
		btn.classList.replace('btn-success', 'btn-outline-danger');
		setToolbarDisabled(true, 'btn-toggle-edit');
	} else {
		editor.contentEditable = 'true';
		isInEditMode = true;
		trackEvent('toggle_edit', { enabled: true });
		btn.textContent = rtT('editingOn');
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

// Toolbar menus use fixed positioning so they are not clipped by the phone-width scrolling toolbar.
(function initToolbarMenus() {
	if (!window.bootstrap) return;
	document.querySelectorAll('#toolbar [data-bs-toggle="dropdown"]').forEach(function(el) {
		bootstrap.Dropdown.getOrCreateInstance(el, { popperConfig: function(cfg) { cfg.strategy = 'fixed'; return cfg; } });
	});
})();

// Installable and usable offline. The worker is network-first, so deployments are never masked by a stale cache.
if ('serviceWorker' in navigator && !EMBED.embedded && (location.protocol === 'https:' || location.hostname === 'localhost')) {
	window.addEventListener('load', function() {
		navigator.serviceWorker.register('/sw.js').catch(function() {});
		// The worker only sees requests made after it takes control, so hand it what this visit already loaded.
		navigator.serviceWorker.ready.then(function(reg) {
			var urls = performance.getEntriesByType('resource').map(function(r) { return r.name; });
			urls.push(location.origin + location.pathname);
			if (reg.active) reg.active.postMessage({ type: 'precache', urls: urls });
		}).catch(function() {});
	});
}

// ── Language suggestion ──────────────────────────────────────────────────────
// Shown only on the English page, only when the browser's first language has a translation, and never
// replaces the page or redirects: it is a dismissible link. Each message is written in its own language.

var LANG_SUGGESTIONS = {
	ja: { path: '/ja/', text: 'このサイトは日本語でもご利用いただけます。', cta: '日本語で開く', close: '閉じる' },
	fr: { path: '/fr/', text: 'Ce site est disponible en français.', cta: 'Passer en français', close: 'Fermer' },
	es: { path: '/es/', text: 'Este sitio está disponible en español.', cta: 'Cambiar a español', close: 'Cerrar' },
	ar: { path: '/ar/', text: 'هذا الموقع متاح بالعربية.', cta: 'التبديل إلى العربية', close: 'إغلاق' },
	pt: { path: '/pt/', text: 'Este site está disponível em português.', cta: 'Mudar para português', close: 'Fechar' },
	ru: { path: '/ru/', text: 'Этот сайт доступен на русском языке.', cta: 'Открыть на русском', close: 'Закрыть' },
	de: { path: '/de/', text: 'Diese Website ist auch auf Deutsch verfügbar.', cta: 'Auf Deutsch öffnen', close: 'Schließen' },
	zh: { path: '/zh/', lang: 'zh-Hans', text: '本网站也提供简体中文版本。', cta: '切换到简体中文', close: '关闭' },
	ko: { path: '/ko/', text: '이 사이트는 한국어로도 이용하실 수 있습니다.', cta: '한국어로 열기', close: '닫기' },
	vi: { path: '/vi/', text: 'Trang web này cũng có tiếng Việt.', cta: 'Chuyển sang tiếng Việt', close: 'Đóng' },
	id: { path: '/id/', text: 'Situs ini juga tersedia dalam Bahasa Indonesia.', cta: 'Buka dalam Bahasa Indonesia', close: 'Tutup' }
};
var LANG_DISMISS_KEY = 'richtext-online-lang-dismissed';

function suggestLanguage() {
	if (EMBED.embedded || document.documentElement.lang !== 'en') return;
	// A shared document lives in this URL's hash/query; the link would lose it.
	if (location.hash.indexOf('#v1:') === 0 || location.search.indexOf('gist=') !== -1) return;
	var first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
	var tag = first.toLowerCase(), code = tag.split('-')[0];
	// Traditional Chinese readers (zh-TW, zh-HK, zh-Hant) should not be sent to the Simplified page.
	if (code === 'zh' && /-(tw|hk|mo|hant)\b/.test(tag)) return;
	var s = LANG_SUGGESTIONS[code];
	var toolbar = document.getElementById('toolbar');
	if (!s || !toolbar) return;
	try { if (localStorage.getItem(LANG_DISMISS_KEY) === '1') return; } catch (e) {}

	var bar = document.createElement('div');
	bar.id = 'lang-suggestion';
	bar.className = 'alert alert-info d-flex align-items-center gap-2 py-2 px-3 mb-2 small';
	bar.setAttribute('role', 'note');
	bar.lang = s.lang || code;
	bar.dir = code === 'ar' ? 'rtl' : 'ltr';

	var text = document.createElement('span');
	text.style.flex = '1';
	text.textContent = s.text;
	var link = document.createElement('a');
	link.className = 'btn btn-sm btn-primary text-nowrap';
	link.href = s.path;
	link.hreflang = s.lang || code;
	link.textContent = s.cta;
	var close = document.createElement('button');
	close.type = 'button';
	close.className = 'btn-close';
	close.setAttribute('aria-label', s.close);

	function remember() { try { localStorage.setItem(LANG_DISMISS_KEY, '1'); } catch (e) {} }
	link.addEventListener('click', function() {
		remember();
		trackEvent('language_suggestion', { action: 'accept', language: code });
	});
	close.addEventListener('click', function() {
		remember();
		bar.remove();
		trackEvent('language_suggestion', { action: 'dismiss', language: code });
	});

	bar.appendChild(text);
	bar.appendChild(link);
	bar.appendChild(close);
	toolbar.parentNode.insertBefore(bar, toolbar);
	trackEvent('language_suggestion', { action: 'shown', language: code });
}

suggestLanguage();

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
		exportText,
		exportMarkdown,
		exportDocx,
		copyFormatted,
		copyHtml,
		showToast,
		setSaveStatus,
		showCloudHint,
		sanitizeHtml,
		loadFirebase,
		suggestLanguage,
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
