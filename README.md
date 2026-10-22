# SiteSense

Cost intelligence for commercial real estate developers. SiteSense helps developers understand where past estimates went wrong, learn from actual project outcomes, benchmark new budgets against comparable completed projects, and test profitability under user-defined scenarios.

## What it does

- **Projects**: completed, in-progress and proposed developments with type, location, area, original budget, timeline, price basis year, specification and assumptions.
- **Data imports**: Excel (.xlsx, .xls) or CSV. Detects the header row, suggests column mappings and units (₹ Cr / lakh / rupees), standardises cost-category names, flags invalid values, missing estimates, zero estimates, total rows and duplicates, lets the user include or exclude every row, and shows an import summary. Nothing is dropped silently.
- **Cost analysis**: original estimate, revised budget, committed, actual to date and final or forecast cost by category; variance in ₹ and %; over budget, within budget, needs review (zero or missing estimate), over budget so far (spend already above estimate) and insufficient data.
- **Recorded reasons**: cause category, explanation, evidence, status (confirmed / under investigation / unknown) and corrective action for each variance.
- **Variance insights**: recurring overruns by category and recorded reasons across completed projects, with sample-size limits.
- **Benchmark & estimate**: comparability factors (type, location, size, price basis, data coverage), user-selected benchmarks, optional user-defined escalation, median ₹/sq ft references (two or more projects), past overrun frequency and "review carefully" flags, with the basis of each estimate recorded.
- **Profitability**: total project cost, projected revenue, profit, profit margin (profit ÷ revenue), return on cost (profit ÷ cost), return on equity and equity IRR, plus construction-cost sensitivity.
- **Scenarios**: construction cost, package prices, delay, revenue and interest-rate changes compared side by side.
- **Re-forecasts**: the original price-change re-forecast with approved variance drivers.
- **Exports**: CSV report, printable report, project file and full workspace backup.

## Data storage

Sign-in and storage use Supabase (js/cloud.js): people create an account with email and password, and their projects are saved to their account so they open on any device. A copy is cached in the browser (localStorage) so the app opens fast. Row level security limits every person to their own rows. The Supabase URL and publishable key in js/cloud.js are public by design. Spreadsheets are still parsed in the browser.

## Files

- `index.html`: landing page and app shell
- `styles.css`: design tokens (approved palette at the top in `:root`) and components
- `js/model.js`: feasibility cash-flow engine (IRR, revenue, profit, margin, ROI, scenarios)
- `js/costs.js`: categories, variance analysis, insights, comparability and benchmark references
- `js/store.js`: local storage, schema migration, workspace import and export
- `js/import.js`: spreadsheet reading (SheetJS, loaded on demand from cdnjs), parsing and validation
- `js/demo.js`: clearly labelled fictional demonstration data
- `js/views/*.js`: landing, workspace, project, cost import and feasibility screens
- `tests/index.html`: logic tests that run in the browser
- `pitch/`: earlier one-page pitch site

## Dependencies

No build step and no npm packages. SheetJS (xlsx 0.18.5) is loaded from cdnjs only when a spreadsheet is read or a template is downloaded. Inter and JetBrains Mono come from Google Fonts.

## Run locally

```
powershell -ExecutionPolicy Bypass -File .claude/serve.ps1
```

Then open http://localhost:5173 for the app and http://localhost:5173/tests/ for the test suite.

## Deploy to Vercel

Push the folder to GitHub, import it in Vercel with framework preset **Other** and no build command, and deploy.

## Not included

- No AI or machine learning. Imports match column names and labels with rules the user reviews.
- No inflation index. Price-basis differences are shown and can be adjusted only with a user-entered escalation assumption.
- No accounts, sharing or server storage.
