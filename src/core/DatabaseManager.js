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
        const hasPortfolios = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portfolios'").get();

        if (!hasPortfolios) {
            this.log('Applying Multi-Portfolio Migration Pipeline...');
            this._runMigration();
        } else {
            this._runV2Schema();
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
        `;
        this.db.exec(schema);
        this.log("Schema verified/initialized (V2).");
    }

    _runMigration() {
        const hasInvestments = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='investments'").get();
        if (!hasInvestments) {
            this._runV2Schema();
            this.db.prepare("INSERT INTO portfolios (name) VALUES ('Default Portfolio')").run();
            return;
        }

        this.db.exec("ALTER TABLE investments RENAME TO investments_old");
        this._runV2Schema();
        this.db.prepare("INSERT INTO portfolios (name) VALUES ('Default Portfolio')").run();
        this.db.exec("INSERT INTO investments (portfolio_id, ticker, shares, target_percentage) SELECT 1, ticker, shares, target_percentage FROM investments_old");
        this.db.exec("DROP TABLE investments_old");

        this.log('Multi-portfolio migration completed successfully.');
    }
}

export default DatabaseManager;
