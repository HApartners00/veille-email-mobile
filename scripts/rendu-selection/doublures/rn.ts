export * from 'react-native-web';
// Rendu sans navigateur : pas de fenêtre, donc une largeur de 0. On donne celle d'un iPhone (390).
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 2, fontScale: 1 });
