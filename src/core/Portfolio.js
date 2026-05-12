import BaseObject from './BaseObject.js';
import Investment from './Investment.js';
import DatabaseManager from './DatabaseManager.js';
import MarketData from './MarketData.js';

class Portfolio extends BaseObject {
    /**
     * @param {number} portfolioId
     * @param {DatabaseManager} dbManager
     * @param {MarketData} marketData
     */
    constructor(portfolioId = 1, dbManager = new DatabaseManager(), marketData = new MarketData()) {
        super();
        this.portfolioId = portfolioId;
        this.dbManager = dbManager;
        this.marketData = marketData;
        /** @type {Investment[]} */
        this.investments = [];
    }

    setInvestments(investments) {
        this.investments = investments;
    }



    /**
     * Loads investments and latest prices from the database for this specific portfolio.
     */
    loadInvestments() {
        const rows = this.dbManager.db.prepare('SELECT id, ticker, shares, target_percentage FROM investments WHERE portfolio_id = ? ORDER BY id ASC').all(this.portfolioId);
        this.investments = rows.map(r => new Investment(r.ticker, r.shares, r.target_percentage));

        const hasCash = this.investments.some(inv => inv.ticker === 'CASH');
        if (!hasCash) {
            const cashInv = new Investment('CASH', 0, 0);
            this.investments.unshift(cashInv);
            this.saveInvestments();
        }
    }

    /**
     * Delete an investment explicitly from the portfolio
     * @param {string} ticker
     */
    deleteInvestment(ticker) {
        if (ticker === 'CASH') return; // Protected structural asset
        this.investments = this.investments.filter(inv => inv.ticker !== ticker);
        this.dbManager.db.prepare('DELETE FROM investments WHERE portfolio_id = ? AND ticker = ?').run(this.portfolioId, ticker);
        // Also delete from history items for this portfolio and ticker
        this.dbManager.db.prepare(`
            DELETE FROM portfolio_history_items
            WHERE history_id IN (SELECT id FROM portfolio_history WHERE portfolio_id = ?)
            AND ticker = ?
        `).run(this.portfolioId, ticker);
        // Note: we don't delete from prices since multiple portfolios may share the price.
    }

    /**
     * Saves the current investments to the database explicitly for this portfolio.
     */
    saveInvestments() {
        const insert = this.dbManager.db.prepare(
            'INSERT INTO investments (portfolio_id, ticker, shares, target_percentage) VALUES (?, ?, ?, ?) ON CONFLICT(portfolio_id, ticker) DO UPDATE SET shares=excluded.shares, target_percentage=excluded.target_percentage'
        );

        const transaction = this.dbManager.db.transaction((investments) => {
            for (const inv of investments) {
                insert.run(this.portfolioId, inv.ticker, inv.shares, inv.targetPercentage);
            }
        });

        transaction(this.investments);
    }

    /**
     * Saves the provided prices for the portfolio at the specified date.
     * @param {Record<string, number>} priceMap
     * @param {string} date
     */
    savePrices(priceMap, date) {
        if (!date) return;

        const insertPrice = this.dbManager.db.prepare(
            'INSERT OR REPLACE INTO prices (ticker, date, price) VALUES (?, ?, ?)'
        );

        const transaction = this.dbManager.db.transaction((entries) => {
            for (const [ticker, price] of entries) {
                if (ticker === 'CASH' || price === undefined || Number.isNaN(price)) continue;
                insertPrice.run(ticker, date, price);
            }
        });

        transaction(Object.entries(priceMap));
    }

    /**
     * Imports portfolio holdings from parsed CSV data and records a snapshot.
     * @param {Array<{ticker:string,shares:number,value:number,price:number}>} holdings
     * @param {string|null} generatedAt
     */
    importHoldings(holdings, generatedAt = null) {
        const existingTargetMap = new Map(this.investments.map(inv => [inv.ticker, inv.targetPercentage]));

        const newInvestments = holdings.map(h => {
            const ticker = h.ticker.toUpperCase();
            const rawShares = h.shares;
            const shares = ticker === 'CASH'
                ? (Number.isFinite(rawShares) ? rawShares : (Number.isFinite(h.value) ? h.value : 0))
                : (Number.isFinite(rawShares) ? rawShares : 0);
            const targetPercentage = existingTargetMap.has(ticker) ? existingTargetMap.get(ticker) : 0;
            return new Investment(ticker, shares, targetPercentage);
        });

        this.setInvestments(newInvestments);
        this.saveInvestments();

        const priceMap = {};
        for (const holding of holdings) {
            const ticker = holding.ticker.toUpperCase();
            if (ticker === 'CASH') continue;
            const price = Number(holding.price);
            if (!Number.isNaN(price)) {
                priceMap[ticker] = price;
            }
        }

        const snapshotDate = Portfolio._normalizeDateString(generatedAt) || MarketData.getPreviousBusinessDay();
        this.savePrices(priceMap, snapshotDate);
        this.takeSnapshot(snapshotDate);
    }

    static _normalizeDateString(value) {
        if (!value) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    /**
     * Updates daily prices for all investments in the portfolio by fetching from Polygon.
     */
    async updateDailyPrices() {
        const date = MarketData.getPreviousBusinessDay();
        const insertPrice = this.dbManager.db.prepare(
            'INSERT OR IGNORE INTO prices (ticker, date, price) VALUES (?, ?, ?)'
        );
        for (const inv of this.investments) {
            if (inv.ticker === 'CASH' || (inv.ticker.length === 5 && inv.ticker.endsWith('XX'))) continue;

            try {
                this.log(`Fetching price for ${inv.ticker} on ${date}`);
                const price = await this.marketData.getEODPrice(inv.ticker, date);
                if (price !== undefined) {
                    insertPrice.run(inv.ticker, date, price);
                    this.log(`Stored price for ${inv.ticker}: ${price}`);
                }
            } catch (error) {
                this.log(`Failed to update price for ${inv.ticker}: ${error.message}`);
            }
        }

        // After all prices are updated, take a snapshot of the final status
        this.takeSnapshot(date);
    }

    /**
     * Records a historical snapshot of the portfolio state.
     * @param {string} date - The date for the snapshot (YYYY-MM-DD)
     */
    takeSnapshot(date) {
        const status = this.getPortfolioStatus();

        const deleteHistory = this.dbManager.db.prepare('DELETE FROM portfolio_history WHERE portfolio_id = ? AND date = ?');
        const insertHistory = this.dbManager.db.prepare('INSERT INTO portfolio_history (portfolio_id, date, total_value) VALUES (?, ?, ?)');
        const insertItem = this.dbManager.db.prepare(`
            INSERT INTO portfolio_history_items
            (history_id, ticker, shares, price, actual_percentage, target_percentage)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const transaction = this.dbManager.db.transaction(() => {
            // Overwrite logic: clear existing for this date
            deleteHistory.run(this.portfolioId, date);

            const info = insertHistory.run(this.portfolioId, date, status.totalValue);
            const historyId = info.lastInsertRowid;

            for (const detail of status.details) {
                insertItem.run(
                    historyId,
                    detail.ticker,
                    detail.shares,
                    detail.price,
                    detail.actualPercentage,
                    detail.targetPercentage
                );
            }
        });

        try {
            transaction();
            this.log(`Portfolio snapshot recorded for ${date}`);
        } catch (error) {
            this.handleError('takeSnapshot', error);
        }
    }

    /**
     * Helper to get the most recent price from the DB for a ticker
     */
    _getLatestPrice(ticker) {
        if (ticker === 'CASH' || (ticker.length === 5 && ticker.endsWith('XX'))) return 1.0;

        const row = this.dbManager.db.prepare(
            'SELECT price FROM prices WHERE ticker = ? ORDER BY date DESC LIMIT 1'
        ).get(ticker);
        return row ? row.price : 0;
    }

    /**
     * Calculates the portfolio status including actual percentages and differences.
     * @returns {Object} status object with overall values and broken down by investment.
     */
    getPortfolioStatus() {
        let totalValue = 0;
        const prices = {};

        // Pre-fetch prices and calculate total value
        for (const inv of this.investments) {
            const price = this._getLatestPrice(inv.ticker);
            prices[inv.ticker] = price;
            totalValue += inv.getValue(price);
        }

        const details = this.investments.map(inv => {
            const price = prices[inv.ticker];
            const value = inv.getValue(price);
            const actualPercentage = totalValue > 0 ? (value / totalValue) : 0;
            const diffPercentage = inv.targetPercentage - actualPercentage;
            const rebalanceAmount = inv.getRebalanceAmount(price, totalValue);

            return {
                ticker: inv.ticker,
                shares: inv.shares,
                price: price,
                value: value,
                targetPercentage: inv.targetPercentage,
                actualPercentage: actualPercentage,
                differencePercentage: diffPercentage,
                rebalanceAmount: rebalanceAmount
            };
        });

        // Sum of actual percentages (should be 1.0 unless portfolio is empty)
        const actualPercentageSum = details.reduce((acc, d) => acc + d.actualPercentage, 0);

        // Sum of targets
        const targetPercentageSum = this.investments.reduce((acc, inv) => acc + inv.targetPercentage, 0);
        const isTargetValid = this.investments.length === 0 || Math.abs(targetPercentageSum - 1.0) <= 0.0001;

        return {
            totalValue,
            actualPercentageSum,
            targetPercentageSum,
            isTargetValid,
            details
        };
    }
}

export default Portfolio;
