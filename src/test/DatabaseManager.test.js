import test from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../core/DatabaseManager.js';

test('DatabaseManager Unit Tests', (t) => {

    // Setup an in-memory database for testing
    // This qualifies as mocking the persistent file-system call
    const testDbName = ':memory:';
    const manager = new DatabaseManager(testDbName);

    t.test('should identify as DatabaseManager class', () => {
        assert.strictEqual(manager.className, 'DatabaseManager');
    });

    t.test('should initialize the assets table on creation', () => {
        // Query the sqlite_master table to verify schema application
        const stmt = manager.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='assets'"
        );
        const table = stmt.get();

        assert.ok(table, 'Assets table should exist');
        assert.strictEqual(table.name, 'assets');
    });

    t.test('should log initialization precisely', () => {
        // Verification that BaseObject's logging is inherited and utilized
        // In a full mock scenario, you could spy on console.log
        assert.doesNotThrow(() => manager.log('Test log entry'));
    });

    t.test('should handle connection errors gracefully', () => {
        // Attempting to connect to an invalid path to trigger BaseObject.handleError
        // We expect it to throw an error as defined in your BaseObject
        assert.throws(() => {
            new DatabaseManager('/invalid/path/to/db.db');
        }, /ERROR in Database Connection/);
    });
});
