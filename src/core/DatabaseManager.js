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
        this._runInitialSchema();
        this._migrateSchema();

        // Ensure at least one default portfolio exists for fresh databases
        const count = this.db.prepare('SELECT count(*) as count FROM portfolios').get();
        if (count.count === 0) {
            this.db.prepare("INSERT INTO portfolios (name) VALUES ('Default Portfolio')").run();
        }
    }

    _runInitialSchema() {
        const schema = `
            CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                type TEXT DEFAULT 'INVESTMENT',
                is_hidden INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS investments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                name TEXT,
                shares REAL NOT NULL DEFAULT 0,
                target_percentage REAL NOT NULL DEFAULT 0,
                type TEXT,
                macro_category TEXT,
                fcf_yield REAL,
                payout_ratio REAL,
                roic REAL,
                annual_dividend REAL,
                estimated_forward_cashflow REAL,
                last_fundamental_update TEXT,
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
        this.log("Initial database schema verified/initialized.");
    }

    /**
     * Unified migration loop to dynamically check and append missing columns.
     * Keeps backward compatibility for existing databases.
     */
    _migrateSchema() {
        try {
            const columnExists = this.db.prepare("SELECT count(*) as count FROM pragma_table_info('portfolios') WHERE name='type'").get().count > 0;
            if (!columnExists) {
                this.db.exec("ALTER TABLE portfolios ADD COLUMN type TEXT DEFAULT 'INVESTMENT'");
                this.log("Schema migration: Added column type to portfolios table.");
            }
        } catch (e) {
            this.handleError("Migration column type on portfolios", e);
        }

        const columns = [
            { name: 'name', type: 'TEXT' },
            { name: 'type', type: 'TEXT' },
            { name: 'macro_category', type: 'TEXT' },
            { name: 'fcf_yield', type: 'REAL' },
            { name: 'payout_ratio', type: 'REAL' },
            { name: 'roic', type: 'REAL' },
            { name: 'annual_dividend', type: 'REAL' },
            { name: 'estimated_forward_cashflow', type: 'REAL' },
            { name: 'last_fundamental_update', type: 'TEXT' }
        ];

        for (const col of columns) {
            try {
                const columnExists = this.db.prepare(`SELECT count(*) as count FROM pragma_table_info('investments') WHERE name='${col.name}'`).get().count > 0;
                if (!columnExists) {
                    this.db.exec(`ALTER TABLE investments ADD COLUMN ${col.name} ${col.type}`);
                    this.log(`Schema migration: Added column ${col.name} to investments table.`);
                }
            } catch (e) {
                this.handleError(`Migration column ${col.name}`, e);
            }
        }
    }
}

export default DatabaseManager;
