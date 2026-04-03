DO NOT REMOVE THIS "AI ANALYSED THE CODE AND HELPED ME WRITE THIS; I TOOK HELP FROM AI FOR THE CODES TOO"

# ⚡ EnergyTrading - Real-Time Peer-to-Peer Energy Marketplace

Welcome to **EnergyTrading**, a high-performance, full-stack simulation of a decentralized energy grid. This platform allows users to buy and sell energy (kWh) in a live marketplace, featuring real-time trade matching and automated financial settlement.

Designed with a **premium glassmorphism aesthetic**, it provides a professional-grade experience for simulating smart grid transactions.

---

## ✨ Features

- **💎 Premium Glassmorphism UI**: A vibrant, modern interface with neon accents, dark mode, and smooth glass effects.
- **🔐 Secure Authentication**: Full signup and login system with persistent user accounts and industry-standard password hashing (`bcrypt`).
- **⚙️ Custom Trading Engine**: A custom-built matching engine that handles Bid/Ask orders with millisecond precision.
- **💰 Real-Time Settlement**: Automated balance management. When a trade is matched, funds are instantly transferred from the buyer to the seller in the backend database.
- **📡 Live Data Stream**: Powered by WebSockets to ensure the Order Book, Trade History, and User Balances update instantly without page refreshes.
- **🏗️ Persistent Storage**: Integrated SQLite database using SQLAlchemy to keep your trades, users, and balances safe even after a server restart.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.10+, FastAPI, Uvicorn
- **Database**: SQLite (managed with SQLAlchemy ORM)
- **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Design System)
- **Communication**: WebSockets (Real-time updates)
- **Security**: Secure Password Hashing (Bcrypt)

---

## 🚀 Getting Started

Follow these steps to get your local energy marketplace up and running:

### 1. Clone & Set Up
First, navigate to your project directory and ensure you have Python 3.10 or higher installed.

### 2. Install Dependencies
Install all required libraries using the included `requirements.txt`:
```bash
pip install -r requirements.txt
```

### 3. Run the Program
Start the backend server by running:
```bash
python main.py
```

### 4. Access the Marketplace
Once the server is running, open your web browser and go to:
[http://localhost:8000/static/login.html](http://localhost:8000/static/login.html)

---

## 📈 Demo Mode
The platform currently includes an **"Add Funds"** feature in the dashboard. You can manually enter any amount to top up your balance, allowing you to simulate multiple accounts and test real-time trading scenarios immediately!

---

## 📝 License
This project is for educational and simulation purposes. Feel free to modify and expand it!
