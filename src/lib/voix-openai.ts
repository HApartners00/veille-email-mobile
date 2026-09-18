import { apiPost } from './api';

/**
 * L'ASSISTANT VOCAL PAR OPENAI, EN DIRECT. 18/09/2026.
 *
 * ⚠️ CE QUE CE FICHIER REMPLACE, ET POURQUOI.
 *
 * Chez Vapi, la chaîne est : app → Vapi → (transcription, modèle, synthèse) →
 * Vapi → app. Vapi prend 0,05 $ la minute pour tenir ce fil, soit 56 % d'une
 * facture mesurée à 0,0898 $/min. Aucune remise n'existe sous 999 $/mois.
 *
 * Ici il n'y a personne au milieu : l'app parle À OpenAI, qui entend et répond
 * en voix d'un seul tenant. Mesuré par HA le 18/09 sur un appel de 49 secondes :
 * 0,0193 $/min, soit −78 %. Et il a écouté les dix voix : `cedar` est la sienne.
 *
 * ⚠️ CE QUE ÇA DÉPLACE, ET C'EST TOUT LE SUJET DE CE FICHIER.
 * Vapi appelait nos outils de serveur à serveur. Sans Vapi, l'appel d'outil
 * redescend ICI, dans l'app, et c'est elle qui vient le faire exécuter par
 * `/api/voice/outil-app`. Le travail au bout du fil est le même code qu'avant
 * (`lib/voix-outils.ts` côté serveur) — seul le chemin change.
 *
 * ⚠️ ÉCRIT COMME UN MODULE, PAS COMME UN ÉCRAN. Le banc d'essai s'en sert
 * aujourd'hui ; le vrai assistant s'en servira le jour où l'on bascule. Si la
 * bascule demandait de réécrire ça, on aurait mesuré une chose et livré une
 * autre.
 *
 * ⚠️ AUCUNE CLÉ OPENAI NE DESCEND ICI. Le serveur échange sa vraie clé contre un
 * jeton de dix minutes, limité à cette session. Même principe que pour Vapi.
 *
 * ⚠️ RIEN EN SILENCE. Chaque panne remonte par `surErreur`, brute. Un assistant
 * qui se tait laisse croire à une panne de micro, et on cherche au mauvais
 * endroit pendant une heure.
 */

export type Usage = {
  audioIn: number;
  audioCache: number;
  audioOut: number;
  texteIn: number;
  texteCache: number;
  texteOut: number;
};

export type AppelOutilVu = {
  nom: string;
  args: Record<string, unknown>;
  /** Temps total vu par l'app : réseau compris, pas seulement le travail serveur. */
  ms: number;
  /** Temps passé côté serveur, tel qu'il le rapporte. La différence est le réseau. */
  msServeur?: number;
  resultat: string;
  erreur?: string;
};

export type ContexteAppel = {
  objet?: string;
  expediteur?: string;
  resume?: string;
  aUnResume?: boolean;
  longueurInstructions?: number;
};

export type SessionOpenAI = {
  /** Coupe le micro et la liaison. Idempotent. */
  arreter: () => void;
  /** Le mail sur lequel porte la conversation, à cet instant. */
  itemIdCourant: () => string | null;
  modele: string;
  voix: string;
  contexte: ContexteAppel | null;
  /** Le ticket de session. Absent = les outils ne marcheront pas, et on le dit. */
  ticket: string | null;
};

function message(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || 'Erreur sans message';
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type Rappels = {
  /** Une étape du démarrage, en clair. Sert à savoir OÙ ça casse. */
  surEtape?: (texte: string) => void;
  surUsage?: (u: Usage) => void;
  surOutil?: (a: AppelOutilVu) => void;
  surErreur?: (texte: string) => void;
  /** Le mail de la conversation a changé (mail_suivant). L'écran doit suivre. */
  surMail?: (itemId: string) => void;
  /** Ce que dit l'assistant, au fil de l'eau. Pour les sous-titres. */
  surTexte?: (texte: string) => void;
};

export async function demarrerOpenAI(
  params: {
    voix: string;
    modele: string;
    locale: string;
    itemId?: string | null;
    brouillon?: string | null;
  } & Rappels,
): Promise<SessionOpenAI> {
  const noter = (t: string) => params.surEtape?.(t);
  const dire = (t: string) => params.surErreur?.(t);

  // ---------------------------------------------------------------- 1. le jeton
  noter('1. demande du jeton au serveur…');
  const r = await apiPost<{
    ok?: boolean;
    jeton?: string;
    modele?: string;
    voix?: string;
    session?: string | null;
    sessionEchec?: string | null;
    outils?: string[];
    contexte?: ContexteAppel;
    error?: string;
  }>('/api/voice/essai-openai', {
    voix: params.voix,
    modele: params.modele,
    locale: params.locale,
    itemId: params.itemId || undefined,
    brouillon: params.brouillon || undefined,
  });
  if (!r?.jeton) throw new Error(r?.error || "Le serveur n'a pas renvoyé de jeton.");

  const modele = String(r.modele || params.modele);
  const voix = String(r.voix || params.voix);
  const ticket = r.session || null;

  noter(`   jeton reçu · modèle ${modele} · voix ${voix}`);
  noter(`   mail : ${r.contexte?.objet || '(sans objet)'} · résumé : ${r.contexte?.aUnResume ? 'oui' : 'NON'}`);
  noter(`   outils déclarés : ${(r.outils || []).length}`);

  // ⚠️ RIEN EN SILENCE. Sans ticket, les sept outils échoueront TOUS, et
  // l'assistant dira « je n'ai pas pu » sans qu'on sache pourquoi. On le dit
  // maintenant, avant le premier mot.
  if (!ticket) {
    dire(
      `⚠️ Pas de ticket de session : les outils ne marcheront pas. Cause : ${r.sessionEchec || 'non dite par le serveur'}`,
    );
  }

  // --------------------------------------------------------- 2. le module natif
  // `require` et non `import` en tête : si le module manquait, un import
  // planterait au montage de l'écran au lieu de le DIRE ici.
  noter('2. chargement du module WebRTC…');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webrtc = require('@daily-co/react-native-webrtc');
  const { RTCPeerConnection, mediaDevices } = webrtc;
  if (!RTCPeerConnection) throw new Error('RTCPeerConnection introuvable dans le module.');

  // ----------------------------------------------------------------- 3. le micro
  noter('3. ouverture du micro…');
  const flux = await mediaDevices.getUserMedia({ audio: true, video: false });

  // --------------------------------------------------------------- 4. la liaison
  noter('4. ouverture de la liaison…');
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  flux.getTracks().forEach((t: unknown) => pc.addTrack(t, flux));

  let itemId: string | null = params.itemId || null;
  let ferme = false;

  const canal = pc.createDataChannel('oai-events');

  const envoyer = (o: unknown) => {
    try {
      canal.send(JSON.stringify(o));
    } catch (e) {
      dire(`envoi sur le canal impossible : ${message(e)}`);
    }
  };

  /**
   * ⚠️ LES APPELS D'OUTILS SONT EXÉCUTÉS UN PAR UN, JAMAIS EN PARALLÈLE.
   *
   * Le modèle peut en demander plusieurs d'un coup. Or ils agissent sur le MÊME
   * ticket de session : `reecrire_brouillon` puis `preparer_envoi` lancés
   * ensemble prépareraient l'envoi d'un texte déjà remplacé. Le serveur refuse
   * ce cas (l'empreinte ne correspond plus), mais il vaut mieux ne pas le créer.
   *
   * Cette file garantit l'ordre d'arrivée.
   */
  let file: Promise<unknown> = Promise.resolve();
  /** Les travaux en cours, par réponse : on ne relance le modèle qu'à la fin. */
  const enCours = new Map<string, Promise<unknown>[]>();

  async function executer(appel: { call_id: string; name: string; arguments: string; response_id: string }) {
    const debut = Date.now();
    let args: Record<string, unknown> = {};
    try {
      args = appel.arguments ? (JSON.parse(appel.arguments) as Record<string, unknown>) : {};
    } catch {
      // Des arguments illisibles ne doivent pas tuer la conversation : on
      // exécute avec ce qu'on a, et le serveur dira ce qui manque.
      args = {};
    }

    let sortie = '';
    let erreur: string | undefined;
    let msServeur: number | undefined;

    if (!ticket) {
      // La cause est connue depuis le démarrage : on la redonne à l'assistant
      // pour qu'il la DISE, au lieu d'un échec muet.
      erreur = 'Pas de ticket de session : cette conversation ne peut rien faire.';
      sortie = erreur;
    } else {
      try {
        const rep = await apiPost<{
          ok?: boolean;
          resultat?: string;
          itemId?: string | null;
          ms?: number;
          error?: string;
        }>('/api/voice/outil-app', { session: ticket, nom: appel.name, args });
        msServeur = rep?.ms;
        if (rep?.ok && typeof rep.resultat === 'string') {
          sortie = rep.resultat;
          // `mail_suivant` change le mail de la conversation. L'écran doit
          // suivre la voix — sinon il montre un mail dont on ne parle plus, et
          // un écran qui ment est pire qu'un écran qui ne bouge pas.
          if (rep.itemId && rep.itemId !== itemId) {
            itemId = rep.itemId;
            params.surMail?.(rep.itemId);
          }
        } else {
          erreur = String(rep?.error || 'Réponse inattendue du serveur.');
          sortie = erreur;
        }
      } catch (e) {
        erreur = message(e);
        // ⚠️ ON RÉPOND QUAND MÊME AU MODÈLE. Un outil sans réponse le laisse
        // attendre indéfiniment : la conversation se fige, micro ouvert, et la
        // personne croit que l'app a planté.
        sortie = `L'outil a échoué : ${erreur}`;
      }
    }

    params.surOutil?.({
      nom: appel.name,
      args,
      ms: Date.now() - debut,
      msServeur,
      resultat: sortie,
      erreur,
    });

    envoyer({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: appel.call_id, output: sortie },
    });
  }

  canal.onmessage = (ev: { data: string }) => {
    let m: {
      type?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
      response_id?: string;
      delta?: string;
      transcript?: string;
      response?: { usage?: Record<string, unknown>; id?: string };
      error?: { message?: string };
    };
    try {
      m = JSON.parse(ev.data);
    } catch {
      return; // Un message illisible ne doit pas couper la conversation.
    }

    if (m.type === 'error') {
      dire(String(m.error?.message || JSON.stringify(m)));
      return;
    }

    // Ce que l'assistant dit, au fil de l'eau. Les deux noms d'événement sont
    // acceptés : OpenAI a renommé celui-ci en passant en version générale, et on
    // ne veut pas de sous-titres muets si l'app tourne sur l'ancien nom.
    if (
      (m.type === 'response.output_audio_transcript.done' ||
        m.type === 'response.audio_transcript.done') &&
      m.transcript
    ) {
      params.surTexte?.(String(m.transcript));
    }

    // -------------------------------------------------------- un outil demandé
    if (m.type === 'response.function_call_arguments.done' && m.call_id && m.name) {
      const rid = String(m.response_id || 'sans-reponse');
      const travail = (file = file.then(() =>
        executer({
          call_id: String(m.call_id),
          name: String(m.name),
          arguments: String(m.arguments || '{}'),
          response_id: rid,
        }),
      ));
      const liste = enCours.get(rid) || [];
      liste.push(travail);
      enCours.set(rid, liste);
      return;
    }

    // ------------------------------------------------------- la réponse est finie
    if (m.type === 'response.done') {
      const u = (m.response?.usage || {}) as {
        input_token_details?: {
          audio_tokens?: number;
          text_tokens?: number;
          cached_tokens_details?: { audio_tokens?: number; text_tokens?: number };
        };
        output_token_details?: { audio_tokens?: number; text_tokens?: number };
      };
      if (m.response?.usage) {
        const ein = u.input_token_details || {};
        const cache = ein.cached_tokens_details || {};
        const eout = u.output_token_details || {};
        params.surUsage?.({
          // Les jetons mis en cache sont facturés à part, TRÈS en dessous : les
          // compter au plein tarif gonflerait la note d'un facteur 30 et ferait
          // rater la décision.
          audioIn: Math.max(0, (ein.audio_tokens || 0) - (cache.audio_tokens || 0)),
          audioCache: cache.audio_tokens || 0,
          audioOut: eout.audio_tokens || 0,
          texteIn: Math.max(0, (ein.text_tokens || 0) - (cache.text_tokens || 0)),
          texteCache: cache.text_tokens || 0,
          texteOut: eout.text_tokens || 0,
        });
      }

      /**
       * ⚠️ ON NE RELANCE LE MODÈLE QU'UNE FOIS TOUS LES OUTILS RENDUS.
       *
       * Un `response.create` envoyé avant que les résultats soient déposés fait
       * parler l'assistant SANS eux : il improvise « c'est fait » alors que rien
       * n'est fait. C'est le pire échec possible pour un assistant qui envoie
       * des mails.
       */
      const rid = String(m.response?.id || 'sans-reponse');
      const liste = enCours.get(rid);
      if (liste && liste.length) {
        enCours.delete(rid);
        Promise.all(liste)
          .then(() => {
            if (!ferme) envoyer({ type: 'response.create' });
          })
          .catch((e) => dire(`outil en échec : ${message(e)}`));
      }
      return;
    }
  };

  canal.onopen = () => {
    noter('   canal ouvert');
    /**
     * ⚠️ L'ASSISTANT PARLE EN PREMIER, comme chez Vapi.
     *
     * Vapi le faisait tout seul (`firstMessageMode`). OpenAI attend qu'on le lui
     * demande : sans ce `response.create`, l'app reste muette jusqu'à ce que la
     * personne parle — ce qui ressemble exactement à un micro en panne.
     */
    envoyer({ type: 'response.create' });
  };

  const offre = await pc.createOffer({});
  await pc.setLocalDescription(offre);

  noter('5. négociation avec OpenAI…');
  const rep = await fetch(
    `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(modele)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${r.jeton}`, 'content-type': 'application/sdp' },
      body: offre.sdp,
    },
  );
  const sdp = await rep.text();
  if (!rep.ok) {
    try {
      flux.getTracks().forEach((t: { stop: () => void }) => t.stop());
      pc.close();
    } catch {
      // On ferme au mieux : l'erreur qui compte est celle d'OpenAI, juste après.
    }
    throw new Error(`OpenAI a refusé la liaison (${rep.status}) : ${sdp.slice(0, 300)}`);
  }
  await pc.setRemoteDescription({ type: 'answer', sdp });

  noter('6. liaison établie — parle.');

  return {
    arreter: () => {
      if (ferme) return;
      ferme = true;
      try {
        flux.getTracks().forEach((t: { stop: () => void }) => t.stop());
      } catch (e) {
        dire(`arrêt du micro : ${message(e)}`);
      }
      try {
        pc.close();
      } catch (e) {
        dire(`fermeture : ${message(e)}`);
      }
    },
    itemIdCourant: () => itemId,
    modele,
    voix,
    contexte: r.contexte || null,
    ticket,
  };
}
