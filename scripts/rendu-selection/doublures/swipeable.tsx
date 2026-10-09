// Doublure du ReanimatedSwipeable : montre la ligne DÉCALÉE de `globalThis.__decalage` px,
// avec le VRAI panneau d'action dessous (rendu par le vrai composant).
import { View } from 'react-native-web';
export enum SwipeDirection { LEFT = 'left', RIGHT = 'right' }
export default function Swipeable(p: any) {
  const g = globalThis as any; const d: number = Array.isArray(g.__decalages) ? (g.__decalages.shift() || 0) : 0;
  const tr = { value: d };
  const panneau = d > 0 ? p.renderLeftActions?.({ value: 1 }, tr, {}) : d < 0 ? p.renderRightActions?.({ value: 1 }, tr, {}) : null;
  return (
    <View style={{ position: 'relative', overflow: 'hidden' }}>
      {panneau ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: d > 0 ? 'flex-start' : 'flex-end' }}>{panneau}</View> : null}
      <View style={{ transform: [{ translateX: d }] }}>{p.children}</View>
    </View>
  );
}
