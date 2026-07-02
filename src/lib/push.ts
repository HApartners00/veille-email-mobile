import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { apiPost } from './api';

/**
 * Notifications push (Expo Push) — v1 : « email urgent reçu ».
 *
 * - registerForPushNotifications() : permission → jeton Expo → POST
 *   /api/push-tokens (backend). Best-effort, silencieux.
 * - attachNotificationHandlers() : tap sur la notification → ouvre le détail
 *   de l'email (data.itemId).
 *
 * ⚠️ Expo Go (SDK 53+) ne supporte plus les push distantes : à tester dans un
 * build dev-client ou standalone. Le code est sans effet dans Expo Go.
 */

// Affichage des notifications quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registered = false;

export async function registerForPushNotifications(): Promise<void> {
  if (registered) return;
  try {
    if (!Device.isDevice) return; // simulateur : pas de push

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!tokenResp?.data) return;

    await apiPost('/api/push-tokens', { token: tokenResp.data, platform: Platform.OS });
    registered = true;
  } catch {
    // best-effort : jamais bloquant (Expo Go, permission refusée, offline…)
  }
}

/** Tap sur une notification → ouvre le détail de l'email. Renvoie l'unsubscribe. */
export function attachNotificationHandlers(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const itemId = (response?.notification?.request?.content?.data as { itemId?: string })
      ?.itemId;
    if (itemId) {
      try {
        router.push(`/email/${itemId}`);
      } catch {
        // navigation pas prête : ignorer
      }
    }
  });
  return () => sub.remove();
}
