import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { apiPost } from './api';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// LE PREMIER IMPORT — 22/09/2026.
//
// MESURE (20/09) : un nouveau client connecte sa boîte Outlook à 00 h 15 (Paris),
// ouvre l'app à 00 h 28. Ses mails n'arrivent qu'à 7 h 53, avec le rapport du
// matin. Pendant 7 heures, l'Accueil affichait « ✓ Boîte à jour — rien à
// traiter » : c'était faux, rien n'avait encore été importé.
//
// Ce crochet dit si l'app attend son PREMIER mail :
//   · `aucunMail` : la requête des mails récents, SANS filtre de date, n'a rien
//     rendu — ce compte n'a encore aucun mail en base ;
//   · une boîte est-elle connectée ? (`sources`, sous RLS).
// Pendant l'attente, l'écran se recharge toutes les 10 s, pendant 3 minutes au
// plus ; au-delà, on le DIT au lieu de tourner indéfiniment.
//
// FILET : une relève est demandée UNE fois par lancement (/api/refresh). Le
// serveur la lance déjà à la connexion de la boîte (/api/accounts) ; ceci couvre
// les comptes connectés avant ce correctif, et une relève serveur qui aurait
// échoué. Rien de muet : un échec part en console.
// ─────────────────────────────────────────────────────────────────────────────

export type EtatPremierImport = 'inconnu' | 'non' | 'sans-boite' | 'attente' | 'trop-long';

const INTERVALLE_MS = 10_000;
const DUREE_MAX_MS = 3 * 60_000;

// Partagés entre l'Accueil et l'onglet Emails : une seule relève, un seul chrono.
let releveDemandee = false;
let debutAttente: number | null = null;

export function usePremierImport(aucunMail: boolean | null, recharger: () => void): EtatPremierImport {
  const [aUneBoite, setAUneBoite] = useState<boolean | null>(null);
  const [tropLong, setTropLong] = useState(false);
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;

  // Une boîte est-elle connectée ? Lu seulement quand il n'y a aucun mail.
  useEffect(() => {
    if (aucunMail !== true || aUneBoite !== null) return;
    let vivant = true;
    (async () => {
      // Une ligne suffit. Pas de `count: 'exact'` : il se lit dans un en-tête de
      // réponse, et un en-tête absent donnerait « 0 boîte » — donc « Aucune boîte
      // connectée » affirmé à tort. Mesuré sur le rendu du 22/09.
      const { data, error } = await supabase.from('sources').select('id').limit(1);
      if (!vivant) return;
      if (error) {
        // On ne sait pas. Afficher « aucune boîte » serait peut-être faux ; « vos mails
        // arrivent » aussi, mais c'est le cas de quasiment tout nouveau compte (on ne
        // s'inscrit qu'en connectant sa boîte). On le dit en console.
        console.error('[premier-import] lecture des boîtes impossible :', error.message);
        setAUneBoite(true);
        return;
      }
      setAUneBoite((data ?? []).length > 0);
    })();
    return () => {
      vivant = false;
    };
  }, [aucunMail, aUneBoite]);

  const enAttente = aucunMail === true && aUneBoite === true;

  // Filet : une relève, une seule fois par lancement.
  useEffect(() => {
    if (!enAttente || releveDemandee) return;
    releveDemandee = true;
    apiPost('/api/refresh', {}).catch((e) => console.error('[premier-import] relève non demandée :', e));
  }, [enAttente]);

  // Rechargement toutes les 10 s tant que l'écran est visible, 3 minutes au plus.
  useFocusEffect(
    useCallback(() => {
      if (!enAttente) return undefined;
      if (debutAttente === null) debutAttente = Date.now();
      const verifier = () => {
        if (debutAttente !== null && Date.now() - debutAttente > DUREE_MAX_MS) {
          setTropLong(true);
          return false;
        }
        return true;
      };
      if (!verifier()) return undefined;
      const id = setInterval(() => {
        if (!verifier()) {
          clearInterval(id);
          return;
        }
        rechargerRef.current();
      }, INTERVALLE_MS);
      return () => clearInterval(id);
    }, [enAttente]),
  );

  // Le premier mail est arrivé : on remet le chrono à zéro pour la suite.
  useEffect(() => {
    if (aucunMail === false) debutAttente = null;
  }, [aucunMail]);

  if (aucunMail === null) return 'inconnu';
  if (!aucunMail) return 'non';
  if (aUneBoite === null) return 'inconnu';
  if (!aUneBoite) return 'sans-boite';
  return tropLong ? 'trop-long' : 'attente';
}
