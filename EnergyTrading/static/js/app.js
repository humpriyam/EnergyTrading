/* ================================================================
   ENERGYTRADING — APP.JS
   ================================================================ */

let socket;
let currentSide = 'BID';
let user = JSON.parse(localStorage.getItem('user'));
let candleSeries;
let lastCandle = null;
let chart;

// ─── Bootstrap ────────────────────────────────────────────────────
if (!user) {
    window.location.href = '/static/login.html';
} else {
    updateDashboardHeader();
    fetchUserBalance();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${user.username}`);
    setupWebSocketHandlers();

    // Chart needs a brief delay so layout is fully rendered
    setTimeout(initChart, 400);
}

// ─── WebSocket ────────────────────────────────────────────────────
function setupWebSocketHandlers() {
    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SNAPSHOT') {
            renderOrderBook(msg.data);
            if (msg.data.my_orders) renderMyOrders(msg.data.my_orders);
        } else if (msg.type === 'TRADES') {
            renderTrades(msg.data);
            updateCandles(msg.data);
        } else if (msg.type === 'BALANCE_UPDATE') {
            user.balance = msg.balance;
            localStorage.setItem('user', JSON.stringify(user));
            document.getElementById('userBalance').innerText = msg.balance.toFixed(2);
        } else if (msg.type === 'ERROR') {
            showAlert(msg.message, false);
        }
    };
    socket.onopen = () => console.log('✅ WebSocket Connected');
    socket.onclose = () => console.warn('⚠️ WebSocket Disconnected');
}

// ─── Header ───────────────────────────────────────────────────────
function updateDashboardHeader() {
    document.getElementById('userInfo').innerText = user.username;
}

async function fetchUserBalance() {
    try {
        const res = await fetch(`/user/${user.username}`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('userBalance').innerText = data.balance.toFixed(2);
            user.balance = data.balance;
            user.id = data.id;
            localStorage.setItem('user', JSON.stringify(user));
        }
    } catch (err) {
        console.error('Failed to fetch balance:', err);
    }
}

// ─── Add Funds Modal ──────────────────────────────────────────────
function showAddFunds() { document.getElementById('fundsModal').style.display = 'flex'; }
function hideAddFunds() { document.getElementById('fundsModal').style.display = 'none'; }

async function addFunds() {
    const amount = parseFloat(document.getElementById('fundsAmount').value);
    if (!amount || amount <= 0) { showAlert('Please enter a valid amount', false); return; }
    try {
        const res = await fetch('/add-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, amount })
        });
        if (res.ok) {
            showAlert(`✅ Successfully added ${amount} INR!`);
            hideAddFunds();
            fetchUserBalance();
        } else {
            showAlert('Failed to add funds', false);
        }
    } catch { showAlert('Server error', false); }
}

// ─── My Account Modal ─────────────────────────────────────────────
function showMyAccount() {
    // Populate fields
    const initial = (user.username || '?')[0].toUpperCase();
    document.getElementById('avatarInitial').textContent = initial;
    document.getElementById('accUsername').textContent = user.username;
    document.getElementById('accUsernameDisplay').textContent = user.username;
    document.getElementById('accId').textContent = user.id || '–';
    document.getElementById('accBalance').textContent = (user.balance || 0).toFixed(2) + ' INR';

    // Reset to profile tab
    switchAccountTab('profile');

    // Clear all sensitive fields
    ['oldPassword', 'newPassword', 'confirmPassword', 'deletePassword', 'deleteConfirmText'].forEach(id => {
        document.getElementById(id).value = '';
    });

    document.getElementById('accountModal').style.display = 'flex';
}

function hideMyAccount() {
    document.getElementById('accountModal').style.display = 'none';
}

function switchAccountTab(tab) {
    const tabs = ['profile', 'security', 'danger'];
    const buttons = { profile: 'tabProfile', security: 'tabSecurity', danger: 'tabDanger' };
    tabs.forEach(t => {
        const key = t.charAt(0).toUpperCase() + t.slice(1);
        const content = document.getElementById(`accountTab${key}`);
        const btn = document.getElementById(buttons[t]);
        if (t === tab) {
            content.style.display = 'block';
            btn.classList.add('active');
        } else {
            content.style.display = 'none';
            btn.classList.remove('active');
        }
    });

    // Populate danger-tab balance live
    if (tab === 'danger') {
        const bal = (user.balance || 0).toFixed(2);
        const balEl = document.getElementById('dangerBalance');
        balEl.textContent = bal + ' INR';
        balEl.className = 'danger-balance' + (user.balance === 0 ? ' ok' : '');
    }
}

async function changePassword() {
    const oldPwd = document.getElementById('oldPassword').value.trim();
    const newPwd = document.getElementById('newPassword').value.trim();
    const confPwd = document.getElementById('confirmPassword').value.trim();

    if (!oldPwd || !newPwd || !confPwd) {
        showAlert('Please fill in all password fields', false); return;
    }
    if (newPwd.length < 6) {
        showAlert('New password must be at least 6 characters', false); return;
    }
    if (newPwd !== confPwd) {
        showAlert('New passwords do not match', false); return;
    }

    try {
        const res = await fetch('/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user.username,
                old_password: oldPwd,
                new_password: newPwd
            })
        });
        const data = await res.json();
        if (res.ok) {
            showAlert('🔐 Password updated successfully!');
            hideMyAccount();
        } else {
            showAlert(data.detail || 'Failed to change password', false);
        }
    } catch { showAlert('Server error', false); }
}

// ─── Logout ───────────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/static/login.html';
}

// ─── Withdraw Modal ───────────────────────────────────────────────
function showWithdraw() {
    document.getElementById('withdrawAvailBal').textContent = (user.balance || 0).toFixed(2) + ' INR';
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawPassword').value = '';
    document.getElementById('withdrawPreview').style.display = 'none';
    // Reset pct buttons
    document.querySelectorAll('.pct-btn').forEach(btn => btn.classList.remove('pct-active'));
    document.getElementById('withdrawModal').style.display = 'flex';
}
function hideWithdraw() {
    document.getElementById('withdrawModal').style.display = 'none';
}
function setWithdrawPct(pct) {
    const bal = user.balance || 0;
    const amount = parseFloat((bal * pct).toFixed(2));
    document.getElementById('withdrawAmount').value = amount;

    // Highlight active pct button
    document.querySelectorAll('.pct-btn').forEach(btn => btn.classList.remove('pct-active'));
    event.currentTarget.classList.add('pct-active');

    updateWithdrawPreview();
}
function updateWithdrawPreview() {
    const amt = parseFloat(document.getElementById('withdrawAmount').value) || 0;
    const bal = user.balance || 0;
    const preview = document.getElementById('withdrawPreview');
    if (amt > 0) {
        const after = bal - amt;
        document.getElementById('withdrawAfterBal').textContent = after.toFixed(2) + ' INR';
        document.getElementById('withdrawAfterBal').style.color = after < 0 ? 'var(--ask)' : 'var(--primary)';
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}
async function withdraw() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const password = document.getElementById('withdrawPassword').value.trim();

    if (!amount || amount <= 0) { showAlert('Enter a valid withdrawal amount', false); return; }
    if (!password) { showAlert('Password is required', false); return; }
    if (amount > (user.balance || 0)) { showAlert(`Insufficient balance (${(user.balance || 0).toFixed(2)} INR)`, false); return; }

    try {
        const res = await fetch('/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, amount, password })
        });
        const data = await res.json();
        if (res.ok) {
            user.balance = data.new_balance;
            localStorage.setItem('user', JSON.stringify(user));
            document.getElementById('userBalance').innerText = data.new_balance.toFixed(2);
            showAlert(`🏦 Withdrew ${amount.toFixed(2)} INR successfully!`);
            hideWithdraw();
        } else {
            showAlert(data.detail || 'Withdrawal failed', false);
        }
    } catch { showAlert('Server error', false); }
}

// ─── Delete Account ───────────────────────────────────────────────
async function deleteAccount() {
    const password = document.getElementById('deletePassword').value.trim();
    const confirmText = document.getElementById('deleteConfirmText').value.trim();

    if (!password) { showAlert('Password is required', false); return; }
    if (confirmText !== 'DELETE') { showAlert('Type DELETE (all caps) to confirm', false); return; }
    if ((user.balance || 0) > 0) {
        showAlert(`Balance must be 0.00 INR. Current: ${user.balance.toFixed(2)} INR — withdraw first.`, false);
        return;
    }

    try {
        const res = await fetch('/delete-account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, password })
        });
        const data = await res.json();
        if (res.ok) {
            showAlert('Account deleted. Redirecting…');
            localStorage.removeItem('user');
            setTimeout(() => window.location.href = '/static/login.html', 2000);
        } else {
            showAlert(data.detail || 'Deletion failed', false);
        }
    } catch { showAlert('Server error', false); }
}

// ─── Chart ────────────────────────────────────────────────────────
function initChart() {
    const container = document.getElementById('chartContainer');

    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 500,
        layout: {
            background: { type: 'solid', color: '#080c14' },
            textColor: '#9aa3b8',
            fontSize: 11,
        },
        grid: {
            vertLines: { color: 'rgba(42, 50, 70, 0.6)' },
            horzLines: { color: 'rgba(42, 50, 70, 0.6)' },
        },
        rightPriceScale: { borderColor: 'rgba(80, 90, 110, 0.5)' },
        timeScale: { borderColor: 'rgba(80, 90, 110, 0.5)', timeVisible: true },
        crosshair: {
            mode: 1,
            vertLine: { color: 'rgba(0,255,136,0.3)', labelBackgroundColor: '#00ff88' },
            horzLine: { color: 'rgba(0,255,136,0.3)', labelBackgroundColor: '#00ff88' },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00ff88',
        downColor: '#ff4d6d',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff4d6d',
        wickUpColor: '#00ff88',
        wickDownColor: '#ff4d6d',
    });

    // Resize observer
    const ro = new ResizeObserver(entries => {
        if (!entries.length || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.resize(width, height);
    });
    ro.observe(container);

    fetchHistory();
}

async function fetchHistory() {
    try {
        const res = await fetch('/history/kWh_INR');
        if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
                candleSeries.setData(data);
                lastCandle = data[data.length - 1];
            } else {
                const p = parseFloat(document.getElementById('marketPrice').innerText) || 10;
                const now = Math.floor(Date.now() / 1000);
                lastCandle = { time: Math.floor(now / 60) * 60, open: p, high: p, low: p, close: p };
                candleSeries.setData([lastCandle]);
            }
        }
    } catch (err) { console.error('History fetch failed:', err); }
}

function updateCandles(trades) {
    if (!trades || !trades.length) return;
    trades.forEach(trade => {
        const price = parseFloat(trade.price);
        const timestamp = parseFloat(trade.timestamp);
        const candleTime = Math.floor(timestamp / 60) * 60;

        if (lastCandle && lastCandle.time === candleTime) {
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
        } else {
            lastCandle = { time: candleTime, open: price, high: price, low: price, close: price };
        }
        candleSeries.update(lastCandle);
    });
}

// ─── Order Book ───────────────────────────────────────────────────
function renderOrderBook(data) {
    const askList = document.getElementById('askList');
    const bidList = document.getElementById('bidList');
    const priceEl = document.getElementById('marketPrice');

    priceEl.innerText = data.market_price;
    askList.innerHTML = '';
    bidList.innerHTML = '';

    const icon = src => src === 'Solar' ? '☀️' : src === 'Wind' ? '🌬️' : '⚡';

    // ASKs (shown in reverse — highest first)
    data.asks.slice(0, 15).reverse().forEach(ask => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="ask-price">${icon(ask.source)} ${ask.price}</td>
            <td style="text-align:right;">${ask.quantity}</td>
            <td style="text-align:right;">${(ask.price * ask.quantity).toFixed(2)}</td>
        `;
        row.onclick = () => { document.getElementById('orderPrice').value = ask.price; updateTotal(); };
        askList.appendChild(row);
    });

    // BIDs
    data.bids.slice(0, 15).forEach(bid => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="bid-price">${icon(bid.source)} ${bid.price}</td>
            <td style="text-align:right;">${bid.quantity}</td>
            <td style="text-align:right;">${(bid.price * bid.quantity).toFixed(2)}</td>
        `;
        row.onclick = () => { document.getElementById('orderPrice').value = bid.price; updateTotal(); };
        bidList.appendChild(row);
    });
}

// ─── My Orders ────────────────────────────────────────────────────
function renderMyOrders(orders) {
    const list = document.getElementById('myOrdersList');
    const noMsg = document.getElementById('noOrdersMsg');
    list.innerHTML = '';

    if (!orders.length) { noMsg.style.display = 'block'; return; }
    noMsg.style.display = 'none';

    orders.sort((a, b) => b.timestamp - a.timestamp).forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="${order.side === 'BID' ? 'bid-price' : 'ask-price'}">${order.side}</td>
            <td>${order.price}</td>
            <td>${order.quantity}</td>
            <td title="${order.delivery_slot}">${order.source}</td>
            <td><button class="cancel-btn" onclick="cancelOrder('${order.id}')">Cancel</button></td>
        `;
        list.appendChild(row);
    });
}

function cancelOrder(orderId) {
    socket.send(JSON.stringify({
        type: 'CANCEL_ORDER',
        payload: { user_id: user.username, symbol: 'kWh_INR', order_id: orderId }
    }));
}

// ─── Trades Feed ──────────────────────────────────────────────────
function renderTrades(trades) {
    const feed = document.getElementById('tradeList');
    trades.forEach(trade => {
        const div = document.createElement('div');
        div.className = 'trade-item trade-flash';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                <span style="color:var(--primary); font-weight:700; font-size:0.72rem; letter-spacing:0.8px;">SETTLED #${trade.trade_id}</span>
                <span style="color:var(--muted); font-size:0.68rem;">${new Date(trade.timestamp * 1000).toLocaleTimeString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                <span>${trade.quantity} kWh @ <strong style="color:var(--text);">${trade.price}</strong> INR</span>
                <span style="color:var(--muted); font-style:italic;">${trade.buyer_id} ↔ ${trade.seller_id}</span>
            </div>
        `;
        feed.prepend(div);

        // Update market price display
        const priceEl = document.getElementById('marketPrice');
        priceEl.innerText = trade.price;
        priceEl.classList.add('trade-flash');
        setTimeout(() => priceEl.classList.remove('trade-flash'), 600);
    });
}

// ─── Order Form ───────────────────────────────────────────────────
function setSide(side) {
    currentSide = side;
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    const execBtn = document.getElementById('placeOrderBtn');

    if (side === 'BID') {
        buyBtn.classList.add('active'); sellBtn.classList.remove('active');
        execBtn.innerText = 'EXECUTE PURCHASE';
        execBtn.style.background = 'linear-gradient(90deg, var(--bid), #00c876)';
    } else {
        sellBtn.classList.add('active'); buyBtn.classList.remove('active');
        execBtn.innerText = 'GO LIVE (SELL)';
        execBtn.style.background = 'linear-gradient(90deg, var(--ask), #ff2250)';
    }
    updateTotal();
}

function updateTotal() {
    const price = parseFloat(document.getElementById('orderPrice').value) || 0;
    const qty = parseFloat(document.getElementById('orderQty').value) || 0;
    document.getElementById('totalCost').innerText = (price * qty).toFixed(2);
}

document.getElementById('orderPrice').oninput = updateTotal;
document.getElementById('orderQty').oninput = updateTotal;

function placeOrder() {
    const price = parseFloat(document.getElementById('orderPrice').value);
    const qty = parseFloat(document.getElementById('orderQty').value);
    const source = document.getElementById('energySource').value;
    const slot = document.getElementById('deliverySlot').value;

    if (!price || !qty) { showAlert('Please enter valid price and quantity', false); return; }
    if (currentSide === 'BID' && price * qty > user.balance) {
        showAlert(`Insufficient balance! Required: ${(price * qty).toFixed(2)} INR`, false); return;
    }

    socket.send(JSON.stringify({
        type: 'PLACE_ORDER',
        payload: {
            user_id: user.username,
            symbol: 'kWh_INR',
            side: currentSide,
            price,
            quantity: qty,
            source,
            delivery_slot: slot
        }
    }));
    showAlert('📡 Order transmitted to Grid…', true);
}

// ─── Alert Toast ──────────────────────────────────────────────────
function showAlert(message, isInfo = true) {
    const el = document.getElementById('alert');
    el.innerText = message;
    el.style.background = isInfo ? 'var(--primary)' : 'var(--ask)';
    el.style.color = isInfo ? 'var(--bg)' : 'white';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Close modals on overlay click
document.getElementById('fundsModal').addEventListener('click', e => { if (e.target.id === 'fundsModal') hideAddFunds(); });
document.getElementById('accountModal').addEventListener('click', e => { if (e.target.id === 'accountModal') hideMyAccount(); });
document.getElementById('withdrawModal').addEventListener('click', e => { if (e.target.id === 'withdrawModal') hideWithdraw(); });
