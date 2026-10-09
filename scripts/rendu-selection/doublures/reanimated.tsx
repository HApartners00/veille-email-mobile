// Doublure de react-native-reanimated : une image fixe n'a pas besoin d'animation.
import { View } from 'react-native-web';
const Reanimated = { View };
export default Reanimated;
export const useAnimatedStyle = (f: () => any) => { try { return f(); } catch { return {}; } };
export const interpolate = (v: number, a: number[], b: number[]) => { const t = Math.max(0, Math.min(1, (v - a[0]!) / (a[1]! - a[0]!))); return b[0]! + t * (b[1]! - b[0]!); };
export const Extrapolation = { CLAMP: 'clamp' };
export type SharedValue<T> = { value: T };
