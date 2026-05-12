import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

import Portfolio from './Portfolio.js';
import Investment from './Investment.js';
import DatabaseManager from './DatabaseManager.js';
import MarketData from './MarketData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize global dependencies
const dbManager = new DatabaseManager();
const marketData = new MarketData();

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
        const rows = dbManager.db.prepare('SELECT id, name, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/portfolios', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required.' });
        dbManager.db.prepare('INSERT INTO portfolios (name) VALUES (?)').run(name);
        const rows = dbManager.db.prepare('SELECT id, name, is_hidden FROM portfolios ORDER BY id ASC').all();
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
        const rows = dbManager.db.prepare('SELECT id, name, is_hidden FROM portfolios ORDER BY id ASC').all();
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
        const rows = dbManager.db.prepare('SELECT id, name, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/portfolios/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        dbManager.db.prepare('DELETE FROM portfolios WHERE id = ?').run(id);
        const rows = dbManager.db.prepare('SELECT id, name, is_hidden FROM portfolios ORDER BY id ASC').all();
        res.json({ success: true, data: rows });
    } catch(err) {
         res.status(500).json({ success: false, error: err.message });
    }
});

// --- REST API ROUTES FOR SPECIFIC PORTFOLIOS --- //

app.get('/api/portfolios/:id/status', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/portfolios/:id/investments', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { ticker, shares, targetPercentage } = req.body;

        if (!ticker || shares === undefined || targetPercentage === undefined) {
             return res.status(400).json({ success: false, error: 'Ticker, shares, and targetPercentage are required' });
        }

        const newInvestment = new Investment(ticker, parseFloat(shares), parseFloat(targetPercentage));
        const existingIndex = portfolio.investments.findIndex(i => i.ticker === ticker);

        if (existingIndex >= 0) {
            portfolio.investments[existingIndex] = newInvestment;
        } else {
            portfolio.investments.push(newInvestment);
        }

        portfolio.saveInvestments();

        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });

    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/portfolios/:id/import', (req, res) => {
    try {
        const portfolio = getPortfolio(req.params.id);
        const { holdings, generatedAt } = req.body;

        if (!Array.isArray(holdings) || holdings.length === 0) {
            return res.status(400).json({ success: false, error: 'Holdings array is required for import.' });
        }

        portfolio.importHoldings(holdings, generatedAt || null);
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
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Portfolio Web UI running on http://localhost:${port}`);
});
