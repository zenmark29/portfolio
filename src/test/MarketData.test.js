import test, { mock } from 'node:test';
import assert from 'node:assert';
import MarketData from '../core/MarketData.js';

test('MarketData logic and mocking', async () => {
    const originalKey = process.env.POLY_KEY;
    const originalAVKey = process.env.AV_KEY;
    
    // Test constructor constraints
    delete process.env.POLY_KEY;
    assert.throws(() => new MarketData(), /POLY_KEY environment variable is not set/);
    
    process.env.POLY_KEY = 'TEST_KEY';
    delete process.env.AV_KEY;
    assert.throws(() => new MarketData(), /AV_KEY environment variable is not set/);
    
    process.env.AV_KEY = 'TEST_AV_KEY';
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

    // Test getAssetDetails
    md.rest.reference = {
        tickerDetails: mock.fn(async (ticker) => {
            if (ticker === 'ERROR') throw new Error('Polygon timeout');
            if (ticker === 'NONAME') return { results: {} };
            return { results: { name: 'Apple Inc.' } };
        })
    };
    
    const name = await md.getAssetDetails('AAPL');
    assert.strictEqual(name, 'Apple Inc.');
    
    const emptyName = await md.getAssetDetails('NONAME');
    assert.strictEqual(emptyName, null);
    
    const errName = await md.getAssetDetails('ERROR');
    assert.strictEqual(errName, null);

    // Mock avClient methods
    md.avClient = {
        request: mock.fn(async (func, params) => {
            if (params.symbol === 'ERROR') throw new Error('AV timeout');
            if (params.symbol === 'NONE_TEST') {
                return {
                    DividendPerShare: 'None',
                    PayoutRatio: '-',
                    ReturnOnInvestedCapitalTTM: 'abc'
                };
            }
            return {
                DividendPerShare: '3.50',
                PayoutRatio: '0.45',
                ReturnOnInvestedCapitalTTM: '0.18'
            };
        }),
        trailingAnnualDividend: mock.fn(async (symbol) => {
            if (symbol === 'ERROR') throw new Error('AV timeout');
            return 2.45;
        })
    };

    // Test getStockFundamentals
    const stockData = await md.getStockFundamentals('AAPL');
    assert.deepStrictEqual(stockData, {
        annualDividend: 3.50,
        payoutRatio: 0.45,
        roic: 0.18
    });

    const stockDataNone = await md.getStockFundamentals('NONE_TEST');
    assert.deepStrictEqual(stockDataNone, {
        annualDividend: 0,
        payoutRatio: 0,
        roic: 0
    });

    await assert.rejects(async () => {
        await md.getStockFundamentals('ERROR');
    }, /Failed to fetch Stock fundamentals for ERROR/);

    // Test getETFFundamentals
    const etfDividend = await md.getETFFundamentals('SPY');
    assert.strictEqual(etfDividend, 2.45);

    await assert.rejects(async () => {
        await md.getETFFundamentals('ERROR');
    }, /Failed to fetch ETF fundamentals for ERROR/);

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
    process.env.AV_KEY = originalAVKey;
});
