let socket;
let currentSide = 'BID';
let user = JSON.parse(localStorage.getItem('user'));

if (!user) {
    window.location.href = '/static/login.html';
} else {
    updateDashboardHeader();
    fetchUserBalance();
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

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws/${user.username}`);

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'SNAPSHOT') {
        renderOrderBook(msg.data);
    } else if (msg.type === 'TRADES') {
        renderTrades(msg.data);
    } else if (msg.type === 'BALANCE_UPDATE') {
        user.balance = msg.balance;
        localStorage.setItem('user', JSON.stringify(user));
        document.getElementById('userBalance').innerText = msg.balance.toFixed(2);
    } else if (msg.type === 'ERROR') {
        showAlert(msg.message, false);
    }
};

function renderOrderBook(data) {
    const askList = document.getElementById('askList');
    const bidList = document.getElementById('bidList');
    const marketPrice = document.getElementById('marketPrice');

    marketPrice.innerText = data.market_price;
    askList.innerHTML = '';
    bidList.innerHTML = '';

    // Render BIDs (top first)
    data.bids.slice(0, 10).forEach(bid => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="bid-price">${bid.price}</td>
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
    data.asks.slice(0, 10).reverse().forEach(ask => {
        const row = document.createElement('tr');
        row.className = 'book-row';
        row.innerHTML = `
            <td class="ask-price">${ask.price}</td>
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

function renderTrades(trades) {
    const tradeList = document.getElementById('tradeList');
    trades.forEach(trade => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid var(--glass-border)';
        div.style.fontSize = '0.85rem';
        div.innerHTML = `
            <span style="color: var(--primary); font-weight: bold;">TRADE #${trade.trade_id}</span>
            <span style="float: right;">${trade.price} INR | ${trade.quantity} kWh</span>
        `;
        tradeList.prepend(div);
        
        // Dynamic market price update effect
        document.getElementById('marketPrice').innerText = trade.price;
        document.getElementById('marketPrice').style.color = 'var(--primary)';
        setTimeout(() => {
            document.getElementById('marketPrice').style.color = 'inherit';
        }, 500);
    });
}

function setSide(side) {
    currentSide = side;
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    
    if (side === 'BID') {
        buyBtn.classList.add('active');
        sellBtn.classList.remove('active');
    } else {
        sellBtn.classList.add('active');
        buyBtn.classList.remove('active');
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
    }, 3000);
}

function placeOrder() {
    const price = parseFloat(document.getElementById('orderPrice').value);
    const qty = parseFloat(document.getElementById('orderQty').value);

    if (!price || !qty) {
        showAlert('Please enter valid price and quantity', false);
        return;
    }

    if (currentSide === 'BID') {
        const totalCost = price * qty;
        if (totalCost > user.balance) {
            showAlert(`Insufficient balance! You need ${totalCost.toFixed(2)} INR but only have ${user.balance.toFixed(2)} INR`, false);
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
            quantity: qty
        }
    };

    socket.send(JSON.stringify(order));
    // We don't show success here anymore because the server might return an ERROR
}
