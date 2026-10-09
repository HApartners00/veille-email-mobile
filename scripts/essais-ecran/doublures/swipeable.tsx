// Doublure du ReanimatedSwipeable (banc d'écran, 09/10/2026). Garde ses props par SUJET du
// mail (les enfants sont un <EmailRow subject=…>) pour que l'essai « glisse » une ligne en
// appelant onSwipeableOpen, et compte les montages (une ligne ne doit pas être remontée).
import { useEffect } from 'react';
import { View } from 'react-native-web';
export enum SwipeDirection { LEFT = 'left', RIGHT = 'right' }
const g = globalThis as any;
g.__glisser = g.__glisser || {}; g.__montages = g.__montages || 0;
export default function Swipeable(p: any) {
  const sujet = p.children?.props?.subject;
  g.__glisser[sujet] = p;
  useEffect(() => { g.__montages++; }, []);
  return <View>{p.children}</View>;
}
