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
        // Example: Initializing the portfolio structure
        const schema = `
            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT UNIQUE NOT NULL,
                name TEXT,
                asset_type TEXT
            );
        `;
        this.db.exec(schema);
        this.log("Schema verified/initialized.");
    }
}

export default DatabaseManager;
