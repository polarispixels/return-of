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
| Style values | `css/themes.css`, sourced from `~/code/polaris-pixels/laboratory/data/styles/` |

- **Live:** https://polarispixels.github.io/return-of/ (repo `polarispixels/return-of`, GitHub Pages via Actions).

## Rules

1. **No build step.** Plain HTML, CSS, and script tags. `index.html` works from `file://`.
2. **Styles are scoped by `data-style`.** Editorial is the book's voice; Swiss is for tables, charts, and numbers. `css/site.css` reads theme tokens only: never hard-code a color or font outside `css/themes.css`.
3. **Content and what it claims belong to Ryan.** Do not invent market data, returns, or advice. Illustrations use arithmetic or cited sources, and say which.
4. **Verify before claiming done.** Run `node tools/check.js`. A deploy is done when the live page shows the new version.
5. **No em dashes** in anything a person reads (the check enforces it).

## Commands

```bash
node tools/check.js            # the deploy gate
python3 -m http.server 8000    # local preview
```

## Release

Bump `js/version.js`, add a `## [x.y.z]` entry to `CHANGELOG.md`, run the check, commit, push `main`, then `git tag vX.Y.Z && git push --tags`. Keep the docs page in sync with any change to how the site works.

## Known traps

- The chart sizes itself to its container in real pixels (so labels stay readable on phones) and redraws on resize. Do not swap it for a scaled `viewBox`.
- Header and footer are copied between pages. Change both.
