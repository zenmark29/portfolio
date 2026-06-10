import test from 'node:test';
import assert from 'node:assert';
import QfxParser from '../core/QfxParser.js';

test('QfxParser - parses valid QFX successfully with all fields', () => {
    const qfx = `
        OFXHEADER:100
        <OFX>
          <SIGNONMSGSRSV1>
            <SONRS>
              <FI><ORG>Chase</FI>
            </SONRS>
          </SIGNONMSGSRSV1>
          <BANKMSGSRSV1>
            <STMTTRNRS>
              <STMTRS>
                <BANKACCTFROM>
                  <ACCTID>123456789
                </BANKACCTFROM>
                <LEDGERBAL>
                  <BALAMT>12345.67
                  <DTASOF>20260608120000
                </LEDGERBAL>
              </STMTRS>
            </STMTTRNRS>
          </BANKMSGSRSV1>
        </OFX>
    `;
    const result = QfxParser.parse(qfx);
    assert.strictEqual(result.name, 'Chase (123456789)');
    assert.strictEqual(result.balance, 12345.67);
    assert.strictEqual(result.date, '2026-06-08');
});

test('QfxParser - handles missing ORG, logs warning and uses Unknown Bank with ACCTID', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>500
          <DTASOF>20251231
        </LEDGERBAL>
        <ACCTID>9876
    `;
    const result = QfxParser.parse(qfx);
    assert.strictEqual(result.name, 'Unknown Bank (9876)');
    assert.strictEqual(result.balance, 500.00);
    assert.strictEqual(result.date, '2025-12-31');
});

test('QfxParser - handles missing ACCTID, logs warning and uses ORG with Unknown Account', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>999.99
          <DTASOF>20260101
        </LEDGERBAL>
        <ORG>Wells Fargo
    `;
    const result = QfxParser.parse(qfx);
    assert.strictEqual(result.name, 'Wells Fargo (Unknown Account)');
    assert.strictEqual(result.balance, 999.99);
    assert.strictEqual(result.date, '2026-01-01');
});

test('QfxParser - handles missing ORG and ACCTID, logs warnings and uses defaults', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>150.25
        </LEDGERBAL>
    `;
    const result = QfxParser.parse(qfx);
    assert.strictEqual(result.name, 'Unknown Bank (Unknown Account)');
    assert.strictEqual(result.balance, 150.25);
    // Should fallback to today's date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.strictEqual(result.date, `${yyyy}-${mm}-${dd}`);
});

test('QfxParser - handles invalid or short DTASOF, fallback to today', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>150.25
          <DTASOF>2026
        </LEDGERBAL>
    `;
    const result = QfxParser.parse(qfx);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.strictEqual(result.date, `${yyyy}-${mm}-${dd}`);
});

test('QfxParser - handles completely invalid DTASOF date string, fallback to today', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>150.25
          <DTASOF>99999999
        </LEDGERBAL>
    `;
    const result = QfxParser.parse(qfx);
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    assert.strictEqual(result.date, `${yyyy}-${mm}-${dd}`);
});

test('QfxParser - throws error on empty QFX content', () => {
    assert.throws(() => {
        QfxParser.parse('');
    }, /QFX file content is empty/);
});

test('QfxParser - throws error on missing BALAMT', () => {
    const qfx = `
        <LEDGERBAL>
          <DTASOF>20260608
        </LEDGERBAL>
    `;
    assert.throws(() => {
        QfxParser.parse(qfx);
    }, /Could not find ledger balance <BALAMT> in QFX content/);
});

test('QfxParser - throws error on invalid BALAMT format', () => {
    const qfx = `
        <LEDGERBAL>
          <BALAMT>abc
        </LEDGERBAL>
    `;
    assert.throws(() => {
        QfxParser.parse(qfx);
    }, /Invalid balance format: abc/);
});
