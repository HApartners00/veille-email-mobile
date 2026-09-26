/**
 * LE CRÉDIT DU JOUR, CÔTÉ APP — 25/09/2026.
 *
 * Deux choses seulement :
 *   · un signal « crédit épuisé », émis par `api.ts` dès qu'une route répond
 *     402 `credit_epuise`, et par la jauge quand elle lit un crédit vide ;
 *   · la lecture de `/api/credit` pour la jauge (part restante, jamais un montant).
 *
 * ⚠️ RÈGLE APP STORE 3.1.1 : rien ici ne parle de formule, de prix ni
 * d'abonnement. L'app dit « revenez demain », point. L'offre de formule vit sur
 * le web et dans l'email « limite atteinte », hors de l'app.
 */

export type SourceEpuise = 'refus' | 'jauge';
/** `changerFormule` (26/09/2026) : Gratuit ou Essentiel — le panneau ajoute
 *  « rendez-vous sur vmail-app.com ». Inconnu (undefined) = on ne l'affiche pas. */
export type SignalEpuise = { source: SourceEpuise; reinitialise_a: string | null; changerFormule?: boolean };

type Ecouteur = (s: SignalEpuise) => void;
const ecouteurs = new Set<Ecouteur>();

export function ecouterCreditEpuise(f: Ecouteur): () => void {
  ecouteurs.add(f);
  return () => {
    ecouteurs.delete(f);
  };
}

export function signalerCreditEpuise(s: SignalEpuise): void {
  for (const f of ecouteurs) {
    try {
      f(s);
    } catch (e) {
      // Un écouteur cassé ne doit pas empêcher les autres d'entendre le signal.
      console.error('[crédit] écouteur en échec', e);
    }
  }
}

/** Appelé par api.ts sur CHAQUE réponse : ne fait rien sauf sur un 402 du crédit. */
export function verifierReponseCredit(status: number, json: unknown): void {
  if (status !== 402) return;
  const j = (json || {}) as { code?: string; reinitialise_a?: string | null; plan?: string };
  if (j.code !== 'credit_epuise') return;
  signalerCreditEpuise({
    source: 'refus',
    reinitialise_a: j.reinitialise_a ?? null,
    changerFormule: j.plan === 'gratuit' || j.plan === 'essentiel',
  });
}
