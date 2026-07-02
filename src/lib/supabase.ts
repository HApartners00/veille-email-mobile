import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

import { secureSessionStorage } from './secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase non configuré : renseigne EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans le fichier .env (puis relance `npx expo start -c`).',
  );
}

/**
 * Client Supabase pour React Native.
 * - Session persistée dans le trousseau natif (expo-secure-store, chiffré) —
 *   plus jamais de jetons en clair dans AsyncStorage. Migration douce incluse.
 * - detectSessionInUrl désactivé (pas de navigateur sur mobile).
 */
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
