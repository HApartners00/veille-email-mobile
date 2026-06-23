import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager } from 'react-native';

import { apiPost } from '@/lib/api';
import {
  bcp47,
  defaultLocale,
  fmt as fmtRaw,
  getDictionary,
  isRtl,
  normalizeLocale,
  type Dict,
  type Locale,
} from '@/lib/i18n';

const STORAGE_KEY = 'app.locale';

/** Langue de l'appareil (synchrone) → une de nos locales, sinon repli anglais. */
function detectDeviceLocale(): Locale {
  try {
    const tags = Localization.getLocales();
    for (const t of tags) {
      const norm = normalizeLocale(t.languageTag || t.languageCode);
      if (norm) return norm;
    }
  } catch {
    // ignore
  }
  return defaultLocale;
}

function deviceTimeZone(): string {
  try {
    const tz = Localization.getCalendars()?.[0]?.timeZone;
    if (tz) return tz;
  } catch {
    // ignore
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

type I18nValue = {
  locale: Locale;
  t: Dict;
  dir: 'ltr' | 'rtl';
  rtl: boolean;
  /** Repère BCP-47 pour toLocaleDateString/Intl. */
  intl: string;
  setLocale: (next: Locale) => Promise<void>;
  /** Interpolation liée à la locale courante : f('{n}', { n }) */
  f: (template: string, vars: Record<string, string | number>) => string;
  /** true quand la langue stockée a fini de charger (évite un flash). */
  ready: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

// Applique le sens d'écriture le plus tôt possible (avant le 1er rendu).
const initial = detectDeviceLocale();
try {
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== isRtl(initial)) {
    I18nManager.forceRTL(isRtl(initial));
  }
} catch {
  // ignore
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const [ready, setReady] = useState(false);

  // Au démarrage : la langue choisie (stockée) prime sur la langue de l'appareil.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const norm = normalizeLocale(stored);
        if (mounted && norm && norm !== locale) {
          setLocaleState(norm);
          if (I18nManager.isRTL !== isRtl(norm)) {
            I18nManager.forceRTL(isRtl(norm));
          }
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    // Bascule RTL (s'applique pleinement au prochain démarrage de l'app).
    try {
      if (I18nManager.isRTL !== isRtl(next)) {
        I18nManager.forceRTL(isRtl(next));
      }
    } catch {
      // ignore
    }
    // Propage langue + fuseau au backend (profil + Account Store n8n → digest).
    try {
      await apiPost('/api/locale', { locale: next, tz: deviceTimeZone() });
    } catch {
      // best-effort : la langue est déjà appliquée et stockée localement.
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = getDictionary(locale);
    return {
      locale,
      t,
      dir: isRtl(locale) ? 'rtl' : 'ltr',
      rtl: isRtl(locale),
      intl: bcp47[locale],
      setLocale,
      f: fmtRaw,
      ready,
    };
  }, [locale, setLocale, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé dans <I18nProvider>.');
  return ctx;
}
