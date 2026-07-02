import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Stockage de session pour Supabase Auth, adossé au trousseau natif
 * (iOS Keychain / Android Keystore) via expo-secure-store.
 *
 * Pourquoi : AsyncStorage écrit en CLAIR sur le disque — les jetons de session
 * (access + refresh) y étaient lisibles par toute personne ayant accès au
 * système de fichiers de l'appareil (sauvegardes comprises sur Android).
 *
 * Particularités :
 * - SecureStore limite chaque entrée à ~2048 octets ; la session Supabase
 *   (JSON avec les 2 jetons) dépasse souvent cette taille → on découpe la
 *   valeur en tranches (`<clé>.0`, `<clé>.1`, …) + une entrée méta
 *   (`<clé>.__meta`) qui mémorise le nombre de tranches.
 * - Migration douce : si la clé n'existe pas encore dans SecureStore mais
 *   existe dans AsyncStorage (installations antérieures), on la déplace vers
 *   SecureStore puis on l'efface d'AsyncStorage — personne n'est déconnecté.
 * - AFTER_FIRST_UNLOCK : le refresh automatique du jeton doit pouvoir lire la
 *   valeur même quand l'app tourne en arrière-plan après un redémarrage.
 */

const CHUNK_SIZE = 1900; // marge sous la limite de 2048 octets
const META_SUFFIX = '.__meta';

const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// SecureStore n'accepte que [A-Za-z0-9._-] dans les clés.
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readChunked(key: string): Promise<string | null> {
  const k = safeKey(key);
  const meta = await SecureStore.getItemAsync(k + META_SUFFIX, OPTS);
  if (!meta) return null;
  const count = parseInt(meta, 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(`${k}.${i}`, OPTS);
    if (part === null) return null; // tranche manquante → valeur corrompue
    parts.push(part);
  }
  return parts.join('');
}

async function writeChunked(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  const count = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let i = 0; i < count; i += 1) {
    await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), OPTS);
  }
  // Purge les anciennes tranches excédentaires si la valeur a rétréci.
  const prevMeta = await SecureStore.getItemAsync(k + META_SUFFIX, OPTS);
  const prev = prevMeta ? parseInt(prevMeta, 10) : 0;
  for (let i = count; i < (Number.isFinite(prev) ? prev : 0); i += 1) {
    await SecureStore.deleteItemAsync(`${k}.${i}`, OPTS).catch(() => {});
  }
  await SecureStore.setItemAsync(k + META_SUFFIX, String(count), OPTS);
}

async function removeChunked(key: string): Promise<void> {
  const k = safeKey(key);
  const meta = await SecureStore.getItemAsync(k + META_SUFFIX, OPTS);
  const count = meta ? parseInt(meta, 10) : 0;
  for (let i = 0; i < (Number.isFinite(count) ? count : 0); i += 1) {
    await SecureStore.deleteItemAsync(`${k}.${i}`, OPTS).catch(() => {});
  }
  await SecureStore.deleteItemAsync(k + META_SUFFIX, OPTS).catch(() => {});
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await readChunked(key);
      if (v !== null) return v;
      // Migration douce depuis AsyncStorage (anciennes installations).
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        await writeChunked(key, legacy);
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacy;
      }
      return null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await writeChunked(key, value);
    } catch {
      // best-effort : ne jamais faire planter l'auth pour un souci de stockage
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await removeChunked(key);
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch {
      // best-effort
    }
  },
};
