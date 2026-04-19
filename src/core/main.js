import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import Portfolio from './Portfolio.js';
import Investment from './Investment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize the core object model
const portfolio = new Portfolio();
portfolio.loadInvestments();

app.use(express.json());
// Serve the frontend UI
app.use(express.static(path.join(__dirname, '../../public')));

// --- REST API API ROUTES --- //

/**
 * Returns the current status of the portfolio, including live math and rebalancing amounts
 */
app.get('/api/portfolio', (req, res) => {
    try {
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Adds an investment explicitly to the portfolio list
 */
app.post('/api/investments', (req, res) => {
    try {
        const { ticker, shares, targetPercentage } = req.body;
        
        if (!ticker || shares === undefined || targetPercentage === undefined) {
             return res.status(400).json({ success: false, error: 'Ticker, shares, and targetPercentage are required' });
        }
        
        // We will append to current investments, or replace if existing
        const currentInvestments = portfolio.investments.filter(i => i.ticker !== ticker);
        const newInvestment = new Investment(ticker, parseFloat(shares), parseFloat(targetPercentage));
        currentInvestments.push(newInvestment);
        
        portfolio.setInvestments(currentInvestments);
        portfolio.saveInvestments();
        
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });

    } catch (error) {
        // Reload previous valid state if validation fails
        portfolio.loadInvestments(); 
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * Deletes an investment explicitly
 */
app.delete('/api/investments/:ticker', (req, res) => {
    try {
        const { ticker } = req.params;
        portfolio.deleteInvestment(ticker);
        const status = portfolio.getPortfolioStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Triggers a fetch of the previous business day closing prices from Polygon
 */
app.post('/api/prices/update', async (req, res) => {
    try {
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
