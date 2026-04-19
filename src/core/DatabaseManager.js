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
            this.log(`Synchronous connection established: ${dbName}`);
            this._initializeSchema();
        } catch (error) {
            this.handleError('Database Connection', error);
        }
    }

    _initializeSchema() {
        const schema = `
            CREATE TABLE IF NOT EXISTS investments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT UNIQUE NOT NULL,
                shares REAL NOT NULL DEFAULT 0,
                target_percentage REAL NOT NULL DEFAULT 0
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
        this.log("Schema verified/initialized.");
    }
}

export default DatabaseManager;
