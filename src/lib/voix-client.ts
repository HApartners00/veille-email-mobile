import { apiGet, apiPost } from './api';

/**
 * L'ASSISTANT VOCAL, CÔTÉ APP — 17/09/2026.
 *
 * ⚠️ L'APPEL NE VIT PAS DANS UN ÉCRAN. Il vit ici, dans le module, et les écrans
 * s'y abonnent. Raison mesurée d'avance : quand l'assistant passe au mail
 * suivant, l'app NAVIGUE — l'écran du mail précédent est démonté. Si l'appel
 * appartenait à l'écran, la conversation se couperait à chaque « suivant », ce
 * qui est exactement ce qu'on veut éviter en mains libres.
 *
 * ⚠️ AUCUNE CLÉ VAPI ICI. L'app demande un laissez-passer de 10 minutes à
 * /api/voice/start, qui ne marche qu'avec notre assistant. Rien à embarquer,
 * rien à faire fuiter dans un build.
 *
 * ⚠️ RIEN EN SILENCE. Toute erreur est posée dans l'état et affichée à l'écran,
 * avec le message brut. Un assistant qui se tait sans raison est un bug qu'on ne
 * peut pas diagnostiquer à l'oreille.
 */

export type EtapeVoix = 'inactif' | 'demarrage' | 'en_cours' | 'fin';

export type EtatVoix = {
  etape: EtapeVoix;
  /** Le mail dont on parle. Change quand l'assistant passe au suivant. */
  itemId: string | null;
  session: string | null;
  /** Le texte courant de la réponse, tel que le serveur le détient. */
  brouillon: string;
  /** La dernière phrase entendue (sous-titre). */
  phrase: string;
  quiParle: 'assistant' | 'vous' | null;
  /** Un envoi est préparé : l'assistant attend un oui. */
  confirmation: boolean;
  envoye: boolean;
  muet: boolean;
  erreur: string | null;
  debutMs: number | null;
};

const VIDE: EtatVoix = {
  etape: 'inactif',
  itemId: null,
  session: null,
  brouillon: '',
  phrase: '',
  quiParle: null,
  confirmation: false,
  envoye: false,
  muet: false,
  erreur: null,
  debutMs: null,
};

let etat: EtatVoix = VIDE;
const ecoutes = new Set<(e: EtatVoix) => void>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vapi: any = null;

function poser(partiel: Partial<EtatVoix>) {
  etat = { ...etat, ...partiel };
  for (const f of ecoutes) f(etat);
}

/** L'état courant, lisible pendant le rendu. */
export function etatVoix(): EtatVoix {
  return etat;
}

/** S'abonner. Renvoie la fonction de désabonnement. */
export function ecouterVoix(f: (e: EtatVoix) => void): () => void {
  ecoutes.add(f);
  f(etat);
  return () => {
    ecoutes.delete(f);
  };
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// ---------------------------------------------------------------------------
// Le bouton s'affiche-t-il ? (Premium, décidé par le serveur)
// ---------------------------------------------------------------------------

let eligible: boolean | null = null;

/**
 * `null` tant qu'on ne sait pas — l'écran n'affiche alors RIEN plutôt qu'un
 * bouton qui apparaît puis disparaît (règle des trois états, 14/08).
 */
export function eligibiliteConnue(): boolean | null {
  return eligible;
}

export async function lireEligibilite(): Promise<boolean> {
  if (eligible !== null) return eligible;
  try {
    const r = await apiGet<{ eligible?: boolean }>('/api/voice/start');
    eligible = r?.eligible === true;
  } catch {
    // On ne sait pas : on ne propose pas. Mieux vaut un bouton absent qu'un
    // bouton qui échoue devant l'utilisateur.
    eligible = false;
  }
  return eligible;
}

// ---------------------------------------------------------------------------
// L'appel
// ---------------------------------------------------------------------------

type Demarrage = {
  itemId: string;
  locale: string;
  brouillon: string;
};

type ReponseStart = {
  assistantId: string;
  jetonVapi: string;
  session: string;
  /**
   * La voix à utiliser pour CET appel, quand elle doit changer (18/09).
   *
   * Le serveur renvoie `null` en français : l'assistant a déjà la bonne voix,
   * il n'y a rien à remplacer. Il ne renvoie un objet que pour l'anglais, où la
   * voix française sonnerait avec un accent français. On ne fabrique donc RIEN
   * ici : c'est le serveur qui décide, et lui seul se relit dans git.
   */
  voix?: { provider: string; model: string; voiceId: string } | null;
  contexte: {
    objet: string;
    expediteur: string;
    resume: string;
    brouillon: string;
    langue: string;
  };
};

export async function demarrerVoix(p: Demarrage): Promise<void> {
  if (etat.etape === 'demarrage' || etat.etape === 'en_cours') return;
  poser({ ...VIDE, etape: 'demarrage', itemId: p.itemId, brouillon: p.brouillon });

  let r: ReponseStart;
  try {
    r = await apiPost<ReponseStart>('/api/voice/start', {
      itemId: p.itemId,
      locale: p.locale,
      brouillon: p.brouillon,
    });
  } catch (e) {
    poser({ etape: 'fin', erreur: message(e) });
    return;
  }

  try {
    // `require` et non `import` en tête : si le module natif manquait, l'écran
    // du mail planterait au montage, avant même d'avoir affiché le mail.
    const mod = require('@vapi-ai/react-native');
    const Vapi = mod?.default ?? mod;
    vapi = new Vapi(r.jetonVapi);
    brancher(r.session);
    await vapi.start(r.assistantId, {
      // La voix n'est posée QUE si le serveur en demande une. Sans ce garde, une
      // réponse sans `voix` enverrait `undefined` chez Vapi.
      ...(r.voix ? { voice: r.voix } : {}),
      variableValues: {
        session: r.session,
        objet: r.contexte.objet,
        expediteur: r.contexte.expediteur,
        resume: r.contexte.resume || "Je n'ai pas encore de résumé pour ce mail.",
        brouillon: r.contexte.brouillon || '',
        langue: r.contexte.langue === 'en' ? 'English' : 'français',
      },
    });
    poser({ etape: 'en_cours', session: r.session, debutMs: Date.now() });
  } catch (e) {
    poser({ etape: 'fin', erreur: message(e) });
    await arreterVoix();
  }
}

function brancher(session: string) {
  if (!vapi) return;

  vapi.on('call-start', () => poser({ etape: 'en_cours', debutMs: Date.now() }));
  vapi.on('call-end', () => {
    poser({ etape: 'fin', quiParle: null });
    vapi = null;
  });
  vapi.on('speech-start', () => poser({ quiParle: 'assistant' }));
  vapi.on('speech-end', () => poser({ quiParle: null }));
  vapi.on('error', (e: unknown) => poser({ erreur: message(e) }));

  vapi.on('message', (m: Record<string, unknown>) => {
    const type = String(m?.type || '');

    if (type === 'transcript') {
      const texte = String(m.transcript || '').trim();
      const role = String(m.role || '');
      if (texte) {
        poser({ phrase: texte, quiParle: role === 'assistant' ? 'assistant' : 'vous' });
      }
      return;
    }

    if (type === 'tool-calls') {
      // Le RÉSULTAT d'un outil va au modèle, pas à nous : c'est le serveur qui
      // détient le nouveau brouillon et le mail courant. On va donc les relire.
      void rafraichir(session);
      return;
    }

    if (type === 'status-update' && String(m.status || '') === 'ended') {
      poser({ etape: 'fin', quiParle: null });
    }
  });
}

/** Relit l'état de la conversation côté serveur (brouillon, mail courant). */
async function rafraichir(session: string) {
  try {
    const r = await apiGet<{
      ok?: boolean;
      itemId?: string | null;
      brouillon?: string;
      envoiPrepare?: boolean;
      envoye?: boolean;
    }>(`/api/voice/etat?session=${encodeURIComponent(session)}`);
    if (r?.ok) {
      poser({
        itemId: r.itemId ?? etat.itemId,
        brouillon: String(r.brouillon || ''),
        confirmation: r.envoiPrepare === true && r.envoye !== true,
        envoye: r.envoye === true,
      });
    }
  } catch {
    // Sans réponse, on garde ce qu'on affiche : mieux vaut un texte d'il y a
    // trois secondes qu'un écran vide pendant que l'assistant parle.
  }
}

export async function arreterVoix(): Promise<void> {
  try {
    vapi?.stop?.();
  } catch {
    // On coupe quand même l'affichage : un « Terminer » qui ne termine rien
    // serait pire que tout.
  }
  vapi = null;
  poser({ etape: 'fin', quiParle: null, confirmation: false });
}

export function couperMicro(muet: boolean): void {
  try {
    vapi?.setMuted?.(muet);
    poser({ muet });
  } catch (e) {
    poser({ erreur: message(e) });
  }
}

/** Remet l'état à zéro quand l'écran a fini d'afficher la fin d'appel. */
export function oublierVoix(): void {
  etat = VIDE;
  for (const f of ecoutes) f(etat);
}
