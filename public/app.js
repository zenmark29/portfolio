document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const totalValueEl = document.getElementById('totalValue');
    const actualPercentageSumEl = document.getElementById('actualPercentageSum');
    const investmentsListEl = document.getElementById('investmentsList');
    const addInvestmentForm = document.getElementById('addInvestmentForm');
    const updatePricesBtn = document.getElementById('updatePricesBtn');
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

            tr.innerHTML = `
                <td class="ticker-cell">${inv.ticker}</td>
                <td>
                    <input type="number" class="grid-input shares-input" data-ticker="${inv.ticker}" data-field="shares" value="${inv.shares}" step="any" min="0">
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
                    ${inv.ticker !== 'CASH' ? `<button class="btn-delete" data-ticker="${inv.ticker}">✕</button>` : ''}
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
                    else showError(result.error || 'Failed to rename (does this name already exist?).');
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

    // Boot
    fetchPortfolios();

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
});
