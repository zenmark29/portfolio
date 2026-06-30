import BaseObject from './BaseObject.js';

class SavingsCsvParser extends BaseObject {
    /**
     * Parse a Savings CSV file string and extract account name, ledger balance, and date.
     * @param {string} csvText
     * @returns {{ name: string, balance: number, date: string }}
     */
    static parse(csvText) {
        if (!csvText || !csvText.trim()) {
            throw new Error('CSV file content is empty');
        }

        const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n').map(line => line.trim());

        // Find the index of the header line starting with Account,
        const headerIndex = lines.findIndex(line => line.startsWith('Account,'));
        if (headerIndex === -1) {
            throw new Error('Could not find account summary header in CSV content');
        }

        const dataLine = lines[headerIndex + 1];
        if (!dataLine) {
            throw new Error('Could not find account data row in CSV content');
        }

        // Parse CSV line helper (handles quoted fields correctly)
        const parseCsvLine = (line) => {
            const values = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i += 1;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current);
            return values;
        };

        const headers = parseCsvLine(lines[headerIndex]);
        const dataValues = parseCsvLine(dataLine);

        const accountIndex = headers.indexOf('Account');
        const balanceIndex = headers.indexOf('Total Balance');

        if (accountIndex === -1 || balanceIndex === -1) {
            throw new Error('CSV is missing required headers');
        }

        const name = dataValues[accountIndex]?.trim();
        const rawBalance = dataValues[balanceIndex]?.trim();

        if (!name || !rawBalance) {
            throw new Error('Account name or balance missing from CSV data');
        }

        const balance = parseFloat(rawBalance.replace(/,/g, ''));
        if (Number.isNaN(balance)) {
            throw new Error(`Invalid balance format: ${rawBalance}`);
        }

        // Find date from "Generated at ..." line
        let date = null;
        const generatedAtLine = lines.find(line => line.startsWith('Generated at '));
        if (generatedAtLine) {
            let dateStr = generatedAtLine.replace('Generated at ', '').trim();
            // strip timezone abbreviation at the end (e.g. " ET", " EST", " EDT")
            dateStr = dateStr.replace(/\s+[A-Z]{2,4}$/i, '');
            const parsedDate = new Date(dateStr);
            if (!Number.isNaN(parsedDate.getTime())) {
                const yyyy = parsedDate.getFullYear();
                const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const dd = String(parsedDate.getDate()).padStart(2, '0');
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

        return {
            name,
            balance,
            date
        };
    }
}

export default SavingsCsvParser;
