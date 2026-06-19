// Génère les PNG d'icône à partir des sources vectorielles (assets/brand/*.svg).
// Usage : depuis la racine du projet mobile →  node scripts/gen-icons.mjs
// Prérequis : sharp (npm i -D sharp si absent).
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const root = new URL('../', import.meta.url);
const f = (p) => fileURLToPath(new URL(p, root));

// [source svg, sortie png, taille px]
const jobs = [
  ['assets/brand/icon.svg', 'assets/images/icon.png', 1024],
  ['assets/brand/icon.svg', 'assets/images/favicon.png', 196],
  ['assets/brand/icon-foreground.svg', 'assets/images/android-icon-foreground.png', 1024],
  ['assets/brand/icon-foreground.svg', 'assets/images/splash-icon.png', 1024],
  ['assets/brand/icon-monochrome.svg', 'assets/images/android-icon-monochrome.png', 1024],
];

for (const [src, out, size] of jobs) {
  await sharp(f(src), { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(f(out));
  console.log('✓', out, size + 'px');
}

console.log('\nIcônes générées dans assets/images/. Pense à : npx expo start -c');
