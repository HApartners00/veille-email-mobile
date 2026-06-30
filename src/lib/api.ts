import * as FileSystem from 'expo-file-system/legacy';

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

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `Erreur ${res.status}`);
  return json as T;
}

/** Upload multipart (FormData) — pour les pièces jointes. N'impose PAS de content-type
 * (React Native ajoute la boundary automatiquement). */
export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `Erreur ${res.status}`);
  return json as T;
}

/** Télécharge un fichier authentifié vers le cache local et renvoie son URI.
 * Utilisé pour ouvrir/partager une pièce jointe sur mobile. */
export async function apiDownloadToFile(path: string, fileName: string): Promise<string> {
  const headers = await authHeaders();
  const safe = (fileName || 'fichier').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const target = (FileSystem.cacheDirectory || '') + Date.now() + '_' + safe;
  const res = await FileSystem.downloadAsync(API_BASE + path, target, { headers });
  if (!res || res.status < 200 || res.status >= 300) {
    throw new Error(`Téléchargement échoué (${res ? res.status : 'réseau'})`);
  }
  return res.uri;
}
