import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiGet } from './api';
import { demarrerOpenAI, type SessionOpenAI } from './voix-openai';

/**
 * L'ASSISTANT VOCAL, CÔTÉ APP — 17/09/2026, basculé sur OpenAI le 18/09.
 *
 * ⚠️ CE FICHIER A CHANGÉ D'INTÉRIEUR, PAS D'INTERFACE. Il parlait à Vapi ; il
 * parle maintenant à OpenAI en direct, par `lib/voix-openai.ts`. Ce qu'il
 * EXPOSE — `demarrerVoix`, `arreterVoix`, `couperMicro`, `ecouterVoix`,
 * `etatVoix`, `oublierVoix`, l'éligibilité — n'a pas bougé d'une ligne. C'est
 * voulu : l'écran du mail et le panneau vocal n'ont rien à savoir de qui sert la
 * voix, et on ne touche pas à 100 Ko d'écran pour changer de fournisseur.
 *
 * POURQUOI LA BASCULE, mesuré sur de vrais appels : 0,0898 $/min chez Vapi, dont
 * 0,05 $ de péage — 56 % qui ne payaient ni la voix, ni le modèle, ni la
 * transcription, et aucune remise sous 999 $/mois. Un appel réel de 49 s chez
 * OpenAI : 0,0193 $/min, soit −78 %.
 *
 * ⚠️ L'APPEL NE VIT PAS DANS UN ÉCRAN. Il vit ici, dans le module, et les écrans
 * s'y abonnent. Raison mesurée d'avance : quand l'assistant passe au mail
 * suivant, l'app NAVIGUE — l'écran du mail précédent est démonté. Si l'appel
 * appartenait à l'écran, la conversation se couperait à chaque « suivant », ce
 * qui est exactement ce qu'on veut éviter en mains libres.
 *
 * ⚠️ AUCUNE CLÉ ICI. L'app demande un jeton de dix minutes à /api/voice/start.
 * Rien à embarquer, rien à faire fuiter dans un build.
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
let appel: SessionOpenAI | null = null;
/**
 * Le ticket de la conversation en cours, connu AVANT l'objet de session.
 *
 * ⚠️ POURQUOI IL EST À PART. `appel` n'existe qu'une fois le démarrage terminé,
 * alors qu'un outil peut partir dès l'ouverture du canal — quelques
 * millisecondes plus tôt. S'appuyer sur `appel.ticket` laisserait une fenêtre
 * étroite où la relecture de l'état ne saurait pas quoi demander : un défaut
 * rare, donc impossible à retrouver.
 */
let ticketCourant: string | null = null;

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

/**
 * LES CATÉGORIES COCHÉES DANS LE FLUX, AU MOMENT OÙ L'ON APPUIE SUR LE MICRO.
 *
 * ⚠️ POURQUOI ON LES LIT ICI ET PAS DEPUIS L'ÉCRAN. Constat de HA le 18/09 :
 * « avant de cliquer sur le mail, j'ai filtré que les à répondre ; quand je lui
 * dis mail suivant il doit descendre dans cette catégorie ». Le filtre vit dans
 * l'écran du FLUX, qui n'est plus monté quand on ouvre un mail — il n'y a donc
 * personne à qui le demander. Mais le flux l'écrit sur l'appareil à chaque
 * changement : on relit simplement sa clé.
 *
 * ⚠️ MÊME CLÉ, MÊME FORME QUE `app/(tabs)/index.tsx` (`CLE_FILTRES`). Si elle
 * change là-bas, elle doit changer ici — d'où ce commentaire plutôt qu'une
 * constante partagée, que rien n'obligerait à relire.
 *
 * Illisible ou absente : on renvoie une liste vide, c'est-à-dire « toute la boîte
 * de réception ». Jamais d'erreur affichée pour ça : ne pas savoir filtrer ne doit
 * pas empêcher de parler.
 */
const CLE_FILTRES_FLUX = 'vmail.feed.filtres.v1';
const CATEGORIES_CONNUES = ['urgent', 'important', 'human', 'info'];

async function filtresDuFlux(): Promise<string[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_FILTRES_FLUX);
    if (!brut) return [];
    const p = JSON.parse(brut) as { filtres?: unknown };
    if (!Array.isArray(p?.filtres)) return [];
    return p.filtres
      .map((x) => String(x || '').toLowerCase())
      .filter((x) => CATEGORIES_CONNUES.includes(x));
  } catch (e) {
    console.warn('[voix] filtres du flux illisibles, on prend toute la boîte', e);
    return [];
  }
}

type Demarrage = {
  itemId: string;
  locale: string;
  brouillon: string;
};

export async function demarrerVoix(p: Demarrage): Promise<void> {
  if (etat.etape === 'demarrage' || etat.etape === 'en_cours') return;
  poser({ ...VIDE, etape: 'demarrage', itemId: p.itemId, brouillon: p.brouillon });

  try {
    const session = await demarrerOpenAI({
      route: '/api/voice/start',
      corps: {
        itemId: p.itemId,
        locale: p.locale,
        brouillon: p.brouillon,
        filtres: await filtresDuFlux(),
      },

      // Les étapes du démarrage ne s'affichent pas à l'utilisateur : elles
      // servent au diagnostic quand quelqu'un dit « ça ne marche pas ».
      surEtape: (t) => console.log('[voix]', t),
      surTicket: (t) => {
        ticketCourant = t;
      },

      /**
       * OÙ SORT LE SON — 19/09/2026.
       *
       * Constat de HA au premier appel réel : « le son sort du haut-parleur du
       * haut de l'iPhone, comme un appel ». C'est le comportement d'iOS pour une
       * liaison WebRTC ; Vapi posait le réglage pour nous. Le module s'en charge
       * désormais et RELIT ce que l'appareil a fait.
       *
       * On le journalise sans l'afficher : une sortie audio mal placée
       * s'entend — inutile d'ajouter un bandeau à quelqu'un qui a déjà compris.
       * Mais quand il faudra en parler, la trace sera là.
       */
      surSortieAudio: (son) => console.log('[voix] son :', son.obtenu, '—', son.raison),

      surParole: (qui) => poser({ quiParle: qui }),
      surTexte: (t) => poser({ phrase: t, quiParle: 'assistant' }),
      surErreur: (m) => poser({ erreur: m }),

      /**
       * ⚠️ L'ÉCRAN SUIT LA VOIX SANS DEVINER — 18/09, deuxième version.
       *
       * Chez Vapi, l'app apprenait le changement de mail en interrogeant
       * /api/voice/etat à l'aveugle, avec des relectures à 0,5 s et 1,5 s « au
       * cas où ». Ici c'est l'app qui exécute l'outil : le serveur lui rend le
       * nouveau mail dans la même réponse. Plus de relectures spéculatives,
       * plus de fenêtre pendant laquelle l'écran ment.
       */
      surMail: (id) => poser({ itemId: id }),

      /**
       * APRÈS CHAQUE OUTIL, ON RELIT L'ÉTAT DE LA CONVERSATION.
       *
       * Le RÉSULTAT d'un outil va au modèle, pas à nous : c'est le serveur qui
       * détient le nouveau brouillon et l'état de l'envoi. On le relit donc —
       * mais une seule fois, et au bon moment, puisqu'on sait exactement quand
       * l'outil a fini.
       */
      surOutil: () => {
        if (ticketCourant) void rafraichir(ticketCourant);
      },

      // La liaison est tombée : on le montre. Un micro allumé sur une
      // conversation morte est pire qu'un écran qui dit « terminé ».
      surFin: () => {
        if (etat.etape === 'en_cours') poser({ etape: 'fin', quiParle: null });
      },
    });

    appel = session;
    poser({ etape: 'en_cours', session: session.ticket, debutMs: Date.now() });
    // Le premier outil a pu partir avant ce point : on relit l'état une fois,
    // pour ne pas afficher un brouillon d'avant la première action.
    if (ticketCourant) void rafraichir(ticketCourant);
  } catch (e) {
    poser({ etape: 'fin', erreur: message(e) });
    try {
      appel?.arreter('echec_demarrage');
    } catch {
      // Rien à rattraper : l'erreur affichée est celle du démarrage.
    }
    appel = null;
  }
}

/** Relit l'état de la conversation côté serveur (brouillon, envoi préparé). */
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
    appel?.arreter('termine_par_utilisateur');
  } catch {
    // On coupe quand même l'affichage : un « Terminer » qui ne termine rien
    // serait pire que tout.
  }
  appel = null;
  ticketCourant = null;
  poser({ etape: 'fin', quiParle: null, confirmation: false });
}

export function couperMicro(muet: boolean): void {
  try {
    appel?.couperMicro(muet);
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
