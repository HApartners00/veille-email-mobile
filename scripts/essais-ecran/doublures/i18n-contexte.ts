import { bcp47, fmt, getDictionary } from '@/lib/i18n';
const t = getDictionary('fr');
export const useI18n = () => ({ locale: 'fr', t, dir: 'ltr', rtl: false, intl: bcp47.fr, setLocale: async () => {}, f: fmt, ready: true });
