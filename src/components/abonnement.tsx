import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * RÉGLAGES › ABONNEMENT — APP — 26/09/2026.
 *
 * Demande de HA : « dans les réglages il doit y avoir un endroit où on voit son
 * plan et on peut changer de plan ». Choix de HA : la formule + un bouton DIRECT
 * vers la page Abonnement du compte web (app.veille-email.fr/settings?s=abonnement),
 * où l'on change de formule.
 *
 * ⚠️ RISQUE APP STORE ASSUMÉ PAR HA (26/09). Cet écran avait été RETIRÉ le 27/08
 * après un refus d'Apple (règles 3.1.1 et 3.1.3(c)). La règle 3.1.1, relue le
 * 26/09, interdit hors des États-Unis tout bouton ou lien vers un autre moyen de
 * paiement que l'achat intégré. HA a choisi le bouton direct, partout. Aucun prix
 * n'est affiché ici.
 *
 * Données : /api/billing/status (déjà utilisé par le web). Une lecture ratée
 * s'affiche (jamais une formule inventée) ; un échec d'ouverture aussi.
 */

const LIEN_ABONNEMENT = 'https://app.veille-email.fr/settings?s=abonnement';

type Dict = {
  titre: string;
  votre: string;
  gratuit: string;
  offert: string;
  essai: string;
  renouv: string;
  fin: string;
  changer: string;
  gerer: string;
  note: string;
  illisible: string;
  echec: string;
};

const STR: Record<string, Dict> = {
  fr: {
    titre: 'Abonnement',
    votre: 'Votre formule',
    gratuit: 'Gratuit',
    offert: 'Accès offert',
    essai: 'Essai Premium jusqu’au {d}',
    renouv: 'Renouvellement le {d}',
    fin: 'Se termine le {d}',
    changer: 'Changer de formule',
    gerer: 'Gérer mon abonnement',
    note: 'La page s’ouvre sur le site de Vmail. Connectez-vous avec la même adresse si on vous le demande.',
    illisible: 'Formule indisponible pour le moment. Réessayez dans un instant.',
    echec: 'Impossible d’ouvrir la page. Réessayez.',
  },
  en: {
    titre: 'Subscription',
    votre: 'Your plan',
    gratuit: 'Free',
    offert: 'Complimentary access',
    essai: 'Premium trial until {d}',
    renouv: 'Renews on {d}',
    fin: 'Ends on {d}',
    changer: 'Change plan',
    gerer: 'Manage my subscription',
    note: 'The page opens on the Vmail website. Sign in with the same address if asked.',
    illisible: 'Your plan is unavailable right now. Please try again in a moment.',
    echec: 'Couldn’t open the page. Please try again.',
  },
  es: {
    titre: 'Suscripción',
    votre: 'Tu plan',
    gratuit: 'Gratuito',
    offert: 'Acceso ofrecido',
    essai: 'Prueba Premium hasta el {d}',
    renouv: 'Se renueva el {d}',
    fin: 'Termina el {d}',
    changer: 'Cambiar de plan',
    gerer: 'Gestionar mi suscripción',
    note: 'La página se abre en la web de Vmail. Inicia sesión con la misma dirección si te lo pide.',
    illisible: 'Tu plan no está disponible en este momento. Inténtalo de nuevo en un momento.',
    echec: 'No se ha podido abrir la página. Inténtalo de nuevo.',
  },
  de: {
    titre: 'Abonnement',
    votre: 'Ihr Tarif',
    gratuit: 'Gratis',
    offert: 'Kostenloser Zugang',
    essai: 'Premium-Test bis {d}',
    renouv: 'Verlängerung am {d}',
    fin: 'Endet am {d}',
    changer: 'Tarif wechseln',
    gerer: 'Abo verwalten',
    note: 'Die Seite öffnet sich auf der Vmail-Website. Melden Sie sich bei Bedarf mit derselben Adresse an.',
    illisible: 'Ihr Tarif ist gerade nicht verfügbar. Bitte gleich erneut versuchen.',
    echec: 'Die Seite konnte nicht geöffnet werden. Bitte erneut versuchen.',
  },
  pt: {
    titre: 'Assinatura',
    votre: 'O seu plano',
    gratuit: 'Gratuito',
    offert: 'Acesso oferecido',
    essai: 'Teste Premium até {d}',
    renouv: 'Renova a {d}',
    fin: 'Termina a {d}',
    changer: 'Mudar de plano',
    gerer: 'Gerir a minha assinatura',
    note: 'A página abre no site da Vmail. Inicie sessão com o mesmo endereço, se lhe for pedido.',
    illisible: 'O seu plano está indisponível de momento. Tente de novo dentro de instantes.',
    echec: 'Não foi possível abrir a página. Tente de novo.',
  },
  it: {
    titre: 'Abbonamento',
    votre: 'Il tuo piano',
    gratuit: 'Gratuito',
    offert: 'Accesso offerto',
    essai: 'Prova Premium fino al {d}',
    renouv: 'Rinnovo il {d}',
    fin: 'Termina il {d}',
    changer: 'Cambia piano',
    gerer: 'Gestisci abbonamento',
    note: 'La pagina si apre sul sito di Vmail. Accedi con lo stesso indirizzo se richiesto.',
    illisible: 'Il tuo piano non è disponibile al momento. Riprova tra un istante.',
    echec: 'Impossibile aprire la pagina. Riprova.',
  },
  ar: {
    titre: 'الاشتراك',
    votre: 'باقتك',
    gratuit: 'المجانية',
    offert: 'وصول مجاني',
    essai: 'تجربة Premium حتى {d}',
    renouv: 'يتجدد في {d}',
    fin: 'ينتهي في {d}',
    changer: 'تغيير الباقة',
    gerer: 'إدارة اشتراكي',
    note: 'تُفتح الصفحة على موقع Vmail. سجّل الدخول بنفس العنوان إذا طُلب منك ذلك.',
    illisible: 'باقتك غير متاحة حاليًا. أعد المحاولة بعد قليل.',
    echec: 'تعذّر فتح الصفحة. أعد المحاولة.',
  },
  ru: {
    titre: 'Подписка',
    votre: 'Ваш тариф',
    gratuit: 'Бесплатный',
    offert: 'Бесплатный доступ',
    essai: 'Пробный Premium до {d}',
    renouv: 'Продление {d}',
    fin: 'Заканчивается {d}',
    changer: 'Сменить тариф',
    gerer: 'Управлять подпиской',
    note: 'Страница откроется на сайте Vmail. При необходимости войдите с тем же адресом.',
    illisible: 'Ваш тариф сейчас недоступен. Повторите попытку через минуту.',
    echec: 'Не удалось открыть страницу. Попробуйте ещё раз.',
  },
};

/** Titre de la rubrique, pour l'index des réglages et le bandeau du sous-écran. */
export function abonnementTitre(locale: string): string {
  return (STR[locale] ?? STR.en!).titre;
}

type Statut = {
  source?: 'subscription' | 'offert' | 'trial' | null;
  plan?: 'essential' | 'premium' | null;
  acces_offert?: boolean;
  free_trial_ends_at?: string | null;
  premium_trial_active?: boolean;
  premium_trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

type Etat = { kind: 'lecture' } | { kind: 'lu'; s: Statut } | { kind: 'illisible' };

function date(iso: string | null | undefined, intl: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Abonnement() {
  const { locale, intl } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const [etat, setEtat] = useState<Etat>({ kind: 'lecture' });
  const [echec, setEchec] = useState(false);

  const lire = useCallback(async () => {
    try {
      const s = await apiGet<Statut>('/api/billing/status');
      setEtat({ kind: 'lu', s: s || {} });
    } catch (e) {
      console.error('[abonnement] /api/billing/status illisible', e);
      setEtat({ kind: 'illisible' });
    }
  }, []);

  // Relu à l'ouverture et au retour dans l'app (après un changement sur le site).
  useEffect(() => {
    void lire();
    const abo = AppState.addEventListener('change', (st) => {
      if (st === 'active') void lire();
    });
    return () => abo.remove();
  }, [lire]);

  const ouvrir = async () => {
    setEchec(false);
    try {
      await WebBrowser.openBrowserAsync(LIEN_ABONNEMENT);
      void lire();
    } catch (e) {
      console.error('[abonnement] ouverture du site impossible', e);
      setEchec(true);
    }
  };

  if (etat.kind === 'lecture') return <View style={styles.page} />;
  if (etat.kind === 'illisible') {
    return (
      <View style={styles.page}>
        <View style={styles.carte}>
          <Text style={styles.texte}>{t.illisible}</Text>
        </View>
      </View>
    );
  }

  const s = etat.s;
  const offert = s.source === 'offert' || s.acces_offert === true;
  const abonne = s.source === 'subscription';
  const essai = s.source === 'trial';
  const nom = offert
    ? t.offert
    : abonne || essai
      ? s.premium_trial_active || essai || s.plan === 'premium'
        ? 'Premium'
        : 'Essentiel'
      : t.gratuit;
  const sous = offert
    ? null
    : essai
      ? t.essai.replace('{d}', date(s.free_trial_ends_at, intl) || '')
      : s.premium_trial_active
        ? t.essai.replace('{d}', date(s.premium_trial_ends_at, intl) || '')
        : abonne && date(s.current_period_end, intl)
          ? (s.cancel_at_period_end ? t.fin : t.renouv).replace('{d}', date(s.current_period_end, intl)!)
          : null;
  // Accès offert : rien à changer. Premium payant : gérer (baisser, résilier).
  const bouton = offert ? null : abonne && s.plan === 'premium' && !s.premium_trial_active ? t.gerer : t.changer;

  return (
    <View style={styles.page}>
      <View style={styles.carte}>
        <Text style={styles.etiquette}>{t.votre}</Text>
        <Text style={styles.nom}>{nom}</Text>
        {sous ? <Text style={styles.sous}>{sous}</Text> : null}
        {bouton ? (
          <>
            <Pressable onPress={() => void ouvrir()} style={styles.bouton} accessibilityRole="button">
              <Text style={styles.boutonTexte}>{bouton}</Text>
            </Pressable>
            <Text style={styles.note}>{t.note}</Text>
            {echec ? <Text style={styles.echec}>{t.echec}</Text> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  carte: {
    backgroundColor: colors.charcoalSoft,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  etiquette: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDarkMuted },
  nom: { fontFamily: fonts.sansBold, fontSize: 24, color: colors.cream, marginTop: 4, letterSpacing: -0.4 },
  sous: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDarkMuted, marginTop: 4 },
  texte: { fontFamily: fonts.sans, fontSize: 14, color: colors.cream },
  bouton: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  boutonTexte: { color: '#fff', fontFamily: fonts.sansSemibold, fontSize: 15 },
  note: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.onDarkMuted, marginTop: spacing.sm },
  echec: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.danger, marginTop: spacing.sm },
});
