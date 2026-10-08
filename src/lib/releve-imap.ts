import { useCallback, useEffect, useRef } from 'react';

import { apiPost } from './api';

// ──────────────────────────────────────────────────────────────────────────────
// « TIRER POUR RAFRAÎCHIR » VA CHERCHER LES MAILS YAHOO / ICLOUD — 08/10/2026.
//
// MESURÉ le 08/10/2026 (3 jours de mails) : un mail iCloud mettait 35 s à 5 min à entrer
// dans Vmail (3 min au milieu) ; Gmail 9 s, Outlook 3 s — eux préviennent Vmail. Yahoo et
// iCloud ne préviennent pas : n8n va voir à heure fixe. Et tirer la liste vers le bas ne
// faisait que RELIRE ce que Vmail avait déjà : n8n n'a reçu AUCUNE demande de relève venue
// de l'app entre le 07/10 à 09:52 et le 08/10 à 13:45.
//
// Désormais, tirer demande à Vmail d'aller voir les boîtes Yahoo / iCloud tout de suite
// (/api/refresh avec `imapSeulement` : Gmail et Outlook ne sont pas relancés, ils n'en ont
// pas besoin). La relève et le tri prennent 12 à 20 s (MESURÉ le 07 et le 08/10) : l'écran
// se recharge seul à 12 s puis à 25 s. Un client sans boîte Yahoo / iCloud : la route ne
// lance rien et rend 0 — aucun rechargement en plus.
//
// (08/10/2026, plus tard) Si la boîte est DÉJÀ en cours de relève, ou relevée il y a moins de
// 15 s, le serveur n'appelle pas n8n pour rien (`imapEvitees`) — mais l'écran se recharge
// quand même : la relève en cours va finir. Le bouton « Actualiser » recharge lui aussi à
// 12 s et 25 s quand une relève Yahoo / iCloud est partie (avant : 7 s seulement, trop tôt).
// ──────────────────────────────────────────────────────────────────────────────

const RECHARGER_APRES_MS = [12_000, 25_000];

/**
 * Demande la relève des boîtes Yahoo / iCloud. Rend le nombre de relèves lancées, ou déjà en
 * cours / tout juste faites. Ne lève jamais.
 */
export async function demanderReleveImap(): Promise<number> {
  try {
    const r = await apiPost<{ imap?: number; imapEvitees?: number }>('/api/refresh', { imapSeulement: true });
    return (Number(r?.imap) || 0) + (Number(r?.imapEvitees) || 0);
  } catch (e) {
    // Rien de cassé : l'horloge de n8n passera de toute façon. Mais ça se dit.
    console.error('[releve-imap] relève Yahoo / iCloud non demandée :', e);
    return 0;
  }
}

/**
 * Rend `programmer(n)` : si n > 0 (des relèves Yahoo / iCloud sont parties ou en cours), recharge
 * l'écran à 12 s puis à 25 s. Les rechargements en attente sont annulés si l'écran disparaît,
 * et remplacés par un nouvel appel.
 */
export function useRechargementsApresReleve(recharger: () => unknown): (releves: number) => void {
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;
  const minuteurs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      minuteurs.current.forEach(clearTimeout);
      minuteurs.current = [];
    },
    [],
  );

  return useCallback((releves: number) => {
    if (!(releves > 0)) return;
    minuteurs.current.forEach(clearTimeout);
    minuteurs.current = RECHARGER_APRES_MS.map((ms) =>
      setTimeout(() => {
        void rechargerRef.current();
      }, ms),
    );
  }, []);
}

/**
 * Rend une fonction à appeler quand on tire : elle demande la relève, puis recharge l'écran
 * quand la relève a eu le temps d'aboutir.
 */
export function useReleveImap(recharger: () => unknown): () => Promise<void> {
  const programmer = useRechargementsApresReleve(recharger);
  return useCallback(async () => {
    programmer(await demanderReleveImap());
  }, [programmer]);
}
