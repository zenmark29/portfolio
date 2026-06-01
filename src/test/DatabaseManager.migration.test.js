import test from 'node:test';
import assert from 'node:assert';
import DatabaseManager from '../core/DatabaseManager.js';

test('V3 migration adds name column when missing', () => {
    const dm = new DatabaseManager(':memory:');

    // Replace db with a stub that reports column missing and captures exec
    let execCalled = false;
    let execSql = null;
    dm.db = {
        prepare: (sql) => ({ get: () => ({ count: 0 }) }),
        exec: (sql) => { execCalled = true; execSql = sql; }
    };

    // Capture logs
    const origLog = dm.log;
    const logs = [];
    dm.log = (m) => logs.push(m);

    dm._runV3Schema();

    dm.log = origLog;

    assert.strictEqual(execCalled, true);
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN name'));
    assert.ok(logs.some(l => l.includes('V3 - added name column')));
});

test('V3 migration handles prepare errors by calling handleError', () => {
    const dm = new DatabaseManager(':memory:');

    let handled = false;
    const origHandle = dm.handleError;
    dm.handleError = (ctx, err) => {
        handled = true;
        assert.strictEqual(ctx, 'Schema V3');
        assert.ok(err instanceof Error);
    };

    dm.db = {
        prepare: () => { throw new Error('boom'); },
        exec: () => {}
    };

    dm._runV3Schema();

    dm.handleError = origHandle;
    assert.strictEqual(handled, true);
});

test('V4 migration adds new investment columns when missing', () => {
    const dm = new DatabaseManager(':memory:');

    let execCalled = false;
    let execSql = null;
    dm.db = {
        prepare: (sql) => ({ get: () => ({ count: 0 }) }),
        exec: (sql) => { execCalled = true; execSql = sql; }
    };

    const origLog = dm.log;
    const logs = [];
    dm.log = (m) => logs.push(m);

    dm._runV4Schema();

    dm.log = origLog;

    assert.strictEqual(execCalled, true);
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN type TEXT'));
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN fcf_yield REAL'));
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN annual_dividend REAL'));
    assert.ok(logs.some(l => l.includes('V4 - added type column')));
});

test('V4 migration handles prepare errors by calling handleError', () => {
    const dm = new DatabaseManager(':memory:');

    let handled = false;
    const origHandle = dm.handleError;
    dm.handleError = (ctx, err) => {
        handled = true;
        assert.strictEqual(ctx, 'Schema V4');
        assert.ok(err instanceof Error);
    };

    dm.db = {
        prepare: () => { throw new Error('boom'); },
        exec: () => {}
    };

    dm._runV4Schema();

    dm.handleError = origHandle;
    assert.strictEqual(handled, true);
});

test('V5 migration adds last_fundamental_update column when missing', () => {
    const dm = new DatabaseManager(':memory:');

    let execCalled = false;
    let execSql = null;
    dm.db = {
        prepare: (sql) => ({ get: () => ({ count: 0 }) }),
        exec: (sql) => { execCalled = true; execSql = sql; }
    };

    const origLog = dm.log;
    const logs = [];
    dm.log = (m) => logs.push(m);

    dm._runV5Schema();

    dm.log = origLog;

    assert.strictEqual(execCalled, true);
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN last_fundamental_update TEXT'));
    assert.ok(logs.some(l => l.includes('V5 - added last_fundamental_update column')));
});

test('V5 migration handles prepare errors by calling handleError', () => {
    const dm = new DatabaseManager(':memory:');

    let handled = false;
    const origHandle = dm.handleError;
    dm.handleError = (ctx, err) => {
        handled = true;
        assert.strictEqual(ctx, 'Schema V5');
        assert.ok(err instanceof Error);
    };

    dm.db = {
        prepare: () => { throw new Error('boom'); },
        exec: () => {}
    };

    dm._runV5Schema();

    dm.handleError = origHandle;
    assert.strictEqual(handled, true);
});

test('V6 migration adds estimated_forward_cashflow column when missing', () => {
    const dm = new DatabaseManager(':memory:');

    let execCalled = false;
    let execSql = null;
    dm.db = {
        prepare: (sql) => ({ get: () => ({ count: 0 }) }),
        exec: (sql) => { execCalled = true; execSql = sql; }
    };

    const origLog = dm.log;
    const logs = [];
    dm.log = (m) => logs.push(m);

    dm._runV6Schema();

    dm.log = origLog;

    assert.strictEqual(execCalled, true);
    assert.ok(execSql && execSql.includes('ALTER TABLE investments ADD COLUMN estimated_forward_cashflow REAL'));
    assert.ok(logs.some(l => l.includes('V6 - added estimated_forward_cashflow column')));
});

test('V6 migration handles prepare errors by calling handleError', () => {
    const dm = new DatabaseManager(':memory:');

    let handled = false;
    const origHandle = dm.handleError;
    dm.handleError = (ctx, err) => {
        handled = true;
        assert.strictEqual(ctx, 'Schema V6');
        assert.ok(err instanceof Error);
    };

    dm.db = {
        prepare: () => { throw new Error('boom'); },
        exec: () => {}
    };

    dm._runV6Schema();

    dm.handleError = origHandle;
    assert.strictEqual(handled, true);
});
