// Faux /api : chaque POST /api/mail-action attend que l'essai y réponde (`repondre`).
const g = globalThis as any;
export const attentes: { corps: any; repondre: (status: number, json: any) => void }[] = g.__attentes || (g.__attentes = []);
export async function apiGet(path: string) { if (path === '/api/connect/list') return { mailboxes: [] }; return {}; }
export async function apiPost() { return {}; }
export function apiPostBrut(path: string, corps: any): Promise<{ ok: boolean; status: number; json: any }> {
  return new Promise((ok) => { attentes.push({ corps: { path, ...corps }, repondre: (status, json) => ok({ ok: status >= 200 && status < 300, status, json }) }); });
}
