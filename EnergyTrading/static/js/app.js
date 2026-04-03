let socket;
let currentSide = 'BID';
let user = JSON.parse(localStorage.getItem('user'));
let candleSeries;
let lastCandle = null;

if (!user) {
    window.location.href = '/static/login.html';
} else {
    updateDashboardHeader();
    fetchUserBalance();
    
    // Initialize global WebSocket FIRST so handlers can use it
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${user.username}`);
    setupWebSocketHandlers();
    
    // Initialize Chart (Delayed for layout)
    setTimeout(() => {
        initChart();
    }, 500);
}

function setupWebSocketHandlers() {
    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SNAPSHOT') {
            renderOrderBook(msg.data);
            if (msg.data.my_orders) {
                renderMyOrders(msg.data.my_orders);
            }
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
    
    socket.onopen = () => console.log("WebSocket Connected to Grid");
    socket.onclose = () => console.warn("WebSocket Disconnected - Check Server");
}

function updateDashboardHeader() {
    document.getElementById('userInfo').innerText = user.username;
}

async function fetchUserBalance() {
    try {
        const res = await fetch(`/user/${user.username}`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('userBalance').innerText = data.balance.toFixed(2);
            // Update local user object too
            user.balance = data.balance;
            localStorage.setItem('user', JSON.stringify(user));
        }
    } catch (err) {
        console.error('Failed to fetch balance:', err);
    }
}

function showAddFunds() {
    document.getElementById('fundsModal').style.display = 'flex';
}

function hideAddFunds() {
    document.getElementById('fundsModal').style.display = 'none';
}

async function addFunds() {
    const amount = parseFloat(document.getElementById('fundsAmount').value);
    if (!amount || amount <= 0) {
        showAlert('Please enter a valid amount', false);
        return;
    }

    try {
        const res = await fetch('/add-balance', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: user.username, amount: amount})
        });
        
        if (res.ok) {
            showAlert(`Successfully added ${amount} INR!`);
            hideAddFunds();
            fetchUserBalance();
        } else {
            showAlert('Failed to add funds', false);
        }
    } catch (err) {
        showAlert('Server error', false);
    }
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = '/static/login.html';
}

let chart; // Global for debugging

function initChart() {
    const container = document.getElementById('chartContainer');
    console.log("Chart Container size:", container.clientWidth, "x", container.clientHeight);
    
    chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 800,
        height: container.clientHeight || 420,
        layout: {
            background: { type: 'solid', color: '#0b0f1a' },
            textColor: '#d1d4dc',
            fontSize: 12,
        },
        grid: {
            vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
            horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
            visible: true,
        },
        timeScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: true,
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00ff88',
        downColor: '#ff4d4d',
        borderDownColor: '#ff4d4d',
        borderUpColor: '#00ff88',
        wickDownColor: '#ff4d4d',
        wickUpColor: '#00ff88',
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.resize(width, height);
    });
    resizeObserver.observe(container);

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
                // If history is empty, show a single placeholder candle at current price
                const marketPrice = parseFloat(document.getElementById('marketPrice').innerText) || 10;
                const now = Math.floor(Date.now() / 1000);
                const placeholder = { time: Math.floor(now / 60) * 60, open: marketPrice, high: marketPrice, low: marketPrice, close: marketPrice };
                candleSeries.setData([placeholder]);
                lastCandle = placeholder;
            }
        }
    } catch (err) {
        console.error('Failed to fetch history:', err);
    }
}

function updateCandles(trades) {
    if (!trades || trades.length === 0) return;
    
    trades.forEach(trade => {
        const price = parseFloat(trade.price);
        const timestamp = parseFloat(trade.timestamp);
        const candleTime = Math.floor(timestamp / 60) * 60;
        
        if (lastCandle && lastCandle.time === candleTime) {
            // Update existing candle
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
            lastCandle.close = price;
        } else {
            // New candle
            lastCandle = {
                time: candleTime,
                open: price,
                high: price,
                low: price,
                close: price
            };
        }
        candleSeries.update(lastCandle);
    });
}

function renderOrderBook(data) {
    const askList = document.getElementById('askList');
    const bidList = document.getElementById('bidList');
    const marketPrice = document.getElementById('marketPrice');

    marketPrice.innerText = data.market_price;
    askList.innerHTML = '';
    bidList.innerHTML = '';

    const getSourceIcon = (src) => {
        if (src === 'Solar') return '☀️';
        if (src === 'Wind') return '🌬️';
        return '⚡';
    };

    // Render BIDs (top first)
    data.bids.slice(0, 15).forEach(bid => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="bid-price">${getSourceIcon(bid.source)} ${bid.price}</td>
            <td style="text-align: right;">${bid.quantity}</td>
            <td style="text-align: right;">${(bid.price * bid.quantity).toFixed(2)}</td>
        `;
        row.onclick = () => {
            document.getElementById('orderPrice').value = bid.price;
            updateTotal();
        };
        bidList.appendChild(row);
    });

    // Render ASKs (bottom first)
    data.asks.slice(0, 15).reverse().forEach(ask => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="ask-price">${getSourceIcon(ask.source)} ${ask.price}</td>
            <td style="text-align: right;">${ask.quantity}</td>
            <td style="text-align: right;">${(ask.price * ask.quantity).toFixed(2)}</td>
        `;
        row.onclick = () => {
            document.getElementById('orderPrice').value = ask.price;
            updateTotal();
        };
        askList.appendChild(row);
    });
}

function renderMyOrders(orders) {
    const list = document.getElementById('myOrdersList');
    const noOrdersMsg = document.getElementById('noOrdersMsg');
    
    list.innerHTML = '';
    
    if (orders.length === 0) {
        noOrdersMsg.style.display = 'block';
        return;
    }
    
    noOrdersMsg.style.display = 'none';
    
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
        payload: {
            user_id: user.username,
            symbol: 'kWh_INR',
            order_id: orderId
        }
    }));
}

function renderTrades(trades) {
    const tradeList = document.getElementById('tradeList');
    trades.forEach(trade => {
        const div = document.createElement('div');
        div.className = 'trade-flash';
        div.style.padding = '12px';
        div.style.borderBottom = '1px solid var(--glass-border)';
        div.style.fontSize = '0.85rem';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--primary); font-weight: bold; letter-spacing: 1px;">SETTLED #${trade.trade_id}</span>
                <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(trade.timestamp * 1000).toLocaleTimeString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>${trade.quantity} kWh @ ${trade.price} INR</span>
                <span style="color: var(--text-muted); font-style: italic;">${trade.buyer_id} ↔ ${trade.seller_id}</span>
            </div>
        `;
        tradeList.prepend(div);
        
        // Dynamic market price update effect
        const priceEl = document.getElementById('marketPrice');
        priceEl.innerText = trade.price;
        priceEl.classList.add('trade-flash');
        setTimeout(() => priceEl.classList.remove('trade-flash'), 500);
    });
}

function setSide(side) {
    currentSide = side;
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    const placeBtn = document.getElementById('placeOrderBtn');
    
    if (side === 'BID') {
        buyBtn.classList.add('active');
        sellBtn.classList.remove('active');
        placeBtn.innerText = 'EXECUTE PURCHASE';
        placeBtn.style.background = 'var(--bid-color)';
    } else {
        sellBtn.classList.add('active');
        buyBtn.classList.remove('active');
        placeBtn.innerText = 'GO LIVE (SELL)';
        placeBtn.style.background = 'var(--ask-color)';
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

function showAlert(message, isInfo = true) {
    const alert = document.getElementById('alert');
    alert.innerText = message;
    alert.style.background = isInfo ? 'var(--primary)' : 'var(--ask-color)';
    alert.style.color = isInfo ? 'var(--bg-color)' : 'white';
    alert.style.display = 'block';
    setTimeout(() => {
        alert.style.display = 'none';
    }, 4000);
}

function placeOrder() {
    const price = parseFloat(document.getElementById('orderPrice').value);
    const qty = parseFloat(document.getElementById('orderQty').value);
    const source = document.getElementById('energySource').value;
    const slot = document.getElementById('deliverySlot').value;

    if (!price || !qty) {
        showAlert('Please enter valid price and quantity', false);
        return;
    }

    if (currentSide === 'BID') {
        const totalCost = price * qty;
        if (totalCost > user.balance) {
            showAlert(`Insufficient balance! Required: ${totalCost.toFixed(2)} INR`, false);
            return;
        }
    }

    const order = {
        type: 'PLACE_ORDER',
        payload: {
            user_id: user.username,
            symbol: 'kWh_INR',
            side: currentSide,
            price: price,
            quantity: qty,
            source: source,
            delivery_slot: slot
        }
    };

    socket.send(JSON.stringify(order));
    showAlert(`Order transmitted to Grid...`, true);
}
