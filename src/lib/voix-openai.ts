import { apiPost } from './api';

/**
 * L'ASSISTANT VOCAL PAR OPENAI, EN DIRECT. 18/09/2026.
 *
 * ⚠️ CE QUE CE FICHIER REMPLACE, ET POURQUOI.
 *
 * Chez Vapi, la chaîne était : app → Vapi → (transcription, modèle, synthèse) →
 * Vapi → app. Vapi prenait 0,05 $ la minute pour tenir ce fil, soit 56 % d'une
 * facture mesurée à 0,0898 $/min. Aucune remise n'existe sous 999 $/mois.
 *
 * Ici il n'y a personne au milieu : l'app parle À OpenAI, qui entend et répond
 * en voix d'un seul tenant. Mesuré par HA le 18/09 sur un appel de 49 secondes :
 * 0,0193 $/min, soit −78 %. Il a écouté les dix voix : `cedar` est la sienne.
 *
 * ⚠️ CE QUE ÇA DÉPLACE. Vapi appelait nos outils de serveur à serveur. Sans
 * Vapi, l'appel d'outil redescend ICI, dans l'app, et c'est elle qui vient le
 * faire exécuter par `/api/voice/outil-app`. Le travail au bout du fil est le
 * même code qu'avant (`lib/voix-outils.ts` côté serveur) : seul le chemin change.
 *
 * ⚠️ UN SEUL MODULE POUR LES DEUX APPELANTS. Le vrai assistant
 * (`lib/voix-client.ts`) et le banc de mesure (`app/essai-openai.tsx`) passent
 * par ici. Ils ne diffèrent que par la route qui délivre le jeton. Deux copies
 * finiraient par diverger, et on mesurerait sur le banc autre chose que ce qu'on
 * livre.
 *
 * ⚠️ AUCUNE CLÉ OPENAI NE DESCEND ICI. Le serveur échange sa vraie clé contre un
 * jeton de dix minutes, limité à cette session.
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

const USAGE_ZERO: Usage = {
  audioIn: 0,
  audioCache: 0,
  audioOut: 0,
  texteIn: 0,
  texteCache: 0,
  texteOut: 0,
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
  langue?: string;
  longueurInstructions?: number;
};

export type SortieAudio = {
  /** Ce qu'on a demandé, ou `null` quand on a volontairement laissé faire. */
  voulu: string | null;
  /** Ce que l'appareil fait réellement, relu après coup. */
  obtenu: string;
  /** Pourquoi on a fait ça. Lisible par un humain. */
  raison: string;
};

export type SessionOpenAI = {
  /** Coupe le micro et la liaison, et rapporte le coût. Idempotent. */
  arreter: (raison?: string) => void;
  /** Micro coupé ou non. La liaison reste ouverte : l'assistant continue de parler. */
  couperMicro: (muet: boolean) => void;
  /** Le mail sur lequel porte la conversation, à cet instant. */
  itemIdCourant: () => string | null;
  /** La consommation cumulée depuis le début de l'appel. */
  usageTotal: () => Usage;
  modele: string;
  voix: string;
  contexte: ContexteAppel | null;
  /** Le ticket de conversation. Absent = les outils ne marcheront pas, et on le dit. */
  ticket: string | null;
  /** Où sort le son, tel que l'appareil le rapporte. Pour l'affichage et le diagnostic. */
  sortieAudio: () => SortieAudio | null;
  /** Forcer le haut-parleur, ou rendre la main à l'appareil. */
  mettreSurHautParleur: (oui: boolean) => Promise<void>;
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

/**
 * OÙ SORT LE SON. 19/09/2026.
 *
 * ⚠️ LE DÉFAUT QUE ÇA CORRIGE, constaté par HA au premier appel réel : « le son
 * sort du haut-parleur du haut de l'iPhone, comme un appel, au lieu du vrai
 * haut-parleur en bas ».
 *
 * Ce n'est pas un réglage oublié, c'est le comportement d'iOS : une liaison
 * WebRTC ouvre une session audio de type conversation, dont la sortie par défaut
 * est l'ÉCOUTEUR — celui qu'on colle à l'oreille. Vapi appelait le réglage pour
 * nous ; en passant en direct, plus personne ne le fait.
 *
 * ⚠️ LE RÉGLAGE EXISTE DÉJÀ DANS LE BINAIRE, et c'est ce qui permet de corriger
 * sans build. Le module de Daily expose `setAudioDevice` / `getAudioDevice` /
 * `enumerateDevices` sur le pont natif, mais ne les rend pas par son interface
 * JavaScript. On passe donc par `NativeModules`. Lu dans le code du module
 * (`WebRTCModule+DailyDevicesManager.m`), pas deviné : les identifiants sont
 * `SPEAKERPHONE`, `WIRED_OR_EARPIECE` et `BLUETOOTH`, et ils sont les mêmes côté
 * Android.
 *
 * ⚠️ ON NE FORCE PAS LE HAUT-PARLEUR AVEUGLÉMENT. Le code natif, lui, le force
 * même quand un casque est branché (c'est écrit dans son commentaire). Quelqu'un
 * avec des AirPods dans les oreilles s'entendrait soudain diffusé dans la pièce.
 * On regarde donc d'abord CE QUI EST BRANCHÉ, et on ne touche à rien s'il y a un
 * casque ou du Bluetooth.
 */
const HAUT_PARLEUR = 'SPEAKERPHONE';

type PontAudio = {
  /**
   * ⚠️ PROMESSE, celle-ci. Déclarée `resolve`/`reject` côté natif.
   * (`RCT_EXPORT_METHOD(getAudioDevice:(RCTPromiseResolveBlock)resolve ...)`)
   */
  getAudioDevice?: () => Promise<string>;
  /** Sans retour : le natif ne rend rien. On relit avec `getAudioDevice`. */
  setAudioDevice?: (id: string) => void;
};

/**
 * ⚠️ `enumerateDevices` N'EST PAS UNE PROMESSE, ET ÇA A FAIT PLANTER L'APP.
 * 19/09/2026.
 *
 * Constat de HA : « dès que je l'active l'application se ferme, là ça l'a fait
 * 5 fois d'affilée ».
 *
 * Cause, lue dans le module : la méthode native est déclarée
 * `RCT_EXPORT_METHOD(enumerateDevices:(RCTResponseSenderBlock)callback)` — elle
 * attend une FONCTION DE RAPPEL en argument. Je l'appelais sans rien, comme si
 * elle rendait une promesse. Le natif tentait alors d'appeler un rappel
 * inexistant : plantage, application fermée.
 *
 * ⚠️ ET MON `try/catch` NE SERVAIT À RIEN. Un plantage natif ne se rattrape pas
 * en JavaScript. Le filet que je croyais avoir tendu ne tenait rien — c'est
 * précisément le genre de garde-fou qui rassure sans protéger.
 *
 * On passe donc par le wrapper du module (`mediaDevices.enumerateDevices()`),
 * qui enveloppe le rappel correctement et ne peut pas dériver.
 */

function pontAudio(): PontAudio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    return (NativeModules?.WebRTCModule as PontAudio) || null;
  } catch {
    return null;
  }
}

type PeripheriqueAudio = { deviceId?: string; label?: string; kind?: string };

/**
 * Décide où envoyer le son, l'applique, PUIS relit ce que l'appareil a fait.
 *
 * ⚠️ LA RELECTURE N'EST PAS DU ZÈLE. `setAudioDevice` ne rend rien : sans relire,
 * on afficherait « haut-parleur » sans savoir si ça a pris. Un « c'est corrigé »
 * qu'on n'a pas vérifié est exactement ce qui fait perdre une heure plus tard.
 */
async function reglerSortieAudio(
  mediaDevices: { enumerateDevices?: () => Promise<unknown> } | null,
  forcer?: boolean,
): Promise<SortieAudio> {
  const pont = pontAudio();
  if (!pont?.setAudioDevice || !pont?.getAudioDevice) {
    return {
      voulu: null,
      obtenu: 'inconnu',
      raison: "le module natif n'expose pas le réglage de sortie audio",
    };
  }

  let casqueFilaire = false;
  let bluetooth = false;
  try {
    // Le wrapper du module, jamais la méthode native en direct (voir ci-dessus).
    const liste = (await mediaDevices?.enumerateDevices?.()) as PeripheriqueAudio[] | undefined;
    for (const d of Array.isArray(liste) ? liste : []) {
      if (d?.kind !== 'audio') continue;
      if (d.deviceId === 'BLUETOOTH') bluetooth = true;
      // Le module nomme cette entrée « Wired headset » quand un casque est
      // branché, et « Phone earpiece » sinon. C'est le seul signal qu'il donne.
      if (d.deviceId === 'WIRED_OR_EARPIECE' && String(d.label || '').toLowerCase().includes('wired')) {
        casqueFilaire = true;
      }
    }
  } catch {
    // Liste illisible : on continue, la décision se fera sans elle.
  }

  const laisserFaire = !forcer && (bluetooth || casqueFilaire);
  if (!laisserFaire) {
    try {
      pont.setAudioDevice(HAUT_PARLEUR);
    } catch {
      // On relit quand même juste après : c'est la relecture qui fait foi.
    }
  }

  let obtenu = 'inconnu';
  try {
    obtenu = String((await pont.getAudioDevice()) || 'inconnu');
  } catch {
    // Relecture impossible : on le dit, on ne prétend pas que c'est réglé.
  }

  return {
    voulu: laisserFaire ? null : HAUT_PARLEUR,
    obtenu,
    raison: bluetooth
      ? 'Bluetooth connecté — on ne touche à rien'
      : casqueFilaire
        ? 'casque filaire branché — on ne touche à rien'
        : 'rien de branché — haut-parleur',
  };
}

type Rappels = {
  /** Une étape du démarrage, en clair. Sert à savoir OÙ ça casse. */
  surEtape?: (texte: string) => void;
  /** La consommation d'UNE réponse. À additionner, jamais à remplacer. */
  surUsage?: (u: Usage) => void;
  surOutil?: (a: AppelOutilVu) => void;
  surErreur?: (texte: string) => void;
  /** Le mail de la conversation a changé (mail_suivant). L'écran doit suivre. */
  surMail?: (itemId: string) => void;
  /** Ce que dit l'assistant, au fil de l'eau. Pour les sous-titres. */
  surTexte?: (texte: string) => void;
  /** Qui parle en ce moment. `null` = silence. */
  surParole?: (qui: 'assistant' | 'vous' | null) => void;
  /** La liaison est tombée ou s'est fermée. L'écran doit le montrer. */
  surFin?: () => void;
  /**
   * Le ticket de conversation, DÈS QU'IL EST CONNU — c'est-à-dire bien avant que
   * la liaison soit ouverte.
   *
   * ⚠️ POURQUOI CE RAPPEL EXISTE. L'appelant ne reçoit l'objet de session qu'à la
   * fin du démarrage, alors que le premier outil peut partir dans la seconde qui
   * suit l'ouverture du canal. Un appelant qui attendrait l'objet pour connaître
   * le ticket aurait une fenêtre — courte, donc rare, donc introuvable — où il
   * ne saurait pas quoi relire.
   */
  surTicket?: (ticket: string | null) => void;
  /** Où sort le son, une fois la liaison ouverte et le réglage vérifié. */
  surSortieAudio?: (s: SortieAudio) => void;
};

export async function demarrerOpenAI(
  params: {
    /**
     * La route qui délivre le jeton. `/api/voice/start` pour le vrai assistant,
     * `/api/voice/essai-openai` pour le banc (admin, voix et modèle au choix).
     */
    route: string;
    /** Ce que cette route attend. Le module n'en sait rien et n'a pas à le savoir. */
    corps: Record<string, unknown>;
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
  }>(params.route, params.corps);
  if (!r?.jeton) throw new Error(r?.error || "Le serveur n'a pas renvoyé de jeton.");

  const modele = String(r.modele || '');
  const voix = String(r.voix || '');
  const ticket = r.session || null;

  // Avant toute chose : l'appelant doit connaître le ticket tout de suite.
  params.surTicket?.(ticket);

  noter(`   jeton reçu · modèle ${modele} · voix ${voix}`);
  noter(`   mail : ${r.contexte?.objet || '(sans objet)'} · résumé : ${r.contexte?.aUnResume ? 'oui' : 'NON'}`);

  // ⚠️ RIEN EN SILENCE. Sans ticket, les sept outils échoueront TOUS, et
  // l'assistant dira « je n'ai pas pu » sans qu'on sache pourquoi. On le dit
  // maintenant, avant le premier mot.
  if (!ticket) {
    dire(
      `⚠️ Pas de ticket de conversation : les outils ne marcheront pas. Cause : ${r.sessionEchec || 'non dite par le serveur'}`,
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

  let itemId = typeof params.corps.itemId === 'string' ? (params.corps.itemId as string) : null;
  let ferme = false;
  let sortieSon: SortieAudio | null = null;
  const debutMs = Date.now();
  let usage: Usage = { ...USAGE_ZERO };

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
   * ticket de conversation : `reecrire_brouillon` puis `preparer_envoi` lancés
   * ensemble prépareraient l'envoi d'un texte déjà remplacé. Le serveur refuse
   * ce cas (l'empreinte ne correspond plus), mais il vaut mieux ne pas le créer.
   */
  let file: Promise<unknown> = Promise.resolve();
  /** Les travaux en cours, par réponse : on ne relance le modèle qu'à la fin. */
  const enCours = new Map<string, Promise<unknown>[]>();

  async function executer(appel: { call_id: string; name: string; arguments: string }) {
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
      erreur = 'Pas de ticket de conversation : cette conversation ne peut rien faire.';
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

    params.surOutil?.({ nom: appel.name, args, ms: Date.now() - debut, msServeur, resultat: sortie, erreur });

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

    // -------------------------------------------------------------- qui parle
    // Plusieurs noms d'événement selon la version : on les accepte tous plutôt
    // que de parier sur un seul et d'avoir un indicateur qui ne bouge jamais.
    if (m.type === 'input_audio_buffer.speech_started') {
      params.surParole?.('vous');
      return;
    }
    if (m.type === 'input_audio_buffer.speech_stopped') {
      params.surParole?.(null);
      return;
    }
    if (m.type === 'output_audio_buffer.started' || m.type === 'response.output_audio.delta') {
      params.surParole?.('assistant');
      return;
    }
    if (m.type === 'output_audio_buffer.stopped') {
      params.surParole?.(null);
      return;
    }

    // Ce que l'assistant dit, au fil de l'eau. Les deux noms sont acceptés :
    // OpenAI a renommé celui-ci en passant en version générale.
    if (
      (m.type === 'response.output_audio_transcript.done' ||
        m.type === 'response.audio_transcript.done') &&
      m.transcript
    ) {
      params.surTexte?.(String(m.transcript));
      return;
    }

    // -------------------------------------------------------- un outil demandé
    if (m.type === 'response.function_call_arguments.done' && m.call_id && m.name) {
      const rid = String(m.response_id || 'sans-reponse');
      const travail = (file = file.then(() =>
        executer({
          call_id: String(m.call_id),
          name: String(m.name),
          arguments: String(m.arguments || '{}'),
        }),
      ));
      const liste = enCours.get(rid) || [];
      liste.push(travail);
      enCours.set(rid, liste);
      return;
    }

    // ------------------------------------------------------ la réponse est finie
    if (m.type === 'response.done') {
      if (m.response?.usage) {
        const u = m.response.usage as {
          input_token_details?: {
            audio_tokens?: number;
            text_tokens?: number;
            cached_tokens_details?: { audio_tokens?: number; text_tokens?: number };
          };
          output_token_details?: { audio_tokens?: number; text_tokens?: number };
        };
        const ein = u.input_token_details || {};
        const cache = ein.cached_tokens_details || {};
        const eout = u.output_token_details || {};
        const pas: Usage = {
          // Les jetons mis en cache sont facturés à part, TRÈS en dessous : les
          // compter au plein tarif gonflerait la note d'un facteur 30 et ferait
          // rater la décision.
          audioIn: Math.max(0, (ein.audio_tokens || 0) - (cache.audio_tokens || 0)),
          audioCache: cache.audio_tokens || 0,
          audioOut: eout.audio_tokens || 0,
          texteIn: Math.max(0, (ein.text_tokens || 0) - (cache.text_tokens || 0)),
          texteCache: cache.text_tokens || 0,
          texteOut: eout.text_tokens || 0,
        };
        usage = {
          audioIn: usage.audioIn + pas.audioIn,
          audioCache: usage.audioCache + pas.audioCache,
          audioOut: usage.audioOut + pas.audioOut,
          texteIn: usage.texteIn + pas.texteIn,
          texteCache: usage.texteCache + pas.texteCache,
          texteOut: usage.texteOut + pas.texteOut,
        };
        params.surUsage?.(pas);
      }
      params.surParole?.(null);

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

  // La liaison peut tomber sans que personne ne parle : réseau coupé, tunnel,
  // application mise en veille. L'écran doit le MONTRER, pas laisser un micro
  // allumé sur une conversation morte.
  pc.onconnectionstatechange = () => {
    const etat = String(pc.connectionState || '');
    if (etat === 'failed' || etat === 'disconnected' || etat === 'closed') {
      if (etat === 'failed') dire('La liaison avec OpenAI est tombée.');
      params.surFin?.();
    }
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

  /**
   * ⚠️ ON RÈGLE LA SORTIE APRÈS L'ÉTABLISSEMENT, ET ON VÉRIFIE.
   *
   * Avant, iOS n'a pas encore de session audio active : le réglage n'aurait rien
   * sur quoi s'appliquer. Et comme la session peut être reconfigurée quand le
   * premier son arrive, on relit une seconde plus tard et on réapplique UNE
   * fois si ça a bougé.
   *
   * ⚠️ UNE SEULE REPRISE, PAS UNE BOUCLE. Une boucle qui rattrape sans fin
   * finirait par masquer un module qui ne répond pas. Après la reprise, ce
   * qu'on rapporte est ce que l'appareil dit vraiment — même si c'est l'écouteur.
   */
  sortieSon = await reglerSortieAudio(mediaDevices);
  noter(`   son : ${sortieSon.obtenu} (${sortieSon.raison})`);
  params.surSortieAudio?.(sortieSon);

  setTimeout(() => {
    if (ferme) return;
    void (async () => {
      const revu = await reglerSortieAudio(mediaDevices);
      // On ne réapplique que si la sortie a dérivé vers l'écouteur alors qu'on
      // voulait le haut-parleur.
      if (sortieSon?.voulu && revu.obtenu !== sortieSon.voulu) {
        noter(`   son revenu sur ${revu.obtenu} — nouvelle tentative`);
        const encore = await reglerSortieAudio(mediaDevices, true);
        sortieSon = encore;
        params.surSortieAudio?.(encore);
        if (encore.obtenu !== HAUT_PARLEUR) {
          // RIEN EN SILENCE : on a essayé deux fois, ça ne prend pas. La
          // personne entendra le son au mauvais endroit ; autant qu'elle sache
          // que ce n'est pas elle qui a mal réglé son téléphone.
          console.error('[voix] la sortie audio refuse le haut-parleur :', encore.obtenu);
        }
      } else {
        sortieSon = revu;
        params.surSortieAudio?.(revu);
      }
    })();
  }, 1200);

  /**
   * LE RAPPORT DE COÛT. 18/09/2026.
   *
   * ⚠️ POURQUOI IL EST ICI ET PAS DANS L'ÉCRAN. Vapi envoyait sa vraie facture à
   * notre serveur à la fin de chaque appel. OpenAI n'envoie rien : si l'app ne
   * dit pas ce qu'elle a consommé, personne ne le saura jamais. Le mettre dans
   * `arreter()` est la seule façon de ne pas pouvoir l'oublier — et on l'a déjà
   * oublié une fois, le 17/09, quand quatre appels ont disparu du suivi.
   *
   * ⚠️ IL NE BLOQUE PAS ET NE S'AFFICHE PAS. Cette panne-là ne touche pas la
   * conversation, seulement la comptabilité. Elle reste visible dans la console
   * et dans les données.
   */
  function rapporter(raison: string) {
    if (!ticket) {
      console.error('[voix] appel sans ticket : coût non rapporté.');
      return;
    }
    void apiPost('/api/voice/fin-appel', {
      session: ticket,
      debut: new Date(debutMs).toISOString(),
      fin: new Date().toISOString(),
      secondes: Math.max(0, Math.round((Date.now() - debutMs) / 1000)),
      modele,
      raison,
      usage,
    }).catch((e) => console.error('[voix] coût non rapporté', message(e)));
  }

  return {
    arreter: (raison?: string) => {
      if (ferme) return;
      ferme = true;
      // On rapporte AVANT de couper : après, l'app peut être démontée.
      rapporter(raison || 'fin_app');
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
    couperMicro: (muet: boolean) => {
      try {
        // On DÉSACTIVE la piste, on ne la coupe pas : une piste arrêtée ne se
        // rallume pas, et « couper le micro » doit pouvoir se défaire.
        flux.getAudioTracks().forEach((t: { enabled: boolean }) => {
          t.enabled = !muet;
        });
      } catch (e) {
        dire(`micro : ${message(e)}`);
      }
    },
    itemIdCourant: () => itemId,
    usageTotal: () => ({ ...usage }),
    sortieAudio: () => sortieSon,
    mettreSurHautParleur: async (oui: boolean) => {
      // `false` ne force rien : il rend la main à l'appareil, qui reprendra son
      // choix par défaut (casque, Bluetooth, ou écouteur).
      const r = await reglerSortieAudio(mediaDevices, oui);
      sortieSon = r;
      params.surSortieAudio?.(r);
    },
    modele,
    voix,
    contexte: r.contexte || null,
    ticket,
  };
}
