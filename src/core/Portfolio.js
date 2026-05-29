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
        const rows = this.dbManager.db.prepare('SELECT id, ticker, shares, target_percentage, name, type, macro_category, fcf_yield, payout_ratio, roic, annual_dividend FROM investments WHERE portfolio_id = ? ORDER BY id ASC').all(this.portfolioId);
        this.investments = rows.map(r => new Investment(
            r.ticker,
            r.shares,
            r.target_percentage,
            r.name,
            r.type,
            r.macro_category,
            r.fcf_yield,
            r.payout_ratio,
            r.roic,
            r.annual_dividend
        ));

        const hasCash = this.investments.some(inv => inv.ticker === 'CASH');
        if (!hasCash) {
            const cashInv = new Investment('CASH', 0, 0, 'Cash');
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
            'INSERT INTO investments (portfolio_id, ticker, shares, target_percentage, name, type, macro_category, fcf_yield, payout_ratio, roic, annual_dividend) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(portfolio_id, ticker) DO UPDATE SET shares=excluded.shares, target_percentage=excluded.target_percentage, name=COALESCE(excluded.name, investments.name), type=excluded.type, macro_category=excluded.macro_category, fcf_yield=excluded.fcf_yield, payout_ratio=excluded.payout_ratio, roic=excluded.roic, annual_dividend=excluded.annual_dividend'
        );

        const transaction = this.dbManager.db.transaction((investments) => {
            for (const inv of investments) {
                insert.run(
                    this.portfolioId,
                    inv.ticker,
                    inv.shares,
                    inv.targetPercentage,
                    inv.name,
                    inv.type,
                    inv.macroCategory,
                    inv.fcfYield,
                    inv.payoutRatio,
                    inv.roic,
                    inv.annualDividend
                );
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
        const existingTargetMap = new Map(this.investments.map(inv => [inv.ticker, inv])); // this is where I need to do the merge between existing investments and the new ones from the CSV,
        // preserving targets and other details where possible.
        const newInvestments = holdings.map(h => {
            if (existingTargetMap.has(h.ticker.toUpperCase())) {
                console.log(`Existing target for ${h.ticker}: ${existingTargetMap.get(h.ticker.toUpperCase()).ticker}`);
                const existing = existingTargetMap.get(h.ticker.toUpperCase());
                existing.shares = h.shares;
                // Preserve existing target percentage and other details

                return existing;
            } else {
                 console.log(`Importing holding: ${h.ticker}, shares: ${h.shares}, value: ${h.value}, price: ${h.price}`);
                const newInv = new Investment(
                    h.ticker.toUpperCase(),
                    h.shares,
                    0, // default target percentage, user can adjust later
                    null, // name will be fetched later if missing
                    null, // type unknown at this point
                    null, // macro category unknown at this point
                    null, // fcf yield unknown at this point
                    null, // payout ratio unknown at this point
                    null, // roic unknown at this point
                    null  // annual dividend unknown at this point
                );
                existingTargetMap.set(h.ticker.toUpperCase(), newInv);
                return newInv;
            }
        });


        this.setInvestments(newInvestments);// I don't need this if I set them in place.
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
     * Checks if any investments are missing names and fetches them from Polygon API.
     */
    async ensureAssetNames() {
        const updateName = this.dbManager.db.prepare('UPDATE investments SET name = ? WHERE portfolio_id = ? AND ticker = ?');
        let fetchCount = 0;

        for (const inv of this.investments) {
            if (inv.ticker === 'CASH' || (inv.ticker.length === 5 && inv.ticker.endsWith('XX'))) {
                if (!inv.name) {
                    inv.name = inv.ticker === 'CASH' ? 'Cash' : 'Money Market Fund';
                    updateName.run(inv.name, this.portfolioId, inv.ticker);
                }
                continue;
            }

            if (!inv.name) {
                // To avoid hitting the 5/min limit too fast, add a delay if we fetch multiple
                if (fetchCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                this.log(`Fetching asset details for ${inv.ticker}`);
                const name = await this.marketData.getAssetDetails(inv.ticker);
                fetchCount++;

                if (name) {
                    inv.name = name;
                    updateName.run(name, this.portfolioId, inv.ticker);
                    this.log(`Stored name for ${inv.ticker}: ${name}`);
                }
            }
        }
    }

    /**
     * Updates daily prices for all investments in the portfolio by fetching from Polygon.
     */
    async updateDailyPrices() {
        const date = MarketData.getPreviousBusinessDay();
        const insertPrice = this.dbManager.db.prepare(
            'INSERT OR IGNORE INTO prices (ticker, date, price) VALUES (?, ?, ?)'
        );
        const checkPrice = this.dbManager.db.prepare(
            'SELECT price FROM prices WHERE ticker = ? AND date = ?'
        );
        for (const inv of this.investments) {
            if (inv.ticker === 'CASH' || (inv.ticker.length === 5 && inv.ticker.endsWith('XX'))) continue;

            const existing = checkPrice.get(inv.ticker, date);
            if (existing !== undefined) {
                this.log(`Price for ${inv.ticker} on ${date} already exists in DB. Skipping API call.`);
                continue;
            }

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
                name: inv.name,
                shares: inv.shares,
                price: price,
                value: value,
                type: inv.type,
                macroCategory: inv.macroCategory,
                fcfYield: inv.fcfYield,
                payoutRatio: inv.payoutRatio,
                roic: inv.roic,
                annualDividend: inv.annualDividend,
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

    /**
     * Calculates the Pearson correlation coefficient between two tickers' daily returns.
     * @param {string} ticker1
     * @param {string} ticker2
     * @returns {number|null} Pearson correlation coefficient, or null if insufficient data/undefined.
     */
    calculateCorrelation(ticker1, ticker2) {
        if (ticker1 === ticker2) return 1.0;

        // Fetch prices from database sorted by date ascending
        const prices1 = this.dbManager.db.prepare(
            'SELECT date, price FROM prices WHERE ticker = ? ORDER BY date ASC'
        ).all(ticker1);

        const prices2 = this.dbManager.db.prepare(
            'SELECT date, price FROM prices WHERE ticker = ? ORDER BY date ASC'
        ).all(ticker2);

        // Align dates: find intersection of dates
        const priceMap2 = new Map(prices2.map(p => [p.date, p.price]));
        const alignedPrices = [];

        for (const p1 of prices1) {
            if (priceMap2.has(p1.date)) {
                alignedPrices.push({
                    date: p1.date,
                    price1: p1.price,
                    price2: priceMap2.get(p1.date)
                });
            }
        }

        // We need at least 3 common dates to compute 2 daily returns (needed for standard deviation variance calculation)
        if (alignedPrices.length < 3) {
            return null;
        }

        // Calculate returns
        const returns1 = [];
        const returns2 = [];

        for (let i = 1; i < alignedPrices.length; i++) {
            const prev = alignedPrices[i - 1];
            const curr = alignedPrices[i];

            // Calculate daily percentage returns
            const r1 = (curr.price1 - prev.price1) / prev.price1;
            const r2 = (curr.price2 - prev.price2) / prev.price2;

            returns1.push(r1);
            returns2.push(r2);
        }

        // Compute Pearson correlation coefficient
        const mean1 = returns1.reduce((sum, val) => sum + val, 0) / returns1.length;
        const mean2 = returns2.reduce((sum, val) => sum + val, 0) / returns2.length;

        let covariance = 0;
        let var1 = 0;
        let var2 = 0;

        for (let i = 0; i < returns1.length; i++) {
            const diff1 = returns1[i] - mean1;
            const diff2 = returns2[i] - mean2;

            covariance += diff1 * diff2;
            var1 += diff1 * diff1;
            var2 += diff2 * diff2;
        }

        const stdDevProduct = Math.sqrt(var1 * var2);
        if (stdDevProduct === 0) {
            return null; // Undefined correlation (zero variance in returns)
        }

        return covariance / stdDevProduct;
    }

    /**
     * Calculates the correlation matrix for all active correlatable tickers.
     * Excludes CASH and money market funds (5-character tickers ending in XX).
     * @returns {Object} { tickers: string[], matrix: Record<string, Record<string, number|null>> }
     */
    getCorrelationMatrix() {
        const activeTickers = this.investments
            .map(inv => inv.ticker)
            .filter(ticker => ticker !== 'CASH' && !(ticker.length === 5 && ticker.endsWith('XX')));

        const tickers = [...new Set(activeTickers)].sort();
        const matrix = {};

        for (const t of tickers) {
            matrix[t] = {};
        }

        for (let i = 0; i < tickers.length; i++) {
            const t1 = tickers[i];
            matrix[t1][t1] = 1.0; // self-correlation is 1.0

            for (let j = i + 1; j < tickers.length; j++) {
                const t2 = tickers[j];
                const corr = this.calculateCorrelation(t1, t2);

                // Since correlation matrix is symmetric
                matrix[t1][t2] = corr;
                matrix[t2][t1] = corr;
            }
        }

        return { tickers, matrix };
    }

    /**
     * Updates fundamental metrics from Alpha Vantage for Stock and ETF investments in the portfolio.
     * Respects throttling thresholds (30 days for stocks, 90 days for ETFs).
     * This updates both the active object being displayed and the database.
     */
    async updateFundamentalMetrics() {
        const today = new Date().toISOString().split('T')[0];

        /*
         * this if the date check.
         */
        const selectQuery = this.dbManager.db.prepare(
            'SELECT last_fundamental_update, type FROM investments WHERE portfolio_id = ? AND ticker = ?'
        );

        /*
         * This actually updates the data in the database.
         */
        const updateQuery = this.dbManager.db.prepare(`
            UPDATE investments
            SET annual_dividend = ?,
            fcf_yield = ?,
            payout_ratio = ?,
            roic = ?,
            last_fundamental_update = ?
            WHERE portfolio_id = ? AND ticker = ?
        `);

        for (const inv of this.investments) {
            const ticker = inv.ticker;
            if (ticker === 'CASH' || (ticker.length === 5 && ticker.endsWith('XX'))) continue;

            const record = selectQuery.get(this.portfolioId, ticker);
            if (!record) continue;

            const type = (record.type || '').toUpperCase();
            if (type !== 'STOCK' && type !== 'ETF') continue;

            const lastUpdate = record.last_fundamental_update;
            let needsUpdate = false;

            if (!lastUpdate) {
                needsUpdate = true;
            } else {
                const diffTime = Math.abs(new Date(today) - new Date(lastUpdate));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const threshold = type === 'STOCK' ? 30 : 90;
                if (diffDays >= threshold) {
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                try {
                    if (type === 'STOCK') {
                        this.log(`Syncing Stock fundamentals for ${ticker}...`);
                        const data = await this.marketData.getStockFundamentals(ticker);
                        if (data) {
                            updateQuery.run(
                                data.annualDividend,
                                data.fcfYield,
                                data.payoutRatio,
                                data.roic,
                                today,
                                this.portfolioId,
                                ticker
                            );

                            // Also update the local investment instance properties
                            inv.annualDividend = data.annualDividend;
                            inv.payoutRatio = data.payoutRatio;
                            inv.roic = data.roic;
                            inv.fcfYield = data.fcfYield;
                            this.log(`Stock fundamentals updated for ${ticker}.`);
                        }
                    } else if (type === 'ETF') {
                        this.log(`Syncing ETF fundamentals for ${ticker}...`);
                        const annualDividend = await this.marketData.getETFFundamentals(ticker);
                        updateQuery.run(
                            annualDividend,
                            null, // ETF FCF yield set to null
                            null, // ETF payout ratio set to null
                            null, // ETF ROIC set to null
                            today,
                            this.portfolioId,
                            ticker
                        );

                        inv.annualDividend = annualDividend;
                        inv.payoutRatio = null;
                        inv.roic = null;
                        this.log(`ETF fundamentals updated for ${ticker}.`);
                    }
                } catch (error) {
                    this.log(`Failed to update fundamentals for ${ticker}: ${error.message}`);
                }
            } else {
                this.log(`Fundamentals for ${ticker} are up to date (last update: ${lastUpdate}). Skipping sync.`);
            }
        }
    }
}

export default Portfolio;
