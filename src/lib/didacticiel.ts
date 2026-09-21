import { apiGet, apiPost } from '@/lib/api';

/**
 * L'état « didacticiel déjà vu » — côté SERVEUR.
 *
 * ⚠️ POURQUOI PAS AsyncStorage. Sur l'appareil, l'état repart à zéro à chaque
 * réinstallation, et n'existe pas sur le deuxième téléphone de la même
 * personne. Quelqu'un qui réinstalle l'app a déjà vu les cinq écrans ; les lui
 * remontrer, c'est lui dire qu'on ne le connaît pas. La colonne
 * `profiles.didacticiel_vu_le` (migration du 21/09/2026) est la seule vérité.
 *
 * 🔴 AUCUN CATCH MUET ICI. `null` veut dire « on n'a pas pu savoir », et ce
 * n'est PAS la même chose que `false`. L'appelant ne montre rien quand il ne
 * sait pas : un didacticiel rejoué à chaque ouverture parce que le réseau tousse
 * serait pire que pas de didacticiel du tout.
 */
export async function didacticielDejaVu(): Promise<boolean | null> {
  try {
    const r = await apiGet<{ vu?: boolean }>('/api/didacticiel');
    return Boolean(r?.vu);
  } catch (e) {
    console.error('Lecture de l’état du didacticiel en échec :', e);
    return null;
  }
}

/** Marque le didacticiel comme vu. Idempotent côté serveur. */
export async function marquerDidacticielVu(): Promise<boolean> {
  try {
    await apiPost('/api/didacticiel', {});
    return true;
  } catch (e) {
    // Conséquence si ça échoue : le didacticiel se remontrera à la prochaine
    // ouverture. Désagréable, pas grave — mais jamais silencieux.
    console.error('Enregistrement « didacticiel vu » en échec :', e);
    return false;
  }
}

// « Revoir le didacticiel » (Réglages) ouvre simplement l'écran : rien à
// remettre à zéro en base, donc aucune fonction de plus ici.
