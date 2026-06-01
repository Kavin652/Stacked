import os
import uuid
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import bcrypt
import jwt
import httpx

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
ALPHA_VANTAGE_API_KEY = os.environ['ALPHA_VANTAGE_API_KEY']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================ MODELS ============================

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class OnboardingIn(BaseModel):
    name: str
    age: int
    risk_tolerance: Literal["low", "medium", "high"]

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    age: Optional[int] = None
    risk_tolerance: Optional[str] = None
    onboarded: bool = False
    savings_balance: float = 0
    cash_balance: float = 0

class AuthOut(BaseModel):
    token: str
    user: UserOut

class TransactionIn(BaseModel):
    amount: float
    category: Literal["Food", "Entertainment", "Transport", "Income", "Subscriptions", "Other"]
    type: Literal["income", "expense"]
    description: str = ""
    date: Optional[str] = None  # ISO

class TransactionOut(BaseModel):
    id: str
    amount: float
    category: str
    type: str
    description: str
    date: str

class GoalIn(BaseModel):
    name: str
    emoji: str
    target_amount: float
    current_amount: float = 0

class GoalOut(BaseModel):
    id: str
    name: str
    emoji: str
    target_amount: float
    current_amount: float
    created_at: str

class HoldingIn(BaseModel):
    ticker: str
    shares: float
    purchase_price: float
    type: Literal["Stock", "ETF", "401k"] = "Stock"

class HoldingOut(BaseModel):
    id: str
    ticker: str
    shares: float
    purchase_price: float
    type: str
    current_price: Optional[float] = None
    current_value: Optional[float] = None
    gain_loss: Optional[float] = None
    gain_loss_pct: Optional[float] = None

class ChatIn(BaseModel):
    message: str

class ChatOut(BaseModel):
    reply: str

class BalancesIn(BaseModel):
    savings: float
    cash: float

# ============================ UTILS ============================

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        name=u.get("name", ""),
        age=u.get("age"),
        risk_tolerance=u.get("risk_tolerance"),
        onboarded=u.get("onboarded", False),
        savings_balance=u.get("savings_balance", 0) or 0,
        cash_balance=u.get("cash_balance", 0) or 0,
    )

# Simple in-memory cache for stock prices (Alpha Vantage rate limit: 25/day free)
_price_cache: dict[str, tuple[float, datetime]] = {}
_CACHE_TTL = timedelta(minutes=15)

async def fetch_stock_price(ticker: str) -> Optional[float]:
    ticker = ticker.upper().strip()
    now = datetime.now(timezone.utc)
    cached = _price_cache.get(ticker)
    if cached and now - cached[1] < _CACHE_TTL:
        return cached[0]
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.get(
                "https://www.alphavantage.co/query",
                params={
                    "function": "GLOBAL_QUOTE",
                    "symbol": ticker,
                    "apikey": ALPHA_VANTAGE_API_KEY,
                },
            )
            data = r.json()
            quote = data.get("Global Quote") or {}
            price_str = quote.get("05. price")
            if price_str:
                price = float(price_str)
                _price_cache[ticker] = (price, now)
                return price
    except Exception as e:
        logger.warning(f"Alpha Vantage fetch failed for {ticker}: {e}")
    return None

# ============================ AUTH ============================

@api_router.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password": hash_password(body.password),
        "name": body.name,
        "age": None,
        "risk_tolerance": None,
        "onboarded": False,
        "savings_balance": 0.0,
        "cash_balance": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    return AuthOut(token=create_token(user_id), user=user_to_out(user_doc))

@api_router.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return AuthOut(token=create_token(user["id"]), user=user_to_out(user))

@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user)

@api_router.post("/auth/onboarding", response_model=UserOut)
async def onboarding(body: OnboardingIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "name": body.name,
            "age": body.age,
            "risk_tolerance": body.risk_tolerance,
            "onboarded": True,
        }},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return user_to_out(updated)

@api_router.post("/auth/balances", response_model=UserOut)
async def update_balances(body: BalancesIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"savings_balance": body.savings, "cash_balance": body.cash}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return user_to_out(updated)

# ============================ TRANSACTIONS ============================

@api_router.post("/transactions", response_model=TransactionOut)
async def add_transaction(body: TransactionIn, user: dict = Depends(get_current_user)):
    tx_id = str(uuid.uuid4())
    date_iso = body.date or datetime.now(timezone.utc).isoformat()
    doc = {
        "id": tx_id,
        "user_id": user["id"],
        "amount": body.amount,
        "category": body.category,
        "type": body.type,
        "description": body.description,
        "date": date_iso,
    }
    await db.transactions.insert_one(doc)
    return TransactionOut(
        id=tx_id, amount=body.amount, category=body.category,
        type=body.type, description=body.description, date=date_iso,
    )

@api_router.get("/transactions", response_model=List[TransactionOut])
async def list_transactions(user: dict = Depends(get_current_user)):
    cursor = db.transactions.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("date", -1)
    items = await cursor.to_list(1000)
    return [TransactionOut(**t) for t in items]

@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ============================ GOALS ============================

@api_router.post("/goals", response_model=GoalOut)
async def add_goal(body: GoalIn, user: dict = Depends(get_current_user)):
    goal_id = str(uuid.uuid4())
    created = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": goal_id,
        "user_id": user["id"],
        "name": body.name,
        "emoji": body.emoji,
        "target_amount": body.target_amount,
        "current_amount": body.current_amount,
        "created_at": created,
    }
    await db.goals.insert_one(doc)
    return GoalOut(id=goal_id, name=body.name, emoji=body.emoji,
                   target_amount=body.target_amount, current_amount=body.current_amount,
                   created_at=created)

@api_router.get("/goals", response_model=List[GoalOut])
async def list_goals(user: dict = Depends(get_current_user)):
    cursor = db.goals.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [GoalOut(**g) for g in items]

@api_router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, body: GoalIn, user: dict = Depends(get_current_user)):
    res = await db.goals.update_one(
        {"id": goal_id, "user_id": user["id"]},
        {"$set": {
            "name": body.name, "emoji": body.emoji,
            "target_amount": body.target_amount, "current_amount": body.current_amount,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    g = await db.goals.find_one({"id": goal_id}, {"_id": 0, "user_id": 0})
    return GoalOut(**g)

@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    res = await db.goals.delete_one({"id": goal_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ============================ HOLDINGS ============================

async def enrich_holding(h: dict) -> HoldingOut:
    price = await fetch_stock_price(h["ticker"])
    current_value = price * h["shares"] if price else None
    cost_basis = h["purchase_price"] * h["shares"]
    gain_loss = (current_value - cost_basis) if current_value is not None else None
    gain_loss_pct = ((current_value / cost_basis - 1) * 100) if (current_value is not None and cost_basis > 0) else None
    return HoldingOut(
        id=h["id"], ticker=h["ticker"], shares=h["shares"],
        purchase_price=h["purchase_price"], type=h.get("type", "Stock"),
        current_price=price, current_value=current_value,
        gain_loss=gain_loss, gain_loss_pct=gain_loss_pct,
    )

@api_router.post("/holdings", response_model=HoldingOut)
async def add_holding(body: HoldingIn, user: dict = Depends(get_current_user)):
    h_id = str(uuid.uuid4())
    doc = {
        "id": h_id,
        "user_id": user["id"],
        "ticker": body.ticker.upper().strip(),
        "shares": body.shares,
        "purchase_price": body.purchase_price,
        "type": body.type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.holdings.insert_one(doc)
    return await enrich_holding(doc)

@api_router.get("/holdings", response_model=List[HoldingOut])
async def list_holdings(user: dict = Depends(get_current_user)):
    cursor = db.holdings.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    items = await cursor.to_list(1000)
    enriched = await asyncio.gather(*[enrich_holding(h) for h in items])
    return list(enriched)

@api_router.delete("/holdings/{holding_id}")
async def delete_holding(holding_id: str, user: dict = Depends(get_current_user)):
    res = await db.holdings.delete_one({"id": holding_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# ============================ AI CHAT ============================

async def build_user_context(user: dict) -> str:
    txs = await db.transactions.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("date", -1).to_list(50)
    goals = await db.goals.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).to_list(20)
    holdings = await db.holdings.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).to_list(50)

    # Compute monthly stats
    now = datetime.now(timezone.utc)
    this_month_spent = sum(
        t["amount"] for t in txs
        if t["type"] == "expense" and t["date"][:7] == now.strftime("%Y-%m")
    )
    this_month_income = sum(
        t["amount"] for t in txs
        if t["type"] == "income" and t["date"][:7] == now.strftime("%Y-%m")
    )
    savings = user.get("savings_balance", 0)
    cash = user.get("cash_balance", 0)

    ctx = [
        f"User name: {user.get('name')}",
        f"Age: {user.get('age')}",
        f"Risk tolerance: {user.get('risk_tolerance')}",
        f"Savings balance: ${savings:.2f}",
        f"Cash balance: ${cash:.2f}",
        f"This month spent: ${this_month_spent:.2f}",
        f"This month income: ${this_month_income:.2f}",
        f"Recent transactions: {[(t['date'][:10], t['type'], t['category'], t['amount']) for t in txs[:10]]}",
        f"Goals: {[(g['name'], g['current_amount'], g['target_amount']) for g in goals]}",
        f"Holdings: {[(h['ticker'], h['shares'], h['purchase_price']) for h in holdings]}",
    ]
    return "\n".join(ctx)

@api_router.post("/ai/chat", response_model=ChatOut)
async def ai_chat(body: ChatIn, user: dict = Depends(get_current_user)):
    context = await build_user_context(user)
    system_message = (
        "You are Corn, a friendly, encouraging, and savvy AI financial advisor for teenagers and young adults. "
        "Speak casually but knowledgeably. Use emojis sparingly. Keep responses concise (2-4 short paragraphs max). "
        "Give practical, age-appropriate financial advice. Avoid jargon, or explain it when you must use it. "
        "Never recommend risky behavior. When discussing investments, always mention diversification and long-term thinking. "
        "Personalize advice based on this user's data:\n\n"
        f"{context}"
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"user-{user['id']}",
            system_message=system_message,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        reply = await chat.send_message(UserMessage(text=body.message))
        # Store in db
        await db.chat_messages.insert_many([
            {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "user",
             "content": body.message, "timestamp": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "user_id": user["id"], "role": "assistant",
             "content": reply, "timestamp": datetime.now(timezone.utc).isoformat()},
        ])
        return ChatOut(reply=reply)
    except Exception as e:
        logger.exception("AI chat error")
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")

@api_router.get("/ai/chat/history")
async def chat_history(user: dict = Depends(get_current_user)):
    items = await db.chat_messages.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).sort("timestamp", 1).to_list(200)
    return items

@api_router.post("/ai/suggest-investments")
async def suggest_investments(user: dict = Depends(get_current_user)):
    age = user.get("age") or 18
    risk = user.get("risk_tolerance") or "low"
    system_message = (
        "You are a friendly financial advisor for teens. Given an age and risk tolerance, suggest 3 beginner-friendly "
        "stocks or ETFs. Respond ONLY in compact JSON array format: "
        '[{"ticker":"XXX","name":"...","reason":"one short sentence","type":"ETF or Stock"}]. '
        "Do not include any markdown, code fences, or other text outside the JSON."
    )
    user_msg = f"Age: {age}, Risk tolerance: {risk}. Suggest 3 beginner-friendly tickers."
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"suggest-{user['id']}-{uuid.uuid4()}",
            system_message=system_message,
        ).with_model("anthropic", "claude-haiku-4-5-20251001")
        reply = await chat.send_message(UserMessage(text=user_msg))
        import json, re
        # Try to parse JSON
        cleaned = re.sub(r"```(?:json)?", "", reply).strip("` \n")
        m = re.search(r"\[.*\]", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)
        parsed = json.loads(cleaned)
        return {"suggestions": parsed}
    except Exception as e:
        logger.exception("suggest-investments error")
        return {"suggestions": [
            {"ticker": "VOO", "name": "Vanguard S&P 500 ETF", "reason": "Broad market exposure, low fees, great starter ETF.", "type": "ETF"},
            {"ticker": "VTI", "name": "Vanguard Total Stock Market", "reason": "Diversified across the entire US market.", "type": "ETF"},
            {"ticker": "AAPL", "name": "Apple Inc.", "reason": "Stable blue-chip company you likely know well.", "type": "Stock"},
        ]}

@api_router.post("/ai/goal-projection/{goal_id}")
async def goal_projection(goal_id: str, user: dict = Depends(get_current_user)):
    goal = await db.goals.find_one({"id": goal_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Compute avg weekly net savings from last 90 days of transactions
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    txs = await db.transactions.find(
        {"user_id": user["id"], "date": {"$gte": cutoff}}, {"_id": 0, "user_id": 0}
    ).to_list(1000)
    income = sum(t["amount"] for t in txs if t["type"] == "income")
    expense = sum(t["amount"] for t in txs if t["type"] == "expense")
    net_90 = income - expense
    weekly = net_90 / 13.0 if net_90 > 0 else 0
    remaining = max(0, goal["target_amount"] - goal["current_amount"])
    if weekly <= 0:
        return {"weeks": None, "weekly_rate": 0, "message": "You need positive net savings to project a timeline. Try logging some income or reducing expenses!"}
    weeks = int(remaining / weekly) + (1 if remaining % weekly else 0)
    months = round(weeks / 4.33, 1)
    return {
        "weeks": weeks,
        "months": months,
        "weekly_rate": round(weekly, 2),
        "remaining": round(remaining, 2),
        "message": f"At your current savings rate of ~${weekly:.2f}/week, you'll hit this goal in about {weeks} weeks ({months} months)."
    }

# ============================ STOCKS ============================

@api_router.get("/stocks/price/{ticker}")
async def stock_price(ticker: str, user: dict = Depends(get_current_user)):
    price = await fetch_stock_price(ticker)
    if price is None:
        raise HTTPException(status_code=404, detail="Could not fetch price")
    return {"ticker": ticker.upper(), "price": price}

# ============================ ROOT ============================

@api_router.get("/")
async def root():
    return {"message": "Corn Club API", "status": "ok"}

# ============================ APP ============================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
