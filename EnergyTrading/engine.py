from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import time
import json

@dataclass
class Order:
    id: str
    user_id: str
    price: float
    quantity: float
    side: str = "BID" # BID or ASK
    source: str = "Grid" # Solar, Wind, Grid
    delivery_slot: str = "Next Hour"
    executed_quantity: float = 0.0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "price": f"{self.price:.2f}",
            "quantity": f"{self.quantity:.2f}",
            "executed_quantity": f"{self.executed_quantity:.2f}",
            "side": self.side,
            "source": self.source,
            "delivery_slot": self.delivery_slot,
            "timestamp": self.timestamp
        }

@dataclass
class Trade:
    trade_id: int
    symbol: str
    price: float
    quantity: float
    buyer_id: str
    seller_id: str
    timestamp: float = field(default_factory=time.time)

    def to_dict(self):
        return {
            "trade_id": self.trade_id,
            "symbol": self.symbol,
            "price": f"{self.price:.2f}",
            "quantity": f"{self.quantity:.2f}",
            "buyer_id": self.buyer_id,
            "seller_id": self.seller_id,
            "timestamp": self.timestamp
        }

class OrderBook:
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.bids: List[Order] = [] # Sorted descending
        self.asks: List[Order] = [] # Sorted ascending
        self.last_trade_id = 0
        self.market_price = 0.0

    def add_order(self, order: Order) -> List[Trade]:
        trades = []
        if order.side == "BID":
            # Match against ASKs
            i = 0
            while i < len(self.asks) and self.asks[i].price <= order.price and order.quantity > 0:
                ask = self.asks[i]
                
                # SELF-MATCHING PREVENTION
                if ask.user_id == order.user_id:
                    i += 1 # Skip own order
                    continue

                fill_qty = min(order.quantity, ask.quantity)
                
                # Update executed quantities
                order.quantity -= fill_qty
                order.executed_quantity += fill_qty
                ask.quantity -= fill_qty
                ask.executed_quantity += fill_qty
                
                self.last_trade_id += 1
                self.market_price = ask.price
                
                trades.append(Trade(
                    trade_id=self.last_trade_id,
                    symbol=self.symbol,
                    price=ask.price,
                    quantity=fill_qty,
                    buyer_id=order.user_id,
                    seller_id=ask.user_id
                ))
                
                if ask.quantity == 0:
                    self.asks.pop(i)
                else:
                    i += 1
            
            if order.quantity > 0:
                self.bids.append(order)
                self.bids.sort(key=lambda x: (-x.price, x.timestamp))
                
        else: # side == "ASK"
            # Match against BIDs
            i = 0
            while i < len(self.bids) and self.bids[i].price >= order.price and order.quantity > 0:
                bid = self.bids[i]

                # SELF-MATCHING PREVENTION
                if bid.user_id == order.user_id:
                    i += 1 # Skip own order
                    continue

                fill_qty = min(order.quantity, bid.quantity)
                
                # Update executed quantities
                order.quantity -= fill_qty
                order.executed_quantity += fill_qty
                bid.quantity -= fill_qty
                bid.executed_quantity += fill_qty
                
                self.last_trade_id += 1
                self.market_price = bid.price
                
                trades.append(Trade(
                    trade_id=self.last_trade_id,
                    symbol=self.symbol,
                    price=bid.price,
                    quantity=fill_qty,
                    buyer_id=bid.user_id,
                    seller_id=order.user_id
                ))
                
                if bid.quantity == 0:
                    self.bids.pop(i)
                else:
                    i += 1
            
            if order.quantity > 0:
                self.asks.append(order)
                self.asks.sort(key=lambda x: (x.price, x.timestamp))
                
        return trades

    def cancel_order(self, order_id: str, user_id: str) -> bool:
        # Search in BIDs
        for i, order in enumerate(self.bids):
            if order.id == order_id and order.user_id == user_id:
                self.bids.pop(i)
                return True
        # Search in ASKs
        for i, order in enumerate(self.asks):
            if order.id == order_id and order.user_id == user_id:
                self.asks.pop(i)
                return True
        return False

    def get_snapshot(self, user_id: Optional[str] = None):
        snapshot = {
            "symbol": self.symbol,
            "market_price": f"{self.market_price:.2f}",
            "bids": [b.to_dict() for b in self.bids],
            "asks": [a.to_dict() for a in self.asks]
        }
        if user_id:
            user_bids = [b.to_dict() for b in self.bids if b.user_id == user_id]
            user_asks = [a.to_dict() for a in self.asks if a.user_id == user_id]
            snapshot["my_orders"] = user_bids + user_asks
        return snapshot

class TradingEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TradingEngine, cls).__new__(cls)
            cls._instance.orderbooks = {"kWh_INR": OrderBook("kWh_INR")}
        return cls._instance

    def process_order(self, user_id: str, symbol: str, side: str, price: float, quantity: float, source: str = "Grid", delivery_slot: str = "Next Hour") -> Tuple[List[dict], dict]:
        if symbol not in self.orderbooks:
            self.orderbooks[symbol] = OrderBook(symbol)
        
        book = self.orderbooks[symbol]
        order_id = f"ord_{int(time.time() * 1000)}_{user_id}" # Added user_id to ensure uniqueness if multiple people place at same ms
        new_order = Order(id=order_id, user_id=user_id, price=price, quantity=quantity, side=side, source=source, delivery_slot=delivery_slot)
        
        trades = book.add_order(new_order)
        
        return [t.to_dict() for t in trades], book.get_snapshot(user_id)

    def cancel_order(self, user_id: str, symbol: str, order_id: str) -> dict:
        if symbol not in self.orderbooks:
            return None
        book = self.orderbooks[symbol]
        success = book.cancel_order(order_id, user_id)
        if success:
            return book.get_snapshot(user_id)
        return None
