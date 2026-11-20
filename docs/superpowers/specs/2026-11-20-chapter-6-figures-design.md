# Chapter 6 figures: design

November 20, 2026. Approved by Ryan in conversation; he asked to skip previews and review on the live site.

## Intent

Every section of a chapter gets a figure that works with its text: sometimes a summary, sometimes an extension. Chapter 6, The Core, sets the look for the book and is the first step toward the kit in issue #3.

## Figures

| Fig. | Section | Kind | What it shows |
|---|---|---|---|
| 6.1 | Broad index funds | chart | $500 a month for 30 years at an assumed 7%, paying a 0.03% fee vs a 1.00% fee. The gap is shaded and priced. |
| 6.2 | Pies | diagram | One example pie, target 60/30/10 vs today 67/24/9; the next deposit goes to the slice furthest below target. |
| 6.3 | Dividend growth | diagram + chart | The reinvestment loop, and yearly income with and without reinvesting (yield held at 3%, payout and price grow 6% a year). |
| 6.4 | Rebalancing | chart | The same pie as drift from target, against a 5-point band. |
| 6.5 | Why the core is the default | diagram | Core and satellite with the routine running, and after it lapses (the satellite returns to the core). Not to scale. |

## Rules

- Arithmetic only, labeled with its assumptions. No real fund data. Ryan can change the assumed numbers.
- Charts (numbers, axes) and diagrams (shapes, arrows, short labels) both live in `js/chart.js`, draw at real pixel width, and read colors from theme tokens.
- One example pie across 6.2 and 6.4, with fixed entity colors: U.S. stocks `--fg`, international `--accent`, bonds `--muted`.
- New arithmetic (`futureValue`, `mostUnderweight`, `drift`, `dividendIncome`) is pure and tested in `tools/check.js`.

## Approaches considered

1. **Draw functions in `js/chart.js` (chosen).** Theme-aware, readable on phones, testable, reusable.
2. Hand-written inline SVG in the fragment. Faster once, but labels scale down on phones and nothing is reused.
3. Image files. Cannot follow the theme; adds tools.

## Out of scope

Restyling other chapters' figures; a hover layer; the table kit.
