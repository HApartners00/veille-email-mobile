#!/usr/bin/env bash
# Essais de l'écran Emails (glisser, Annuler, sélection) — 09/10/2026.
#   usage : bash scripts/essais-ecran/lancer.sh <chemin de jsdom> <chemin de tsx>
#   ex.   : bash scripts/essais-ecran/lancer.sh ~/banc/node_modules/jsdom/lib/api.js ~/banc/node_modules/tsx
# Monte un banc à côté avec le VRAI src/app/(tabs)/index.tsx et ses vrais composants
# (react-native-web, déjà dans node_modules de l'app) ; seuls la base, /api, le routeur,
# le stockage et le geste lui-même sont des doublures (dossier doublures/).
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$ICI/../.." && pwd)"
JSDOM_CHEMIN="${1:?chemin de jsdom/lib/api.js}"; TSX="${2:?dossier du paquet tsx}"
BANC="$(mktemp -d)"; mkdir -p "$BANC/doublures" "$BANC/essais"
cp "$ICI/doublures/"* "$BANC/doublures/"; cp "$ICI/ecran-glisser.test.tsx" "$BANC/essais/"
ln -s "$APP/node_modules" "$BANC/node_modules"
printf '{ "name": "banc-ecran", "private": true, "type": "module" }\n' > "$BANC/package.json"
cat > "$BANC/tsconfig.json" <<JSON
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx", "strict": false, "esModuleInterop": true, "skipLibCheck": true, "baseUrl": ".",
  "paths": {
    "react-native": ["./doublures/rn.ts"],
    "react-native-svg": ["./doublures/svg.tsx"],
    "react-native-reanimated": ["./doublures/reanimated.tsx"],
    "react-native-gesture-handler/ReanimatedSwipeable": ["./doublures/swipeable.tsx"],
    "@react-native-async-storage/async-storage": ["./doublures/async-storage.ts"],
    "expo-router": ["./doublures/expo-router.ts"],
    "react-native-safe-area-context": ["./doublures/safe-area.ts"],
    "@/context/i18n": ["./doublures/i18n-contexte.ts"],
    "@/lib/supabase": ["./doublures/supabase.ts"],
    "@/lib/api": ["./doublures/api.ts"],
    "@/lib/premier-import": ["./doublures/premier-import.ts"],
    "@/lib/releve-imap": ["./doublures/releve-imap.ts"],
    "@/components/premier-import": ["./doublures/bloc-premier-import.tsx"],
    "@/*": ["$APP/src/*"]
  } } }
JSON
cd "$BANC" && JSDOM_CHEMIN="$JSDOM_CHEMIN" timeout -s KILL 100 node --import "file://$TSX/dist/loader.mjs" essais/ecran-glisser.test.tsx
