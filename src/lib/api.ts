import { supabase } from './supabase';

/** Base de l'API web (routes Next.js déployées sur Vercel). Surchargeable via .env. */
const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://veille-email-app.vercel.app';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, { headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `Erreur ${res.status}`);
  return json as T;
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `Erreur ${res.status}`);
  return json as T;
}
