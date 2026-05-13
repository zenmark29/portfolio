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
        const msg = `ERROR in ${context}: ${error.message}`;
        this.log(msg);
        throw new Error(msg);
    }
}

export default BaseObject;
