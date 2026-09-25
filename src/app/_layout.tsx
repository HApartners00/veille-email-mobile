import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_700Bold_Italic,
  useFonts,
} from '@expo-google-fonts/playfair-display';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CreditOverlay from '@/components/credit-overlay';
import { AuthProvider } from '@/context/auth';
import { I18nProvider } from '@/context/i18n';
import { interFonts } from '@/lib/fonts';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    ...interFonts,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AuthProvider>
          <StatusBar style="light" />
          {fontsLoaded ? (
            <>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.fond },
              }}
            />
            {/* Crédit du jour (25/09/2026) : barre fine + panneau « épuisé », sans offre (App Store 3.1.1). */}
            <CreditOverlay />
            </>
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: colors.charcoal,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIndicator color={colors.terracottaVivid} />
            </View>
          )}
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
