import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { colors } from '@/lib/theme';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}
      >
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)/accueil' : '/login'} />;
}
