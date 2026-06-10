# Support Savings Account Portfolio via QFX Imports

We will introduce support for tracking a savings account as a third type of portfolio. Unlike investment portfolios containing multiple stocks/ETFs and CASH, a Savings portfolio contains a single base asset (`SAVINGS`) representing the savings account balance. The balance and account name will be parsed and updated from an uploaded Quicken Financial Exchange (QFX) file.

## User Review Required

> [!IMPORTANT]
> - **Schema Migration**: We will alter the `portfolios` table to add a `type` column (`INVESTMENT` or `SAVINGS`). This will be automatically migrated on start.
> - **UI Customization**: When a `SAVINGS` portfolio is active, the UI dynamically changes:
>   - The "Import CSV" button becomes "Import QFX".
>   - The "Sync Prices" and "Heatmap" buttons are disabled/hidden.
>   - The "Add Allocation" form is hidden since a savings portfolio does not hold generic stocks/ETFs.
>   - Unneeded financial columns (FCF, Payback, ROIC, Dividend, etc.) are blanked out/hyphenated for the `SAVINGS` row.
>   - The performance history chart will work exactly like investment portfolios, showing historical balance growth.

## Clarifying Questions

> [!QUESTION]
> Please answer the following before implementation begins:

1. **QFX Bank Name Extraction**
   - The plan mentions extracting bank name from `<ORG>` and `<ACCTID>` tags (e.g., "Chase (1234)").
   - Should we concatenate them, or use just one source?
   - What should we do if `<ACCTID>` is missing from the QFX file? Use just `<ORG>`?

   - ANSWER - both will always be there. If one is missing log an error.


2. **Historical Snapshots for SAVINGS Imports**
   - When importing a QFX file, should we create a historical price snapshot on the exact `<DTASOF>` date from the file?
   - Should we backfill snapshots if the QFX date is older than today?
   - Or should we only create a snapshot if it's a new/unique date?

   - ANSWER use the exact `<DTASOF>. Do not backfill. Only create if it's a new/unique date.

3. **SAVINGS Price Handling Over Time**
   - We set SAVINGS price to 1.0 (balance = shares). When importing QFX:
     - Should we create ONE historical price entry for the parsed date only?
     - Or should we ensure a price entry exists for both today AND the parsed date?
     - ANSWER ONE historical price entry for the parsed date only

4. **Multiple SAVINGS Portfolios**
   - If the user creates multiple SAVINGS portfolios, should we:
     - Allow correlation/heatmap calculations between them (probably no)?
     - Block the buttons entirely, or only for SAVINGS types?
     - No correlation or heatmap. Doesn't make sense here.

5. **Preventing Invalid Operations on SAVINGS**
   - Should CSV imports on SAVINGS portfolios be:
     - Silently rejected (return error)?
     - Blocked at the UI level (button disabled)?
     - Both (UI + server-side validation)?
   - Same question for "Add Allocation" form submissions?
   - When adding for a SAVINGS account selecting QFX files should be the only option. Change the file selector dialog to only allow QFX to be selected for savings.

6. **Schema Migration Safety**
   - Should we add a migration test that specifically verifies:
     - Existing databases get the `type` column added?
     - All existing portfolios default to type `INVESTMENT`?
     - New portfolios created after migration have the correct type?
     Not right now.

## Proposed Changes

Before making any changes, review all files as there have been updates. Work might be completed already.
For example. Changes have already been made to the portfolios table.

Code coverage and branch coverage must remain at 100% for all files except logger.js
---

### Database Schema and Management

#### [MODIFY] [DatabaseManager.js](file:///Users/robertmills/projects/portfolio/src/core/DatabaseManager.js)
- Update `_runInitialSchema` to declare the `type` column on `portfolios` table: `type TEXT DEFAULT 'INVESTMENT'`.
- Update `_migrateSchema` to execute a check and add the `type` column to the `portfolios` table for existing databases.
- Ensure the default portfolio is inserted with type `INVESTMENT`.

---

### QFX File Parsing

#### [NEW] [QfxParser.js](file:///Users/robertmills/projects/portfolio/src/core/QfxParser.js)
- Implement a parser that parses standard bank account QFX statements.
- Extract:
  - Account/Bank name from `<ORG>` and `<ACCTID>` tags (e.g. `Chase (1234)`).
  - Balance amount from the `<BALAMT>` tag inside `<LEDGERBAL>`.
  - Date from the `<DTASOF>` tag (formatted to `YYYY-MM-DD`).
- Validate presence of balance and throw errors if parsing fails or tags are missing.

---

### Core Portfolio Logic

#### [MODIFY] [Portfolio.js](file:///Users/robertmills/projects/portfolio/src/core/Portfolio.js)
- Modify `loadInvestments()`:
  - Load the portfolio `type` and `name` from the `portfolios` database table.
  - If the portfolio `type` is `SAVINGS`, ensure that a single structural holding with ticker `SAVINGS` exists instead of `CASH`.
  - Do not add `CASH` if portfolio is of type `SAVINGS`.
- Modify `ensureAssetNames()`, `updateDailyPrices()`, and `updateFundamentalMetrics()`:
  - Bypass Polygon API fetching and Alpha Vantage fundamentals syncing if portfolio type is `SAVINGS`.
  - For `updateDailyPrices()`, save the price of `SAVINGS` as `1.0` and take a historical snapshot.
- Modify `getCorrelationMatrix()`:
  - Return empty tickers list and empty matrix if type is `SAVINGS`.
- Add `importQfx(qfxText)`:
  - Parse `qfxText` using `QfxParser`.
  - Update the `SAVINGS` holding `shares` to the balance, set its name to the parsed name.
  - Set the price of `SAVINGS` as `1.0` for the parsed statement date.
  - Take a historical snapshot on the parsed date.

---

### Web Server API

#### [MODIFY] [main.js](file:///Users/robertmills/projects/portfolio/src/core/main.js)
- Modify `GET /api/portfolios` to return `type` in the portfolio objects.
- Modify `POST /api/portfolios` to accept an optional `type` and save it to the database.
- Add `POST /api/portfolios/:id/import-qfx` endpoint:
  - Expects text/plain or JSON body containing `qfxText`.
  - Invokes `portfolio.importQfx(qfxText)`.
  - Returns updated portfolio status.

---

### Client-Side User Interface

#### [MODIFY] [index.html](file:///Users/robertmills/projects/portfolio/public/index.html)
- Adjust the file import modal or form to display appropriate file extensions (`.csv` or `.qfx`) depending on mode.
- In the portfolio management menu, add a dropdown selector for Portfolio Type ("Investment Portfolio" or "Savings Account") when creating a new portfolio.

#### [MODIFY] [app.js](file:///Users/robertmills/projects/portfolio/public/app.js)
- Maintain an in-memory mapping of portfolios and their types.
- When selecting/switching portfolios:
  - If the selected portfolio is of type `SAVINGS`:
    - Change "Import CSV" button text to "Import QFX" and set file picker `accept=".qfx"`.
    - Hide the "Add Allocation" form panel.
    - Hide/disable the "Sync Prices" and "Heatmap" buttons.
  - Else:
    - Restore "Import CSV" label and file picker `accept=".csv"`.
    - Show the "Add Allocation" form panel.
    - Enable/show the "Sync Prices" and "Heatmap" buttons.
- Update file upload logic:
  - If selected portfolio is `SAVINGS`, upload the file content as raw text to `/api/portfolios/:id/import-qfx`.
- In the table rendering function (`renderPortfolio`):
  - If portfolio type is `SAVINGS`, hide or hyphenate fields that do not apply to the `SAVINGS` asset (type, macro category, FCF, payback, ROIC, dividend, rebalance math).
  - Ensure the delete button is locked for the `SAVINGS` row.

---

### Test Suite

#### [NEW] [QfxParser.test.js](file:///Users/robertmills/projects/portfolio/src/test/QfxParser.test.js)
- Add unit tests verifying successful QFX parsing, formatting of dates, fallback names, and missing field errors.

#### [MODIFY] [Portfolio.test.js](file:///Users/robertmills/projects/portfolio/src/test/Portfolio.test.js)
- Add unit tests covering Savings portfolio initialization, loading, QFX import, daily price updates bypassing API calls, and snapshot taking.

#### [MODIFY] [DatabaseManager.test.js](file:///Users/robertmills/projects/portfolio/src/test/DatabaseManager.test.js)
- Add unit tests verifying schema migration for the `type` column.

---

## Verification Plan

### Automated Tests
- Run `npm test` to verify all unit tests run and pass.
- Run `npm run coverage` to verify 100% statement, branch, and function coverage is maintained across all modified/new JavaScript source files.

### Manual Verification
- Start the server: `npm start`
- Open the web browser at http://127.0.0.1:3000
- Add a new portfolio of type "Savings Account".
- Confirm the UI hides the "Add Allocation" form, "Sync Prices", and "Heatmap" buttons.
- Upload a sample QFX file.
- Verify the balance and name are parsed, the holding table updates, and the history chart plots the savings growth.
