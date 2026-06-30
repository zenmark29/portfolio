import test from 'node:test';
import assert from 'node:assert';
import SavingsCsvParser from '../core/SavingsCsvParser.js';

test('SavingsCsvParser - parses valid CSV successfully with all fields', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal,Year-to-date (YTD) interest paid,Last year's interest earned,Annual percentage yield (APY)
"Premium ""Savings"" -3249","191,961.45",191961.45,2597.73,7144.36,3.50,

Value $
Cash,191961.45

Generated at Jun 20 2026 12:50 PM ET
`;
    const result = SavingsCsvParser.parse(csv);
    assert.strictEqual(result.name, 'Premium "Savings" -3249');
    assert.strictEqual(result.balance, 191961.45);
    assert.strictEqual(result.date, '2026-06-20');
});

test('SavingsCsvParser - handles missing date gracefully, fallback to today', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal,Year-to-date (YTD) interest paid,Last year's interest earned,Annual percentage yield (APY)
Premium Savings -3249,191961.45,191961.45,2597.73,7144.36,3.50,
`;
    const result = SavingsCsvParser.parse(csv);
    assert.strictEqual(result.name, 'Premium Savings -3249');
    assert.strictEqual(result.balance, 191961.45);
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.strictEqual(result.date, `${yyyy}-${mm}-${dd}`);
});

test('SavingsCsvParser - handles invalid date gracefully, fallback to today', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal,Year-to-date (YTD) interest paid,Last year's interest earned,Annual percentage yield (APY)
Premium Savings -3249,191961.45,191961.45,2597.73,7144.36,3.50,

Generated at Not a Valid Date
`;
    const result = SavingsCsvParser.parse(csv);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.strictEqual(result.date, `${yyyy}-${mm}-${dd}`);
});

test('SavingsCsvParser - throws error on empty CSV content', () => {
    assert.throws(() => {
        SavingsCsvParser.parse('');
    }, /CSV file content is empty/);
});

test('SavingsCsvParser - throws error on missing account summary header', () => {
    const csv = `Some other header
Foo,Bar
123,456
`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /Could not find account summary header in CSV content/);
});

test('SavingsCsvParser - throws error on missing data line', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /Could not find account data row in CSV content/);
});

test('SavingsCsvParser - throws error on missing required columns in header', () => {
    const csv = `Account Summary
Account,SomeOtherColumn
Premium Savings -3249,12345
`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /CSV is missing required headers/);
});

test('SavingsCsvParser - throws error on empty account name or balance', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal
,191961.45,191961.45
`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /Account name or balance missing from CSV data/);
});

test('SavingsCsvParser - throws error on invalid balance format', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal
Premium Savings -3249,abc,abc
`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /Invalid balance format: abc/);
});

test('SavingsCsvParser - throws error on blank data line', () => {
    const csv = `Account Summary
Account,Total Balance,Available for withdrawal

`;
    assert.throws(() => {
        SavingsCsvParser.parse(csv);
    }, /Could not find account data row in CSV content/);
});

