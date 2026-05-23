import logger from './logger.js';

class BaseObject {
    constructor() {
        this.className = this.constructor.name;
    }

    /**
     * Precise, non-verbose logging.
     * @param {string} message
     */
    log(message) {
        logger.info(`${this.className}: ${message}`);
    }

    /**
     * Centralized error handling for objects.
     * @param {string} context
     * @param {Error} error
     */
    handleError(context, error) {
        // Redact sensitive environment values from error messages before logging
        const redact = (text) => {
            if (!text) return text;
            const keys = ['POLY_KEY', 'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS'];
            let out = String(text);
            for (const k of keys) {
                const v = process.env[k];
                if (v && typeof v === 'string' && v.length > 0) {
                    out = out.split(v).join('[REDACTED]');
                }
            }
            return out;
        };

        const sanitized = redact(error.message);
        const msg = `ERROR in ${context}: ${sanitized}`;
        this.log(msg);
        // Throw sanitized message including the context (preserves previous behavior
        // while avoiding leaking sensitive env values)
        throw new Error(msg);
    }
}

export default BaseObject;
