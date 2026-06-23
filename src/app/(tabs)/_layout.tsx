import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { colors } from '@/lib/theme';

// L'app s'ouvre sur l'onglet Accueil (récap du jour).
export const unstable_settings = {
  initialRouteName: 'accueil',
};

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        // Bandeau du bas en charbon, comme le bandeau du haut.
        tabBarActiveTintColor: colors.terracottaLight,
        tabBarInactiveTintColor: colors.onDarkMuted,
        tabBarStyle: {
          backgroundColor: colors.charcoal,
          borderTopColor: colors.charline,
        },
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: colors.charcoal },
        headerTitleStyle: { color: colors.onDark, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="accueil"
        options={{
          title: t.tabs.accueil,
          tabBarIcon: ({ color }) => <TabIcon glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.feed,
          tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sources"
        options={{
          title: t.tabs.sources,
          tabBarIcon: ({ color }) => <TabIcon glyph="✉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: t.tabs.rules,
          tabBarIcon: ({ color }) => <TabIcon glyph="⚑" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}
