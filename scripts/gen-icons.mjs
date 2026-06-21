// Génère les PNG d'icône à partir des sources vectorielles (assets/brand/*.svg).
// Le V est rendu avec la VRAIE police Georgia de Windows (rendu exact, identique
// au favicon web).
//
// Usage : depuis la racine du projet mobile →  node scripts/gen-icons.mjs
// Prérequis : npm i -D @resvg/resvg-js
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const f = (p) => fileURLToPath(new URL(p, root));

// Polices Georgia (Windows). Si absentes, on retombe sur les polices système.
const fontFiles = ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/georgiab.ttf'].filter((p) =>
  existsSync(p),
);

// [source svg, sortie png, taille px]
const jobs = [
  ['assets/brand/icon.svg', 'assets/images/icon.png', 1024],
  ['assets/brand/icon.svg', 'assets/images/favicon.png', 196],
  ['assets/brand/icon-foreground.svg', 'assets/images/android-icon-foreground.png', 1024],
  ['assets/brand/icon-foreground.svg', 'assets/images/splash-icon.png', 1024],
  ['assets/brand/icon-monochrome.svg', 'assets/images/android-icon-monochrome.png', 1024],
];

for (const [src, out, size] of jobs) {
  const svg = readFileSync(f(src), 'utf8');
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Georgia' },
    background: 'rgba(0,0,0,0)',
  });
  writeFileSync(f(out), r.render().asPng());
  console.log('OK', out, size + 'px');
}

console.log('\nIcônes générées dans assets/images/. Ensuite : npx expo start -c');
