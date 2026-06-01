"""
Corn Club Backend API - end-to-end pytest suite
Covers: health, auth, onboarding, balances, transactions, goals, holdings,
AI chat / history / suggest-investments / goal-projection.
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get the public backend URL the user/app actually hits
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")

API = f"{BASE_URL}/api"


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def fresh_user(session):
    """Register a brand-new user for the whole test run."""
    email = f"TEST_corn_{uuid.uuid4().hex[:8]}@corn.club"
    password = "Sup3rSecret!"
    name = "TEST Tester"
    r = session.post(f"{API}/auth/register",
                     json={"email": email, "password": password, "name": name},
                     timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == email.lower()
    assert data["user"]["onboarded"] is False
    return {"email": email, "password": password, "name": name,
            "token": data["token"], "id": data["user"]["id"]}


@pytest.fixture(scope="session")
def auth_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}",
            "Content-Type": "application/json"}


# ---------- Health ----------

class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"


# ---------- Auth ----------

class TestAuth:
    def test_login_success(self, session, fresh_user):
        r = session.post(f"{API}/auth/login",
                         json={"email": fresh_user["email"],
                               "password": fresh_user["password"]},
                         timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["id"] == fresh_user["id"]
        assert "token" in data

    def test_me_with_token(self, session, auth_headers, fresh_user):
        r = session.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == fresh_user["email"].lower()
        assert body["id"] == fresh_user["id"]

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_duplicate_register(self, session, fresh_user):
        r = session.post(f"{API}/auth/register",
                         json={"email": fresh_user["email"],
                               "password": "whatever123",
                               "name": "dup"},
                         timeout=15)
        assert r.status_code == 400

    def test_login_wrong_password(self, session, fresh_user):
        r = session.post(f"{API}/auth/login",
                         json={"email": fresh_user["email"],
                               "password": "wrong-pass!"},
                         timeout=15)
        assert r.status_code == 401

    def test_protected_requires_auth(self, session):
        for path in ["/transactions", "/goals", "/holdings",
                     "/ai/chat/history"]:
            r = session.get(f"{API}{path}", timeout=15)
            assert r.status_code == 401, f"{path} should be 401 unauth, got {r.status_code}"


# ---------- Onboarding & Balances ----------

class TestOnboardingBalances:
    def test_onboarding(self, session, auth_headers):
        r = session.post(f"{API}/auth/onboarding",
                         headers=auth_headers,
                         json={"name": "TEST Tester",
                               "age": 17, "risk_tolerance": "medium"},
                         timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["onboarded"] is True
        assert body["age"] == 17
        assert body["risk_tolerance"] == "medium"

        # verify persistence via /auth/me
        r2 = session.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r2.json()["onboarded"] is True
        assert r2.json()["age"] == 17

    def test_balances(self, session, auth_headers):
        r = session.post(f"{API}/auth/balances",
                         headers=auth_headers,
                         json={"savings": 250.5, "cash": 75.25},
                         timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["savings_balance"] == 250.5
        assert body["cash_balance"] == 75.25


# ---------- Transactions ----------

class TestTransactions:
    created_id = None

    def test_create_transaction(self, session, auth_headers):
        r = session.post(f"{API}/transactions",
                         headers=auth_headers,
                         json={"amount": 12.5, "category": "Food",
                               "type": "expense",
                               "description": "TEST lunch"},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["amount"] == 12.5
        assert data["type"] == "expense"
        assert data["category"] == "Food"
        TestTransactions.created_id = data["id"]

    def test_create_income(self, session, auth_headers):
        r = session.post(f"{API}/transactions",
                         headers=auth_headers,
                         json={"amount": 500, "category": "Income",
                               "type": "income",
                               "description": "TEST paycheck"},
                         timeout=15)
        assert r.status_code == 200

    def test_list_transactions(self, session, auth_headers):
        r = session.get(f"{API}/transactions", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 2
        assert any(t["id"] == TestTransactions.created_id for t in items)

    def test_delete_transaction(self, session, auth_headers):
        assert TestTransactions.created_id
        r = session.delete(f"{API}/transactions/{TestTransactions.created_id}",
                           headers=auth_headers, timeout=15)
        assert r.status_code == 200
        # Confirm gone
        r2 = session.get(f"{API}/transactions", headers=auth_headers, timeout=15)
        ids = [t["id"] for t in r2.json()]
        assert TestTransactions.created_id not in ids

    def test_delete_nonexistent_transaction(self, session, auth_headers):
        r = session.delete(f"{API}/transactions/does-not-exist",
                           headers=auth_headers, timeout=15)
        assert r.status_code == 404


# ---------- Goals ----------

class TestGoals:
    created_id = None

    def test_create_goal(self, session, auth_headers):
        r = session.post(f"{API}/goals", headers=auth_headers,
                         json={"name": "TEST New Bike", "emoji": "🚴",
                               "target_amount": 500,
                               "current_amount": 50},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST New Bike"
        assert data["target_amount"] == 500
        TestGoals.created_id = data["id"]

    def test_list_goals(self, session, auth_headers):
        r = session.get(f"{API}/goals", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(g["id"] == TestGoals.created_id for g in items)

    def test_update_goal(self, session, auth_headers):
        r = session.patch(f"{API}/goals/{TestGoals.created_id}",
                          headers=auth_headers,
                          json={"name": "TEST New Bike", "emoji": "🚴",
                                "target_amount": 600,
                                "current_amount": 120},
                          timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["target_amount"] == 600
        assert data["current_amount"] == 120

    def test_goal_projection_no_savings(self, session, auth_headers):
        # delete the income we created earlier might still exist; project anyway
        r = session.post(f"{API}/ai/goal-projection/{TestGoals.created_id}",
                         headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # The response should at minimum have weekly_rate + message
        assert "weekly_rate" in body
        assert "message" in body

    def test_delete_goal(self, session, auth_headers):
        r = session.delete(f"{API}/goals/{TestGoals.created_id}",
                           headers=auth_headers, timeout=15)
        assert r.status_code == 200
        # Confirm 404 on projection now
        r2 = session.post(f"{API}/ai/goal-projection/{TestGoals.created_id}",
                          headers=auth_headers, timeout=15)
        assert r2.status_code == 404


# ---------- Holdings (Alpha Vantage may be rate-limited; price can be null) ----------

class TestHoldings:
    created_id = None

    def test_create_holding(self, session, auth_headers):
        r = session.post(f"{API}/holdings", headers=auth_headers,
                         json={"ticker": "AAPL", "shares": 10,
                               "purchase_price": 150, "type": "Stock"},
                         timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ticker"] == "AAPL"
        assert data["shares"] == 10
        # current_price may be None if Alpha Vantage rate-limited
        assert "current_price" in data
        assert "current_value" in data
        assert "gain_loss" in data
        TestHoldings.created_id = data["id"]

    def test_list_holdings(self, session, auth_headers):
        r = session.get(f"{API}/holdings", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert any(h["id"] == TestHoldings.created_id for h in items)

    def test_delete_holding(self, session, auth_headers):
        r = session.delete(f"{API}/holdings/{TestHoldings.created_id}",
                           headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- AI ----------

class TestAI:
    def test_ai_chat(self, session, auth_headers):
        r = session.post(f"{API}/ai/chat", headers=auth_headers,
                         json={"message": "Give me one quick tip to save money as a teen."},
                         timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reply" in body
        assert isinstance(body["reply"], str)
        assert len(body["reply"].strip()) > 0

    def test_ai_chat_history(self, session, auth_headers):
        # Allow a moment after previous insert
        time.sleep(0.5)
        r = session.get(f"{API}/ai/chat/history",
                        headers=auth_headers, timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 2  # one user + one assistant
        roles = {m["role"] for m in msgs}
        assert "user" in roles and "assistant" in roles

    def test_ai_suggest_investments(self, session, auth_headers):
        r = session.post(f"{API}/ai/suggest-investments",
                         headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "suggestions" in body
        suggestions = body["suggestions"]
        assert isinstance(suggestions, list)
        assert len(suggestions) == 3
        for s in suggestions:
            assert "ticker" in s and isinstance(s["ticker"], str)
            assert "name" in s
            assert "reason" in s

    def test_goal_projection_with_income(self, session, auth_headers):
        # Seed a goal + recent income transaction so weekly_rate > 0
        gr = session.post(f"{API}/goals", headers=auth_headers,
                          json={"name": "TEST Save", "emoji": "💰",
                                "target_amount": 1000,
                                "current_amount": 100},
                          timeout=15)
        assert gr.status_code == 200
        gid = gr.json()["id"]

        # Add large recent income & small expense so net is positive
        session.post(f"{API}/transactions", headers=auth_headers,
                     json={"amount": 2000, "category": "Income",
                           "type": "income",
                           "description": "TEST big income"}, timeout=15)
        session.post(f"{API}/transactions", headers=auth_headers,
                     json={"amount": 100, "category": "Food",
                           "type": "expense",
                           "description": "TEST food"}, timeout=15)

        r = session.post(f"{API}/ai/goal-projection/{gid}",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("weekly_rate", 0) > 0
        assert body.get("weeks") is not None
        assert body.get("months") is not None
        assert "message" in body
        # cleanup
        session.delete(f"{API}/goals/{gid}", headers=auth_headers, timeout=15)
