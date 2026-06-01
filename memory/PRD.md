# Corn Club — Product Requirements Document (PRD)

## Overview
**Corn Club** is an AI-powered personal finance mobile app for teens & young adults.
Tech: React Native + Expo (frontend), FastAPI + MongoDB (backend), Claude Haiku 4.5 via Emergent LLM Key (AI), Alpha Vantage (live stock prices).

## Auth & Onboarding
- Email/password registration & login (JWT, bcrypt).
- 3-step onboarding: name → age → risk tolerance (low/medium/high).
- Token stored via `expo-secure-store`. Auto-redirects between (auth) and (tabs) based on user state.

## Screens (Bottom Tabs)
1. **Dashboard** — Total balance, savings/cash/investment balance cards, greeting with name, this-month vs last-month expense comparison, edit balances modal.
2. **Transactions** — Add income/expense with 6 categories (Food, Entertainment, Transport, Income, Subscriptions, Other). List view + pie chart + bar chart of this-month spending.
3. **AI Advisor** — Chat with Claude. AI receives user balances, recent transactions, goals, holdings as context. Suggested prompts on first open.
4. **Investment Hub** — Manually log Stock/ETF/401k holdings (ticker, shares, purchase price). Pulls live prices from Alpha Vantage. Shows portfolio pie chart, gain/loss, and 3 AI-generated beginner picks tailored to age + risk tolerance.
5. **Goals** — Create savings goals (name, emoji, target, current). Progress bar. AI projection (weeks/months) based on last 90 days of income-expense rate.

## Design
- Dark theme `#121214` base, brand green `#00E5A0`.
- Bebas Neue (headings), DM Sans (body).
- Phosphor/Ionicons + emoji for categories.
- Glassmorphism-light feel via solid surface cards + tinted borders.
- Haptic feedback on tab press, button press, success/error.

## Backend Endpoints (`/api` prefix)
- `POST /auth/register` `POST /auth/login` `GET /auth/me` `POST /auth/onboarding` `POST /auth/balances`
- `GET/POST/DELETE /transactions`
- `GET/POST/PATCH/DELETE /goals`
- `GET/POST/DELETE /holdings`
- `POST /ai/chat` `GET /ai/chat/history` `POST /ai/suggest-investments` `POST /ai/goal-projection/{id}`
- `GET /stocks/price/{ticker}`

## Integrations
- **Claude Haiku 4.5** (`anthropic/claude-haiku-4-5-20251001`) via `emergentintegrations` + `EMERGENT_LLM_KEY`.
- **Alpha Vantage** GLOBAL_QUOTE for live stock prices, in-memory 15-min cache (free tier is 25 requests/day, so caching is important).

## Next Iterations
- Auto-update savings balance when income/expense transactions are logged.
- Push notifications for goal milestones (requires deployment build).
- Multi-currency support.
- Recurring transactions / subscription tracking.
