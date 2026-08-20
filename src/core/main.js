import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

import Portfolio from './Portfolio.js';
import Investment from './Investment.js';
import DatabaseManager from './DatabaseManager.js';
import MarketData from './MarketData.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize global dependencies
const dbManager = new DatabaseManager();
const marketData = new MarketData();

// Security middlewares
app.use(helmet());

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 60,           // 'max' is renamed to 'limit' for clarity, though max is aliased
    standardHeaders: 'draft-7', // Draft-7 RateLimit headers
    legacyHeaders: false,       // Disable X-RateLimit-* headers
});
app.use(limiter);
app.use(express.json({ limit: '2mb' })); // Limit JSON payloads to 2MB
app.use(express.static(path.join(__dirname, '../../public')));

/**
 * GET /api/portfolios/:id/history
 * Retrieves historical snapshots of portfolio value and holdings over time.
 * Each snapshot is a point-in-time record created after a price update.
 * Used to display performance charts and track allocation changes.
 *
 * @param {number} id - Portfolio ID
 * @returns {Object} { success: true, data: Array<{ date, totalValue, holdings }> }
 */
app.get('/api/portfolios/:id/history', (req, res) => {
    try {
        const portfolioId = parseInt(req.params.id);
        const history = dbManager.db.prepare('SELECT id, date, total_value FROM portfolio_history WHERE portfolio_id = ? ORDER BY date ASC').all(portfolioId);

        const detailedHistory = history.map(h => {
            const items = dbManager.db.prepare('SELECT ticker, shares, price, actual_percentage, target_percentage FROM portfolio_history_items WHERE history_id = ?').all(h.id);
            return {
                date: h.date,
                totalValue: h.total_value,
                holdings: items
            };
        });

        res.json({ success: true, data: detailedHistory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Helper to dynamically instantiate the active portfolio context
const getPortfolio = (id) => {
    const portfolio = new Portfolio(parseInt(id), dbManager, marketData);
    portfolio.loadInvestments();
    return portfolio;
};

const getOverviewStatus = async () => {
    const portfolios = dbManager.db
        .prepare('SELECT id FROM portfolios WHERE is_hidden = 0 ORDER BY id ASC')
        .all()
        .map(row => getPortfolio(row.id));

    for (const portfolio of portfolios) {
        await portfolio.ensureAssetNames();
    }

    return Portfolio.getOverviewStatus(portfolios.map(portfolio => portfolio.getPortfolioStatus()));
};

// --- PORTFOLIOS API ROUTES --- //

/**
 * GET /api/portfolios
 * Retrieves all portfolios from the database.
 * Used by the UI to populate the portfolio selector dropdown and manage existing portfolios.
 *
 * @returns {Object} { success: true, data: Array<{ id, name, type, is_hidden }> }
 */
app.get('/api/portfolios', (req, res) => {
    try {
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/portfolios
 * Creates a new portfolio with the given name and type.
 * Validates portfolio name (max 30 chars, no special chars) before insertion.
 * Returns updated list of all portfolios after creation.
 *
 * @param {string} name - Portfolio name (required, max 30 characters)
 * @param {string} type - Portfolio type: 'INVESTMENT' or 'SAVINGS' (defaults to 'INVESTMENT')
 * @returns {Object} { success: true, data: Array<{ id, name, type, is_hidden }> }
 */
app.post('/api/portfolios', (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required.' });
        if (!name || name.length > 30 || /[<>"']/g.test(name)) {
            return res.status(400).json({ error: 'Invalid portfolio name - cannot be more than 30 characters' });
        }
        const portfolioType = type || 'INVESTMENT';
        dbManager.db.prepare('INSERT INTO portfolios (name, type) VALUES (?, ?)').run(name, portfolioType);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/portfolios/:id/visibility
 * Toggles the visibility (hide/show) of a portfolio in the UI.
 * Hidden portfolios are excluded from the main display but remain in the database.
 *
 * @param {number} id - Portfolio ID
 * @param {boolean} is_hidden - True to hide, false to show
 * @returns {Object} { success: true, data: Array<{ id, name, type, is_hidden }> }
 */
app.put('/api/portfolios/:id/visibility', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { is_hidden } = req.body;
        dbManager.db.prepare('UPDATE portfolios SET is_hidden = ? WHERE id = ?').run(is_hidden ? 1 : 0, id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/portfolios/:id/name
 * Renames an existing portfolio.
 * Validates that the name is not empty before updating.
 *
 * @param {number} id - Portfolio ID
 * @param {string} name - New portfolio name (required)
 * @returns {Object} { success: true, data: Array<{ id, name, type, is_hidden }> }
 */
app.put('/api/portfolios/:id/name', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required.' });
        dbManager.db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name, id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/portfolios/:id
 * Deletes a portfolio and all associated investments and history (via CASCADE).
 * This is a permanent operation and cannot be undone.
 *
 * @param {number} id - Portfolio ID to delete
 * @returns {Object} { success: true, data: Array<{ id, name, type, is_hidden }> }
 */
app.delete('/api/portfolios/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        dbManager.db.prepare('DELETE FROM portfolios WHERE id = ?').run(id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- REST API ROUTES FOR SPECIFIC PORTFOLIOS --- //

/**
 * GET /api/portfolios/:id/status
 * Retrieves the current portfolio status including total value, allocations, and performance metrics.
 * Ensures asset names are fetched from MarketData before returning status.
 * This is the primary endpoint for displaying portfolio summary in the UI.
 *
 * @param {number} id - Portfolio ID
 * @returns {Object} { success: true, data: { totalValue, holdings, targetPercentageSum, port_type, ... } }
 */
app.get('/api/portfolios/:id/status', async (req, res) => {
    try {
        if (req.params.id === 'overview') {
            res.json({ success: true, data: await getOverviewStatus() });
            return;
        }

        const portfolio = getPortfolio(req.params.id);
        await portfolio.ensureAssetNames();
        let status = portfolio.getPortfolioStatus();
        status.port_type = portfolio.type; // Include portfolio type in status response
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/portfolios/:id/correlation
 * Calculates and returns the correlation matrix between all assets in the portfolio.
 * Used by the heatmap visualization to show asset relationships and diversification quality.
 *
 * @param {number} id - Portfolio ID
 * @returns {Object} { success: true, data: correlation matrix }
 */
app.get('/api/portfolios/:id/correlation', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const correlationData = portfolio.getCorrelationMatrix();
        res.json({ success: true, data: correlationData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/portfolios/:id/investments
 * Adds or updates a single investment (holding) in a portfolio.
 * If the ticker already exists, it updates the shares and target percentage.
 * Validates ticker format (1-5 uppercase letters) and ensures required fields are present.
 *
 * @param {number} id - Portfolio ID
 * @param {string} ticker - Stock/ETF ticker symbol (1-5 uppercase letters, required)
 * @param {number} shares - Number of shares held (required)
 * @param {number} targetPercentage - Target portfolio allocation % (required, 0-1)
 * @param {string} [type] - Investment type (Stock, ETF, Crypto, etc.)
 * @param {string} [macroCategory] - Macro category (Growth, Value, Income, etc.)
 * @param {number} [fcfYield] - Free cash flow yield
 * @param {number} [payoutRatio] - Payout ratio
 * @param {number} [roic] - Return on invested capital
 * @param {number} [annualDividend] - Annual dividend amount
 * @returns {Object} { success: true, data: updated portfolio status }
 */
app.post('/api/portfolios/:id/investments', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { ticker, shares, targetPercentage, type, macroCategory, fcfYield, payoutRatio, roic, annualDividend } = req.body;

        if (!ticker || !/^[A-Z]{1,5}$/.test(ticker)) {
            return res.status(400).json({ error: 'Invalid ticker format - ticker cannot be longer than 5 characters' });
        }

        if (!ticker || shares === undefined || targetPercentage === undefined) {
            return res.status(400).json({ success: false, error: 'Ticker, shares, and targetPercentage are required' });
        }

        const existingIndex = portfolio.investments.findIndex(i => i.ticker === ticker);
        const existingInvestment = existingIndex >= 0 ? portfolio.investments[existingIndex] : null;

        const newInvestment = new Investment(
            ticker,
            parseFloat(shares),
            parseFloat(targetPercentage),
            existingInvestment ? existingInvestment.name : null,
            type !== undefined ? type : (existingInvestment ? existingInvestment.type : null),
            macroCategory !== undefined ? macroCategory : (existingInvestment ? existingInvestment.macroCategory : null),
            fcfYield !== undefined ? parseFloat(fcfYield) : (existingInvestment ? existingInvestment.fcfYield : null),
            payoutRatio !== undefined ? parseFloat(payoutRatio) : (existingInvestment ? existingInvestment.payoutRatio : null),
            roic !== undefined ? parseFloat(roic) : (existingInvestment ? existingInvestment.roic : null),
            annualDividend !== undefined ? parseFloat(annualDividend) : (existingInvestment ? existingInvestment.annualDividend : null)
        );

        if (existingIndex >= 0) {
            portfolio.investments[existingIndex] = newInvestment;
        } else {
            portfolio.investments.push(newInvestment);
        }

        portfolio.saveInvestments();
        await portfolio.ensureAssetNames();

        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });

    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/portfolios/:id/import
 * Bulk imports holdings from a parsed CSV export (typically from a broker).
 * Replaces the entire portfolio holdings with the provided array.
 * Automatically moves CASH to the front of the holdings list for UI consistency.
 * Subject to 2MB JSON body limit.
 *
 * @param {number} id - Portfolio ID
 * @param {Array} holdings - Array of { ticker, shares, targetPercentage, ... } (required, non-empty)
 * @param {string} [generatedAt] - Timestamp when the CSV was generated
 * @returns {Object} { success: true, data: updated portfolio status }
 */
app.post('/api/portfolios/:id/import', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { holdings, generatedAt } = req.body;



        if (!Array.isArray(holdings) || holdings.length === 0) {
            return res.status(400).json({ success: false, error: 'Holdings array is required for import.' });
        }

        const index = holdings.findIndex(inv => inv.ticker === 'CASH');
        if (index > -1) {
            holdings.unshift(holdings.splice(index, 1)[0]);
        }

        portfolio.importHoldings(holdings, generatedAt || null);
        await portfolio.ensureAssetNames();

        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error(`POST /api/portfolios/${req.params.id}/import failed: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/portfolios/:id/import-qfx
 * Imports a savings account balance from a QFX (Quicken Financial Exchange) file.
 * Parses QFX format to extract balance, account name, and date.
 * Typically used for brokerage cash positions or savings accounts.
 * Subject to 2MB JSON body limit.
 *
 * @param {number} id - Portfolio ID (must be of type 'SAVINGS')
 * @param {string} qfxText - Raw QFX file content (required)
 * @returns {Object} { success: true, data: updated portfolio status }
 */
app.post('/api/portfolios/:id/import-qfx', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { qfxText } = req.body;

        if (!qfxText) {
            return res.status(400).json({ success: false, error: 'QFX text content is required for import.' });
        }

        portfolio.importQfx(qfxText);
        await portfolio.ensureAssetNames();

        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error(`POST /api/portfolios/${req.params.id}/import-qfx failed: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/portfolios/:id/import-savings-csv
 * Imports a savings account balance from a custom CSV export format.
 * Parses CSV to extract account name, total balance, and generation timestamp.
 * Typically used for high-yield savings or money market accounts.
 * Subject to 2MB JSON body limit.
 *
 * @param {number} id - Portfolio ID (must be of type 'SAVINGS')
 * @param {string} csvText - Raw CSV file content (required)
 * @returns {Object} { success: true, data: updated portfolio status }
 */
app.post('/api/portfolios/:id/import-savings-csv', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { csvText } = req.body;

        if (!csvText) {
            return res.status(400).json({ success: false, error: 'CSV text content is required for import.' });
        }

        portfolio.importSavingsCsv(csvText);
        await portfolio.ensureAssetNames();

        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error(`POST /api/portfolios/${req.params.id}/import-savings-csv failed: ${error.message}`);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/portfolios/:id/investments/:ticker
 * Removes a single investment from the portfolio.
 * CASH and SAVINGS tickers cannot be deleted (protected structural assets).
 * Removes all price and history records associated with the ticker for this portfolio.
 *
 * @param {number} id - Portfolio ID
 * @param {string} ticker - Stock/ETF ticker symbol to remove
 * @returns {Object} { success: true, data: updated portfolio status }
 */
app.delete('/api/portfolios/:id/investments/:ticker', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { ticker } = req.params;
        portfolio.deleteInvestment(ticker);
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/portfolios/:id/prices/update
 * Fetches the latest market prices and fundamental metrics for all investments.
 * Calls Polygon.io for daily prices and Alpha Vantage for fundamental data (dividends, ROIC, etc.).
 * After updating prices, creates a portfolio snapshot in the history table.
 * This is a long-running operation that may take several seconds.
 *
 * @param {number} id - Portfolio ID
 * @returns {Object} { success: true, data: updated portfolio status with latest prices }
 */
app.post('/api/portfolios/:id/prices/update', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        await portfolio.updateDailyPrices();
        await portfolio.updateFundamentalMetrics();
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CENTRALIZED ERROR HANDLING MIDDLEWARE --- //
app.use((err, req, res, next) => {
    // Log precisely and descriptively but not verbosely
    logger.error(`${req.method} ${req.path} failed: ${err.message}`);

    res.status(500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});


app.listen(port, '127.0.0.1', () => {
    logger.info(`Portfolio Web UI running on http://127.0.0.1:${port}`);
});

// Validation helper for import payloads
const validateImportSize = (text, fieldName, maxSizeKb = 512) => {
    if (!text) {
        throw new Error(`${fieldName} is required`);
    }
    const sizeKb = new TextEncoder().encode(text).length / 1024;
    if (sizeKb > maxSizeKb) {
        throw new Error(`${fieldName} exceeds maximum size of ${maxSizeKb}KB (received ${sizeKb.toFixed(1)}KB)`);
    }
};
