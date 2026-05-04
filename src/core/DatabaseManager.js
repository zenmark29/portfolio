import Database from 'better-sqlite3';
import BaseObject from './BaseObject.js';

class DatabaseManager extends BaseObject {
    /**
     * @param {string} dbName - Defaults to portfolio.db per project rules
     */
    constructor(dbName = 'portfolio.db') {
        super();
        try {
            this.db = new Database(dbName, { verbose: null });
            this.db.pragma('foreign_keys = ON'); // Required for ON DELETE CASCADE
            this.log(`Synchronous connection established: ${dbName}`);
            this._initializeSchema();
        } catch (error) {
            this.handleError('Database Connection', error);
        }
    }

    _initializeSchema() {
        this._runV2Schema();
        
        // Ensure at least one default portfolio exists for fresh databases
        const count = this.db.prepare('SELECT count(*) as count FROM portfolios').get();
        if (count.count === 0) {
            this.db.prepare("INSERT INTO portfolios (name) VALUES ('Default Portfolio')").run();
        }
    }

    _runV2Schema() {
        const schema = `
            CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                is_hidden INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS investments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                shares REAL NOT NULL DEFAULT 0,
                target_percentage REAL NOT NULL DEFAULT 0,
                UNIQUE(portfolio_id, ticker),
                FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                date TEXT NOT NULL,
                price REAL NOT NULL,
                UNIQUE(ticker, date)
            );

            CREATE TABLE IF NOT EXISTS portfolio_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                total_value REAL NOT NULL,
                UNIQUE(portfolio_id, date),
                FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS portfolio_history_items (
                history_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                shares REAL NOT NULL,
                price REAL NOT NULL,
                actual_percentage REAL NOT NULL,
                target_percentage REAL NOT NULL,
                FOREIGN KEY (history_id) REFERENCES portfolio_history(id) ON DELETE CASCADE
            );
        `;
        this.db.exec(schema);
        this.log("Schema verified/initialized (V2).");
    }
}
export default DatabaseManager;
