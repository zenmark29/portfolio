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
    
    process.env.POLY_KEY = originalKey;
});
