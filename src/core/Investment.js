import BaseObject from './BaseObject.js';

class Investment extends BaseObject {
    /**
     * @param {string} ticker
     * @param {number} shares
     * @param {number} targetPercentage - e.g., 0.25 for 25%
     * @param {string|null} name - The descriptive name of the asset
     * @param {string|null} type - Asset type classification
     * @param {string|null} macroCategory - Macro category classification
     */
    constructor(ticker, shares = 0, targetPercentage = 0, name = null, type = null, macroCategory = null, fcfYield = null, payoutRatio = null, roic = null, annualDividend = null) {
        super();
        this.ticker = ticker;
        this.shares = shares;
        this.targetPercentage = targetPercentage;
        this.name = name;
        this.type = type;
        this.macroCategory = macroCategory;
        this.fcfYield = fcfYield;
        this.payoutRatio = payoutRatio;
        this.roic = roic;
        this.annualDividend = annualDividend;
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
