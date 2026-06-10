import test from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../core/DatabaseManager.js';

test('Unified schema migration loop adds missing columns', () => {
    const dm = new DatabaseManager(':memory:');

    // Mock db to report that ALL modern columns are missing
    let execCalls = [];
    dm.db = {
        prepare: (sql) => ({
            get: () => {
                // Return count: 0 to simulate missing columns
                return { count: 0 };
            }
        }),
        exec: (sql) => {
            execCalls.push(sql);
        }
    };

    // Capture logs
    const origLog = dm.log;
    const logs = [];
    dm.log = (m) => logs.push(m);

    dm._migrateSchema();

    dm.log = origLog;

    // We have portfolios type migration + 9 dynamic investments migration columns
    assert.strictEqual(execCalls.length, 10);
    assert.ok(execCalls.some(sql => sql.includes('ALTER TABLE portfolios ADD COLUMN type TEXT')));
    assert.ok(execCalls.some(sql => sql.includes('ALTER TABLE investments ADD COLUMN name TEXT')));
    assert.ok(execCalls.some(sql => sql.includes('ALTER TABLE investments ADD COLUMN type TEXT')));
    assert.ok(execCalls.some(sql => sql.includes('ALTER TABLE investments ADD COLUMN estimated_forward_cashflow REAL')));
    assert.ok(logs.some(l => l.includes('Schema migration: Added column name')));
});

test('Unified schema migration loop skips already existing columns', () => {
    const dm = new DatabaseManager(':memory:');

    let execCalled = false;
    dm.db = {
        prepare: (sql) => ({
            get: () => {
                // Return count: 1 to simulate columns already existing
                return { count: 1 };
            }
        }),
        exec: (sql) => {
            execCalled = true;
        }
    };

    dm._migrateSchema();

    // No exec calls should be made since all columns already exist
    assert.strictEqual(execCalled, false);
});

test('Unified schema migration loop handles errors gracefully', () => {
    const dm = new DatabaseManager(':memory:');

    let handledErrors = [];
    const origHandle = dm.handleError;
    dm.handleError = (ctx, err) => {
        handledErrors.push({ ctx, message: err.message });
    };

    dm.db = {
        prepare: () => {
            throw new Error('Database prepare mock failure');
        },
        exec: () => {}
    };

    dm._migrateSchema();

    dm.handleError = origHandle;
    
    // We have portfolios type column + 9 dynamic investments columns, each should call handleError when prepare throws
    assert.strictEqual(handledErrors.length, 10);
    assert.ok(handledErrors.some(h => h.ctx === 'Migration column type on portfolios'));
    assert.ok(handledErrors.filter(h => h.ctx.startsWith('Migration column ')).length >= 9);
    assert.ok(handledErrors.every(h => h.message.includes('Database prepare mock failure')));
});
