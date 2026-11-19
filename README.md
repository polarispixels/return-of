# Return Of

A personal study book on investing and trading, built as a series of web pages.

- **Live:** https://polarispixels.github.io/return-of/
- **Docs:** https://polarispixels.github.io/return-of/docs/
- **Changes:** [CHANGELOG.md](CHANGELOG.md)
- **Work:** [Issues](https://github.com/polarispixels/return-of/issues) and [BACKLOG.md](BACKLOG.md)

## Run it

There is nothing to install. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Build and check it

Chapters are written in `content/chapters/` and built into `chapters/`:

```bash
node tools/build.js
node tools/check.js
```

The same check gates every deploy. Pushing to `main` publishes the site if it passes.

Nothing here is financial advice. It is one person's study notes.
