import test, { mock } from 'node:test';
import assert from 'node:assert';
import MarketData from '../core/MarketData.js';

test('MarketData logic and mocking', async () => {
    const originalKey = process.env.POLY_KEY;
    
    delete process.env.POLY_KEY;
    assert.throws(() => new MarketData(), /POLY_KEY environment variable is not set/);
    
    process.env.POLY_KEY = 'TEST_KEY';
    const md = new MarketData();
    
    md.rest = {
        stocks: {
            dailyOpenClose: mock.fn(async (ticker, date) => {
                if (ticker === 'ERROR') throw new Error('Polygon timeout');
                return { close: 155.5 };
            })
        }
    };
    
    const price = await md.getEODPrice('AAPL', '2023-10-10');
    assert.strictEqual(price, 155.5);
    
    await assert.rejects(async () => {
        await md.getEODPrice('ERROR', '2023-10-10');
    }, /Failed to fetch price for ERROR/);

    const prevDay = MarketData.getPreviousBusinessDay();
    assert.match(prevDay, /^\d{4}-\d{2}-\d{2}$/);

    // Test specific date logic for getPreviousBusinessDay
    const originalDate = global.Date;
    
    // Mock Monday -> should return Friday (-3 days)
    global.Date = class extends originalDate {
        constructor() { super('2026-05-04T12:00:00'); } // Monday
        getDay() { return 1; }
        getDate() { return 4; }
        setDate(d) { assert.strictEqual(d, 1); } // 4 - 3 = 1 (Friday)
    };
    MarketData.getPreviousBusinessDay();

    // Mock Sunday -> should return Friday (-2 days)
    global.Date = class extends originalDate {
        constructor() { super('2026-05-03T12:00:00'); } // Sunday
        getDay() { return 0; }
        getDate() { return 3; }
        setDate(d) { assert.strictEqual(d, 1); } // 3 - 2 = 1 (Friday)
    };
    MarketData.getPreviousBusinessDay();
    
    global.Date = originalDate;
    process.env.POLY_KEY = originalKey;
});
