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
// const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 }); // 60 requests/minute per IP
// Express 5 / rate-limit v8 standard syntax
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 60,           // 'max' is renamed to 'limit' for clarity, though max is aliased
    standardHeaders: 'draft-7', // Draft-7 RateLimit headers
    legacyHeaders: false,       // Disable X-RateLimit-* headers
});
app.use(limiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

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

// --- PORTFOLIOS API ROUTES --- //

app.get('/api/portfolios', (req, res) => {
    try {
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/portfolios', (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required.' });
        const portfolioType = type || 'INVESTMENT';
        dbManager.db.prepare('INSERT INTO portfolios (name, type) VALUES (?, ?)').run(name, portfolioType);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/portfolios/:id/visibility', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { is_hidden } = req.body;
        dbManager.db.prepare('UPDATE portfolios SET is_hidden = ? WHERE id = ?').run(is_hidden ? 1 : 0, id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/portfolios/:id/name', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required.' });
        dbManager.db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name, id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/portfolios/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        dbManager.db.prepare('DELETE FROM portfolios WHERE id = ?').run(id);
        const rows = dbManager.db.prepare('SELECT id, name, type, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

// --- REST API ROUTES FOR SPECIFIC PORTFOLIOS --- //

app.get('/api/portfolios/:id/status', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        await portfolio.ensureAssetNames();
        let status = portfolio.getPortfolioStatus();
        status.port_type = portfolio.type; // Include portfolio type in status response
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/portfolios/:id/correlation', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const correlationData = portfolio.getCorrelationMatrix();
        res.json({ success: true, data: correlationData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/portfolios/:id/investments', async (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { ticker, shares, targetPercentage, type, macroCategory, fcfYield, payoutRatio, roic, annualDividend } = req.body;

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
        res.status(400).json({ success: false, error: error.message });
    }
});

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
        res.status(400).json({ success: false, error: error.message });
    }
});

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
