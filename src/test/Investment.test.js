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
});
