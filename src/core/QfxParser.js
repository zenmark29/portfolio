import BaseObject from './BaseObject.js';

class QfxParser extends BaseObject {
    /**
     * Parse a QFX file string and extract account name, ledger balance, and date.
     * @param {string} qfxText
     * @returns {{ name: string, balance: number, date: string }}
     */
    static parse(qfxText) {
        if (!qfxText) {
            throw new Error('QFX file content is empty');
        }

        // Helper function to extract a tag's value
        const getTagValue = (tag) => {
            const regex = new RegExp(`<${tag}>([^<\\r\\n]+)(?:</${tag}>)?`, 'i');
            const match = qfxText.match(regex);
            return match ? match[1].trim() : null;
        };

        const balAmt = getTagValue('BALAMT');
        if (balAmt === null) {
            throw new Error('Could not find ledger balance <BALAMT> in QFX content');
        }

        const balance = parseFloat(balAmt.replace(/,/g, ''));
        if (Number.isNaN(balance)) {
            throw new Error(`Invalid balance format: ${balAmt}`);
        }

        const dtAsOf = getTagValue('DTASOF');
        let date = null;
        if (dtAsOf && dtAsOf.length >= 8) {
            const yyyy = dtAsOf.substring(0, 4);
            const mm = dtAsOf.substring(4, 6);
            const dd = dtAsOf.substring(6, 8);
            const parsedDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
            if (!Number.isNaN(parsedDate.getTime())) {
                date = `${yyyy}-${mm}-${dd}`;
            }
        }

        if (!date) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            date = `${yyyy}-${mm}-${dd}`;
        }

        const orgName = getTagValue('ORG');
        const acctId = getTagValue('ACCTID');

        // Both ORG and ACCTID should be present; create name with fallbacks if not
        const name = `${orgName || 'Unknown Bank'} (${acctId || 'Unknown Account'})`;

        return {
            name,
            balance,
            date
        };
    }
}

export default QfxParser;
