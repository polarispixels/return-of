# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.15.0] - 2026-11-20

Chapter 9 gets a figure for every section.

### Added

- Chapter 9, The Casino Floor: five figures. Fig. 9.1, holding periods on a log time scale, from 0DTE's seconds to the core's years. Fig. 9.2, a long call that is right about the direction and still loses. Fig. 9.3, two made-up months of tuition: one hits zero and ends; the next starts with the same fixed budget. Fig. 9.4, fifty paper trades, then the Level 4 gate. Fig. 9.5, one day under an example cap of 3 trades.
- Deploy checks for the long call payoff and the tuition path.

## [0.14.0] - 2026-11-20

Chapter 8 gets a figure for every section.

### Added

- Chapter 8, Options From the Seller's Side: five figures. Fig. 8.1, who pays, who collects, and who is obliged, for calls and puts. Fig. 8.2, a covered call's payoff, with the upside given up. Fig. 8.3, a sold put against owning at the strike: the full downside, less the premium. Fig. 8.4, one turn of the Wheel as a cycle. Fig. 8.5, each obligation covered by cash or shares before the trade.
- A payoff frame shared by the two payoff charts. On phones they name their lines in a legend above the plot.
- Deploy checks for the covered call and sold put payoffs, and that every cash flow in the Wheel figure appears in the Chapter 8 table.

## [0.13.0] - 2026-11-20

Charts get a second color: blue.

### Added

- `--accent-2` (blue, `#1F5FAD`) and `--accent-2-soft` (light blue, `#8FB3DE`) in every style. A book-specific extension of the Laboratory palettes, chosen over green and purple after a side-by-side preview.
- Charts fall back to gray if a cached stylesheet lacks the new colors, instead of drawing them black.
- Docs: blue's meaning in the color rule, and the decision.

### Changed

- Gray now means structure only (grids, labels, bands, empty states). Where it stood for data, it is blue:
  - Chapter 6: international stocks and bonds, deposits, taking cash, and the hedge's protected zone.
  - Chapter 2: the cushion (blue) and reserve (light blue), and the rest of the portfolio in Fig. 2.4.
  - Chapter 4: strategies outside the core and the casino floor; Value and Systematic in Fig. 4.4, where Index Core is now black.
  - Chapter 7: the reference line in the setup sketches, and the funnel's first two stages.
  - Chapter 1 and the welcome page: the mildest series in Figs. 1, 1.1.
  - Chapter 3: the source-of-edge box.
- Fig. 3.2: the cost bars are red, since costs are costs.

## [0.12.0] - 2026-11-20

Chapter 7 gets a figure for every section.

### Added

- Chapter 7, The Satellite: five figures. Fig. 7.1, a month of mornings: 10.5 hours of routine for the satellite against one automatic deposit for the core. Fig. 7.2, sketches of the three swing setups, each with entry, stop, and target. Fig. 7.3, growth momentum as a funnel. Fig. 7.4, the three written numbers (a 3 to 1 trade) and how a tight or wide stop sizes the same $100 of risk. Fig. 7.5, Trader A's running average over 50 trades, settling at +$60.
- Deploy checks for reward to risk, position size, the running average, and Trader A's made-up sequence.

## [0.11.0] - 2026-11-20

Chapter 6 brought in line with the rest of the book.

### Changed

- Chapter 6 figures follow the book's color rule: red means loss, cost, risk, or the active slice. Fig. 6.1: the low-fee line is now black and the 1.00% fee red. Figs. 6.2 and 6.4: international stocks are gray, not red. Fig. 6.3: reinvesting is black and the loop nodes are black. Fig. 6.5: the hedged core is black and the unhedged core red.
- Fig. 6.6 shows strategies 1 to 3 as chips in the core, and is drawn with the same bucket blocks as Chapter 2.
- Chapter 6 chart code uses the shared grid and line helpers.

### Added

- A deploy check that the example pie never uses red.
- Docs: the color rule.

## [0.10.0] - 2026-11-20

The Protective Hedge gets a home, and Chapter 5 gets a figure for every section.

### Added

- Chapter 6: a new section, "Insuring the core: the Protective Hedge" (Strategy 8), with Fig. 6.5, a put putting a floor under the core. It links the SEC and FINRA alert on leveraged and inverse ETFs, and adds two open questions.
- Chapter 5, The Ladder: five figures. Fig. 5.1, the Ladder with strategy chips, timing, and gates. Fig. 5.2, the promotion rule as a grid. Fig. 5.3, time decay working for the seller. Fig. 5.4, tuition counted as already spent. Fig. 5.5, ten trading days without the routine.
- Deploy checks for the hedge floor, time value left, and the promotion rule.

### Changed

- Chapter 6: the core-and-satellite diagram is now Fig. 6.6.
- Chapter 4: the groups figure and the text now point the Protective Hedge to Chapter 6. The contents list says Chapter 6 covers "Index funds, pies, dividends, and a hedge."

## [0.9.0] - 2026-11-20

Chapter 4 gets a figure for every section, and the menu gets a map.

### Added

- Chapter 4, The Strategy Menu: six figures. Fig. 4.1, untagged trades sorted into tagged strategies. Fig. 4.2, all thirteen strategies on a risk and effort grid. Fig. 4.3, the shape of a loss: one failure in a fund of 500 against one same-day option. Fig. 4.4, a sketch of effort over time. Fig. 4.5, the seven groups with their chapters. Fig. 4.6, one attention budget split across more strategies.
- Strategy chips: numbered circles colored by slice (passive core black, casino floor red, the rest gray), for reuse in later chapters.
- A deploy check that the strategy data drawn in Fig. 4.2 matches the Chapter 4 table word for word, plus checks for the attention and concentration arithmetic.

## [0.8.0] - 2026-11-20

Chapter 3 gets a figure for every section.

### Added

- Chapter 3, Know Your Edge: five figures. Fig. 3.1, a method is not yet an edge. Fig. 3.2, costs turning a small hypothetical edge negative. Fig. 3.3, Trader B's 20 trades as memory keeps them and as the journal shows them. Fig. 3.4, the expectancy map: win rate against average win over average loss, with the break-even curve and both traders. Fig. 3.5, the loop from core to satellite test to journal, and back.
- Kit: a shared `box` for flow diagrams.
- Deploy checks for the new arithmetic: expectancy, the break-even payoff, net after costs, and Trader B's made-up sequence.

## [0.7.0] - 2026-11-20

Chapter 1 gets a figure for every section.

### Added

- Chapter 1, Return of Capital: five figures. Fig. 1.1, equal ups and downs do not cancel. Fig. 1.2, the gain-needed curve behind the table, against the line most people assume. Fig. 1.3, one 50% fall in year 10 resets the clock on 30 years of compounding. Fig. 1.4, each habit stops one way to lose big. Fig. 1.5, the order of questions.
- Kit pieces: a horizontal grid, a polyline, and label spreading so end labels never overlap. Charts drop ticks and labels on narrow screens.
- Deploy checks for the new arithmetic: the round trip and a growth path with one fall.

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
