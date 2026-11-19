# Return Of

Ryan's personal study book on investing and trading: a public static site of multimedia pages for his own reference. MVP stage, favor speed.

## Where authority lives

| Concern | Authoritative source |
|---|---|
| How the site is built, styled, and shipped; decisions | `docs/index.html` (live at `/docs/`) |
| Committed work | [GitHub Issues](https://github.com/polarispixels/return-of/issues) |
| Loose ideas | `BACKLOG.md` |
| What changed, when | `CHANGELOG.md` and `git log` |
| The version | `RETURN_OF_VERSION` in `js/version.js` |
| The book outline (parts, chapters, order) | `content/chapters.json`, following the book plan in COMPASS (`/mnt/f/compass/08_Projects/return-of/PLAN.md`) |
| Chapter content | `content/chapters/NN-slug.html` (fragments). `chapters/` is generated: never edit it by hand |
| Style values | `css/themes.css`, sourced from `~/code/polaris-pixels/laboratory/data/styles/` |

- **Live:** https://polarispixels.github.io/return-of/ (repo `polarispixels/return-of`, GitHub Pages via Actions).

## Rules

1. **No dependencies.** Plain HTML, CSS, and script tags. One script, `node tools/build.js`, wraps chapter fragments into pages; its output is committed so the site works from `file://`.
2. **Styles are scoped by `data-style`.** Editorial is the book's voice; Swiss is for tables, charts, and numbers. `css/site.css` reads theme tokens only: never hard-code a color or font outside `css/themes.css`.
3. **Content and what it claims belong to Ryan.** Do not invent market data, returns, or advice. Illustrations use arithmetic or cited sources, and say which. No quotes from real people. Tax and regulatory claims need a primary source link.
4. **Verify before claiming done.** Run `node tools/check.js`. A deploy is done when the live page shows the new version.
5. **No em dashes** in anything a person reads (the check enforces it).
6. **The site is public; the method is not the money.** Nothing personal goes on a page: no balances, holdings, past trades, or life plans. Ask before using anything from the COMPASS `DECISIONS.md`.

## Commands

```bash
node tools/build.js            # rebuild chapter pages and the contents list
node tools/check.js            # the deploy gate (fails if the build is stale)
python3 -m http.server 8000    # local preview
```

## Release

Bump `js/version.js`, add a `## [x.y.z]` entry to `CHANGELOG.md`, run the build and the check, commit, push `main`, then `git tag vX.Y.Z && git push --tags`. Keep the docs page in sync with any change to how the site works.

## Known traps

- Charts size themselves to their container in real pixels (so labels stay readable on phones) and redraw on resize. Do not swap this for a scaled `viewBox`.
- `js/chart.js` runs in the browser and is also loaded by `tools/check.js` in Node. Keep anything that touches `document` or `window` below the `typeof document` guard.
- New chart: add a draw function to `CHARTS` in `js/chart.js`, keep its arithmetic pure, and test it in `tools/check.js`.
- Header and footer exist in three places: `index.html`, `docs/index.html`, and the chapter template in `tools/build.js`.
- The contents list in `index.html` sits between `contents:start` and `contents:end` markers and is rewritten by the build. Edit `content/chapters.json`, not the list.
