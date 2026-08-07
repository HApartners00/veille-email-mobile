import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { IconDraft, IconHome, IconMail, IconSend, IconSliders } from '@/components/icons';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { attachNotificationHandlers, registerForPushNotifications } from '@/lib/push';
import { colors, fonts } from '@/lib/theme';

// L'app s'ouvre sur l'onglet Accueil (recap du jour).
export const unstable_settings = {
  initialRouteName: 'accueil',
};

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();

  // Push : enregistre le jeton une fois connecté + gère le tap (→ détail email).
  useEffect(() => {
    if (!session) return;
    void registerForPushNotifications();
    return attachNotificationHandlers();
  }, [session]);

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
