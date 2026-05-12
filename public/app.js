document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - App
    const totalValueEl = document.getElementById('totalValue');
    const actualPercentageSumEl = document.getElementById('actualPercentageSum');
    const investmentsListEl = document.getElementById('investmentsList');
    const addInvestmentForm = document.getElementById('addInvestmentForm');
    const updatePricesBtn = document.getElementById('updatePricesBtn');
    const importFileInput = document.getElementById('portfolioImportFile');
    const importPortfolioBtn = document.getElementById('btnImportPortfolio');
    const addBtn = document.getElementById('addBtn');
    const errorBanner = document.getElementById('errorBanner');

    // Portfolio Management Elements
    const selectEl = document.getElementById('portfolioSelect');
    const btnManagePortfolios = document.getElementById('btnManagePortfolios');
    const manageMenu = document.getElementById('manageMenu');
    const managePortfoliosList = document.getElementById('managePortfoliosList');
    const newPortfolioName = document.getElementById('newPortfolioName');
    const btnAddPortfolio = document.getElementById('btnAddPortfolio');

    let currentPortfolioId = null;

    // Formatters
    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatPercent = (val) => (val * 100).toFixed(2) + '%';

    // Utilities
    const showError = (msg) => {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
        setTimeout(() => { errorBanner.style.display = 'none'; }, 6000);
    };

    const clearError = () => {
        errorBanner.style.display = 'none';
        errorBanner.textContent = '';
    };

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

    const formatPortfolioDate = (dateInput) => {
        const date = dateInput ? new Date(dateInput) : null;
        if (!date || Number.isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const parsePortfolioDownloadCsv = (csvText) => {
        const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const rows = normalized.split('\n');
        const headerIndex = rows.findIndex(row => row.startsWith('Symbol,Last Price $'));

        if (headerIndex === -1) {
            throw new Error('Unable to locate the portfolio holdings header in the CSV.');
        }

        const header = parseCsvLine(rows[headerIndex]);
        const symbolIndex = header.indexOf('Symbol');
        const lastPriceIndex = header.indexOf('Last Price $');
        const quantityIndex = header.indexOf('Quantity');
        const valueIndex = header.indexOf('Value $');

        if ([symbolIndex, lastPriceIndex, quantityIndex, valueIndex].some(index => index === -1)) {
            throw new Error('CSV header is missing required columns.');
        }

        const holdings = [];

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i].trim();
            if (!row) continue;
            if (row.startsWith('TOTAL')) break;

            const values = parseCsvLine(row);
            const ticker = values[symbolIndex]?.trim();
            if (!ticker) continue;

            const rawPrice = values[lastPriceIndex]?.trim();
            const rawShares = values[quantityIndex]?.trim();
            const rawValue = values[valueIndex]?.trim();

            const price = rawPrice ? parseFloat(rawPrice.replace(/,/g, '')) : 0;
            let shares = rawShares ? parseFloat(rawShares.replace(/,/g, '')) : NaN;
            const value = rawValue ? parseFloat(rawValue.replace(/,/g, '')) : 0;

            if (ticker === 'CASH') {
                shares = Number.isNaN(shares) ? value : shares;
            } else {
                shares = Number.isNaN(shares) ? 0 : shares;
            }

            holdings.push({
                ticker,
                shares,
                price: Number.isNaN(price) ? 0 : price,
                value: Number.isNaN(value) ? 0 : value
            });
        }

        const generatedAtMatch = normalized.match(/Generated at (.+)$/m);
        const generatedAt = generatedAtMatch ? formatPortfolioDate(generatedAtMatch[1]) : null;

        return { holdings, generatedAt };
    };

    const importPortfolioFromCsv = async (file) => {
        const text = await file.text();
        const parsed = parsePortfolioDownloadCsv(text);
        if (!parsed.holdings.length) {
            throw new Error('The CSV did not contain any portfolio holdings.');
        }

        const res = await fetch(`/api/portfolios/${currentPortfolioId}/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
        });

        const result = await res.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to import portfolio CSV.');
        }

        return result.data;
    };

    const handlePortfolioImport = async () => {
        if (!currentPortfolioId) {
            showError('Select a portfolio before importing a CSV.');
            return;
        }

        const file = importFileInput.files?.[0];
        if (!file) {
            showError('Choose a CSV file to import.');
            return;
        }

        importPortfolioBtn.disabled = true;
        importPortfolioBtn.textContent = 'Importing...';

        try {
            const data = await importPortfolioFromCsv(file);
            renderPortfolio(data);
            fetchHistory(true);
        } catch (err) {
            showError(err.message || 'Failed to import portfolio CSV.');
        } finally {
            importPortfolioBtn.disabled = false;
            importPortfolioBtn.textContent = 'Import CSV';
        }
    };

    // Render Data to UI
    const renderPortfolio = (data) => {
        // Update Hero Stats
        totalValueEl.textContent = formatCurrency(data.totalValue);

        const sumColor = data.isTargetValid ? 'var(--positive)' : 'var(--negative)';
        actualPercentageSumEl.textContent = formatPercent(data.targetPercentageSum);
        actualPercentageSumEl.style.color = sumColor;

        if (!data.isTargetValid && data.details.length > 0) {
            errorBanner.textContent = 'Warning: Expected sum of 100% but targets sum to ' + formatPercent(data.targetPercentageSum) + '.';
            errorBanner.style.display = 'block';
            errorBanner.style.background = 'rgba(234, 179, 8, 0.1)';
            errorBanner.style.borderLeftColor = '#eab308';
        } else {
            errorBanner.style.background = 'var(--danger-bg)';
            errorBanner.style.borderLeftColor = 'var(--negative)';
            clearError();
        }

        // Clear Table
        investmentsListEl.innerHTML = '';

        // Inject Rows
        data.details.forEach(inv => {
            const tr = document.createElement('tr');

            // Rebalance Action formatting
            const isBuy = inv.rebalanceAmount >= 0;
            const diffClass = isBuy ? 'diff-positive' : 'diff-negative';
            const actionText = isBuy
                ? `BUY ${formatCurrency(inv.rebalanceAmount)}`
                : `SELL ${formatCurrency(Math.abs(inv.rebalanceAmount))}`;

            tr.className = inv.ticker === 'CASH' ? 'cash-row' : '';
            tr.innerHTML = `
                <td class="ticker-cell">${inv.ticker} ${inv.ticker === 'CASH' ? '💰' : ''}</td>
                <td>
                    <input type="number" class="grid-input shares-input"
                        data-ticker="${inv.ticker}"
                        data-field="shares"
                        value="${inv.shares}"
                        step="any" min="0"
                        title="${inv.ticker === 'CASH' ? 'Total Dollar Amount' : 'Number of Shares'}">
                </td>
                <td>${formatCurrency(inv.price)}</td>
                <td>${formatCurrency(inv.value)}</td>
                <td class="percent-cell">
                    <span>${formatPercent(inv.actualPercentage)}</span>
                    <span class="percent-target">
                        Target: <input type="number" class="grid-input target-input" data-ticker="${inv.ticker}" data-field="targetPercentage" value="${inv.targetPercentage}" step="0.01" min="0" max="1">
                    </span>
                </td>
                <td class="${diffClass}">
                    ${actionText}
                    <div style="font-size: 0.8em; opacity: 0.8">Diff: ${formatPercent(inv.differencePercentage)}</div>
                </td>
                <td>
                    ${inv.ticker !== 'CASH' ? `<button class="btn-delete" data-ticker="${inv.ticker}">✕</button>` : '<span style="opacity: 0.3; cursor: default;" title="System Asset">🔒</span>'}
                </td>
            `;
            investmentsListEl.appendChild(tr);
        });
    };

    // Fetch initial state
    const fetchPortfolio = async () => {
        if (!currentPortfolioId) return;
        try {
            clearError();
            const res = await fetch(`/api/portfolios/${currentPortfolioId}/status`);
            const result = await res.json();
            if (result.success) renderPortfolio(result.data);
            else showError(result.error);
        } catch (err) {
            showError('Network error connecting to API.');
        }
    };

    // --- MULTI PORTFOLIO LOGIC ---

    btnManagePortfolios.addEventListener('click', () => {
        manageMenu.style.display = manageMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (!btnManagePortfolios.contains(e.target) && !manageMenu.contains(e.target)) {
            manageMenu.style.display = 'none';
        }
    });

    selectEl.addEventListener('change', (e) => {
        currentPortfolioId = e.target.value;
        fetchPortfolio();
        fetchHistory(true);
    });

    const refreshPortfoliosUI = (portfolios) => {
        selectEl.innerHTML = '';
        managePortfoliosList.innerHTML = '';
        let hasVisible = false;

        portfolios.forEach(p => {
            if (!p.is_hidden) {
                hasVisible = true;
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                selectEl.appendChild(option);
            }

            const isCurrent = parseInt(currentPortfolioId) === p.id;

            managePortfoliosList.innerHTML += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 4px;">
                    <span style="${p.is_hidden ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${p.name} ${isCurrent ? '(active)' : ''}</span>
                    <div style="display: flex; gap: 0.2rem;">
                        <button class="btn-rename-portfolio" data-id="${p.id}" data-name="${p.name}" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary);" title="Rename">✏️</button>
                        <button class="btn-toggle-portfolio" data-id="${p.id}" data-hidden="${p.is_hidden}" style="background: transparent; border: none; cursor: pointer; color: var(--text-secondary);" title="${p.is_hidden ? 'Restore' : 'Hide'}">${p.is_hidden ? '👁️' : '🚫'}</button>
                        <button class="btn-delete-portfolio" data-id="${p.id}" style="background: transparent; border: none; cursor: pointer; color: var(--negative);" title="Delete">✕</button>
                    </div>
                </li>
            `;
        });

        if (!hasVisible && portfolios.length > 0) {
            currentPortfolioId = portfolios[0].id;
            selectEl.innerHTML = `<option value="${currentPortfolioId}">${portfolios[0].name}</option>`;
        }

        if (!currentPortfolioId && portfolios.length > 0) {
            currentPortfolioId = selectEl.options[0].value;
        } else if (selectEl.querySelector(`option[value="${currentPortfolioId}"]`)) {
            selectEl.value = currentPortfolioId;
        } else if (selectEl.options.length > 0) {
            currentPortfolioId = selectEl.options[0].value;
        }

        fetchPortfolio();
        fetchHistory(true); // Force fetch data in background
    };

    // --- CHARTING LOGIC ---
    let portfolioChart = null;
    let isChartVisible = false;
    const btnToggleChart = document.getElementById('btnToggleChart');
    const performancePanel = document.getElementById('performancePanel');

    btnToggleChart.addEventListener('click', () => {
        isChartVisible = !isChartVisible;
        performancePanel.style.display = isChartVisible ? 'block' : 'none';
        btnToggleChart.classList.toggle('btn-active', isChartVisible);
        if (isChartVisible) fetchHistory();
    });

    const fetchHistory = async (force = false) => {
        if (!currentPortfolioId || (!isChartVisible && !force)) return;
        try {
            const res = await fetch(`/api/portfolios/${currentPortfolioId}/history`);
            const result = await res.json();
            if (result.success) {
                if (result.data.length > 0) {
                    renderHistoryChart(result.data);
                } else if (portfolioChart) {
                    portfolioChart.destroy();
                    portfolioChart = null;
                }
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        }
    };

    const renderHistoryChart = (historyData) => {
        const ctx = document.getElementById('portfolioChart').getContext('2d');

        const labels = historyData.map(d => d.date);
        const totalValues = historyData.map(d => d.totalValue);

        // Find the absolute smallest holding value to set as the Y-axis floor
        let minHoldingValue = Number.MAX_VALUE;
        historyData.forEach(d => {
            d.holdings.forEach(h => {
                const val = h.shares * h.price;
                if (val > 0 && val < minHoldingValue) {
                    minHoldingValue = val;
                }
            });
        });
        if (minHoldingValue === Number.MAX_VALUE) minHoldingValue = 0;

        const datasets = [];

        // Add individual holdings as independent lines
        const tickers = [...new Set(historyData.flatMap(d => d.holdings.map(h => h.ticker)))].sort();
        tickers.forEach((ticker, index) => {
            const data = historyData.map(d => {
                const holding = d.holdings.find(h => h.ticker === ticker);
                return holding ? (holding.shares * holding.price) : 0;
            });

            const hue = (index * 137.5) % 360;
            datasets.push({
                label: ticker,
                data: data,
                borderColor: `hsla(${hue}, 70%, 50%, 0.8)`,
                backgroundColor: `hsla(${hue}, 70%, 50%, 0.8)`,
                borderWidth: 2,
                fill: false,
                pointRadius: 3,
                tension: 0.1
            });
        });

        // Add Total Portfolio Value line
        datasets.push({
            label: 'Total Portfolio Value',
            data: totalValues,
            borderColor: '#f8fafc', // Distinct white/light color
            backgroundColor: '#f8fafc',
            borderWidth: 4,
            borderDash: [5, 5], // Dashed line to stand out
            fill: false,
            pointRadius: 4,
            tension: 0.1,
            order: -1 // Draw on top
        });

        if (portfolioChart) {
            portfolioChart.destroy();
        }

        portfolioChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        min: minHoldingValue,
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            callback: (value) => '$' + value.toLocaleString(),
                            color: '#94a3b8'
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#f8fafc', padding: 20, boxWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    const fetchPortfolios = async () => {
        try {
            const res = await fetch('/api/portfolios');
            const result = await res.json();
            if (result.success) {
                refreshPortfoliosUI(result.data);
            }
        } catch(err) {
            showError('Failed to load portfolios list.');
        }
    };

    btnAddPortfolio.addEventListener('click', async () => {
        const name = newPortfolioName.value.trim();
        if (!name) return;
        try {
            const res = await fetch('/api/portfolios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const result = await res.json();
            if (result.success) {
                newPortfolioName.value = '';
                refreshPortfoliosUI(result.data);
            }
        } catch(err) {
            showError('Failed to create portfolio.');
        }
    });

    managePortfoliosList.addEventListener('click', async (e) => {
        const tgt = e.target.closest('button');
        if (!tgt) return;

        const id = tgt.dataset.id;

        if (tgt.classList.contains('btn-toggle-portfolio')) {
            const is_hidden = tgt.dataset.hidden === '0'; // toggle it
            try {
                const res = await fetch(`/api/portfolios/${id}/visibility`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_hidden })
                });
                const result = await res.json();
                if (result.success) refreshPortfoliosUI(result.data);
            } catch(err){ showError('Failed to update visibility.'); }
        }

        if (tgt.classList.contains('btn-rename-portfolio')) {
            const currentName = tgt.dataset.name;
            const newName = prompt('Enter new portfolio name:', currentName);
            if (newName && newName.trim() !== '' && newName !== currentName) {
                try {
                    const res = await fetch(`/api/portfolios/${id}/name`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName.trim() })
                    });
                    const result = await res.json();
                    if (result.success) refreshPortfoliosUI(result.data);
                    else showError(result.error || 'Failed to rename.');
                } catch(err){ showError('Failed to rename portfolio.'); }
            }
        }

        if (tgt.classList.contains('btn-delete-portfolio')) {
            if (!confirm('Are you absolutely sure you want to permanently delete this portfolio?')) return;
            try {
                const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.success) {
                    if (parseInt(currentPortfolioId) === parseInt(id)) currentPortfolioId = null;
                    refreshPortfoliosUI(result.data);
                }
            } catch(err){ showError('Failed to delete portfolio.'); }
        }
    });

    // Handle Form Submit
    addInvestmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentPortfolioId) return;
        clearError();

        const ticker = document.getElementById('ticker').value.toUpperCase();
        const shares = document.getElementById('shares').value;
        const targetPercentage = document.getElementById('targetPercentage').value;

        addBtn.disabled = true;
        addBtn.textContent = 'Updating...';

        try {
            const res = await fetch(`/api/portfolios/${currentPortfolioId}/investments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, shares, targetPercentage })
            });
            const result = await res.json();

            if (result.success) {
                renderPortfolio(result.data);
                addInvestmentForm.reset();
            } else {
                showError(result.error);
            }
        } catch (err) {
            showError('Network error while adding investment.');
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Update Portfolio';
        }
    });

    // Handle Price Sync
    updatePricesBtn.addEventListener('click', async () => {
        if (!currentPortfolioId) return;
        clearError();
        const originalText = updatePricesBtn.innerHTML;
        updatePricesBtn.disabled = true;
        updatePricesBtn.innerHTML = 'Syncing...';

        try {
            const res = await fetch(`/api/portfolios/${currentPortfolioId}/prices/update`, { method: 'POST' });
            const result = await res.json();

            if (result.success) {
                renderPortfolio(result.data);
                fetchHistory(); // Refresh chart after sync
            } else {
                showError(result.error);
            }
        } catch (err) {
            showError('Network error while syncing prices.');
        } finally {
            updatePricesBtn.disabled = false;
            updatePricesBtn.innerHTML = originalText;
        }
    });

    importPortfolioBtn.addEventListener('click', async () => {
        if (!currentPortfolioId) return;
        clearError();
        await handlePortfolioImport();
    });

    // Editable Grid Handlers
    investmentsListEl.addEventListener('change', async (e) => {
        if (!currentPortfolioId) return;
        if (e.target.classList.contains('grid-input')) {
            const tr = e.target.closest('tr');
            const ticker = e.target.dataset.ticker;
            const shares = tr.querySelector('.shares-input').value;
            const targetPercentage = tr.querySelector('.target-input').value;

            try {
                const res = await fetch(`/api/portfolios/${currentPortfolioId}/investments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker, shares, targetPercentage })
                });
                const result = await res.json();
                if (result.success) renderPortfolio(result.data);
                else showError(result.error);
            } catch (err) {
                showError('Network error while updating investment.');
            }
        }
    });

    investmentsListEl.addEventListener('click', async (e) => {
        if (!currentPortfolioId) return;
        if (e.target.classList.contains('btn-delete')) {
            const ticker = e.target.dataset.ticker;
            if (!confirm(`Are you sure you want to delete ${ticker}?`)) return;

            try {
                const res = await fetch(`/api/portfolios/${currentPortfolioId}/investments/${ticker}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.success) renderPortfolio(result.data);
                else showError(result.error);
            } catch (err) {
                showError('Network error while deleting investment.');
            }
        }
    });

    fetchPortfolios();
});
