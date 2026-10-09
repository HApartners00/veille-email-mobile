// Doublure de react-native-svg pour le rendu web du banc : les mêmes éléments, en SVG du navigateur.
import { createElement } from 'react';
const el = (tag: string) => (p: any) => createElement(tag, p, p?.children);
const Svg = (p: any) => {
  const { children, width, height, viewBox, fill } = p || {};
  return createElement('svg', { width, height, viewBox, fill, xmlns: 'http://www.w3.org/2000/svg' }, children);
};
export default Svg;
export const Path = el('path'), Rect = el('rect'), Line = el('line'), Polyline = el('polyline'), Circle = el('circle'), G = el('g'), Defs = el('defs');
