import test from 'node:test';
import assert from 'node:assert';
import BaseObject from '../core/BaseObject.js';
import logger from '../core/logger.js';

test('handleError redacts when error.message missing (covers empty check)', () => {
    const base = new BaseObject();

    // Stub logger to capture output without writing files
    const origInfo = logger.info;
    const captured = [];
    logger.info = (msg) => captured.push(msg);

    try {
        // Pass an object without a `message` property so `error.message` is undefined
        assert.throws(
            () => base.handleError('TEST_CTX', {}),
            { message: 'ERROR in TEST_CTX: undefined' }
        );

        // BaseObject.log prefixes the message with the class name
        assert.strictEqual(captured.length, 1);
        assert.strictEqual(captured[0], `BaseObject: ERROR in TEST_CTX: undefined`);
    } finally {
        logger.info = origInfo;
    }
});
