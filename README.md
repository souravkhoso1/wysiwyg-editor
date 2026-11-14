# RichText.online

A free, browser-based rich text (WYSIWYG) editor, live at **https://richtext.online**. No sign-up, no install, no build step: the whole site is plain HTML, CSS and JavaScript served by GitHub Pages.

Available in English (default), Japanese, French, Spanish, Arabic, Portuguese, Russian, German, Simplified Chinese, Korean, Vietnamese and Indonesian.

## Features

Formatting, headings, lists, colours, fonts, links, images, YouTube/Vimeo embeds, tables, find and replace, Markdown mode with live preview, source HTML view, dark mode, fullscreen, on-device version history, and export to HTML, Markdown, Word (.docx), plain text or PDF (print), plus copy-as-formatted-text. Works offline once loaded and can be installed as an app. Documents autosave in the browser. They can be shared as a link, and an optional Google sign-in saves documents to an account (Firebase Auth and Firestore).

## Run it locally

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. There is nothing to install. Analytics is switched off on any host other than richtext.online, so local testing doesn't affect the stats.

## How the site is put together

| Path | What it is |
|---|---|
| `index.html` | The English page and the source of truth for every language |
| `ja/ fr/ es/ ar/ pt/ ru/ de/ zh/ ko/ vi/ id/` | **Generated** translated pages. Don't edit by hand |
| `i18n/*.json` | The translations (`en.json` is the extracted English reference) |
| `tools/build_i18n.py` | Generates the translated pages, `sitemap.xml` and `robots.txt` |
| `editor.js`, `styles.css` | All behaviour and styling |
| `export.js` | Markdown and Word exporters, loaded on demand |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |
| `embed.js`, `embed-example.html` | The embeddable editor and its documentation |

Third-party scripts (Bootstrap, marked, DOMPurify, LZ-String, Font Awesome, the Firebase SDK) are loaded from CDNs with pinned versions and Subresource Integrity hashes. When you change one, update its version and its `integrity` value together. Firebase only loads when someone signs in.

## Changing text or translating

1. Edit the English in `index.html` (or the UI strings in the `RT_DEFAULTS` block in `editor.js`).
2. Run `python3 tools/build_i18n.py extract` to refresh `i18n/en.json`. Changed English text gets a new id.
3. Add or fix that string in each `i18n/<lang>.json`.
4. Run `python3 tools/build_i18n.py build`. It stops with a list of anything missing or whose markup or `{placeholders}` no longer match the English.
5. Commit the source changes **and** the regenerated pages.

**Native speakers: the translations were machine made and we'd love your corrections.** Open a pull request that edits `i18n/<lang>.json`, or an issue with the better wording.

## Adding a language

1. Add it to `LANGS` in `tools/build_i18n.py`.
2. Add it in `index.html` in three places: the `<head>` hreflang links, the header language menu and the footer language list (`build` fails and says exactly what is missing).
3. Add its message to `LANG_SUGGESTIONS` in `editor.js`, and its link to `404.html` and `llms.txt`.
4. Create `i18n/<lang>.json` (copy `en.json`, translate the values, and add a `"note"` entry), then run `python3 tools/build_i18n.py build`.

## Embedding the editor in another site

```html
<div id="editor"></div>
<script src="https://richtext.online/embed.js"></script>
<script>
  var ed = RichTextEditor.create('#editor', { height: 400 });
  ed.onChange(function (html) { /* save html */ });
</script>
```

Sign-in, cloud save and version history are switched off in embedded editors, and they never read the visitor's own saved draft. See [embed-example.html](embed-example.html).

## Deploying

The live site is the `gh-pages` branch; pushing to it publishes within a minute or two. Static files use a manual `?v=` cache-buster (see `index.html`): bump it when `editor.js` or `styles.css` change.

## Licence

No licence file has been added yet, so by default all rights are reserved. Add a `LICENSE` file to say how others may use the code.
