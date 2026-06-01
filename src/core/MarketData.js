import BaseObject from './BaseObject.js';
import { restClient } from '@polygon.io/client-js';
import { AlphaVantageClient } from 'av_api';

class MarketData extends BaseObject {
    constructor() {
        super();
        const apiKey = process.env.POLY_KEY;
        if (!apiKey) {
            this.handleError('Constructor', new Error('POLY_KEY environment variable is not set.'));
        }
        this.rest = restClient(apiKey);

        const avKey = process.env.AV_KEY;
        if (!avKey) {
            this.handleError('Constructor', new Error('AV_KEY environment variable is not set.'));
        }
        this.avClient = new AlphaVantageClient(avKey);
    }

    /**
     * Fetches the previous daily open/close for a single ticker.
     * Polygon.io's rest.stocks.dailyOpenClose handles this.
     * @param {string} ticker
     * @param {string} date - Format: YYYY-MM-DD
     * @returns {Promise<number>} - Best representation of the EOD price (close price).
     */
    async getEODPrice(ticker, date) {
        try {
            // Note: date should be a valid business day.
            const response = await this.rest.stocks.dailyOpenClose(ticker, date);
            return response.close;
        } catch (error) {
            // If the date passed happens to be a weekend or holiday, it throws an error in Polygon.
            this.handleError('getEODPrice', new Error(`Failed to fetch price for ${ticker} on ${date}: ${error.message}`));
        }
    }

    /**
     * Helper to get a proper previous market day (skips weekend).
     * (Simplified approach - ideally requires a market calendar).
     * @returns {string} - YYYY-MM-DD
     */
    static getPreviousBusinessDay() {
        const date = new Date();
        const dayOfWeek = date.getDay();

        let daysToSubtract = 1;
        if (dayOfWeek === 0) { // Sunday
            daysToSubtract = 2;
        } else if (dayOfWeek === 1) { // Monday
            daysToSubtract = 3;
        }

        date.setDate(date.getDate() - daysToSubtract);
        return date.toISOString().split('T')[0];
    }
    /**
     * Fetches details for a given asset ticker (e.g., name).
     * @param {string} ticker
     * @returns {Promise<string|null>} - The name of the asset, or null if not found.
     */
    async getAssetDetails(ticker) {
        try {
            const response = await this.rest.reference.tickerDetails(ticker);
            return response.results.name || null;
        } catch (error) {
            this.log(`Failed to fetch details for ${ticker}: ${error.message}`);
            return null;
        }
    }

    /**
     * Fetches fundamental metrics for STOCK types from Alpha Vantage OVERVIEW.
     * @param {string} ticker
     * @returns {Promise<{annualDividend: number, payoutRatio: number, roic: number}>}
     */
    async getStockFundamentals(ticker) {
        try {
            this.log(`Fetching Stock fundamentals from Alpha Vantage for ${ticker}`);
            const payload = await this.avClient.request('OVERVIEW', { symbol: ticker, datatype: 'json' });

            const parseVal = (v) => {
                if (!v || v === 'None' || v === '-') return 0;
                const parsed = parseFloat(v);
                return Number.isNaN(parsed) ? 0 : parsed;
            };

            const dividendPerShare = parseVal(payload.DividendPerShare);
            const eps = parseVal(payload.EPS);
            const payoutRatio = payload.PayoutRatio ? parseVal(payload.PayoutRatio) : (dividendPerShare / eps || 0);
            const roic = payload.ReturnOnInvestedCapitalTTM ? parseVal(payload.ReturnOnInvestedCapitalTTM) : parseVal(payload.ReturnOnEquityTTM);
            const operatingMargin = parseVal(payload.OperatingMarginTTM);
            return {
                annualDividend: dividendPerShare,
                fcfYield: operatingMargin,
                payoutRatio: payoutRatio,
                roic: roic,
                operatingMargin: operatingMargin
            };
        } catch (error) {
            this.handleError('getStockFundamentals', new Error(`Failed to fetch Stock fundamentals for ${ticker}: ${error.message}`));
        }
    }

    /**
     * Fetches trailing annual dividend for ETF types from Alpha Vantage TIME_SERIES_MONTHLY_ADJUSTED.
     * @param {string} ticker
     * @returns {Promise<number>} - Trailing annual dividend amount.
     */
    async getETFFundamentals(ticker) {
        try {
            this.log(`Fetching ETF dividends from Alpha Vantage for ${ticker}`);
            const trailingDividend = await this.avClient.trailingAnnualDividend(ticker);
            return trailingDividend;
        } catch (error) {
            this.handleError('getETFFundamentals', new Error(`Failed to fetch ETF fundamentals for ${ticker}: ${error.message}`));
        }
    }
}

export default MarketData;
