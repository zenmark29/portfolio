import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AlphaVantageClient,
    GlobalQuoteResponse,
    OverviewResponse
} from '../core/AlphaVantageClient.js';

const jsonResponse = (payload, options = {}) => ({
    ok: true,
    json: async () => payload,
    ...options
});

test('AlphaVantageClient validates its configuration', () => {
    assert.throws(() => new AlphaVantageClient(''), /requires a valid apiKey string/);
    assert.throws(() => new AlphaVantageClient(12), /requires a valid apiKey string/);

    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = undefined;
        assert.throws(() => new AlphaVantageClient('test-key'), /fetch implementation is required/);
    } finally {
        globalThis.fetch = originalFetch;
    }

    const originalKey = process.env.AV_KEY;
    try {
        process.env.AV_KEY = 'environment-key';
        const client = new AlphaVantageClient(undefined, { fetcher: async () => jsonResponse({}) });
        assert.strictEqual(client.apiKey, 'environment-key');
    } finally {
        if (originalKey === undefined) {
            delete process.env.AV_KEY;
        } else {
            process.env.AV_KEY = originalKey;
        }
    }
});

test('request encodes parameters, filters nullish values, and handles API errors', async () => {
    let requestedUrl;
    const client = new AlphaVantageClient('test key', {
        fetcher: async (url) => {
            requestedUrl = new URL(url);
            return jsonResponse({ success: true });
        }
    });

    assert.deepStrictEqual(await client.request('OVERVIEW', {
        symbol: 'A B',
        datatype: 'json',
        omitted: undefined,
        alsoOmitted: null,
        count: 2
    }), { success: true });
    assert.strictEqual(requestedUrl.searchParams.get('apikey'), 'test key');
    assert.strictEqual(requestedUrl.searchParams.get('function'), 'OVERVIEW');
    assert.strictEqual(requestedUrl.searchParams.get('symbol'), 'A B');
    assert.strictEqual(requestedUrl.searchParams.get('count'), '2');
    assert.strictEqual(requestedUrl.searchParams.has('omitted'), false);
    assert.strictEqual(requestedUrl.searchParams.has('alsoOmitted'), false);

    const httpErrorClient = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse({}, { ok: false, status: 503, statusText: 'Unavailable' })
    });
    await assert.rejects(httpErrorClient.request('OVERVIEW'), /503 Unavailable/);

    for (const [payload, expected] of [
        [{ 'Error Message': 'bad symbol' }, /Alpha Vantage error: bad symbol/],
        [{ Note: 'slow down' }, /Alpha Vantage rate limit or note: slow down/],
        [{ Information: 'premium endpoint' }, /Alpha Vantage information: premium endpoint/]
    ]) {
        const errorClient = new AlphaVantageClient('key', {
            fetcher: async () => jsonResponse(payload)
        });
        await assert.rejects(errorClient.request('OVERVIEW'), expected);
    }
});

test('timeSeriesDaily selects adjusted data and applies the compact default', async () => {
    const calls = [];
    const client = new AlphaVantageClient('key', {
        fetcher: async (url) => {
            calls.push(new URL(url));
            return jsonResponse({});
        }
    });

    await client.timeSeriesDaily('IBM');
    await client.timeSeriesDaily('IBM', { outputSize: 'full', adjusted: true });

    assert.strictEqual(calls[0].searchParams.get('function'), 'TIME_SERIES_DAILY');
    assert.strictEqual(calls[0].searchParams.get('outputsize'), 'compact');
    assert.strictEqual(calls[1].searchParams.get('function'), 'TIME_SERIES_DAILY_ADJUSTED');
    assert.strictEqual(calls[1].searchParams.get('outputsize'), 'full');
});

test('trailingAnnualDividend sums at most 12 months and treats invalid dividends as zero', async () => {
    const timeSeries = Object.fromEntries(
        Array.from({ length: 13 }, (_, index) => [
            `2025-${String(12 - index).padStart(2, '0')}`,
            { '7. dividend amount': index === 0 ? '1.25' : (index === 1 ? 'invalid' : '0.25') }
        ])
    );
    const client = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse({ 'Monthly Adjusted Time Series': timeSeries })
    });

    assert.strictEqual(await client.trailingAnnualDividend('IBM'), 3.75);

    const emptyClient = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse({})
    });
    assert.strictEqual(await emptyClient.trailingAnnualDividend('IBM'), 0);
});

test('quote maps quote data and handles an empty response', async () => {
    const client = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse({
            'Global Quote': {
                '01. symbol': 'IBM',
                '02. open': '10.1',
                '03. high': '11.2',
                '04. low': '9.3',
                '05. price': '10.5',
                '06. volume': '1234',
                '07. latest trading day': '2025-01-01',
                '08. previous close': '10.2',
                '09. change': '0.3',
                '10. change percent': '2.94%'
            }
        })
    });
    const quote = await client.quote('IBM');
    assert.deepStrictEqual(quote, new GlobalQuoteResponse({
        '01. symbol': 'IBM',
        '02. open': '10.1',
        '03. high': '11.2',
        '04. low': '9.3',
        '05. price': '10.5',
        '06. volume': '1234',
        '07. latest trading day': '2025-01-01',
        '08. previous close': '10.2',
        '09. change': '0.3',
        '10. change percent': '2.94%'
    }));
    assert.strictEqual(quote.hasUsefulInformation, true);

    const emptyQuoteClient = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse({})
    });
    const emptyQuote = await emptyQuoteClient.quote('IBM');
    assert.strictEqual(emptyQuote.symbol, null);
    assert.strictEqual(emptyQuote.hasUsefulInformation, false);
});

test('searchKeywords passes the search query to the API', async () => {
    let requestedUrl;
    const client = new AlphaVantageClient('key', {
        fetcher: async (url) => {
            requestedUrl = new URL(url);
            return jsonResponse({ bestMatches: [] });
        }
    });

    assert.deepStrictEqual(await client.searchKeywords('International Business Machines'), { bestMatches: [] });
    assert.strictEqual(requestedUrl.searchParams.get('function'), 'SYMBOL_SEARCH');
    assert.strictEqual(requestedUrl.searchParams.get('keywords'), 'International Business Machines');
});

test('overview maps fundamental data and reports whether it contains useful information', async () => {
    const overviewPayload = {
        Symbol: 'IBM',
        'Asset type': 'Common Stock',
        Name: 'International Business Machines',
        Description: 'Technology company',
        CIK: '51143',
        Exchange: 'NYSE',
        Currency: 'USD',
        Country: 'USA',
        Sector: 'Technology',
        Industry: 'IT Services',
        'Market Capitalization': '1000',
        EBITDA: '200',
        'P/E Ratio': '10.5',
        'PEG Ratio': '1.2',
        'Book Value': '5.5',
        'Dividend per Share': '1.6',
        'Dividend Yield': '0.04',
        EPS: '2.3',
        'Revenue per Share TTM': '4.5',
        'Profit Margin': '0.2',
        'Operating Margin TTM': '0.3',
        'Return on Assets YTD': '0.1',
        'Return on Equity TTM': '0.15',
        'Revenue TTM': '3000',
        'Gross Profit TTM': '900'
    };
    const client = new AlphaVantageClient('key', {
        fetcher: async () => jsonResponse(overviewPayload)
    });
    const overview = await client.overview('IBM');

    assert.deepStrictEqual(overview, new OverviewResponse(overviewPayload));
    assert.strictEqual(overview.hasUsefulInformation, true);
    assert.strictEqual(overview.marketCapitalization, 1000);
    assert.strictEqual(overview.operatingMarginTTM, 0.3);

    const emptyOverview = new OverviewResponse({});
    assert.strictEqual(emptyOverview.symbol, null);
    assert.strictEqual(emptyOverview.marketCapitalization, null);
    assert.strictEqual(emptyOverview.hasUsefulInformation, false);

    for (const field of ['Name', 'Exchange', 'Currency', 'Sector']) {
        assert.strictEqual(new OverviewResponse({ Symbol: 'IBM', [field]: 'present' }).hasUsefulInformation, true);
    }
    assert.strictEqual(new OverviewResponse({ Symbol: 'IBM' }).hasUsefulInformation, false);
});

test('response models handle empty and partially useful payloads', () => {
    assert.strictEqual(new GlobalQuoteResponse({ '01. symbol': 'IBM' }).hasUsefulInformation, false);
    assert.strictEqual(new GlobalQuoteResponse({ '06. volume': '2' }).hasUsefulInformation, false);
    assert.strictEqual(new GlobalQuoteResponse({ '01. symbol': 'IBM', '06. volume': '2' }).hasUsefulInformation, true);
    assert.strictEqual(new GlobalQuoteResponse({ '01. symbol': 'IBM', '05. price': '0' }).price, 0);
});
