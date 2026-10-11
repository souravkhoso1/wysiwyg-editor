/* RichText.online embeddable editor.
 *
 *   <div id="editor"></div>
 *   <script src="https://richtext.online/embed.js"></script>
 *   <script>
 *     var ed = RichTextEditor.create('#editor', { height: 500, content: '<p>Hello</p>' });
 *     ed.onChange(function(html) { ... });
 *     ed.getHTML().then(function(html) { ... });
 *   </script>
 *
 * Elements with a data-richtext-editor attribute are initialised automatically
 * (optional data-height / data-content).
 */
(function () {
	var script = document.currentScript;
	var base = script && script.src ? new URL(script.src).origin : 'https://richtext.online';

	function toCssSize(v) {
		return typeof v === 'number' ? v + 'px' : String(v);
	}

	function create(target, options) {
		options = options || {};
		var container = typeof target === 'string' ? document.querySelector(target) : target;
		if (!container) throw new Error('RichTextEditor: target element not found');

		var src = base + '/?embed=1' +
			'&embed_host=' + encodeURIComponent(location.hostname) +
			'&parent_origin=' + encodeURIComponent(location.origin);

		var iframe = document.createElement('iframe');
		iframe.src = src;
		iframe.title = 'Rich text editor';
		iframe.loading = 'lazy';
		iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
		iframe.style.cssText = 'width:100%;border:0;display:block;height:' + toCssSize(options.height || 500);

		var ready = false;
		var queue = [];
		var pending = {};
		var nextId = 1;
		var changeHandlers = options.onChange ? [options.onChange] : [];

		function send(msg) {
			msg.rt = 1;
			if (!ready) { queue.push(msg); return; }
			iframe.contentWindow.postMessage(msg, base);
		}

		function onMessage(e) {
			if (e.source !== iframe.contentWindow || e.origin !== base) return;
			var d = e.data;
			if (!d || d.rt !== 1) return;
			if (d.type === 'ready') {
				ready = true;
				if (options.content) send({ type: 'setHTML', html: options.content });
				var q = queue;
				queue = [];
				q.forEach(send);
				if (options.onReady) options.onReady();
			} else if (d.type === 'change') {
				changeHandlers.forEach(function (fn) { fn(d.html); });
			} else if (d.type === 'html' && pending[d.id]) {
				pending[d.id](d.html);
				delete pending[d.id];
			}
		}
		window.addEventListener('message', onMessage);
		container.appendChild(iframe);

		return {
			iframe: iframe,
			getHTML: function () {
				return new Promise(function (resolve, reject) {
					var id = nextId++;
					pending[id] = resolve;
					send({ type: 'getHTML', id: id });
					setTimeout(function () {
						if (pending[id]) {
							delete pending[id];
							reject(new Error('RichTextEditor: getHTML timed out'));
						}
					}, 5000);
				});
			},
			setHTML: function (html) { send({ type: 'setHTML', html: html }); },
			onChange: function (fn) { changeHandlers.push(fn); },
			destroy: function () {
				window.removeEventListener('message', onMessage);
				if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
			}
		};
	}

	function autoInit() {
		document.querySelectorAll('[data-richtext-editor]').forEach(function (el) {
			if (el.dataset.richtextInitialised) return;
			el.dataset.richtextInitialised = '1';
			create(el, { height: el.dataset.height || 500, content: el.dataset.content || '' });
		});
	}

	window.RichTextEditor = { create: create };

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
	else autoInit();
})();
