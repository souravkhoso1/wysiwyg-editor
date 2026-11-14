/* Markdown and Word (.docx) exporters. Loaded on demand by editor.js; no dependencies.
 *
 *   RTExport.toMarkdown(rootElement)        -> string
 *   RTExport.toDocx(rootElement)            -> Promise<Blob>
 *
 * Both walk the live editor DOM (computed styles are read to catch pasted content such as
 * <span style="font-weight:700">), so pass the real #editor, not a detached copy. */
(function () {
	'use strict';

	var INLINE = { A: 1, ABBR: 1, B: 1, BDO: 1, BR: 1, CITE: 1, CODE: 1, DEL: 1, EM: 1, FONT: 1, I: 1, IMG: 1, INS: 1, KBD: 1, MARK: 1, Q: 1, S: 1, SAMP: 1, SMALL: 1, SPAN: 1, STRIKE: 1, STRONG: 1, SUB: 1, SUP: 1, U: 1, VAR: 1 };
	var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };

	function isText(n) { return n.nodeType === 3; }
	function isEl(n) { return n.nodeType === 1; }
	function isInline(n) { return isText(n) || (isEl(n) && INLINE[n.tagName] === 1); }
	function isVideoEmbed(n) { return isEl(n) && (n.tagName === 'IFRAME' || (n.classList && n.classList.contains('video-embed'))); }
	function videoSrc(n) { var f = n.tagName === 'IFRAME' ? n : n.querySelector('iframe'); return f ? f.getAttribute('src') || '' : ''; }
	function cs(el) { return window.getComputedStyle(el); }
	function safeHref(h) { return /^(https?:|mailto:)/i.test(h || '') ? h : ''; }

	// Style flags that came from CSS rather than a semantic tag (pasted content). Compared with the parent
	// so nested spans don't repeat what an ancestor already applies.
	function cssFlags(el) {
		var s = cs(el), p = el.parentElement ? cs(el.parentElement) : s;
		return {
			bold: parseInt(s.fontWeight, 10) >= 600 && !(parseInt(p.fontWeight, 10) >= 600),
			italic: s.fontStyle === 'italic' && p.fontStyle !== 'italic',
			underline: s.textDecorationLine.indexOf('underline') !== -1 && p.textDecorationLine.indexOf('underline') === -1,
			strike: s.textDecorationLine.indexOf('line-through') !== -1 && p.textDecorationLine.indexOf('line-through') === -1
		};
	}

	/* ───────────────────────────── Markdown ───────────────────────────── */

	function escapeMd(s) {
		return s.replace(/\\/g, '\\\\').replace(/([*_`\[\]])/g, '\\$1').replace(/</g, '\\<').replace(/~~/g, '\\~\\~');
	}
	function escapeLineStart(line) {
		line = line.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4');          // "1. text" would become a list
		return line.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|={2,}|-{3,}$)/, function (m, sp, tok) { return sp + '\\' + tok; });
	}
	function wrapMd(mark, inner) {
		var m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
		if (!m[2]) return inner;
		return m[1] + mark + m[2] + mark + m[3];
	}
	function codeSpan(text) {
		var ticks = '`';
		while (text.indexOf(ticks) !== -1) ticks += '`';
		var pad = /^`|`$/.test(text) ? ' ' : '';
		return ticks + pad + text + pad + ticks;
	}

	function mdInline(node, st) {
		if (isText(node)) return escapeMd(node.nodeValue.replace(/[ \t\r\n\u00a0]+/g, ' '));
		if (!isEl(node) || SKIP[node.tagName]) return '';
		var tag = node.tagName;
		if (tag === 'BR') return '  \n';
		if (tag === 'IMG') {
			var src = node.getAttribute('src') || '';
			if (!src) return '';
			return '![' + escapeMd(node.getAttribute('alt') || '') + '](' + src.replace(/ /g, '%20').replace(/\)/g, '%29') + ')';
		}
		if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') return codeSpan(node.textContent);
		var inner = mdChildrenInline(node, st);
		var f = (tag === 'SPAN' || tag === 'FONT' || tag === 'MARK') ? cssFlags(node) : {};
		var bold = tag === 'B' || tag === 'STRONG' || f.bold;
		var italic = tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR' || f.italic;
		var strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || f.strike;
		var underline = tag === 'U' || tag === 'INS' || f.underline;
		if (st && st.heading) bold = false;
		if (tag === 'SUB') inner = '<sub>' + inner + '</sub>';
		if (tag === 'SUP') inner = '<sup>' + inner + '</sup>';
		if (underline) inner = wrapTag('u', inner);
		if (strike) inner = wrapMd('~~', inner);
		if (italic) inner = wrapMd('*', inner);
		if (bold) inner = wrapMd('**', inner);
		if (tag === 'A') {
			var href = safeHref(node.getAttribute('href'));
			if (href && inner.trim()) inner = '[' + inner + '](' + href.replace(/ /g, '%20').replace(/\)/g, '%29') + ')';
		}
		return inner;
	}
	function wrapTag(tag, inner) {
		var m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
		return m[2] ? m[1] + '<' + tag + '>' + m[2] + '</' + tag + '>' + m[3] : inner;
	}
	function mdChildrenInline(el, st) {
		var out = '';
		for (var c = el.firstChild; c; c = c.nextSibling) out += mdInline(c, st);
		return out;
	}
	function tidyInline(s) {
		return s.replace(/^ +/, '').replace(/(?:  \n)+$/, '').replace(/ +$/, '');   // keep the two spaces of a hard line break
	}

	// Returns an array of block strings for the children of `parent`.
	function mdChildren(parent, st) {
		var blocks = [], inline = '';
		function flush() {
			var t = tidyInline(inline);
			if (t.trim()) blocks.push(escapeLineStart(t));
			inline = '';
		}
		for (var c = parent.firstChild; c; c = c.nextSibling) {
			if (isEl(c) && SKIP[c.tagName]) continue;
			if (isInline(c) && !isVideoEmbed(c)) { inline += mdInline(c, st); continue; }
			flush();
			var b = mdBlock(c, st);
			if (b) blocks.push(b);
		}
		flush();
		return blocks;
	}

	function mdBlock(el, st) {
		if (!isEl(el)) return '';
		var tag = el.tagName;
		if (isVideoEmbed(el)) { var v = videoSrc(el); return v ? '[Video](' + v + ')' : ''; }
		if (/^H[1-6]$/.test(tag)) {
			var text = tidyInline(mdChildrenInline(el, { heading: true })).replace(/\s*\n\s*/g, ' ');
			return text.trim() ? new Array(+tag[1] + 1).join('#') + ' ' + text : '';
		}
		if (tag === 'UL' || tag === 'OL') return mdList(el, st);
		if (tag === 'BLOCKQUOTE') {
			var q = mdChildren(el, st).join('\n\n');
			return q ? q.split('\n').map(function (l) { return l ? '> ' + l : '>'; }).join('\n') : '';
		}
		if (tag === 'PRE') {
			var code = el.textContent.replace(/\n+$/, '');
			var fence = '```';
			while (code.indexOf(fence) !== -1) fence += '`';
			return fence + '\n' + code + '\n' + fence;
		}
		if (tag === 'HR') return '---';
		if (tag === 'TABLE') return mdTable(el);
		return mdChildren(el, st).join('\n\n');
	}

	function mdList(el, st) {
		var ordered = el.tagName === 'OL', n = parseInt(el.getAttribute('start'), 10);
		if (isNaN(n)) n = 1;
		var items = [];
		for (var li = el.firstElementChild; li; li = li.nextElementSibling) {
			if (li.tagName !== 'LI') continue;
			var parts = mdChildren(li, st);
			var marker = ordered ? (n++) + '. ' : '- ';
			var pad = new Array(marker.length + 1).join(' ');
			var text = '';
			parts.forEach(function (p, i) {
				var isList = /^(\s*)([-*]|\d+\.)\s/.test(p) && i > 0;
				text += (i === 0 ? '' : (isList ? '\n' : '\n\n')) + p;
			});
			var lines = text.split('\n');
			items.push(marker + lines[0] + lines.slice(1).map(function (l) { return l ? '\n' + pad + l : '\n'; }).join(''));
		}
		return items.join('\n');
	}

	function mdTable(table) {
		var rows = [].slice.call(table.rows).map(function (r) {
			return [].slice.call(r.cells).map(function (c) {
				return tidyInline(mdChildrenInline(c, {})).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
			});
		});
		if (!rows.length) return '';
		var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
		function line(cells) { var a = cells.slice(); while (a.length < cols) a.push(''); return '| ' + a.join(' | ') + ' |'; }
		var sep = '|' + new Array(cols + 1).join(' --- |');
		return [line(rows[0]), sep].concat(rows.slice(1).map(line)).join('\n');
	}

	function toMarkdown(root) {
		return mdChildren(root, {}).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
	}

	/* ─────────────────────────────── ZIP ──────────────────────────────── */

	var CRC_TABLE = (function () {
		var t = [];
		for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
		return t;
	})();
	function crc32(bytes) {
		var c = 0xFFFFFFFF;
		for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
		return (c ^ 0xFFFFFFFF) >>> 0;
	}
	// Minimal ZIP writer using the "stored" method (no compression), which is valid for .docx.
	function zip(files) {
		var enc = new TextEncoder(), chunks = [], central = [], offset = 0, d = new Date();
		var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
		var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
		files.forEach(function (f) {
			var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
			var lh = new DataView(new ArrayBuffer(30));
			lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
			lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
			lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
			chunks.push(new Uint8Array(lh.buffer), name, f.data);
			var ch = new DataView(new ArrayBuffer(46));
			ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
			ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
			ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
			ch.setUint32(42, offset, true);
			central.push(new Uint8Array(ch.buffer), name);
			offset += 30 + name.length + size;
		});
		var cdSize = 0;
		central.forEach(function (c) { cdSize += c.length; });
		var end = new DataView(new ArrayBuffer(22));
		end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
		end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
		return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
	}

	/* ─────────────────────────────── DOCX ─────────────────────────────── */

	var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
		'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
		'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
		'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
		'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
	var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
	var MAX_IMG_PX = 590;
	var RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

	function esc(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

	function rgbToHex(c) {
		var m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
		if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
		return [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('').toUpperCase();
	}

	// ── run formatting ──
	function rPr(f) {
		var x = '';
		if (f.style) x += '<w:rStyle w:val="' + f.style + '"/>';
		if (f.font) x += '<w:rFonts w:ascii="' + esc(f.font) + '" w:hAnsi="' + esc(f.font) + '" w:cs="' + esc(f.font) + '"/>';
		if (f.bold) x += '<w:b/><w:bCs/>';
		if (f.italic) x += '<w:i/><w:iCs/>';
		if (f.strike) x += '<w:strike/>';
		if (f.color) x += '<w:color w:val="' + f.color + '"/>';
		if (f.size) x += '<w:sz w:val="' + f.size + '"/><w:szCs w:val="' + f.size + '"/>';
		if (f.underline) x += '<w:u w:val="single"/>';
		if (f.bg) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + f.bg + '"/>';
		if (f.vert) x += '<w:vertAlign w:val="' + f.vert + '"/>';
		if (f.rtl) x += '<w:rtl/>';
		return x ? '<w:rPr>' + x + '</w:rPr>' : '';
	}
	function textRuns(text, f) {
		var out = '', parts = text.split('\n');
		parts.forEach(function (line, i) {
			if (i) out += '<w:r><w:br/></w:r>';
			line.split('\t').forEach(function (seg, j) {
				if (j) out += '<w:r><w:tab/></w:r>';
				if (seg) out += '<w:r>' + rPr(f.rtl === undefined && RTL_RE.test(seg) ? merge(f, { rtl: true }) : f) + '<w:t xml:space="preserve">' + esc(seg) + '</w:t></w:r>';
			});
		});
		return out;
	}
	function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) if (b[k] !== undefined) o[k] = b[k]; return o; }

	// A paragraph under construction: collapses whitespace across runs like a browser does.
	function Para() { this.items = []; this.lastSpace = true; this.hasContent = false; }
	Para.prototype.text = function (s, f) {
		s = s.replace(/[ \t\r\n]+/g, ' ');
		if (this.lastSpace) s = s.replace(/^ /, '');
		if (!s) return;
		this.lastSpace = / $/.test(s);
		if (s.trim()) this.hasContent = true;
		this.items.push({ k: 't', s: s, f: f });
	};
	Para.prototype.pre = function (s, f) { if (s) { this.hasContent = true; this.lastSpace = false; this.items.push({ k: 't', s: s, f: f }); } };
	Para.prototype.br = function () { this.items.push({ k: 'br' }); this.lastSpace = true; };
	Para.prototype.xml = function (x) { this.hasContent = true; this.lastSpace = false; this.items.push({ k: 'x', x: x }); };
	Para.prototype.render = function () {
		var it = this.items, last = it.length - 1;
		while (last >= 0 && it[last].k === 'br') last--;
		var out = '';
		for (var i = 0; i <= last; i++) {
			var p = it[i];
			if (p.k === 'br') out += '<w:r><w:br/></w:r>';
			else if (p.k === 'x') out += p.x;
			else {
				var s = p.s;
				if (i === last) s = s.replace(/ $/, '');
				if (s) out += wrapLink(textRuns(s, p.f), p.f);
			}
		}
		return out;
	};
	function wrapLink(runs, f) { return f.link ? '<w:hyperlink r:id="' + f.link + '" w:history="1">' + runs + '</w:hyperlink>' : runs; }

	function pPr(o) {
		var x = '';
		if (o.style) x += '<w:pStyle w:val="' + o.style + '"/>';
		if (o.numId) x += '<w:numPr><w:ilvl w:val="' + o.ilvl + '"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
		if (o.border) x += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>';
		if (o.shd) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>';
		if (o.bidi) x += '<w:bidi/>';
		if (o.after !== undefined) x += '<w:spacing w:after="' + o.after + '"/>';
		if (o.indent) x += '<w:ind w:left="' + o.indent + '"/>';
		if (o.jc) x += '<w:jc w:val="' + o.jc + '"/>';
		return x ? '<w:pPr>' + x + '</w:pPr>' : '';
	}

	function Builder(images) {
		this.images = images; this.rels = []; this.nextRel = 10; this.abstracts = []; this.nums = []; this.nextAbs = 1; this.nextNum = 2; this.nextDocPr = 1; this.media = [];
	}
	Builder.prototype.link = function (url) {
		var id = 'rId' + (this.nextRel++);
		this.rels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + esc(url) + '" TargetMode="External"/>');
		return id;
	};
	Builder.prototype.image = function (img) {
		var info = this.images.get(img);
		if (!info) return null;
		var id = 'rId' + (this.nextRel++), n = this.media.length + 1, name = 'image' + n + '.' + info.ext;
		this.media.push({ name: 'word/media/' + name, data: info.bytes, ext: info.ext });
		this.rels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + name + '"/>');
		var cx = Math.round(info.w * 9525), cy = Math.round(info.h * 9525), dp = this.nextDocPr++;
		var alt = esc(img.getAttribute('alt') || '');
		return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
			'<wp:docPr id="' + dp + '" name="Picture ' + dp + '" descr="' + alt + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
			'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + dp + '" name="' + name + '" descr="' + alt + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
			'<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
			'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
	};
	Builder.prototype.newNum = function (start) {
		var aid = this.nextAbs++, nid = this.nextNum++;
		this.abstracts.push(absNumXml(aid, 'decimal', start));
		this.nums.push('<w:num w:numId="' + nid + '"><w:abstractNumId w:val="' + aid + '"/></w:num>');
		return nid;
	};

	// Inline content -> into paragraph `p`
	Builder.prototype.inline = function (node, p, f, ctx) {
		if (isText(node)) { if (ctx.pre) p.pre(node.nodeValue, f); else p.text(node.nodeValue, f); return; }
		if (!isEl(node) || SKIP[node.tagName]) return;
		var tag = node.tagName;
		if (tag === 'BR') { p.br(); return; }
		if (tag === 'IMG') {
			var x = this.image(node);
			if (x) p.xml(x);
			else {
				var src = node.getAttribute('src') || '', label = node.getAttribute('alt') || src;
				if (safeHref(src)) p.text(label, merge(f, { link: this.link(src), style: 'Hyperlink' }));
				else if (label) p.text('[' + label + ']', f);
			}
			return;
		}
		var nf = f, s;
		if (tag === 'B' || tag === 'STRONG') nf = merge(nf, { bold: true });
		if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR') nf = merge(nf, { italic: true });
		if (tag === 'U' || tag === 'INS') nf = merge(nf, { underline: true });
		if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') nf = merge(nf, { strike: true });
		if (tag === 'SUB') nf = merge(nf, { vert: 'subscript' });
		if (tag === 'SUP') nf = merge(nf, { vert: 'superscript' });
		if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') nf = merge(nf, { font: 'Consolas' });
		if (tag === 'A') { var h = safeHref(node.getAttribute('href')); if (h) nf = merge(nf, { link: this.link(h), style: 'Hyperlink' }); }
		if (tag === 'SPAN' || tag === 'FONT' || tag === 'MARK') {
			s = cs(node);
			var fl = cssFlags(node), par = node.parentElement ? cs(node.parentElement) : s;
			if (fl.bold && !ctx.heading) nf = merge(nf, { bold: true });
			if (fl.italic) nf = merge(nf, { italic: true });
			if (fl.underline) nf = merge(nf, { underline: true });
			if (fl.strike) nf = merge(nf, { strike: true });
			if (s.color !== par.color && !nf.link) { var col = rgbToHex(s.color); if (col) nf = merge(nf, { color: col }); }
			if (s.backgroundColor !== par.backgroundColor) { var bg = rgbToHex(s.backgroundColor); if (bg) nf = merge(nf, { bg: bg }); }
			if (s.fontFamily !== par.fontFamily) { var fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (fam && !/^(sans-serif|serif|monospace|system-ui)$/i.test(fam)) nf = merge(nf, { font: fam }); }
			if (s.fontSize !== par.fontSize && !ctx.heading) { var px = parseFloat(s.fontSize); if (px) nf = merge(nf, { size: Math.round(px * 1.5) }); }
		}
		for (var c = node.firstChild; c; c = c.nextSibling) this.inline(c, p, nf, ctx);
	};

	function blockProps(el, ctx) {
		var s = cs(el), o = { bidi: s.direction === 'rtl' };
		if (!o.bidi) {
			var a = s.textAlign;
			if (a === 'center') o.jc = 'center'; else if (a === 'right' || a === 'end') o.jc = 'right'; else if (a === 'justify') o.jc = 'both';
		}
		if (ctx.indent) o.indent = ctx.indent * 720;
		return o;
	}

	// Block-level children of `parent` -> array of XML strings
	Builder.prototype.blocks = function (parent, ctx) {
		var out = [], self = this, p = null;
		function flush(props) {
			if (!p) return;
			if (p.hasContent) out.push('<w:p>' + pPr(merge(props || {}, ctx.para || {})) + p.render() + '</w:p>');
			p = null;
		}
		for (var c = parent.firstChild; c; c = c.nextSibling) {
			if (isEl(c) && SKIP[c.tagName]) continue;
			if (isInline(c) && !isVideoEmbed(c)) {
				if (!p) p = new Para();
				this.inline(c, p, ctx.fmt || {}, ctx);
				continue;
			}
			flush(isEl(parent) ? blockProps(parent, ctx) : {});
			out = out.concat(this.block(c, ctx));
		}
		flush(isEl(parent) ? blockProps(parent, ctx) : {});
		return out;
	};

	Builder.prototype.block = function (el, ctx) {
		if (!isEl(el)) return [];
		var tag = el.tagName, self = this, out = [];
		if (isVideoEmbed(el)) {
			var v = videoSrc(el);
			if (!safeHref(v)) return [];
			var p = new Para(); p.text(v, { link: this.link(v), style: 'Hyperlink' });
			return ['<w:p>' + pPr(merge({}, ctx.para || {})) + p.render() + '</w:p>'];
		}
		if (/^H[1-6]$/.test(tag)) {
			var hp = new Para(), hctx = merge(ctx, { heading: true });
			for (var c = el.firstChild; c; c = c.nextSibling) this.inline(c, hp, {}, hctx);
			return hp.hasContent ? ['<w:p>' + pPr(merge(blockProps(el, ctx), { style: 'Heading' + tag[1] })) + hp.render() + '</w:p>'] : [];
		}
		if (tag === 'UL' || tag === 'OL') return this.list(el, ctx);
		if (tag === 'BLOCKQUOTE') return this.blocks(el, merge(ctx, { indent: (ctx.indent || 0) + 1, para: merge(ctx.para || {}, { style: 'Quote' }) }));
		if (tag === 'PRE') {
			var text = el.textContent.replace(/\n+$/, '');
			text.split('\n').forEach(function (line) {
				var pp = new Para(); pp.pre(line || ' ', { font: 'Consolas', size: 20 });
				out.push('<w:p>' + pPr({ shd: 'F2F2F2', after: 0, indent: ctx.indent ? ctx.indent * 720 : 0 }) + pp.render() + '</w:p>');
			});
			return out.concat(['<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>']);
		}
		if (tag === 'HR') return ['<w:p>' + pPr({ border: true }) + '</w:p>'];
		if (tag === 'TABLE') return this.table(el, ctx);
		return this.blocks(el, ctx);
	};

	Builder.prototype.list = function (el, ctx) {
		var ordered = el.tagName === 'OL', level = ctx.listLevel === undefined ? 0 : ctx.listLevel + 1;
		if (level > 8) level = 8;
		var numId = ordered ? this.newNum(isNaN(parseInt(el.getAttribute('start'), 10)) ? 1 : parseInt(el.getAttribute('start'), 10)) : 1;
		var out = [];
		for (var li = el.firstElementChild; li; li = li.nextElementSibling) {
			if (li.tagName !== 'LI') continue;
			var lctx = merge(ctx, { listLevel: level });
			var p = null, first = true, self = this;
			var flushItem = function () {
				if (!p) return;
				if (p.hasContent) {
					out.push('<w:p>' + pPr(first ? { style: 'ListParagraph', numId: numId, ilvl: level } : { style: 'ListParagraph', indent: (level + 1) * 720 }) + p.render() + '</w:p>');
					first = false;
				}
				p = null;
			};
			for (var c = li.firstChild; c; c = c.nextSibling) {
				if (isEl(c) && SKIP[c.tagName]) continue;
				if (isInline(c) && !isVideoEmbed(c)) { if (!p) p = new Para(); this.inline(c, p, {}, lctx); continue; }
				flushItem();
				if (isEl(c) && (c.tagName === 'UL' || c.tagName === 'OL')) out = out.concat(this.list(c, lctx));
				else out = out.concat(this.block(c, lctx));
			}
			flushItem();
		}
		return out;
	};

	Builder.prototype.table = function (el, ctx) {
		var rows = [].slice.call(el.rows);
		if (!rows.length) return [];
		var cols = Math.max.apply(null, rows.map(function (r) { var n = 0; [].forEach.call(r.cells, function (c) { n += Math.max(1, c.colSpan || 1); }); return n; }));
		var total = 9026, w = Math.floor(total / cols), self = this;
		var x = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>'; }).join('') + '</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>';
		for (var i = 0; i < cols; i++) x += '<w:gridCol w:w="' + w + '"/>';
		x += '</w:tblGrid>';
		rows.forEach(function (r) {
			x += '<w:tr>';
			[].forEach.call(r.cells, function (cell) {
				var span = Math.max(1, cell.colSpan || 1), isHead = cell.tagName === 'TH';
				var inner = self.blocks(cell, merge(ctx, { indent: 0, para: undefined, fmt: isHead ? { bold: true } : undefined })).join('');
				if (!inner) inner = '<w:p/>';
				x += '<w:tc><w:tcPr><w:tcW w:w="' + (w * span) + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') + (isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '') + '</w:tcPr>' + inner + '</w:tc>';
			});
			x += '</w:tr>';
		});
		return [x + '</w:tbl>', '<w:p/>'];
	};

	// Images: read each <img> once up front (async) so the XML walk can stay synchronous.
	function prepareImages(root) {
		var map = new Map(), imgs = [].slice.call(root.querySelectorAll('img'));
		return Promise.all(imgs.map(function (img) {
			return rasterize(img).then(function (info) { if (info) map.set(img, info); }, function () {});
		})).then(function () { return map; });
	}
	function dataUriBytes(uri) {
		var m = uri.match(/^data:(image\/[a-z+.-]+);base64,(.*)$/i);
		if (!m) return null;
		var bin = atob(m[2]), bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return { mime: m[1].toLowerCase(), bytes: bytes };
	}
	function rasterize(img) {
		var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
		if (!nw || !nh) return Promise.resolve(null);
		var w = img.width || nw, h = img.height || nh;
		if (w > MAX_IMG_PX) { h = Math.round(h * MAX_IMG_PX / w); w = MAX_IMG_PX; }
		var src = img.getAttribute('src') || '', d = /^data:/i.test(src) ? dataUriBytes(src) : null;
		if (d && /^image\/(png|jpeg|gif)$/.test(d.mime)) return Promise.resolve({ bytes: d.bytes, ext: d.mime === 'image/jpeg' ? 'jpeg' : d.mime.split('/')[1], w: w, h: h });
		// anything else (webp, svg, remote): redraw as PNG; fails for cross-origin images that block it
		return new Promise(function (resolve) {
			try {
				var canvas = document.createElement('canvas'); canvas.width = nw; canvas.height = nh;
				canvas.getContext('2d').drawImage(img, 0, 0);
				var png = dataUriBytes(canvas.toDataURL('image/png'));
				resolve(png ? { bytes: png.bytes, ext: 'png', w: w, h: h } : null);
			} catch (e) { resolve(null); }
		});
	}

	var STYLES = XML_HEAD + '<w:styles ' + NS + '>' +
		'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
		'<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
		'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
		[[1, 40], [2, 34], [3, 30], [4, 26], [5, 24], [6, 22]].map(function (h) {
			return '<w:style w:type="paragraph" w:styleId="Heading' + h[0] + '"><w:name w:val="heading ' + h[0] + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
				'<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="' + (h[0] - 1) + '"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="' + h[1] + '"/><w:szCs w:val="' + h[1] + '"/></w:rPr></w:style>';
		}).join('') +
		'<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="595959"/></w:rPr></w:style>' +
		'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>' +
		'<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
		'<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
		'<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
		'<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>' +
		['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>'; }).join('') +
		'</w:tblBorders></w:tblPr></w:style></w:styles>';

	function absNumXml(id, kind, start) {
		var lv = '', fmts = ['decimal', 'lowerLetter', 'lowerRoman'], bullets = ['\u2022', '\u25E6', '\u25AA'];
		for (var i = 0; i < 9; i++) {
			lv += '<w:lvl w:ilvl="' + i + '"><w:start w:val="' + (i === 0 && start ? start : 1) + '"/><w:numFmt w:val="' + (kind === 'bullet' ? 'bullet' : fmts[i % 3]) + '"/>' +
				'<w:lvlText w:val="' + (kind === 'bullet' ? bullets[i % 3] : '%' + (i + 1) + '.') + '"/><w:lvlJc w:val="left"/>' +
				'<w:pPr><w:ind w:left="' + (720 * (i + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
		}
		return '<w:abstractNum w:abstractNumId="' + id + '"><w:multiLevelType w:val="hybridMultilevel"/>' + lv + '</w:abstractNum>';
	}

	function numberingXml(abstracts, nums) {
		return XML_HEAD + '<w:numbering ' + NS + '>' + absNumXml(0, 'bullet') + abstracts.join('') +
			'<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' + nums.join('') + '</w:numbering>';
	}

	function toDocx(root) {
		return prepareImages(root).then(function (images) {
			var b = new Builder(images);
			var bodyXml = b.blocks(root, { fmt: {} }).join('');
			var sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
			var enc = new TextEncoder();
			function f(name, text) { return { name: name, data: enc.encode(text) }; }
			var exts = {};
			b.media.forEach(function (m) { exts[m.ext] = 1; });
			var types = XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
				Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="image/' + e + '"/>'; }).join('') +
				'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
				'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
				'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>';
			var rootRels = XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
			var docRels = XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
				'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' + b.rels.join('') + '</Relationships>';
			var files = [
				f('[Content_Types].xml', types), f('_rels/.rels', rootRels),
				f('word/document.xml', XML_HEAD + '<w:document ' + NS + '><w:body>' + bodyXml + sect + '</w:body></w:document>'),
				f('word/styles.xml', STYLES), f('word/numbering.xml', numberingXml(b.abstracts, b.nums)), f('word/_rels/document.xml.rels', docRels)
			].concat(b.media.map(function (m) { return { name: m.name, data: m.data }; }));
			return zip(files);
		});
	}

	window.RTExport = { toMarkdown: toMarkdown, toDocx: toDocx };
})();
