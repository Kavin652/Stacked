import { storage } from "@/src/utils/storage";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BACKEND}/api`;

const TOKEN_KEY = "corn_club_token";

export async function setToken(token: string | null) {
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  return await storage.secureGet<string>(TOKEN_KEY, "" as string);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data?.detail || data?.message || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: any) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// Types
export type User = {
  id: string;
  email: string;
  name: string;
  age?: number | null;
  risk_tolerance?: string | null;
  onboarded: boolean;
  savings_balance?: number;
  cash_balance?: number;
};

export type Transaction = {
  id: string;
  amount: number;
  category: "Food" | "Entertainment" | "Transport" | "Income" | "Subscriptions" | "Other";
  type: "income" | "expense";
  description: string;
  date: string;
};

export type Goal = {
  id: string;
  name: string;
  emoji: string;
  target_amount: number;
  current_amount: number;
  created_at: string;
};

export type Holding = {
  id: string;
  ticker: string;
  shares: number;
  purchase_price: number;
  type: string;
  current_price: number | null;
  current_value: number | null;
  gain_loss: number | null;
  gain_loss_pct: number | null;
};
