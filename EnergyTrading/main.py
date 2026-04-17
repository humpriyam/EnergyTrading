from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import SessionLocal, engine, get_db
import models
import schemas
import auth
import json
import asyncio
from typing import List, Dict, Optional
from engine import TradingEngine

# Initialize database
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Serving static files
app.mount("/static", StaticFiles(directory="static"), name="static")

engine_trading = TradingEngine() # Renamed to avoid name clash with sqlalchemy engine

# Connections for real-time updates: {username: [websocket, ...]}
active_connections: Dict[str, List[WebSocket]] = {}

async def broadcast_update(data: dict, target_user: Optional[str] = None):
    # If target_user is None, broadcast to everyone
    if target_user is None:
        for user_conns in active_connections.values():
            for connection in user_conns:
                await connection.send_text(json.dumps(data))
    else:
        # Send only to specific user's connections
        if target_user in active_connections:
            for connection in active_connections[target_user]:
                await connection.send_text(json.dumps(data))

@app.post("/signup", response_model=schemas.UserResponse)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pwd = auth.get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_pwd, balance=0.0)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or not auth.verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    return {
        "status": "success", 
        "username": db_user.username, 
        "balance": db_user.balance,
        "id": db_user.id
    }

@app.post("/add-balance")
def add_balance(req: schemas.BalanceUpdate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == req.username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.balance += req.amount
    db.commit()
    db.refresh(db_user)
    return {"status": "success", "new_balance": db_user.balance}

@app.get("/user/{username}", response_model=schemas.UserResponse)
def get_user(username: str, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.post("/change-password")
def change_password(req: schemas.ChangePassword, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == req.username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not auth.verify_password(req.old_password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    db_user.hashed_password = auth.get_password_hash(req.new_password)
    db.commit()
    return {"status": "success", "message": "Password updated successfully"}

@app.post("/withdraw")
def withdraw(req: schemas.WithdrawRequest, db: Session = Depends(get_db)):
    """Withdraw funds — validates password and sufficient balance."""
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be greater than zero")
    db_user = db.query(models.User).filter(models.User.username == req.username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not auth.verify_password(req.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    if db_user.balance < req.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Available: {db_user.balance:.2f} INR"
        )
    db_user.balance -= req.amount
    db.commit()
    db.refresh(db_user)
    return {"status": "success", "new_balance": db_user.balance, "withdrawn": req.amount}

@app.delete("/delete-account")
def delete_account(req: schemas.DeleteAccount, db: Session = Depends(get_db)):
    """Permanently delete a user account — balance must be 0."""
    db_user = db.query(models.User).filter(models.User.username == req.username).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not auth.verify_password(req.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    if db_user.balance > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Account balance must be 0.00 INR before deletion. Current balance: {db_user.balance:.2f} INR"
        )
    db.delete(db_user)
    db.commit()
    return {"status": "success", "message": "Account permanently deleted"}

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await websocket.accept()
    
    if username not in active_connections:
        active_connections[username] = []
    active_connections[username].append(websocket)
    
    try:
        # Send initial state with user-specific orders
        book = engine_trading.orderbooks.get("kWh_INR")
        if book:
            await websocket.send_text(json.dumps({
                "type": "SNAPSHOT", 
                "data": book.get_snapshot(username)
            }))
        
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            if msg["type"] == "PLACE_ORDER":
                payload = msg["payload"]
                user_id = payload["user_id"]
                side = payload["side"]
                price = floor_to_two(payload["price"])
                quantity = floor_to_two(payload["quantity"])
                source = payload.get("source", "Grid")
                delivery_slot = payload.get("delivery_slot", "Next Hour")
                
                # Create a DB session for validation and settlement
                db = SessionLocal()
                try:
                    db_user = db.query(models.User).filter(models.User.username == user_id).first()
                    if not db_user:
                        await websocket.send_text(json.dumps({"type": "ERROR", "message": "User not found"}))
                        continue
                        
                    # Pre-check for BID orders
                    if side == "BID":
                        total_cost = price * quantity
                        if db_user.balance < total_cost:
                            await websocket.send_text(json.dumps({
                                "type": "ERROR", 
                                "message": f"Insufficient balance! Required: {total_cost:.2f}, Available: {db_user.balance:.2f}"
                            }))
                            continue

                    # Process the order in the engine
                    trades, snapshot = engine_trading.process_order(
                        user_id,
                        payload["symbol"],
                        side,
                        price,
                        quantity,
                        source,
                        delivery_slot
                    )
                    
                    # Settle trades in the database and record for history
                    for trade in trades:
                        buyer_id = trade["buyer_id"]
                        seller_id = trade["seller_id"]
                        trade_val = float(trade["price"]) * float(trade["quantity"])
                        
                        buyer = db.query(models.User).filter(models.User.username == buyer_id).first()
                        seller = db.query(models.User).filter(models.User.username == seller_id).first()
                        
                        if buyer:
                            buyer.balance -= trade_val
                        if seller:
                            seller.balance += trade_val

                        # PERSIST TRADE FOR CHARTING
                        new_trade_record = models.TradeRecord(
                            symbol=trade["symbol"],
                            price=float(trade["price"]),
                            quantity=float(trade["quantity"]),
                            buyer_id=buyer_id,
                            seller_id=seller_id,
                            timestamp=float(trade["timestamp"])
                        )
                        db.add(new_trade_record)
                        
                    db.commit()
                    
                    # Notify users of balance changes
                    unique_users = set()
                    for trade in trades:
                        unique_users.add(trade["buyer_id"])
                        unique_users.add(trade["seller_id"])
                    
                    for u in unique_users:
                        db_u = db.query(models.User).filter(models.User.username == u).first()
                        if db_u:
                            await broadcast_update({
                                "type": "BALANCE_UPDATE",
                                "balance": db_u.balance
                            }, target_user=u)
                        
                        # SEND PERSONALIZED SNAPSHOT TO UPDATED USERS
                        user_snapshot = engine_trading.orderbooks["kWh_INR"].get_snapshot(u)
                        await broadcast_update({
                            "type": "SNAPSHOT",
                            "data": user_snapshot
                        }, target_user=u)

                    # Update all other users with public snapshot
                    await broadcast_update({
                        "type": "TRADES",
                        "data": trades
                    })

                    # Broadcast the public snapshot to everyone who wasn't involved in the trade
                    # (Actually, broadcasting to everyone is fine, participants will just get a redundant update)
                    public_snapshot = engine_trading.orderbooks["kWh_INR"].get_snapshot()
                    await broadcast_update({
                        "type": "SNAPSHOT",
                        "data": public_snapshot
                    })

                finally:
                    db.close()

            elif msg["type"] == "CANCEL_ORDER":
                payload = msg["payload"]
                user_id = payload["user_id"]
                symbol = payload["symbol"]
                order_id = payload["order_id"]

                snapshot = engine_trading.cancel_order(user_id, symbol, order_id)
                if snapshot:
                    # Broadcast public update
                    public_snapshot = engine_trading.orderbooks[symbol].get_snapshot()
                    await broadcast_update({
                        "type": "SNAPSHOT",
                        "data": public_snapshot
                    })
                    # Send personalized snapshot to the user who cancelled
                    await websocket.send_text(json.dumps({
                        "type": "SNAPSHOT",
                        "data": snapshot
                    }))
                else:
                    await websocket.send_text(json.dumps({"type": "ERROR", "message": "Order not found or already filled"}))
                
    except WebSocketDisconnect:
        if username in active_connections:
            if websocket in active_connections[username]:
                active_connections[username].remove(websocket)
            if not active_connections[username]:
                del active_connections[username]

@app.get("/history/{symbol}")
def get_market_history(symbol: str, db: Session = Depends(get_db)):
    # Fetch all trades for this symbol
    trades = db.query(models.TradeRecord).filter(models.TradeRecord.symbol == symbol).order_by(models.TradeRecord.timestamp.asc()).all()
    
    # Bucket trades into 1-minute OHLC candles
    candles = []
    if not trades:
        return []
    
    current_bucket = int(trades[0].timestamp // 60) * 60
    current_ohlc = {
        "time": current_bucket,
        "open": trades[0].price,
        "high": trades[0].price,
        "low": trades[0].price,
        "close": trades[0].price
    }
    
    for t in trades:
        bucket = int(t.timestamp // 60) * 60
        if bucket == current_bucket:
            current_ohlc["high"] = max(current_ohlc["high"], t.price)
            current_ohlc["low"] = min(current_ohlc["low"], t.price)
            current_ohlc["close"] = t.price
        else:
            candles.append(current_ohlc)
            current_bucket = bucket
            current_ohlc = {
                "time": current_bucket,
                "open": t.price,
                "high": t.price,
                "low": t.price,
                "close": t.price
            }
    candles.append(current_ohlc)
    return candles

def floor_to_two(val):
    return float(f"{val:.2f}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
