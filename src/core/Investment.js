import BaseObject from './BaseObject.js';

class Investment extends BaseObject {
    /**
     * @param {string} ticker
     * @param {number} shares
     * @param {number} targetPercentage - e.g., 0.25 for 25%
     */
    constructor(ticker, shares = 0, targetPercentage = 0) {
        super();
        this.ticker = ticker;
        this.shares = shares;
        this.targetPercentage = targetPercentage;
    }

    /**
     * Gets the total value of this investment based on a given price.
     * @param {number} currentPrice 
     * @returns {number}
     */
    getValue(currentPrice) {
        if (currentPrice === undefined || currentPrice === null || currentPrice < 0) {
            this.handleError('getValue', new Error(`Invalid price for ${this.ticker}`));
        }
        return this.shares * currentPrice;
    }

    /**
     * Calculates the target value in dollars.
     * @param {number} totalPortfolioValue 
     * @returns {number}
     */
    getTargetValue(totalPortfolioValue) {
        return totalPortfolioValue * this.targetPercentage;
    }

    /**
     * Calculates how many dollars need to be bought (positive) or sold (negative).
     * @param {number} currentPrice 
     * @param {number} totalPortfolioValue 
     * @returns {number}
     */
    getRebalanceAmount(currentPrice, totalPortfolioValue) {
        const currentValue = this.getValue(currentPrice);
        const targetValue = this.getTargetValue(totalPortfolioValue);
        return targetValue - currentValue;
    }
}

export default Investment;
