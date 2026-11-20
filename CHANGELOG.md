# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-11-20

Chapter 2 gets a figure for every section.

### Added

- Chapter 2, Every Dollar Has a Job: four figures. Fig. 2.1, how long a fall takes to recover at an assumed 7% a year. Fig. 2.2, the four buckets filling in order. Fig. 2.3, a $10,000 bill paid without and with a cushion. Fig. 2.4, what a satellite losing half costs the whole portfolio at three sizes.
- Fixed bucket colors that match Chapter 6: cushion and reserve in grays, core in black, satellite in red.
- Deploy checks for the new arithmetic: recovery years, the forced sale, and the hit to the whole portfolio.

## [0.5.0] - 2026-11-20

Chapter 6 gets a figure for every section: the first pass at a visual language for the book.

### Added

- Chapter 6, The Core: five figures. Fig. 6.1, what a fee costs over 30 years. Fig. 6.2, a pie filling its own gaps. Fig. 6.3, the dividend reinvestment loop and the income it adds. Fig. 6.4, drift against a rebalancing band. Fig. 6.5, why the core is where the money rests.
- Diagrams, alongside charts, in `js/chart.js`: shared pieces for text, arrows, and donuts, all drawn from theme tokens.
- One example pie (60/30/10, drifted to 67/24/9) shared by Figs. 6.2 and 6.4.
- Deploy checks for the new arithmetic: deposits with a fee, drift, the most underweight holding, and dividend income.
- Docs: charts and diagrams, and two decisions.

## [0.4.0] - 2026-11-19

The platform fit matrix, and a line between public and private.

### Added

- Chapter 13: the platform fit matrix. Seventeen platforms scored 0 to 3 against nine strategies, shaded as a heatmap and ranked by weighted fit. Change a weight and the table re-ranks.
- A "private" style and placeholder block: a neon pink box that marks content held back from the public site. Chapter 13 uses it for the recommended stack.
- `content/data/platform-fit.json`, the matrix data, and an include that lets a chapter ask the build for the table.
- Deploy checks that the matrix data carries only public fields, that scores are valid, and that every weighted fit matches the source sheet.
- Docs: "What is public and what is private", "The platform fit matrix", and three decisions.

### Changed

- Chapter 13 no longer says it makes no judgment about platforms: it now shows the scores, labeled as working judgments with a date.

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

[Unreleased]: https://github.com/polarispixels/return-of/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/polarispixels/return-of/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/polarispixels/return-of/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/polarispixels/return-of/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/polarispixels/return-of/releases/tag/v0.1.0
