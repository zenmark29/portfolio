import test from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../core/DatabaseManager.js';
import Portfolio from '../core/Portfolio.js';
import Investment from '../core/Investment.js';
import MarketData from '../core/MarketData.js';

test('Portfolio target percentage validation', () => {
    const portfolio = new Portfolio(1, new DatabaseManager(':memory:'), null);

    // Sum = 1.0 (Valid)
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('MSFT', 10, 0.5)
    ]);
    assert.strictEqual(portfolio.getPortfolioStatus().isTargetValid, true);

    // Sum != 1.0 (Invalid)
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.4),
        new Investment('MSFT', 10, 0.5)
    ]);
    assert.strictEqual(portfolio.getPortfolioStatus().isTargetValid, false);
});

test('Portfolio status calculation', () => {
    // Setup in-memory db
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    // Set investments
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),  // 10 shares
        new Investment('MSFT', 5, 0.5)    // 5 shares
    ]);

    // Insert mock prices directly into db
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-01', 150); // value: 1500
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-01', 300); // value: 1500

    const status = portfolio.getPortfolioStatus();

    // Total value = 1500 + 1500 = 3000
    assert.strictEqual(status.totalValue, 3000);

    // AAPL: value=1500, actual=50%
    const aapl = status.details.find(d => d.ticker === 'AAPL');
    assert.strictEqual(aapl.value, 1500);
    assert.strictEqual(aapl.actualPercentage, 0.5);
    assert.strictEqual(aapl.differencePercentage, 0); // 0.5 - 0.5
    assert.strictEqual(aapl.rebalanceAmount, 0);

    // Test Rebalancing math directly
    // Let's say price AAPL shoots to 300
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-02', 300); // AAPL value: 3000
    // MSFT price drops to 200
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-02', 200); // MSFT value: 1000

    const newStatus = portfolio.getPortfolioStatus();
    // Total value = 3000 + 1000 = 4000
    assert.strictEqual(newStatus.totalValue, 4000);

    const newAapl = newStatus.details.find(d => d.ticker === 'AAPL');
    const newMsft = newStatus.details.find(d => d.ticker === 'MSFT');

    // AAPL actual: 3000 / 4000 = 0.75
    assert.strictEqual(newAapl.actualPercentage, 0.75);
    // AAPL dif: 0.50 (target) - 0.75 (actual) = -0.25 (needs to sell)
    assert.strictEqual(newAapl.differencePercentage, -0.25);
    // AAPL rebalance amount: 2000 (target value) - 3000 (current) = -1000
    assert.strictEqual(newAapl.rebalanceAmount, -1000);

    // MSFT actual: 1000 / 4000 = 0.25
    assert.strictEqual(newMsft.actualPercentage, 0.25);
    // MSFT diff: 0.50 - 0.25 = 0.25 (needs to buy)
    assert.strictEqual(newMsft.differencePercentage, 0.25);
    // MSFT rebalance amount: 2000 - 1000 = +1000
    assert.strictEqual(newMsft.rebalanceAmount, 1000);

    assert.strictEqual(newStatus.actualPercentageSum, 1.0);
});

test('Portfolio status includes extended financial metrics', () => {
    const inv = new Investment('AAPL', 10, 0.5, null, null, null, 0.12, 0.3, 0.15, 1.2);
    const portfolio = new Portfolio(1, new DatabaseManager(':memory:'), null);
    portfolio.setInvestments([inv]);

    const status = portfolio.getPortfolioStatus();
    const aapl = status.details.find(d => d.ticker === 'AAPL');

    assert.strictEqual(aapl.fcfYield, 0.12);
    assert.strictEqual(aapl.payoutRatio, 0.3);
    assert.strictEqual(aapl.roic, 0.15);
    assert.strictEqual(aapl.annualDividend, 1.2);
});

test('Portfolio load and save investments', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('MSFT', 10, 0.5)
    ]);

    // Save to DB
    portfolio.saveInvestments();

    // Validate by creating new portfolio reading from same DB ref
    const portfolio2 = new Portfolio(1, dbm, null);
    portfolio2.loadInvestments();

    assert.strictEqual(portfolio2.investments.length, 3);
    assert.strictEqual(portfolio2.investments[0].ticker, 'CASH');
    assert.strictEqual(portfolio2.investments[0].shares, 0);
    // Depending on DB fetch order or unshift, AAPL is likely index 1 or 2.
    // Let's just find them by ticker instead of relying on exact index since DB queries aren't implicitly ordered.
    const aapl = portfolio2.investments.find(i => i.ticker === 'AAPL');
    const msft = portfolio2.investments.find(i => i.ticker === 'MSFT');
    assert.ok(aapl);
    assert.strictEqual(aapl.shares, 10);
    assert.ok(msft);
});

test('Portfolio import holdings preserves shares and creates history', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('CASH', 100, 0.5)
    ]);
    portfolio.saveInvestments();

    portfolio.importHoldings([
        { ticker: 'AAPL', shares: 20, price: 150, value: 3000 },
        { ticker: 'CASH', shares: 5000, price: 0, value: 5000 }
    ], '2026-05-06');

    const status = portfolio.getPortfolioStatus();
    assert.strictEqual(status.details.find(d => d.ticker === 'AAPL').shares, 20);
    assert.strictEqual(status.details.find(d => d.ticker === 'CASH').shares, 5000);
    assert.strictEqual(status.totalValue, 8000);

    const history = dbm.db.prepare('SELECT * FROM portfolio_history WHERE portfolio_id = 1 AND date = ?').get('2026-05-06');
    assert.ok(history);
    assert.strictEqual(history.total_value, 8000);
});

test('Portfolio date normalization covers multiple formats and invalid values', () => {
    assert.strictEqual(Portfolio._normalizeDateString('2026-05-06'), '2026-05-06');
    assert.strictEqual(Portfolio._normalizeDateString('May 6 2026 14:51:00'), '2026-05-06');
    assert.strictEqual(Portfolio._normalizeDateString('not a date'), null);
    assert.strictEqual(Portfolio._normalizeDateString(undefined), null);
});

test('Portfolio import holdings uses default target percentage for new tickers', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);
    portfolio.setInvestments([new Investment('AAPL', 10, 0.5)]);
    portfolio.saveInvestments();

    portfolio.importHoldings([
        { ticker: 'NEW', shares: 5, price: 10, value: 50 }
    ]);

    const newHolding = portfolio.investments.find(i => i.ticker === 'NEW');
    assert.ok(newHolding);
    assert.strictEqual(newHolding.shares, 5);
    assert.strictEqual(newHolding.targetPercentage, 0);

    const status = portfolio.getPortfolioStatus();
    assert.strictEqual(status.details.find(d => d.ticker === 'NEW').shares, 5);
});

test('Portfolio import holdings respects CASH value fallback when shares are invalid', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.importHoldings([
        { ticker: 'CASH', shares: NaN, price: 0, value: 5000 }
    ]);

    const cashHolding = portfolio.investments.find(i => i.ticker === 'CASH');
    assert.ok(cashHolding);
    assert.strictEqual(cashHolding.shares, 5000);
});

test('Portfolio import holdings preserves valid CASH shares when provided', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.importHoldings([
        { ticker: 'CASH', shares: 2500, price: 0, value: 5000 }
    ]);

    const cashHolding = portfolio.investments.find(i => i.ticker === 'CASH');
    assert.ok(cashHolding);
    assert.strictEqual(cashHolding.shares, 2500);
});

test('Portfolio import holdings with CASH invalid shares and invalid value sets shares to zero', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.importHoldings([
        { ticker: 'CASH', shares: NaN, price: 0, value: NaN }
    ]);

    const cashHolding = portfolio.investments.find(i => i.ticker === 'CASH');
    assert.ok(cashHolding);
    assert.strictEqual(cashHolding.shares, 0);
});

test('Portfolio import holdings defaults invalid non-CASH shares to zero', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.importHoldings([
        { ticker: 'FOO', shares: NaN, price: 10, value: 100 }
    ]);

    const fooHolding = portfolio.investments.find(i => i.ticker === 'FOO');
    assert.ok(fooHolding);
    assert.strictEqual(fooHolding.shares, 0);
});

test('Portfolio savePrices skips invalid price entries and handles missing date', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.savePrices({ CASH: 100, FOO: undefined, BAR: NaN, AAPL: 150 }, null);
    assert.strictEqual(dbm.db.prepare('SELECT count(*) as count FROM prices').get().count, 0);

    portfolio.savePrices({ CASH: 100, FOO: undefined, BAR: NaN, AAPL: 150 }, '2026-05-06');
    assert.strictEqual(dbm.db.prepare('SELECT count(*) as count FROM prices').get().count, 1);
    assert.strictEqual(dbm.db.prepare('SELECT price FROM prices WHERE ticker = ? AND date = ?').get('AAPL', '2026-05-06').price, 150);
});

test('Portfolio latest price lookup covers cash, XX assets, and missing values', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    assert.strictEqual(portfolio._getLatestPrice('CASH'), 1.0);
    assert.strictEqual(portfolio._getLatestPrice('FUNXX'), 1.0);
    assert.strictEqual(portfolio._getLatestPrice('MISSING'), 0);

    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('FOO', '2026-05-06', 42);
    assert.strictEqual(portfolio._getLatestPrice('FOO'), 42);
});

test('Portfolio update daily prices continues over CASH and XX holdings', async () => {
    const dbm = new DatabaseManager(':memory:');
    const mockMarketData = {
        getEODPrice: async (ticker) => {
            if (ticker !== 'AAPL') {
                throw new Error(`Unexpected fetch for ${ticker}`);
            }
            return 150;
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('CASH', 100, 0),
        new Investment('FUNXX', 1000, 0),
        new Investment('AAPL', 1, 1)
    ]);

    await portfolio.updateDailyPrices();
    assert.strictEqual(portfolio._getLatestPrice('AAPL'), 150);
});

test('Portfolio update daily prices with Mocks', async () => {
    const dbm = new DatabaseManager(':memory:');

    // Duck typing MarketData mock
    const mockMarketData = {
        getEODPrice: async (ticker) => {
            if (ticker === 'AAPL') return 150;
            if (ticker === 'ERROR') throw new Error('Mock Polygon fail');
            return 100;
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('ERROR', 5, 0.5) // coverage for the catch block
    ]);

    // Trigger update wrapper
    await portfolio.updateDailyPrices();

    // The db should now have the price for AAPL but not ERROR
    const aaplPrice = portfolio._getLatestPrice('AAPL');
    assert.strictEqual(aaplPrice, 150);

    const errPrice = portfolio._getLatestPrice('ERROR');
    assert.strictEqual(errPrice, 0); // Default if not found
});

test('Portfolio update daily prices skips API call if price already cached', async () => {
    const dbm = new DatabaseManager(':memory:');
    const date = MarketData.getPreviousBusinessDay();

    // Cache the price in the DB beforehand
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', date, 150);

    let getEODPriceCalled = false;
    const mockMarketData = {
        getEODPrice: async (ticker) => {
            getEODPriceCalled = true;
            return 999; // Should not be called
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('AAPL', 10, 1.0)
    ]);

    await portfolio.updateDailyPrices();

    assert.strictEqual(getEODPriceCalled, false);
    assert.strictEqual(portfolio._getLatestPrice('AAPL'), 150); // Kept the cached price
});

test('Portfolio deletion and protection', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('CASH', 100, 0.5)
    ]);
    portfolio.saveInvestments();

    // Take a snapshot to create history
    portfolio.takeSnapshot('2023-01-01');

    // Verify history item exists for AAPL
    const historyItemBefore = dbm.db.prepare(`
        SELECT count(*) as count FROM portfolio_history_items phi
        JOIN portfolio_history ph ON phi.history_id = ph.id
        WHERE ph.portfolio_id = ? AND phi.ticker = ?
    `).get(1, 'AAPL');
    assert.strictEqual(historyItemBefore.count, 1);

    // Try deleting CASH (should be ignored)
    portfolio.deleteInvestment('CASH');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'CASH').shares, 100);

    // Delete AAPL
    portfolio.deleteInvestment('AAPL');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'AAPL'), undefined);

    const row = dbm.db.prepare('SELECT count(*) as count FROM investments WHERE ticker = ?').get('AAPL');
    assert.strictEqual(row.count, 0);

    // Verify history item for AAPL is deleted
    const historyItemAfter = dbm.db.prepare(`
        SELECT count(*) as count FROM portfolio_history_items phi
        JOIN portfolio_history ph ON phi.history_id = ph.id
        WHERE ph.portfolio_id = ? AND phi.ticker = ?
    `).get(1, 'AAPL');
    assert.strictEqual(historyItemAfter.count, 0);
});

test('Portfolio snapshotting and history', async () => {
    const dbm = new DatabaseManager(':memory:');

    const mockMarketData = {
        getEODPrice: async () => 200
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5),
        new Investment('MSFT', 10, 0.5)
    ]);
    portfolio.saveInvestments();

    const date = '2023-01-01';

    // Insert prices for status calculation to work
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', date, 200);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', date, 200);

    // Manual snapshot
    portfolio.takeSnapshot(date);

    const history = dbm.db.prepare('SELECT * FROM portfolio_history WHERE portfolio_id = 1 AND date = ?').get(date);
    assert.ok(history);
    assert.strictEqual(history.total_value, 4000); // (10*200) + (10*200)

    const items = dbm.db.prepare('SELECT * FROM portfolio_history_items WHERE history_id = ?').all(history.id);
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items.find(i => i.ticker === 'AAPL').price, 200);

    // Overwrite test
    dbm.db.prepare("UPDATE investments SET shares = 20 WHERE ticker = 'AAPL'").run();
    portfolio.loadInvestments();
    portfolio.takeSnapshot(date); // Same date

    const newHistory = dbm.db.prepare('SELECT * FROM portfolio_history WHERE portfolio_id = 1 AND date = ?').get(date);
    assert.strictEqual(newHistory.total_value, 6000); // (20*200) + (10*200)

    // Ensure only one record exists
    const count = dbm.db.prepare('SELECT count(*) as count FROM portfolio_history WHERE portfolio_id = 1 AND date = ?').get(date);
    assert.strictEqual(count.count, 1);
});

test('Portfolio takeSnapshot catches database transaction failures', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);
    portfolio.setInvestments([new Investment('AAPL', 10, 0.5)]);

    const originalTransaction = dbm.db.transaction;
    dbm.db.transaction = () => {
        return () => { throw new Error('boom'); };
    };

    assert.throws(
        () => portfolio.takeSnapshot('2026-05-06'),
        { message: /boom/ }
    );
    dbm.db.transaction = originalTransaction;
});

test('Portfolio ensureAssetNames fetches missing names and handles errors', async () => {
    const dbm = new DatabaseManager(':memory:');
    const mockMarketData = {
        getAssetDetails: async (ticker) => {
            if (ticker === 'AAPL') return 'Apple Inc.';
            if (ticker === 'ERROR') return null; // API fails, returns null
            return null;
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5, null),
        new Investment('MSFT', 10, 0.5, 'Microsoft Corp.'), // Already has name
        new Investment('CASH', 100, 0, null),
        new Investment('SAVINGS', 100, 0, null), // SAVINGS with null name
        new Investment('FUNXX', 100, 0, null), // 5 char ending in XX
        new Investment('ERROR', 5, 0, null)
    ]);
    portfolio.saveInvestments();

    await portfolio.ensureAssetNames();

    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'AAPL').name, 'Apple Inc.');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'MSFT').name, 'Microsoft Corp.');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'CASH').name, 'Cash');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'SAVINGS').name, 'Savings Account');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'FUNXX').name, 'Money Market Fund');
    assert.strictEqual(portfolio.investments.find(i => i.ticker === 'ERROR').name, null); // Failed

    // Call again to hit the fetchCount > 0 condition if AAPL and ERROR both triggered it,
    // though the loop continues immediately on CASH/FUNXX
    // To properly hit fetchCount > 0 delay, we can just let it run. The test might take 1s because of the delay.
});

test('Portfolio correlation matrix logic and calculations', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);

    // 1. calculateCorrelation on same ticker returns 1.0
    assert.strictEqual(portfolio.calculateCorrelation('AAPL', 'AAPL'), 1.0);

    // 2. Too few overlapping dates (less than 3) returns null
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-01', 150);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-02', 152);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-01', 300);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-02', 305);

    assert.strictEqual(portfolio.calculateCorrelation('AAPL', 'MSFT'), null);

    // 3. Zero variance return (constant price) returns null
    dbm.db.prepare('DELETE FROM prices').run();
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-01', 150);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-02', 150);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('AAPL', '2023-01-03', 150);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-01', 300);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-02', 300);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('MSFT', '2023-01-03', 300);
    // Since prices are constant, daily returns will be 0, yielding 0 variance.
    assert.strictEqual(portfolio.calculateCorrelation('AAPL', 'MSFT'), null);

    // Clear and do valid correlation test
    dbm.db.prepare('DELETE FROM prices').run();

    // Ticker A prices: 100, 110, 120 (returns: 10% gain, 9.09% gain)
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('A', '2023-01-01', 100);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('A', '2023-01-02', 110);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('A', '2023-01-03', 120);

    // Ticker B prices: 200, 220, 240 (returns: 10% gain, 9.09% gain) -> perfect correlation 1.0
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('B', '2023-01-01', 200);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('B', '2023-01-02', 220);
    dbm.db.prepare('INSERT INTO prices (ticker, date, price) VALUES (?, ?, ?)').run('B', '2023-01-03', 240);

    const corr = portfolio.calculateCorrelation('A', 'B');
    assert.ok(corr !== null);
    assert.ok(Math.abs(corr - 1.0) < 0.0001);

    // 4. Test getCorrelationMatrix filters correctly
    portfolio.setInvestments([
        new Investment('A', 10, 0.3),
        new Investment('B', 10, 0.3),
        new Investment('CASH', 100, 0.2),
        new Investment('VUSXX', 500, 0.2) // MMF should be filtered
    ]);

    const result = portfolio.getCorrelationMatrix();
    // CASH and MMF should be excluded from matrix tickers
    assert.deepStrictEqual(result.tickers, ['A', 'B']);
    assert.strictEqual(result.matrix.A.A, 1.0);
    assert.strictEqual(result.matrix.B.B, 1.0);
    assert.ok(Math.abs(result.matrix.A.B - 1.0) < 0.0001);
    assert.ok(Math.abs(result.matrix.B.A - 1.0) < 0.0001);
});

test('Portfolio updateFundamentalMetrics processes Stock, ETF, CASH, other types and handles thresholds', async () => {
    const dbm = new DatabaseManager(':memory:');
    const today = new Date().toISOString().split('T')[0];

    // Calculate dates for testing limits
    const dateStockCached = new Date();
    dateStockCached.setDate(dateStockCached.getDate() - 10); // 10 days ago (Stock should be skipped)
    const strStockCached = dateStockCached.toISOString().split('T')[0];

    const dateStockExpired = new Date();
    dateStockExpired.setDate(dateStockExpired.getDate() - 35); // 35 days ago (Stock should be updated)
    const strStockExpired = dateStockExpired.toISOString().split('T')[0];

    const dateETFCached = new Date();
    dateETFCached.setDate(dateETFCached.getDate() - 45); // 45 days ago (ETF should be skipped)
    const strETFCached = dateETFCached.toISOString().split('T')[0];

    const dateETFExpired = new Date();
    dateETFExpired.setDate(dateETFExpired.getDate() - 95); // 95 days ago (ETF should be updated)
    const strETFExpired = dateETFExpired.toISOString().split('T')[0];

    // Mock MarketData
    const mockMarketData = {
        getStockFundamentals: async (ticker) => {
            if (ticker === 'STOCK_ERR') throw new Error('API failed');
            return {
                annualDividend: 2.5,
                payoutRatio: 0.4,
                roic: 0.15
            };
        },
        getETFFundamentals: async (ticker) => {
            if (ticker === 'ETF_ERR') throw new Error('API failed');
            return 1.8;
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);

    // Setup investments of different types
    const invCash = new Investment('CASH', 100, 0.1, 'Cash', 'CASH');
    const invStockCached = new Investment('STK_OK', 10, 0.2, 'Stock Ok', 'STOCK');
    const invStockExpired = new Investment('STK_EXP', 10, 0.2, 'Stock Expired', 'stock'); // case-insensitive test
    const invStockErr = new Investment('STOCK_ERR', 10, 0.1, 'Stock Error', 'STOCK');
    const invETFCached = new Investment('ETF_OK', 10, 0.2, 'ETF Ok', 'ETF');
    const invETFExpired = new Investment('ETF_EXP', 10, 0.2, 'ETF Expired', 'etf'); // case-insensitive test
    const invETFErr = new Investment('ETF_ERR', 10, 0.1, 'ETF Error', 'ETF');
    const invBond = new Investment('BOND', 10, 0.1, 'Bond', 'BOND'); // neither STOCK nor ETF

    portfolio.setInvestments([
        invCash,
        invStockCached,
        invStockExpired,
        invStockErr,
        invETFCached,
        invETFExpired,
        invETFErr,
        invBond
    ]);

    // Save to DB to insert columns
    portfolio.saveInvestments();

    // Directly modify last_fundamental_update fields in the database to simulate historical update dates
    dbm.db.prepare("UPDATE investments SET last_fundamental_update = ? WHERE ticker = 'STK_OK'").run(strStockCached);
    dbm.db.prepare("UPDATE investments SET last_fundamental_update = ? WHERE ticker = 'STK_EXP'").run(strStockExpired);
    dbm.db.prepare("UPDATE investments SET last_fundamental_update = ? WHERE ticker = 'ETF_OK'").run(strETFCached);
    dbm.db.prepare("UPDATE investments SET last_fundamental_update = ? WHERE ticker = 'ETF_EXP'").run(strETFExpired);

    // Run synchronization
    await portfolio.updateFundamentalMetrics();

    // 1. CASH should not have last_fundamental_update
    const cashRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'CASH'").get();
    assert.strictEqual(cashRow.last_fundamental_update, null);

    // 2. BOND should not be processed (no last_fundamental_update)
    const bondRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'BOND'").get();
    assert.strictEqual(bondRow.last_fundamental_update, null);

    // 3. STK_OK should be skipped (keep old date)
    const stkOkRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'STK_OK'").get();
    assert.strictEqual(stkOkRow.last_fundamental_update, strStockCached);
    assert.strictEqual(stkOkRow.annual_dividend, null);

    // 4. STK_EXP should be updated to today and have fundamental values set
    const stkExpRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'STK_EXP'").get();
    assert.strictEqual(stkExpRow.last_fundamental_update, today);
    assert.strictEqual(stkExpRow.annual_dividend, 2.5);
    assert.strictEqual(stkExpRow.payout_ratio, 0.4);
    assert.strictEqual(stkExpRow.roic, 0.15);
    // Local instance properties check
    assert.strictEqual(invStockExpired.annualDividend, 2.5);
    assert.strictEqual(invStockExpired.payoutRatio, 0.4);
    assert.strictEqual(invStockExpired.roic, 0.15);

    // 5. ETF_OK should be skipped (keep old date)
    const etfOkRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'ETF_OK'").get();
    assert.strictEqual(etfOkRow.last_fundamental_update, strETFCached);
    assert.strictEqual(etfOkRow.annual_dividend, null);

    // 6. ETF_EXP should be updated to today, set annual_dividend and null payout/roic
    const etfExpRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'ETF_EXP'").get();
    assert.strictEqual(etfExpRow.last_fundamental_update, today);
    assert.strictEqual(etfExpRow.annual_dividend, 1.8);
    assert.strictEqual(etfExpRow.payout_ratio, null);
    assert.strictEqual(etfExpRow.roic, null);
    // Local instance check
    assert.strictEqual(invETFExpired.annualDividend, 1.8);
    assert.strictEqual(invETFExpired.payoutRatio, null);
    assert.strictEqual(invETFExpired.roic, null);

    // 7. STOCK_ERR should fail gracefully and not update date/values
    const stkErrRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'STOCK_ERR'").get();
    assert.strictEqual(stkErrRow.last_fundamental_update, null);

    // 8. ETF_ERR should fail gracefully and not update date/values
    const etfErrRow = dbm.db.prepare("SELECT * FROM investments WHERE ticker = 'ETF_ERR'").get();
    assert.strictEqual(etfErrRow.last_fundamental_update, null);
});

test('Portfolio updateFundamentalMetrics edge cases for coverage', async () => {
    const dbm = new DatabaseManager(':memory:');
    const mockMarketData = {};
    const portfolio = new Portfolio(1, dbm, mockMarketData);

    // 1. Ticker ending in XX to cover length === 5 && endsWith('XX')
    const invMMF = new Investment('FUNXX', 100, 0.1);
    
    // 2. Investment present on instance but deleted/not found in database
    const invNotFound = new Investment('STK_EXP', 10, 0.2, 'Stock Expired', 'STOCK');

    // 3. Investment with record type being falsy (null) in DB
    const invNoType = new Investment('NOTYPE', 10, 0.2, 'No Type', null);

    portfolio.setInvestments([
        invMMF,
        invNotFound,
        invNoType
    ]);

    // Save to DB to insert invNoType and invMMF, but immediately delete invNotFound from DB to trigger the !record branch
    portfolio.saveInvestments();
    dbm.db.prepare("DELETE FROM investments WHERE portfolio_id = 1 AND ticker = 'STK_EXP'").run();

    // Run synchronization
    await portfolio.updateFundamentalMetrics();

    // Check that STK_EXP was not processed, and NOTYPE was skipped because type is empty/not STOCK/ETF
    const noTypeRow = dbm.db.prepare("SELECT last_fundamental_update FROM investments WHERE ticker = 'NOTYPE'").get();
    assert.strictEqual(noTypeRow.last_fundamental_update, null);
});

test('Portfolio SAVINGS type initialization and protection', () => {
    const dbm = new DatabaseManager(':memory:');
    
    // Insert a portfolio with type 'SAVINGS'
    dbm.db.prepare("INSERT INTO portfolios (name, type) VALUES ('My Savings', 'SAVINGS')").run();
    const pRow = dbm.db.prepare("SELECT id FROM portfolios WHERE name = 'My Savings'").get();

    const portfolio = new Portfolio(pRow.id, dbm, null);
    portfolio.loadInvestments();

    assert.strictEqual(portfolio.type, 'SAVINGS');
    assert.strictEqual(portfolio.name, 'My Savings');
    
    // Should have exactly 1 investment: SAVINGS
    assert.strictEqual(portfolio.investments.length, 1);
    const savings = portfolio.investments[0];
    assert.strictEqual(savings.ticker, 'SAVINGS');
    assert.strictEqual(savings.name, 'Savings Account');
    assert.strictEqual(savings.targetPercentage, 1.0);

    // Test deletion protection
    portfolio.deleteInvestment('SAVINGS');
    assert.strictEqual(portfolio.investments.length, 1);
    assert.strictEqual(portfolio.investments[0].ticker, 'SAVINGS');
});

test('Portfolio SAVINGS latest price, status, and correlation matrix', () => {
    const dbm = new DatabaseManager(':memory:');
    dbm.db.prepare("INSERT INTO portfolios (name, type) VALUES ('My Savings', 'SAVINGS')").run();
    const pRow = dbm.db.prepare("SELECT id FROM portfolios WHERE name = 'My Savings'").get();

    const portfolio = new Portfolio(pRow.id, dbm, null);
    portfolio.loadInvestments();

    // Verify latest price is always 1.0
    assert.strictEqual(portfolio._getLatestPrice('SAVINGS'), 1.0);

    // Set shares/balance
    portfolio.investments[0].shares = 5000;
    portfolio.saveInvestments();

    // Verify status calculations
    const status = portfolio.getPortfolioStatus();
    assert.strictEqual(status.totalValue, 5000);
    assert.strictEqual(status.details.length, 1);
    assert.strictEqual(status.details[0].ticker, 'SAVINGS');
    assert.strictEqual(status.details[0].shares, 5000);
    assert.strictEqual(status.details[0].value, 5000);
    assert.strictEqual(status.details[0].actualPercentage, 1.0);
    assert.strictEqual(status.details[0].differencePercentage, 0.0);

    // Verify correlation matrix returns empty results
    const corr = portfolio.getCorrelationMatrix();
    assert.deepStrictEqual(corr.tickers, []);
    assert.deepStrictEqual(corr.matrix, {});
});

test('Portfolio SAVINGS importQfx updates holding and saves snapshot', () => {
    const dbm = new DatabaseManager(':memory:');
    dbm.db.prepare("INSERT INTO portfolios (name, type) VALUES ('My Savings', 'SAVINGS')").run();
    const pRow = dbm.db.prepare("SELECT id FROM portfolios WHERE name = 'My Savings'").get();

    const portfolio = new Portfolio(pRow.id, dbm, null);
    portfolio.loadInvestments();

    const qfxText = `
        <ORG>Chase
        <ACCTID>987654
        <BALAMT>15420.50
        <DTASOF>20260608
    `;

    portfolio.importQfx(qfxText);

    assert.strictEqual(portfolio.investments[0].shares, 15420.50);
    assert.strictEqual(portfolio.investments[0].name, 'Chase (987654)');

    // Verify history snapshot was saved
    const history = dbm.db.prepare("SELECT * FROM portfolio_history WHERE portfolio_id = ? AND date = ?").get(pRow.id, '2026-06-08');
    assert.ok(history);
    assert.strictEqual(history.total_value, 15420.50);

    const historyItems = dbm.db.prepare("SELECT * FROM portfolio_history_items WHERE history_id = ?").all(history.id);
    assert.strictEqual(historyItems.length, 1);
    assert.strictEqual(historyItems[0].ticker, 'SAVINGS');
    assert.strictEqual(historyItems[0].shares, 15420.50);
    assert.strictEqual(historyItems[0].price, 1.0);
});

test('Portfolio importQfx throws error on non-SAVINGS portfolios', () => {
    const dbm = new DatabaseManager(':memory:');
    const portfolio = new Portfolio(1, dbm, null);
    portfolio.loadInvestments(); // Defaults to INVESTMENT type

    assert.throws(() => {
        portfolio.importQfx('<BALAMT>5000');
    }, /Only an account with Type of SAVINGS can import QFX files\./);
});

test('Portfolio SAVINGS importQfx creates new SAVINGS investment if none exists', () => {
    const dbm = new DatabaseManager(':memory:');
    dbm.db.prepare("INSERT INTO portfolios (name, type) VALUES ('My Savings', 'SAVINGS')").run();
    const pRow = dbm.db.prepare("SELECT id FROM portfolios WHERE name = 'My Savings'").get();

    const portfolio = new Portfolio(pRow.id, dbm, null);
    portfolio.type = 'SAVINGS'; // Manually set type without loading investments
    portfolio.setInvestments([]); // Clear investments

    const qfxText = `
        <BALAMT>1500
        <DTASOF>20260608
    `;
    portfolio.importQfx(qfxText);

    assert.strictEqual(portfolio.investments.length, 1);
    assert.strictEqual(portfolio.investments[0].ticker, 'SAVINGS');
    assert.strictEqual(portfolio.investments[0].shares, 1500);
});

test('Portfolio loadInvestments handles non-existent portfolio metadata fallback', () => {
    const dbm = new DatabaseManager(':memory:');
    // Portfolio 1 (Default Portfolio) exists in dbm on schema initialization,
    // but we mock the metadata query to return undefined to test fallback values.
    const originalPrepare = dbm.db.prepare;
    dbm.db.prepare = (sql) => {
        const stmt = originalPrepare.call(dbm.db, sql);
        if (sql.includes('SELECT name, type FROM portfolios WHERE id = ?')) {
            return {
                get: () => undefined
            };
        }
        return stmt;
    };

    const portfolio = new Portfolio(1, dbm, null);
    portfolio.loadInvestments();

    assert.strictEqual(portfolio.name, '');
    assert.strictEqual(portfolio.type, 'INVESTMENT');

    dbm.db.prepare = originalPrepare;
});

