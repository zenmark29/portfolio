document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const totalValueEl = document.getElementById('totalValue');
    const actualPercentageSumEl = document.getElementById('actualPercentageSum');
    const investmentsListEl = document.getElementById('investmentsList');
    const addInvestmentForm = document.getElementById('addInvestmentForm');
    const updatePricesBtn = document.getElementById('updatePricesBtn');
    const addBtn = document.getElementById('addBtn');
    const errorBanner = document.getElementById('errorBanner');

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
        try {
            const res = await fetch('/api/portfolio');
            const result = await res.json();
            if (result.success) renderPortfolio(result.data);
            else showError(result.error);
        } catch (err) {
            showError('Network error connecting to API.');
        }
    };

    // Handle Form Submit
    addInvestmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();
        
        const ticker = document.getElementById('ticker').value.toUpperCase();
        const shares = document.getElementById('shares').value;
        const targetPercentage = document.getElementById('targetPercentage').value;

        addBtn.disabled = true;
        addBtn.textContent = 'Updating...';

        try {
            const res = await fetch('/api/investments', {
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
        clearError();
        const originalText = updatePricesBtn.innerHTML;
        updatePricesBtn.disabled = true;
        updatePricesBtn.innerHTML = 'Syncing...';

        try {
            const res = await fetch('/api/prices/update', { method: 'POST' });
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

    // Boot
    fetchPortfolio();

    // Editable Grid Handlers
    investmentsListEl.addEventListener('change', async (e) => {
        if (e.target.classList.contains('grid-input')) {
            const tr = e.target.closest('tr');
            const ticker = e.target.dataset.ticker;
            const shares = tr.querySelector('.shares-input').value;
            const targetPercentage = tr.querySelector('.target-input').value;
            
            try {
                const res = await fetch('/api/investments', {
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
        if (e.target.classList.contains('btn-delete')) {
            const ticker = e.target.dataset.ticker;
            if (!confirm(`Are you sure you want to delete ${ticker}?`)) return;
            
            try {
                const res = await fetch(`/api/investments/${ticker}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.success) renderPortfolio(result.data);
                else showError(result.error);
            } catch (err) {
                showError('Network error while deleting investment.');
            }
        }
    });
});
