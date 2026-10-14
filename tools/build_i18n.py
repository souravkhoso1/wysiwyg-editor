#!/usr/bin/env python3
"""Generate the per-language pages (ja/, fr/, es/, ar/, pt/, ru/), sitemap.xml and robots.txt.

index.html is the English source of truth. Every translatable string in it (element text,
title/placeholder/aria-label attributes, meta descriptions, the JSON-LD description) gets a stable
id derived from its text. Translations live in i18n/<lang>.json as {"html": {id: text}, "js": {key: text}, "note": html}.

    python3 tools/build_i18n.py extract   # refresh i18n/en.json from index.html and editor.js
    python3 tools/build_i18n.py check     # validate translations (missing ids, markup mismatches)
    python3 tools/build_i18n.py build     # check, then write <lang>/index.html, sitemap.xml, robots.txt

Run `build` and commit the output whenever index.html, editor.js strings or a translation changes.
"""
import hashlib
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://richtext.online'

LANGS = {
    'en': dict(name='English', path='/', locale='en_US', dir='ltr'),
    'ja': dict(name='日本語', path='/ja/', locale='ja_JP', dir='ltr'),
    'fr': dict(name='Français', path='/fr/', locale='fr_FR', dir='ltr'),
    'es': dict(name='Español', path='/es/', locale='es_ES', dir='ltr'),
    'ar': dict(name='العربية', path='/ar/', locale='ar_AR', dir='rtl'),
    'pt': dict(name='Português', path='/pt/', locale='pt_BR', dir='ltr'),
    'ru': dict(name='Русский', path='/ru/', locale='ru_RU', dir='ltr'),
}

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
INLINE = {'a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'img', 'input', 'kbd', 'mark', 's', 'small',
          'span', 'strong', 'sub', 'sup', 'u'}
SKIP_TAGS = {'script', 'style', 'pre', 'textarea', 'noscript', 'svg', 'kbd'}
ATTRS = ('title', 'placeholder', 'aria-label', 'alt')
META_KEYS = {'description', 'keywords', 'og:title', 'og:description', 'twitter:title', 'twitter:description'}
NO_TRANSLATE = {'RichText.online', 'MD', 'HR', 'https://', 'ghp_…'}
LETTERS = re.compile(r'[^\W\d_]{2,}')
LEAD = re.compile(r'^(?:\s|<i\b[^>]*></i>|<input\b[^>]*>)+')
TRAIL = re.compile(r'(?:\s|<i\b[^>]*></i>|<input\b[^>]*>)+$')
LD_DESC = re.compile(r'(?<="description": ")[^"]*(?=",\n\t\t"applicationCategory")')
DEFAULTS_RE = re.compile(r'/\* i18n:defaults:start \*/\s*var RT_DEFAULTS = (\{.*?\});\s*/\* i18n:defaults:end \*/', re.S)


class Seg:
    def __init__(self, start, end, raw, kind):
        self.start, self.end, self.raw, self.kind = start, end, raw, kind
        self.text = ' '.join(raw.split())
        self.id = make_id(self.text)


def make_id(text):
    plain = html.unescape(re.sub(r'<[^>]+>', ' ', text))
    words = re.findall(r'[A-Za-z0-9]+', plain)[:4]
    slug = '-'.join(w.lower() for w in words) or 'str'
    return '%s-%s' % (slug, hashlib.sha1(text.encode('utf-8')).hexdigest()[:4])


class Extractor(HTMLParser):
    def __init__(self, src):
        super().__init__()
        self.src = src
        self.line_starts = [0]
        for i, ch in enumerate(src):
            if ch == '\n':
                self.line_starts.append(i + 1)
        self.stack = []
        self.cands = []
        self.attrs = []

    def abs_pos(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def in_skip(self):
        return any(el['skip'] for el in self.stack)

    @staticmethod
    def skip_self(tag, ad):
        if tag == 'html':
            return False
        return tag in SKIP_TAGS or ad.get('translate') == 'no' or 'lang' in ad or 'data-no-i18n' in ad

    def handle_starttag(self, tag, attrs):
        raw = self.get_starttag_text()
        start = self.abs_pos()
        ad = dict(attrs)
        if not self.in_skip() and not self.skip_self(tag, ad):
            if tag == 'meta':
                key = ad.get('name') or ad.get('property')
                if key in META_KEYS and ad.get('content'):
                    m = re.search(r'(?<![\w-])content\s*=\s*"([^"]*)"', raw)
                    if m and LETTERS.search(m.group(1)):
                        self.attrs.append(Seg(start + m.start(1), start + m.end(1), m.group(1), 'attr'))
            for name in ATTRS:
                m = re.search(r'(?<![\w-])%s\s*=\s*"([^"]*)"' % re.escape(name), raw)
                if m and LETTERS.search(m.group(1)):
                    self.attrs.append(Seg(start + m.start(1), start + m.end(1), m.group(1), 'attr'))
        if self.stack and tag not in INLINE:
            self.stack[-1]['block'] = True
        if tag in VOID:
            return
        self.stack.append(dict(tag=tag, ad=ad, inner_start=start + len(raw), block=False, letters=False,
                               skip=self.skip_self(tag, ad)))

    def handle_data(self, data):
        if self.stack and LETTERS.search(data):
            self.stack[-1]['letters'] = True

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                break
        else:
            return
        del_from = i
        el = self.stack[i]
        ancestors_skip = any(e['skip'] for e in self.stack[:i])
        inner_end = self.abs_pos()
        del self.stack[del_from:]
        if el['skip'] or ancestors_skip or el['block'] or not el['letters']:
            return
        inner = self.src[el['inner_start']:inner_end]
        lead = LEAD.match(inner)
        a = lead.end() if lead else 0
        trail = TRAIL.search(inner, a)
        b = trail.start() if trail else len(inner)
        core = inner[a:b]
        if not core or not LETTERS.search(re.sub(r'<[^>]+>', ' ', core)):
            return
        if tag == 'option' and el['ad'].get('value') == core.strip():
            return
        if ' '.join(core.split()) in NO_TRANSLATE:
            return
        self.cands.append(Seg(el['inner_start'] + a, el['inner_start'] + b, core, 'el'))


def find_segments(src):
    ex = Extractor(src)
    ex.feed(src)
    ex.close()
    cands = ex.cands
    keep = [c for c in cands
            if not any(d is not c and d.start <= c.start and c.end <= d.end for d in cands)]
    segs = keep + [a for a in ex.attrs if a.text not in NO_TRANSLATE]
    m = LD_DESC.search(src)
    if m:
        segs.append(Seg(m.start(), m.end(), m.group(0), 'ld'))
    segs.sort(key=lambda s: s.start)
    ids = {}
    for s in segs:
        if ids.setdefault(s.id, s.text) != s.text:
            raise SystemExit('id collision: %s' % s.id)
    return segs


def load_defaults():
    m = DEFAULTS_RE.search((ROOT / 'editor.js').read_text(encoding='utf-8'))
    if not m:
        raise SystemExit('editor.js: RT_DEFAULTS block (i18n:defaults markers) not found')
    return json.loads(m.group(1))


def read_json(p):
    return json.loads(p.read_text(encoding='utf-8'))


def tags_of(s):
    return sorted(re.sub(r'\s+', ' ', t) for t in re.findall(r'<[^>]+>', s))


def extract():
    src = (ROOT / 'index.html').read_text(encoding='utf-8')
    segs = find_segments(src)
    table = {}
    for s in segs:
        table.setdefault(s.id, s.text)
    out = {'html': table, 'js': load_defaults()}
    (ROOT / 'i18n').mkdir(exist_ok=True)
    (ROOT / 'i18n' / 'en.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('i18n/en.json: %d html strings, %d js strings' % (len(table), len(out['js'])))


def validate(code, en, tr):
    problems = []
    for key in ('html', 'js'):
        missing = [k for k in en[key] if k not in tr.get(key, {})]
        extra = [k for k in tr.get(key, {}) if k not in en[key]]
        if missing:
            problems.append('%s: %d missing %s ids, e.g. %s' % (code, len(missing), key, missing[:3]))
        if extra:
            print('warning: %s has %d stale %s ids, e.g. %s' % (code, len(extra), key, extra[:3]))
    for k, v in tr.get('html', {}).items():
        if k not in en['html']:
            continue
        if not v.strip():
            problems.append('%s: empty translation for %s' % (code, k))
        elif tags_of(v) != tags_of(en['html'][k]):
            problems.append('%s: markup differs from English for %s' % (code, k))
    if 'github.com/souravkhoso1/wysiwyg-editor' not in tr.get('note', ''):
        problems.append('%s: "note" (machine-translation notice linking to the repo) is missing' % code)
    for k, v in tr.get('js', {}).items():
        if k in en['js'] and sorted(re.findall(r'\{\w+\}', v)) != sorted(re.findall(r'\{\w+\}', en['js'][k])):
            problems.append('%s: placeholders differ from English for js.%s' % (code, k))
    return problems


def replace_once(s, old, new):
    if s.count(old) != 1:
        raise SystemExit('expected exactly one occurrence of %r, found %d' % (old[:70], s.count(old)))
    return s.replace(old, new)


def build_page(src, segs, code, tr):
    meta = LANGS[code]
    out = src
    for s in sorted(segs, key=lambda s: -s.start):
        t = tr['html'][s.id]
        if s.kind == 'attr':
            t = t.replace('"', '&quot;')
        elif s.kind == 'ld':
            t = json.dumps(t, ensure_ascii=False)[1:-1]
        out = out[:s.start] + t + out[s.end:]
    url = SITE + meta['path']
    dir_attr = ' dir="rtl"' if meta['dir'] == 'rtl' else ''
    out = replace_once(out, '<html lang="en">', '<html lang="%s"%s>' % (code, dir_attr))
    out = replace_once(out, '<link rel="canonical" href="%s/">' % SITE, '<link rel="canonical" href="%s">' % url)
    out = replace_once(out, '<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="%s">' % meta['locale'])
    out = replace_once(out, '<meta property="og:url" content="%s/">' % SITE, '<meta property="og:url" content="%s">' % url)
    out = replace_once(out, '<meta name="twitter:url" content="%s/">' % SITE, '<meta name="twitter:url" content="%s">' % url)
    out = replace_once(out, '"url": "%s/",' % SITE, '"url": "%s",' % url)
    out = replace_once(out, '"inLanguage": "en"', '"inLanguage": "%s"' % code)
    out = replace_once(out, '<span data-lang-current translate="no">English</span>',
                       '<span data-lang-current translate="no">%s</span>' % meta['name'])
    out = replace_once(out, 'class="dropdown-item active" href="/"', 'class="dropdown-item" href="/"')
    out = replace_once(out, 'class="dropdown-item" href="%s"' % meta['path'], 'class="dropdown-item active" href="%s"' % meta['path'])
    if meta['dir'] == 'rtl':
        out = replace_once(out, 'dist/css/bootstrap.min.css', 'dist/css/bootstrap.rtl.min.css')
    note = '<div class="alert alert-info small py-2 px-3 mb-3 lang-note" role="note">%s</div>' % tr['note']
    out = replace_once(out, '\t\t</header>\n', '\t\t</header>\n\t\t' + note + '\n')
    payload = json.dumps(tr['js'], ensure_ascii=False).replace('</', '<\\/')
    m = re.search(r'<script src="/editor\.js\?v=\d+"></script>', out)
    if not m:
        raise SystemExit('editor.js script tag not found')
    out = out[:m.start()] + '<script>window.RT_I18N = %s;</script>\n\t' % payload + out[m.start():]
    return out


def sitemap():
    def alts():
        lines = ['    <xhtml:link rel="alternate" hreflang="%s" href="%s%s"/>' % (c, SITE, m['path']) for c, m in LANGS.items()]
        lines.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s/"/>' % SITE)
        return '\n'.join(lines)
    urls = ''.join('  <url>\n    <loc>%s%s</loc>\n%s\n  </url>\n' % (SITE, m['path'], alts()) for m in LANGS.values())
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + urls + '</urlset>\n')


def check(write):
    src = (ROOT / 'index.html').read_text(encoding='utf-8')
    segs = find_segments(src)
    en = {'html': {}, 'js': load_defaults()}
    for s in segs:
        en['html'].setdefault(s.id, s.text)
    problems = []
    translations = {}
    for code in LANGS:
        if code == 'en':
            continue
        p = ROOT / 'i18n' / ('%s.json' % code)
        if not p.exists():
            problems.append('%s: i18n/%s.json not found' % (code, code))
            continue
        translations[code] = read_json(p)
        problems += validate(code, en, translations[code])
    if problems:
        print('\n'.join(problems[:40]))
        if len(problems) > 40:
            print('... and %d more' % (len(problems) - 40))
        raise SystemExit(1)
    print('translations OK: %d html + %d js strings x %d languages' % (len(en['html']), len(en['js']), len(translations)))
    if not write:
        return
    for code, tr in translations.items():
        d = ROOT / code
        d.mkdir(exist_ok=True)
        (d / 'index.html').write_text(build_page(src, segs, code, tr), encoding='utf-8')
    (ROOT / 'sitemap.xml').write_text(sitemap(), encoding='utf-8')
    (ROOT / 'robots.txt').write_text('User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' % SITE, encoding='utf-8')
    print('wrote %s, sitemap.xml, robots.txt' % ', '.join('%s/index.html' % c for c in translations))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'extract':
        extract()
    elif cmd == 'check':
        check(False)
    elif cmd == 'build':
        check(True)
    else:
        raise SystemExit(__doc__)
