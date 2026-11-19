# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-19

The book takes shape: a table of contents and a first draft of every chapter.

### Added

- Contents on the welcome page: five parts and sixteen chapters, each linking to its own page.
- A page for every chapter, marked "Preliminary draft", with previous and next links. Each chapter ends with open questions still to answer.
- `tools/build.js`, which wraps chapter content files in the shared page and rebuilds the contents list. No dependencies.
- Deploy checks for missing chapters, stale built pages, and content files that break the fragment rules.
- Docs: a "How chapters work" section and three decisions.

### Changed

- The two thesis figures now sit below the contents on the welcome page.
- "No build step" is now "no dependencies": chapter pages are built by a script and the output is committed.

## [0.2.0] - 2026-11-19

The thesis on the page: return on capital and return of capital, side by side.

### Added

- Epigraph on the welcome page: the line the site is named for, marked "Often attributed to Will Rogers", with a note and link on where the wordplay really comes from (a 1920 advertisement, per Quote Investigator).
- Fig. 2: the gain needed to get back to even after a loss, as paired bars in the Swiss style.
- A `pair` layout that sets two figures side by side on wide screens and stacks them on phones.
- Deploy checks for the chart arithmetic, for charts a page asks for but that do not exist, and for the epigraph's attribution and source link.

### Changed

- `js/chart.js` is now a registry of named charts with the arithmetic split out and exported for testing.
- Fig. 1 is labeled "Return on" and Fig. 2 "Return of", so they read as a pair.
- Docs: new "How charts work" section and three decisions.

## [0.1.0] - 2026-11-19

### Added

- Welcome page: the "Return Of" title page in the Contemporary Editorial style.
- Fig. 1: a compound growth chart in the Swiss Modernism style, drawn as SVG and sized to the screen.
- Scoped themes: any element can carry `data-style`, so styles nest and swap by changing one word.
- Docs page at `/docs/` covering layout, styles, versioning, deployment, and decisions.
- `tools/check.js`, the deploy gate, and a GitHub Actions workflow that publishes to GitHub Pages only when it passes.

[Unreleased]: https://github.com/polarispixels/return-of/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/polarispixels/return-of/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/polarispixels/return-of/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/polarispixels/return-of/releases/tag/v0.1.0
