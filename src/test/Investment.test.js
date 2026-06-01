import test from 'node:test';
import assert from 'node:assert';
import Investment from '../core/Investment.js';

test('Investment math operations', (t) => {
    // 100 shares, 25% target
    const inv = new Investment('AAPL', 100, 0.25);
    
    // Price = 150
    // Total Portfolio Value = 100000 -> Target value = 25000
    // Current value = 150 * 100 = 15000
    // Rebalance amount = target - current = 25000 - 15000 = +10000 (buy)
    
    assert.strictEqual(inv.getValue(150), 15000);
    assert.strictEqual(inv.getTargetValue(100000), 25000);
    assert.strictEqual(inv.getRebalanceAmount(150, 100000), 10000);
});

test('Investment math - Sell scenario', (t) => {
    // 200 shares, 10% target
    const inv = new Investment('MSFT', 200, 0.10);
    
    // Price = 300
    // Total Portfolio Value = 500000 -> Target value = 50000
    // Current value = 300 * 200 = 60000
    // Rebalance amount = target - current = 50000 - 60000 = -10000 (sell)
    
    assert.strictEqual(inv.getValue(300), 60000);
    assert.strictEqual(inv.getTargetValue(500000), 50000);
    assert.strictEqual(inv.getRebalanceAmount(300, 500000), -10000);
});

test('Investment math - Invalid price handling', (t) => {
    const inv = new Investment('AAPL', 100, 0.25);
    assert.throws(() => inv.getValue(-1), /Invalid price/);
    assert.throws(() => inv.getValue(null), /Invalid price/);
    assert.throws(() => inv.getValue(undefined), /Invalid price/);
    assert.throws(() => inv.getValue(NaN), /Invalid price/);
});

test('Investment Getters and Setters and Recalculations', () => {
    const inv = new Investment('AAPL', 100, 0.25, 'Apple', 'STOCK', 'Tech', 0.12, 0.3, 0.15, 1.2, 120);

    // Initial getter checks
    assert.strictEqual(inv.ticker, 'AAPL');
    assert.strictEqual(inv.shares, 100);
    assert.strictEqual(inv.targetPercentage, 0.25);
    assert.strictEqual(inv.name, 'Apple');
    assert.strictEqual(inv.type, 'STOCK');
    assert.strictEqual(inv.macroCategory, 'Tech');
    assert.strictEqual(inv.fcfYield, 0.12);
    assert.strictEqual(inv.payoutRatio, 0.3);
    assert.strictEqual(inv.roic, 0.15);
    assert.strictEqual(inv.annualDividend, 1.2);
    assert.strictEqual(inv.estimatedForwardCashflow, 120);

    // Setter updates and side-effect triggers
    inv.ticker = 'MSFT';
    assert.strictEqual(inv.ticker, 'MSFT');

    inv.shares = 200;
    assert.strictEqual(inv.shares, 200);
    assert.strictEqual(inv.estimatedForwardCashflow, 240); // 200 shares * 1.2 dividend

    inv.targetPercentage = 0.5;
    assert.strictEqual(inv.targetPercentage, 0.5);

    inv.name = 'Microsoft';
    assert.strictEqual(inv.name, 'Microsoft');

    inv.type = 'ETF';
    assert.strictEqual(inv.type, 'ETF');

    inv.macroCategory = 'Software';
    assert.strictEqual(inv.macroCategory, 'Software');

    inv.fcfYield = 0.14;
    assert.strictEqual(inv.fcfYield, 0.14);

    inv.payoutRatio = 0.4;
    assert.strictEqual(inv.payoutRatio, 0.4);

    inv.roic = 0.20;
    assert.strictEqual(inv.roic, 0.20);

    inv.annualDividend = 1.5;
    assert.strictEqual(inv.annualDividend, 1.5);
    assert.strictEqual(inv.estimatedForwardCashflow, 300); // 200 shares * 1.5 dividend

    inv.estimatedForwardCashflow = 400;
    assert.strictEqual(inv.estimatedForwardCashflow, 400);

    // Verify invalid values are handled safely in setters
    inv.shares = null;
    assert.strictEqual(inv.shares, 0);

    inv.shares = NaN;
    assert.strictEqual(inv.shares, 0);

    inv.targetPercentage = null;
    assert.strictEqual(inv.targetPercentage, 0);

    inv.fcfYield = null;
    assert.strictEqual(inv.fcfYield, null);

    inv.fcfYield = NaN;
    assert.strictEqual(inv.fcfYield, null);

    inv.payoutRatio = null;
    assert.strictEqual(inv.payoutRatio, null);

    inv.payoutRatio = NaN;
    assert.strictEqual(inv.payoutRatio, null);

    inv.roic = null;
    assert.strictEqual(inv.roic, null);

    inv.roic = NaN;
    assert.strictEqual(inv.roic, null);

    inv.annualDividend = null;
    assert.strictEqual(inv.annualDividend, null);

    inv.annualDividend = NaN;
    assert.strictEqual(inv.annualDividend, null);

    inv.estimatedForwardCashflow = null;
    assert.strictEqual(inv.estimatedForwardCashflow, 0);

    inv.estimatedForwardCashflow = NaN;
    assert.strictEqual(inv.estimatedForwardCashflow, 0);
});

test('Investment Serialization', () => {
    const inv = new Investment('AAPL', 100, 0.25, 'Apple', 'STOCK', 'Tech', 0.12, 0.3, 0.15, 1.2, 120);

    const data = inv.serialize();
    assert.deepStrictEqual(data, {
        ticker: 'AAPL',
        shares: 100,
        targetPercentage: 0.25,
        name: 'Apple',
        type: 'STOCK',
        macroCategory: 'Tech',
        fcfYield: 0.12,
        payoutRatio: 0.3,
        roic: 0.15,
        annualDividend: 1.2,
        estimatedForwardCashflow: 120
    });
});

test('Investment constructor with null/undefined annualDividend', () => {
    const invNullDiv = new Investment('AAPL', 100, 0.25, 'Apple', 'STOCK', 'Tech', 0.12, 0.3, 0.15, null);
    assert.strictEqual(invNullDiv.annualDividend, null);
    assert.strictEqual(invNullDiv.estimatedForwardCashflow, 0);
});

test('Investment constructor with non-null annualDividend and null estimatedForwardCashflow calculates it', () => {
    const invCalc = new Investment('AAPL', 100, 0.25, 'Apple', 'STOCK', 'Tech', 0.12, 0.3, 0.15, 1.5);
    assert.strictEqual(invCalc.annualDividend, 1.5);
    assert.strictEqual(invCalc.estimatedForwardCashflow, 150); // 100 * 1.5
});

test('Investment constructor with all null/undefined values', () => {
    const invAllNull = new Investment('AAPL', null, null, null, null, null, null, null, null, null, null);
    assert.strictEqual(invAllNull.shares, 0);
    assert.strictEqual(invAllNull.targetPercentage, 0);
    assert.strictEqual(invAllNull.fcfYield, null);
    assert.strictEqual(invAllNull.payoutRatio, null);
    assert.strictEqual(invAllNull.roic, null);
    assert.strictEqual(invAllNull.annualDividend, null);
    assert.strictEqual(invAllNull.estimatedForwardCashflow, 0);
});
