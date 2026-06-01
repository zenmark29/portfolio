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
        this._runV3Schema();
        this._runV4Schema();
        this._runV5Schema();
        this._runV6Schema();

        // Ensure at least one default portfolio exists for fresh databases
        const count = this.db.prepare('SELECT count(*) as count FROM portfolios').get();
        if (count.count === 0) {
            this.db.prepare("INSERT INTO portfolios (name) VALUES ('Default Portfolio')").run();
        }
    }

    _runV6Schema() {
        try {
            const columnExists = this.db.prepare("SELECT count(*) as count FROM pragma_table_info('investments') WHERE name='estimated_forward_cashflow'").get().count > 0;
            if (!columnExists) {
                this.db.exec(`
                    ALTER TABLE investments ADD COLUMN estimated_forward_cashflow REAL;
                `);
                this.log("Schema verified/initialized (V6 - added estimated_forward_cashflow column).");
            }
        } catch (e) {
            this.handleError('Schema V6', e);
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
                name TEXT,
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
    _runV3Schema() {
        try {
            const columnExists = this.db.prepare("SELECT count(*) as count FROM pragma_table_info('investments') WHERE name='name'").get().count > 0;
            if (!columnExists) {
                this.db.exec('ALTER TABLE investments ADD COLUMN name TEXT');
                this.log("Schema verified/initialized (V3 - added name column).");
            }
        } catch (e) {
            this.handleError('Schema V3', e);
        }
    }

    _runV4Schema() {
        try {
            const columnExists = this.db.prepare("SELECT count(*) as count FROM pragma_table_info('investments') WHERE name='type'").get().count > 0;
            if (!columnExists) {
                this.db.exec(`
                    ALTER TABLE investments ADD COLUMN type TEXT;
                    ALTER TABLE investments ADD COLUMN macro_category TEXT;
                    ALTER TABLE investments ADD COLUMN fcf_yield REAL;
                    ALTER TABLE investments ADD COLUMN payout_ratio REAL;
                    ALTER TABLE investments ADD COLUMN roic REAL;
                    ALTER TABLE investments ADD COLUMN annual_dividend REAL;
                `);
                this.log("Schema verified/initialized (V4 - added type column).");
            }
        } catch (e) {
            this.handleError('Schema V4', e);
        }
    }

    _runV5Schema() {
        try {
            const columnExists = this.db.prepare("SELECT count(*) as count FROM pragma_table_info('investments') WHERE name='last_fundamental_update'").get().count > 0;
            if (!columnExists) {
                this.db.exec(`
                    ALTER TABLE investments ADD COLUMN last_fundamental_update TEXT;
                `);
                this.log("Schema verified/initialized (V5 - added last_fundamental_update column).");
            }
        } catch (e) {
            this.handleError('Schema V5', e);
        }
    }
}
export default DatabaseManager;
