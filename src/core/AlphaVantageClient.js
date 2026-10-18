const DEFAULT_BASE_URL = 'https://www.alphavantage.co/query';

export class OverviewResponse {
    constructor(payload) {
        this.symbol = payload.Symbol || null;
        this.assetType = payload['Asset type'] || null;
        this.name = payload.Name || null;
        this.description = payload.Description || null;
        this.cik = payload.CIK || null;
        this.exchange = payload.Exchange || null;
        this.currency = payload.Currency || null;
        this.country = payload.Country || null;
        this.sector = payload.Sector || null;
        this.industry = payload.Industry || null;
        this.marketCapitalization = payload['Market Capitalization'] ? parseInt(payload['Market Capitalization']) : null;
        this.ebitda = payload.EBITDA ? parseInt(payload.EBITDA) : null;
        this.peRatio = payload['P/E Ratio'] ? parseFloat(payload['P/E Ratio']) : null;
        this.pegRatio = payload['PEG Ratio'] ? parseFloat(payload['PEG Ratio']) : null;
        this.bookValue = payload['Book Value'] ? parseFloat(payload['Book Value']) : null;
        this.dividendPerShare = payload['Dividend per Share'] ? parseFloat(payload['Dividend per Share']) : null;
        this.dividendYield = payload['Dividend Yield'] ? parseFloat(payload['Dividend Yield']) : null;
        this.eps = payload.EPS ? parseFloat(payload.EPS) : null;
        this.revenuePerShareTTM = payload['Revenue per Share TTM'] ? parseFloat(payload['Revenue per Share TTM']) : null;
        this.profitMargin = payload['Profit Margin'] ? parseFloat(payload['Profit Margin']) : null;
        this.operatingMarginTTM = payload['Operating Margin TTM'] ? parseFloat(payload['Operating Margin TTM']) : null;
        this.returnOnAssetsYTD = payload['Return on Assets YTD'] ? parseFloat(payload['Return on Assets YTD']) : null;
        this.returnOnEquityTTM = payload['Return on Equity TTM'] ? parseFloat(payload['Return on Equity TTM']) : null;
        this.revenueTTM = payload['Revenue TTM'] ? parseInt(payload['Revenue TTM']) : null;
        this.grossProfitTTM = payload['Gross Profit TTM'] ? parseInt(payload['Gross Profit TTM']) : null;
    }

    get hasUsefulInformation() {
        return !!(this.symbol && (this.name || this.exchange || this.currency || this.sector));
    }
}

export class GlobalQuoteResponse {
    constructor(payload) {
        this.symbol = payload['01. symbol'] || null;
        this.open = payload['02. open'] ? parseFloat(payload['02. open']) : null;
        this.high = payload['03. high'] ? parseFloat(payload['03. high']) : null;
        this.low = payload['04. low'] ? parseFloat(payload['04. low']) : null;
        this.price = payload['05. price'] ? parseFloat(payload['05. price']) : null;
        this.volume = payload['06. volume'] ? parseInt(payload['06. volume'], 10) : null;
        this.latestTradingDay = payload['07. latest trading day'] || null;
        this.previousClose = payload['08. previous close'] ? parseFloat(payload['08. previous close']) : null;
        this.change = payload['09. change'] ? parseFloat(payload['09. change']) : null;
        this.changePercent = payload['10. change percent']
            ? parseFloat(payload['10. change percent'].replace('%', '').trim())
            : null;
    }

    get hasUsefulInformation() {
        return !!(this.symbol && (this.price !== null || this.volume !== null));
    }
}

export class AlphaVantageClient {
    constructor(apiKey = process.env.AV_KEY, { fetcher } = {}) {
        if (!apiKey || typeof apiKey !== 'string') {
            throw new TypeError('AlphaVantageClient requires a valid apiKey string');
        }

        const effectiveFetch = fetcher ?? globalThis.fetch;
        if (typeof effectiveFetch !== 'function') {
            throw new Error('A fetch implementation is required for AlphaVantageClient');
        }

        this.apiKey = apiKey;
        this.baseUrl = DEFAULT_BASE_URL;
        this.fetcher = effectiveFetch;
    }

    async request(functionName, params = {}) {
        const url = new URL(this.baseUrl);
        url.searchParams.set('apikey', this.apiKey);
        url.searchParams.set('function', functionName);

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        });

        const response = await this.fetcher(url.toString());
        if (!response.ok) {
            throw new Error(`Alpha Vantage request failed: ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        if (payload['Error Message']) {
            throw new Error(`Alpha Vantage error: ${payload['Error Message']}`);
        }
        if (payload.Note) {
            throw new Error(`Alpha Vantage rate limit or note: ${payload.Note}`);
        }
        if (payload.Information) {
            throw new Error(`Alpha Vantage information: ${payload.Information}`);
        }

        return payload;
    }

    async timeSeriesDaily(symbol, { outputSize = 'compact', adjusted = false } = {}) {
        const functionName = adjusted ? 'TIME_SERIES_DAILY_ADJUSTED' : 'TIME_SERIES_DAILY';
        return this.request(functionName, {
            symbol,
            outputsize: outputSize,
            datatype: 'json'
        });
    }

    async trailingAnnualDividend(symbol) {
        const payload = await this.request('TIME_SERIES_MONTHLY_ADJUSTED', {
            symbol,
            datatype: 'json'
        });

        const timeSeries = payload['Monthly Adjusted Time Series'] || {};
        const dates = Object.keys(timeSeries);
        const trailing12Months = dates.slice(0, 12);

        return trailing12Months.reduce((total, date) => {
            const dividendPaidInMonth = parseFloat(timeSeries[date]['7. dividend amount']) || 0;
            return total + dividendPaidInMonth;
        }, 0);
    }

    async quote(symbol) {
        const payload = await this.request('GLOBAL_QUOTE', { symbol, datatype: 'json' });
        return new GlobalQuoteResponse(payload['Global Quote'] || {});
    }

    async searchKeywords(keywords) {
        return this.request('SYMBOL_SEARCH', { keywords, datatype: 'json' });
    }

    async overview(symbol) {
        const payload = await this.request('OVERVIEW', { symbol, datatype: 'json' });
        return new OverviewResponse(payload);
    }
}
