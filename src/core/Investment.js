import BaseObject from './BaseObject.js';

class Investment extends BaseObject {
    /**
     * @param {string} ticker
     * @param {number} shares
     * @param {number} targetPercentage - e.g., 0.25 for 25%
     * @param {string|null} name - The descriptive name of the asset
     * @param {string|null} type - Asset type classification
     * @param {string|null} macroCategory - Macro category classification
     * @param {number|null} fcfYield
     * @param {number|null} payoutRatio
     * @param {number|null} roic
     * @param {number|null} annualDividend
     * @param {number|null} estimatedForwardCashflow
     */
    constructor(
        ticker,
        shares = 0,
        targetPercentage = 0,
        name = null,
        type = null,
        macroCategory = null,
        fcfYield = null,
        payoutRatio = null,
        roic = null,
        annualDividend = null,
        estimatedForwardCashflow = null
    ) {
        super();
        this._ticker = ticker;
        this._shares = (shares === null || Number.isNaN(Number(shares))) ? 0 : Number(shares);
        this._targetPercentage = (targetPercentage === null || Number.isNaN(Number(targetPercentage))) ? 0 : Number(targetPercentage);
        this._name = name;
        this._type = type;
        this._macroCategory = macroCategory;

        this._fcfYield = (fcfYield === null || fcfYield === undefined || Number.isNaN(Number(fcfYield))) ? null : Number(fcfYield);
        this._payoutRatio = (payoutRatio === null || payoutRatio === undefined || Number.isNaN(Number(payoutRatio))) ? null : Number(payoutRatio);
        this._roic = (roic === null || roic === undefined || Number.isNaN(Number(roic))) ? null : Number(roic);
        this._annualDividend = (annualDividend === null || annualDividend === undefined || Number.isNaN(Number(annualDividend))) ? null : Number(annualDividend);

        // if (estimatedForwardCashflow !== null && estimatedForwardCashflow !== undefined && !Number.isNaN(Number(estimatedForwardCashflow))) {
        //     this._estimatedForwardCashflow = Number(estimatedForwardCashflow);
        // } else {
            this._calculateForwardCashflow();
        // }
    }

    /**
     * Internal calculation of forward cash flow: shares * annualDividend
     * @private
     */
    _calculateForwardCashflow() {
        const div = this._annualDividend === null ? 0 : this._annualDividend;
        this._estimatedForwardCashflow = this._shares * div;
    }

    // Getters and Setters
    get ticker() {
        return this._ticker;
    }

    set ticker(value) {
        this._ticker = value;
    }

    get shares() {
        return this._shares;
    }

    set shares(value) {
        this._shares = (value === null || Number.isNaN(Number(value))) ? 0 : Number(value);
        this._calculateForwardCashflow();
    }

    get targetPercentage() {
        return this._targetPercentage;
    }

    set targetPercentage(value) {
        this._targetPercentage = (value === null || Number.isNaN(Number(value))) ? 0 : Number(value);
    }

    get name() {
        return this._name;
    }

    set name(value) {
        this._name = value;
    }

    get type() {
        return this._type;
    }

    set type(value) {
        this._type = value;
    }

    get macroCategory() {
        return this._macroCategory;
    }

    set macroCategory(value) {
        this._macroCategory = value;
    }

    get fcfYield() {
        return this._fcfYield;
    }

    set fcfYield(value) {
        this._fcfYield = (value === null || value === undefined || Number.isNaN(Number(value))) ? null : Number(value);
    }

    get payoutRatio() {
        return this._payoutRatio;
    }

    set payoutRatio(value) {
        this._payoutRatio = (value === null || value === undefined || Number.isNaN(Number(value))) ? null : Number(value);
    }

    get roic() {
        return this._roic;
    }

    set roic(value) {
        this._roic = (value === null || value === undefined || Number.isNaN(Number(value))) ? null : Number(value);
    }

    get annualDividend() {
        return this._annualDividend;
    }

    set annualDividend(value) {
        this._annualDividend = (value === null || value === undefined || Number.isNaN(Number(value))) ? null : Number(value);
        this._calculateForwardCashflow();
    }

    get estimatedForwardCashflow() {
        return this._estimatedForwardCashflow;
    }

    set estimatedForwardCashflow(value) {
        this._estimatedForwardCashflow = (value === null || value === undefined || Number.isNaN(Number(value))) ? 0 : Number(value);
    }

    /**
     * Gets the total value of this investment based on a given price.
     * @param {number} currentPrice
     * @returns {number}
     */
    getValue(currentPrice) {
        if (currentPrice === undefined || currentPrice === null || currentPrice < 0 || Number.isNaN(Number(currentPrice))) {
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

    /**
     * Custom serialization representation of this object.
     * @returns {Object}
     */
    serialize() {
        return {
            ticker: this.ticker,
            shares: this.shares,
            targetPercentage: this.targetPercentage,
            name: this.name,
            type: this.type,
            macroCategory: this.macroCategory,
            fcfYield: this.fcfYield,
            payoutRatio: this.payoutRatio,
            roic: this.roic,
            annualDividend: this.annualDividend,
            estimatedForwardCashflow: this.estimatedForwardCashflow
        };
    }
}

export default Investment;
