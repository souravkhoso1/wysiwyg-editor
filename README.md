# WYSIWYG Editor

A lightweight, dependency-free rich-text editor that runs entirely in the browser. No build step, no framework — just HTML, CSS, and vanilla JavaScript.

**Live demo:** https://souravkhoso1.github.io/wysiwyg-editor/

## Features

- **Rich text formatting** — bold, italic, underline, strikethrough, headings, lists, indent/outdent, subscript/superscript, horizontal rule
- **Font controls** — family, size, foreground color, background highlight color
- **Link & image insertion** — inline URL bar (no browser prompts)
- **Color persistence** — active fore-color carries forward to new typed characters
- **Clipboard** — cut, copy, paste via the Clipboard API
- **Source view** — toggle between rendered HTML and raw markup (toolbar disabled in source mode)
- **Markdown mode** — split-pane view: write Markdown on the left, see live-rendered HTML on the right
- **Word & character counter** — updates live below the editor
- **Export as HTML** — downloads a self-contained `.html` file
- **Print** — prints the editor content directly
- **Toggle edit mode** — lock the editor read-only
- **Keyboard shortcuts help** — press the keyboard icon in the toolbar; shortcuts adapt to Mac (⌘) or Windows/Linux (Ctrl)

## Running locally

No build step required. Serve the project root with any static file server:

```sh
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080` in your browser.

## Running tests

```sh
npm install
npm test          # single run
npm run test:watch  # watch mode
```

Tests use [Vitest](https://vitest.dev/) with jsdom.

## Deploying to GitHub Pages

```sh
./deploy.sh
```

This pushes only the editor files (`index.html`, `styles.css`, `editor.js`, `.nojekyll`) to the `gh-pages` branch. The `master` branch retains all source, tests, and config.

Set the GitHub Pages source to the `gh-pages` branch in your repository settings.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Application markup and toolbar |
| `styles.css` | Editor-specific styles (Bootstrap handles the rest) |
| `editor.js` | All editor logic; exports functions for testing |
| `editor.test.js` | Vitest test suite (52 tests) |
| `vitest.setup.js` | DOM fixture and mocks loaded before tests |
| `vitest.config.mjs` | Vitest configuration |
| `deploy.sh` | Script to publish to `gh-pages` branch |
