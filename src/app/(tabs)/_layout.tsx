import { Redirect, Tabs, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { IconDraft, IconHome, IconMail, IconSend, IconSliders } from '@/components/icons';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { didacticielDejaVu } from '@/lib/didacticiel';
import { attachNotificationHandlers, registerForPushNotifications } from '@/lib/push';
import { colors, fonts } from '@/lib/theme';

// L'app s'ouvre sur l'onglet Accueil (recap du jour).
export const unstable_settings = {
  initialRouteName: 'accueil',
};

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const didacticielDemande = useRef(false);

  // Push : enregistre le jeton une fois connecté + gère le tap (→ détail email).
  useEffect(() => {
    if (!session) return;
    void registerForPushNotifications();
    return attachNotificationHandlers();
  }, [session]);

  // ───────────────────────────────────────────────────────────────────────────
  // DIDACTICIEL D'ACCUEIL — 21/09/2026
  //
  // POURQUOI ICI ET PAS AILLEURS. Deux chemins mènent à l'app connectée : la
  // connexion (login.tsx fait `replace('/(tabs)/accueil')`) et le démarrage à
  // froid avec une session déjà en mémoire (index.tsx redirige). Les deux
  // passent par CE composant, et lui seul. Le brancher dans login.tsx aurait
  // laissé sans didacticiel quiconque ferme l'app avant de l'avoir fini.
  //
  // `didacticielDemande` : une seule tentative par lancement. Sans lui, le
  // retour du didacticiel remonterait ce layout et le relancerait en boucle.
  //
  // 🔴 `null` = « on n'a pas pu savoir » (réseau, serveur). On ne montre RIEN.
  // Un didacticiel rejoué à chaque ouverture parce que l'API tousse serait pire
  // que pas de didacticiel du tout.
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || didacticielDemande.current) return;
    didacticielDemande.current = true;
    let vivant = true;
    (async () => {
      const vu = await didacticielDejaVu();
      if (!vivant || vu !== false) return;
      router.push('/didacticiel');
    })();
    return () => {
      vivant = false;
    };
  }, [session, router]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.terracottaLight,
        tabBarInactiveTintColor: colors.onDarkMuted,
        tabBarStyle: {
          backgroundColor: colors.charcoal,
          borderTopColor: colors.charline,
        },
        // 5 onglets depuis le 07/08/2026 : à 11 pt, « Отправленные » (ru) et
        // « Gesendet » (de) débordaient. La taille est réduite et le libellé
        // autorisé à se resserrer plutôt qu'à être coupé net.
        tabBarLabelStyle: { fontFamily: fonts.sansSemibold, fontSize: 9.5 },
        tabBarItemStyle: { paddingHorizontal: 2 },
      }}
    >
      {/* 5 onglets visibles : Accueil · Emails · Envoyés · Brouillons · Réglages */}
      <Tabs.Screen
        name="accueil"
        options={{
          title: t.tabs.accueil,
          tabBarIcon: ({ color }) => <IconHome size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.feed,
          tabBarIcon: ({ color }) => <IconMail size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sent"
        options={{
          title: t.tabs.sent,
          tabBarIcon: ({ color }) => <IconSend size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="drafts"
        options={{
          title: t.tabs.drafts,
          tabBarIcon: ({ color }) => <IconDraft size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ color }) => <IconSliders size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
