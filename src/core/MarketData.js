import BaseObject from './BaseObject.js';
import { restClient } from '@polygon.io/client-js';

class MarketData extends BaseObject {
    constructor() {
        super();
        const apiKey = process.env.POLY_KEY;
        if (!apiKey) {
            this.handleError('Constructor', new Error('POLY_KEY environment variable is not set.'));
        }
        this.rest = restClient(apiKey);
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
}

export default MarketData;
