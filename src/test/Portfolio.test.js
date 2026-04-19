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
