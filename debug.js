import DatabaseManager from './src/core/DatabaseManager.js';
import Portfolio from './src/core/Portfolio.js';
import Investment from './src/core/Investment.js';

async function run() {
    const dbm = new DatabaseManager(':memory:');
    const mockMarketData = {
        getAssetDetails: async (ticker) => {
            if (ticker === 'AAPL') return 'Apple Inc.';
            if (ticker === 'ERROR') throw new Error('API failure');
            return null;
        }
    };

    const portfolio = new Portfolio(1, dbm, mockMarketData);
    portfolio.setInvestments([
        new Investment('AAPL', 10, 0.5, null),
        new Investment('MSFT', 10, 0.5, 'Microsoft Corp.'), // Already has name
        new Investment('CASH', 100, 0, null),
        new Investment('FUNXX', 100, 0, null), // 5 char ending in XX
        new Investment('ERROR', 5, 0, null)
    ]);
    try {
        portfolio.saveInvestments();
        console.log("saveInvestments ok");
        await portfolio.ensureAssetNames();
        console.log("ensureAssetNames ok");
    } catch(e) {
        console.error(e);
    }
}
run();
