import { Redirect, Tabs } from 'expo-router';

import { IconFeed, IconFlag, IconHome, IconMail, IconSliders } from '@/components/icons';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { colors } from '@/lib/theme';

// L'app s'ouvre sur l'onglet Accueil (recap du jour).
export const unstable_settings = {
  initialRouteName: 'accueil',
};

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.terracottaLight,
        tabBarInactiveTintColor: colors.onDarkMuted,
        tabBarStyle: {
          backgroundColor: colors.charcoal,
          borderTopColor: colors.charline,
        },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
        headerStyle: { backgroundColor: colors.charcoal },
        headerTitleStyle: { color: colors.onDark, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
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
          tabBarIcon: ({ color }) => <IconFeed size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sources"
        options={{
          title: t.tabs.sources,
          tabBarIcon: ({ color }) => <IconMail size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: t.tabs.rules,
          tabBarIcon: ({ color }) => <IconFlag size={22} color={color} />,
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
