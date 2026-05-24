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
    const formatRealValue = (val) => Number.isFinite(val) ? val.toFixed(2) : '0.00';

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
            fetchCorrelation(true);
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

        // Inject Rows safely (avoid innerHTML with user-controlled data)
        data.details.forEach(inv => {
            const tr = document.createElement('tr');
            if (inv.ticker === 'CASH') tr.classList.add('cash-row');

            // Ticker cell
            const tdTicker = document.createElement('td');
            tdTicker.className = 'ticker-cell';
            const tickerDiv = document.createElement('div');
            tickerDiv.style.fontWeight = '600';
            tickerDiv.textContent = inv.ticker;
            tdTicker.appendChild(tickerDiv);

            if (inv.ticker !== 'CASH' && inv.name) {
                const nameDiv = document.createElement('div');
                nameDiv.style.fontSize = '0.75rem';
                nameDiv.style.opacity = '0.7';
                nameDiv.style.fontWeight = '400';
                nameDiv.style.marginTop = '4px';
                nameDiv.style.lineHeight = '1.2';
                nameDiv.textContent = inv.name;
                tdTicker.appendChild(nameDiv);
            }

            // Shares input cell
            const tdShares = document.createElement('td');
            const sharesInput = document.createElement('input');
            sharesInput.type = 'number';
            sharesInput.className = 'grid-input shares-input';
            sharesInput.setAttribute('data-ticker', inv.ticker);
            sharesInput.setAttribute('data-field', 'shares');
            sharesInput.value = String(inv.shares);
            sharesInput.step = 'any';
            sharesInput.min = '0';
            sharesInput.title = inv.ticker === 'CASH' ? 'Total Dollar Amount' : 'Number of Shares';
            tdShares.appendChild(sharesInput);

            // Price cell
            const tdPrice = document.createElement('td');
            tdPrice.textContent = formatCurrency(inv.price);

            // Value cell
            const tdValue = document.createElement('td');
            tdValue.textContent = formatCurrency(inv.value);

            // Type cell
            const tdType = document.createElement('td');
            const typeInput = document.createElement('input');
            typeInput.type = 'text';
            typeInput.className = 'grid-input type-input';
            typeInput.setAttribute('data-ticker', inv.ticker);
            typeInput.setAttribute('data-field', 'type');
            typeInput.value = inv.type || '';
            typeInput.placeholder = 'e.g. Stock';
            tdType.appendChild(typeInput);

            // Macro Category cell
            const tdMacroCategory = document.createElement('td');
            const macroCategoryInput = document.createElement('input');
            macroCategoryInput.type = 'text';
            macroCategoryInput.className = 'grid-input macro-category-input';
            macroCategoryInput.setAttribute('data-ticker', inv.ticker);
            macroCategoryInput.setAttribute('data-field', 'macroCategory');
            macroCategoryInput.value = inv.macroCategory || '';
            macroCategoryInput.placeholder = 'e.g. Tech';
            tdMacroCategory.appendChild(macroCategoryInput);

            // FCF Yield cell
            const tdFcfYield = document.createElement('td');
            tdFcfYield.textContent = formatRealValue(inv.fcfYield);

            // Payout Ratio cell
            const tdPayoutRatio = document.createElement('td');
            tdPayoutRatio.textContent = formatRealValue(inv.payoutRatio);

            // ROIC cell
            const tdRoic = document.createElement('td');
            tdRoic.textContent = formatRealValue(inv.roic);

            // Annual Dividend cell
            const tdAnnualDividend = document.createElement('td');
            tdAnnualDividend.textContent = formatRealValue(inv.annualDividend);

            // Percent cell with target input
            const tdPercent = document.createElement('td');
            tdPercent.className = 'percent-cell';
            const spanActual = document.createElement('span');
            spanActual.textContent = formatPercent(inv.actualPercentage);
            const spanTarget = document.createElement('span');
            spanTarget.className = 'percent-target';
            spanTarget.textContent = 'Target: ';
            const targetInput = document.createElement('input');
            targetInput.type = 'number';
            targetInput.className = 'grid-input target-input';
            targetInput.setAttribute('data-ticker', inv.ticker);
            targetInput.setAttribute('data-field', 'targetPercentage');
            targetInput.value = String(inv.targetPercentage);
            targetInput.step = '0.01';
            targetInput.min = '0';
            targetInput.max = '1';
            spanTarget.appendChild(targetInput);
            tdPercent.appendChild(spanActual);
            tdPercent.appendChild(spanTarget);

            // Diff / action cell
            const tdDiff = document.createElement('td');
            const isBuy = inv.rebalanceAmount >= 0;
            tdDiff.className = isBuy ? 'diff-positive' : 'diff-negative';
            tdDiff.textContent = isBuy ? `BUY ${formatCurrency(inv.rebalanceAmount)}` : `SELL ${formatCurrency(Math.abs(inv.rebalanceAmount))}`;
            const smallDiff = document.createElement('div');
            smallDiff.style.fontSize = '0.8em';
            smallDiff.style.opacity = '0.8';
            smallDiff.textContent = `Diff: ${formatPercent(inv.differencePercentage)}`;
            tdDiff.appendChild(smallDiff);

            // Actions cell
            const tdActions = document.createElement('td');
            if (inv.ticker !== 'CASH') {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-delete';
                delBtn.setAttribute('data-ticker', inv.ticker);
                delBtn.textContent = '✕';
                tdActions.appendChild(delBtn);
            } else {
                const spanLock = document.createElement('span');
                spanLock.style.opacity = '0.3';
                spanLock.style.cursor = 'default';
                spanLock.title = 'System Asset';
                spanLock.textContent = '🔒';
                tdActions.appendChild(spanLock);
            }

            tr.appendChild(tdTicker);
            tr.appendChild(tdShares);
            tr.appendChild(tdPrice);
            tr.appendChild(tdValue);
            tr.appendChild(tdType);
            tr.appendChild(tdMacroCategory);
            tr.appendChild(tdFcfYield);
            tr.appendChild(tdPayoutRatio);
            tr.appendChild(tdRoic);
            tr.appendChild(tdAnnualDividend);
            tr.appendChild(tdPercent);
            tr.appendChild(tdDiff);
            tr.appendChild(tdActions);

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
        fetchCorrelation(true);
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

            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '0.5rem';
            li.style.background = 'rgba(0,0,0,0.2)';
            li.style.borderRadius = '4px';

            const nameSpan = document.createElement('span');
            if (p.is_hidden) nameSpan.style.textDecoration = 'line-through';
            if (p.is_hidden) nameSpan.style.opacity = '0.5';
            nameSpan.textContent = p.name + (isCurrent ? ' (active)' : '');

            const btnWrap = document.createElement('div');
            btnWrap.style.display = 'flex';
            btnWrap.style.gap = '0.2rem';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn-rename-portfolio';
            renameBtn.setAttribute('data-id', p.id);
            renameBtn.setAttribute('data-name', p.name);
            renameBtn.style.background = 'transparent';
            renameBtn.style.border = 'none';
            renameBtn.style.cursor = 'pointer';
            renameBtn.style.color = 'var(--text-secondary)';
            renameBtn.title = 'Rename';
            renameBtn.textContent = '✏️';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-toggle-portfolio';
            toggleBtn.setAttribute('data-id', p.id);
            toggleBtn.setAttribute('data-hidden', String(p.is_hidden));
            toggleBtn.style.background = 'transparent';
            toggleBtn.style.border = 'none';
            toggleBtn.style.cursor = 'pointer';
            toggleBtn.style.color = 'var(--text-secondary)';
            toggleBtn.title = p.is_hidden ? 'Restore' : 'Hide';
            toggleBtn.textContent = p.is_hidden ? '👁️' : '🚫';

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete-portfolio';
            delBtn.setAttribute('data-id', p.id);
            delBtn.style.background = 'transparent';
            delBtn.style.border = 'none';
            delBtn.style.cursor = 'pointer';
            delBtn.style.color = 'var(--negative)';
            delBtn.title = 'Delete';
            delBtn.textContent = '✕';

            btnWrap.appendChild(renameBtn);
            btnWrap.appendChild(toggleBtn);
            btnWrap.appendChild(delBtn);

            li.appendChild(nameSpan);
            li.appendChild(btnWrap);
            managePortfoliosList.appendChild(li);
        });

        if (!hasVisible && portfolios.length > 0) {
            currentPortfolioId = portfolios[0].id;
            const opt = document.createElement('option');
            opt.value = currentPortfolioId;
            opt.textContent = portfolios[0].name;
            selectEl.appendChild(opt);
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
        fetchCorrelation(true);
    };

    // --- CHARTING LOGIC ---
    let portfolioChart = null;
    let isChartVisible = false;
    let chartScaleMode = 'linear';
    let chartViewMode = 'absolute';
    let currentHistoryData = [];

    const btnToggleChart = document.getElementById('btnToggleChart');
    const performancePanel = document.getElementById('performancePanel');
    const chartViewSelect = document.getElementById('chartViewSelect');
    const chartScaleSelect = document.getElementById('chartScaleSelect');
    const chartScaleContainer = document.getElementById('chartScaleContainer');

    if (chartViewSelect) {
        chartViewSelect.addEventListener('change', (e) => {
            chartViewMode = e.target.value;
            if (chartViewMode === 'percentage') {
                chartScaleContainer.style.display = 'none';
            } else {
                chartScaleContainer.style.display = 'flex';
            }
            if (currentHistoryData.length > 0) {
                renderHistoryChart(currentHistoryData);
            }
        });
    }

    if (chartScaleSelect) {
        chartScaleSelect.addEventListener('change', (e) => {
            chartScaleMode = e.target.value;
            if (currentHistoryData.length > 0) {
                renderHistoryChart(currentHistoryData);
            }
        });
    }

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
                currentHistoryData = result.data;
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

        let baselineTotalValue = historyData[0]?.totalValue || 1;
        const totalValues = historyData.map(d => {
            if (chartViewMode === 'percentage') {
                return baselineTotalValue > 0 ? ((d.totalValue - baselineTotalValue) / baselineTotalValue) * 100 : 0;
            }
            return d.totalValue;
        });

        // Find the absolute smallest holding value to set as the Y-axis floor
        let minHoldingValue = Number.MAX_VALUE;
        if (chartViewMode === 'absolute') {
            historyData.forEach(d => {
                d.holdings.forEach(h => {
                    const val = h.shares * h.price;
                    if (val > 0 && val < minHoldingValue) {
                        minHoldingValue = val;
                    }
                });
            });
            if (minHoldingValue === Number.MAX_VALUE) minHoldingValue = 0;
        }

        const datasets = [];

        // Add individual holdings as independent lines
        const tickers = [...new Set(historyData.flatMap(d => d.holdings.map(h => h.ticker)))].sort();
        tickers.forEach((ticker, index) => {
            let baselineHoldingValue = null;
            const data = historyData.map(d => {
                const holding = d.holdings.find(h => h.ticker === ticker);
                const val = holding ? (holding.shares * holding.price) : 0;

                if (chartViewMode === 'percentage') {
                    if (baselineHoldingValue === null && val > 0) {
                        baselineHoldingValue = val; // First non-zero value is baseline
                    }
                    if (baselineHoldingValue) {
                        return ((val - baselineHoldingValue) / baselineHoldingValue) * 100;
                    }
                    return null; // Don't plot before we own it in percentage mode
                }
                return val;
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

        const yAxisType = (chartViewMode === 'absolute' && chartScaleMode === 'logarithmic') ? 'logarithmic' : 'linear';

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
                        type: yAxisType,
                        min: chartViewMode === 'absolute' ? (yAxisType === 'logarithmic' ? Math.max(0.01, minHoldingValue) : minHoldingValue) : undefined,
                        beginAtZero: false,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            callback: (value) => {
                                if (chartViewMode === 'percentage') {
                                    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
                                } else {
                                    if (value >= 1000) {
                                        return '$' + (value / 1000).toFixed(value % 1000 !== 0 ? 1 : 0) + 'k';
                                    }
                                    return '$' + value.toLocaleString();
                                }
                            },
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
                                    if (chartViewMode === 'percentage') {
                                        const val = context.parsed.y;
                                        label += (val > 0 ? '+' : '') + val.toFixed(2) + '%';
                                    } else {
                                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                                    }
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    // --- CORRELATION HEATMAP LOGIC ---
    let isCorrelationVisible = false;
    const btnToggleCorrelation = document.getElementById('btnToggleCorrelation');
    const correlationPanel = document.getElementById('correlationPanel');
    const correlationContainer = document.getElementById('correlationContainer');
    const correlationDetails = document.getElementById('correlationDetails');

    if (btnToggleCorrelation) {
        btnToggleCorrelation.addEventListener('click', () => {
            isCorrelationVisible = !isCorrelationVisible;
            correlationPanel.style.display = isCorrelationVisible ? 'block' : 'none';
            btnToggleCorrelation.classList.toggle('btn-active', isCorrelationVisible);
            if (isCorrelationVisible) fetchCorrelation();
        });
    }

    const fetchCorrelation = async (force = false) => {
        if (!currentPortfolioId || (!isCorrelationVisible && !force)) return;
        try {
            const res = await fetch(`/api/portfolios/${currentPortfolioId}/correlation`);
            const result = await res.json();
            if (result.success) {
                renderCorrelationHeatmap(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch correlation:', err);
        }
    };

    const getCorrCellStyle = (r) => {
        if (r === null) {
            return {
                bg: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.2)'
            };
        }

        // Diagonal cell (self-correlation)
        if (Math.abs(r - 1.0) < 0.0001) {
            return {
                bg: 'rgba(255, 255, 255, 0.06)',
                border: '2px solid rgba(255, 255, 255, 0.15)',
                color: '#f8fafc'
            };
        }

        const opacity = Math.min(0.85, Math.abs(r) * 0.85);

        if (r > 0) {
            // Warm coral red for positive correlation
            return {
                bg: `hsla(8, 80%, 48%, ${opacity})`,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                color: opacity > 0.4 ? '#f8fafc' : '#cbd5e1'
            };
        } else {
            // Cool indigo blue for negative correlation
            return {
                bg: `hsla(235, 80%, 55%, ${opacity})`,
                border: '1px solid rgba(255, 255, 255, 0.05)',
                color: opacity > 0.4 ? '#f8fafc' : '#cbd5e1'
            };
        }
    };

    const getCorrExplanation = (t1, t2, r) => {
        if (t1 === t2) {
            return `<strong>${t1}</strong> with itself: perfect correlation of <strong>1.00</strong>.`;
        }
        if (r === null) {
            return `Insufficient historical data to compute correlation between <strong>${t1}</strong> and <strong>${t2}</strong> (requires at least 3 common price dates).`;
        }

        const valStr = r === null ? 'N/A' : r.toFixed(2);
        let desc = '';
        if (r === null) {
            desc = 'Insufficient historical data to compute correlation.';
        } else if (r > 0.7) {
            desc = 'Strong positive correlation — they tend to move in tandem (low diversification).';
        } else if (r > 0.3) {
            desc = 'Moderate positive correlation — some diversification benefits, but they often move together.';
        } else if (r > 0.1) {
            desc = 'Weak positive correlation — moderate diversification benefit.';
        } else if (r >= -0.1) {
            desc = 'Uncorrelated (near 0) — independent movements and good diversification.';
        } else if (r >= -0.3) {
            desc = 'Weak negative correlation — tends to move oppositely, offering hedging benefits.';
        } else {
            desc = 'Strong negative correlation — moves in opposite directions, offering strong hedging and risk reduction.';
        }

        return `${t1} and ${t2} return correlation is ${valStr}: ${desc}`;
    };

    const renderCorrelationHeatmap = (data) => {
        const { tickers, matrix } = data;

        if (!correlationContainer || !correlationDetails) return;

        if (!tickers || tickers.length < 2) {
            correlationContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; opacity: 0.5;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    <p style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">Insufficient Diversification Assets</p>
                    <p style="font-size: 0.85rem; max-width: 400px; margin: 0 auto;">You need at least 2 non-cash assets in this portfolio to calculate return correlations and analyze diversification quality.</p>
                </div>
            `;
            correlationDetails.textContent = 'Add more tickers to visualize diversification quality.';
            return;
        }

        // Build table using DOM APIs to avoid injecting user data directly as HTML
        const table = document.createElement('table');
        table.className = 'correlation-matrix';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const emptyTh = document.createElement('th');
        headRow.appendChild(emptyTh);
        tickers.forEach(t => {
            const th = document.createElement('th');
            th.className = 'col-hdr';
            th.textContent = t;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tickers.forEach(t1 => {
            const tr = document.createElement('tr');
            const rowHdr = document.createElement('th');
            rowHdr.className = 'row-hdr';
            rowHdr.textContent = t1;
            tr.appendChild(rowHdr);

            tickers.forEach(t2 => {
                const td = document.createElement('td');
                td.className = 'corr-cell';
                const r = matrix[t1][t2];
                const style = getCorrCellStyle(r);
                const valStr = r === null ? 'N/A' : r.toFixed(2);

                td.dataset.t1 = t1;
                td.dataset.t2 = t2;
                td.dataset.r = (r !== null) ? String(r) : '';

                td.style.background = style.bg;
                td.style.border = style.border;
                td.style.color = style.color;
                td.textContent = valStr;
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);

        // Replace container contents
        correlationContainer.innerHTML = '';
        correlationContainer.appendChild(table);

        // Hover listeners for custom dynamic explanation box
        const cells = correlationContainer.querySelectorAll('.corr-cell');
        cells.forEach(cell => {
            cell.addEventListener('mouseenter', () => {
                const t1 = cell.dataset.t1;
                const t2 = cell.dataset.t2;
                const rRaw = cell.dataset.r;
                const r = rRaw === '' ? null : parseFloat(rRaw);
                correlationDetails.textContent = getCorrExplanation(t1, t2, r);

                // Highlight row/col header visually
                cells.forEach(c => {
                    if (c.dataset.t1 === t1 || c.dataset.t2 === t2) {
                        c.classList.add('active-hover');
                    }
                });
            });

            cell.addEventListener('mouseleave', () => {
                correlationDetails.textContent = 'Hover over any cell in the matrix to analyze asset diversification.';
                cells.forEach(c => c.classList.remove('active-hover'));
            });
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
                fetchCorrelation(true);
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
                fetchCorrelation(); // Refresh correlation heatmap
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
            const type = tr.querySelector('.type-input').value || null;
            const macroCategory = tr.querySelector('.macro-category-input').value || null;

            try {
                const res = await fetch(`/api/portfolios/${currentPortfolioId}/investments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker, shares, targetPercentage, type, macroCategory })
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
                if (result.success) {
                    renderPortfolio(result.data);
                    fetchCorrelation(true);
                } else showError(result.error);
            } catch (err) {
                showError('Network error while deleting investment.');
            }
        }
    });

    fetchPortfolios();
});
