#!/usr/bin/env bash
# Rendu fixe des lignes glissées et de la barre de sélection (09/10/2026).
#   usage : bash scripts/rendu-selection/lancer.sh <dossier de sortie>
# Monte un petit banc à côté (react-native-web), avec les VRAIS composants de src/,
# et écrit vues-app.json (chaque vue en HTML statique, à photographier avec Playwright).
# Paquets en plus de ceux de l'app : tsx, react-dom, react-native-web.
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$ICI/../.." && pwd)"
SORTIE="${1:?dossier de sortie}"; BANC="$(mktemp -d)"
mkdir -p "$BANC/shims" "$BANC/essais" "$SORTIE"
cp "$ICI/doublures/"* "$BANC/shims/"; cp "$ICI/rendu.tsx" "$BANC/essais/"
ln -s "$APP/node_modules" "$BANC/node_modules"
printf '{ "name": "banc-rn", "private": true, "type": "module" }\n' > "$BANC/package.json"
cat > "$BANC/tsconfig.json" <<JSON
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx", "strict": false, "esModuleInterop": true, "skipLibCheck": true, "baseUrl": ".",
  "paths": {
    "react-native": ["./shims/rn.ts"],
    "react-native-svg": ["./shims/svg.tsx"],
    "react-native-reanimated": ["./shims/reanimated.tsx"],
    "react-native-gesture-handler/ReanimatedSwipeable": ["./shims/swipeable.tsx"],
    "@/*": ["$APP/src/*"]
  } } }
JSON
cd "$BANC" && SORTIE="$SORTIE" npx tsx essais/rendu.tsx
echo "vues-app.json écrit dans $SORTIE"
