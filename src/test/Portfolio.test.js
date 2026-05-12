import test from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../core/DatabaseManager.js';
import Portfolio from '../core/Portfolio.js';
import Investment from '../core/Investment.js';

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
