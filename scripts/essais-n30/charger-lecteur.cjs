/**
 * n°30 — Charge le VRAI composant `src/components/mail-html.tsx` d'un dossier
 * (avant ou après) hors de l'iPhone, pour l'essayer dans Chromium.
 *
 * On ne recopie rien à la main : le fichier .tsx est transpilé tel quel, et ce
 * qu'il importe de React Native est remplacé par de petites doublures :
 *   - `WebView` devient un objet qu'on inspecte (on lit ses props) ;
 *   - `Linking.openURL` note l'adresse qu'il aurait ouverte dans Safari ;
 *   - `Platform.OS` vaut 'ios' (l'app n'est publiée que sur iPhone).
 *
 * Usage : const { rendre } = require('./charger-lecteur.cjs');
 *         const { props, ouverts } = rendre('<dossier src>', '<html du mail>');
 *         props.source.html            → la page exacte donnée à la WebView
 *         props.injectedJavaScript      → le script de mesure
 *         props.onShouldStartLoadWithRequest({url, navigationType}) → true/false
 *         ouverts                       → adresses envoyées à Safari / Mail
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function rendre(dirSrc, html, opts = {}) {
  const fichier = path.join(dirSrc, 'components', 'mail-html.tsx');
  const code = fs.readFileSync(fichier, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: fichier,
  }).outputText;

  const ouverts = [];
  const doublures = {
    react: {
      useMemo: (f) => f(),
      useState: (v) => [v, () => {}],
      useCallback: (f) => f,
      useRef: (v) => ({ current: v }),
    },
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: 'Fragment',
    },
    'react-native': {
      Linking: { openURL: (u) => { ouverts.push(u); return Promise.resolve(); } },
      Platform: { OS: opts.os || 'ios', select: (o) => o[opts.os || 'ios'] ?? o.default },
    },
    'react-native-webview': { WebView: 'WebView' },
    '@/lib/theme': {
      colors: { terracotta: '#c2551a', surface: '#f4ede0' },
      radius: { md: 12 },
    },
  };

  const m = new Module(fichier);
  m.filename = fichier;
  m.paths = [];
  m.require = (nom) => {
    if (nom in doublures) return doublures[nom];
    if (nom.startsWith('@/lib/')) {
      // Un module pur de l'app (ex. `@/lib/page-mail`) : transpilé de la même façon.
      return chargerPur(path.join(dirSrc, nom.slice(2)), dirSrc, doublures);
    }
    throw new Error('Import non prévu par la doublure : ' + nom);
  };
  m._compile(js, fichier);
  const MailHtml = m.exports.default;
  const el = MailHtml({ html, ...(opts.fond ? { fond: opts.fond } : {}) });
  return { el, props: el.props, ouverts, module: m.exports };
}

function chargerPur(base, dirSrc, doublures) {
  const f = ['.ts', '.tsx'].map((e) => base + e).find((p) => fs.existsSync(p));
  if (!f) throw new Error('Module introuvable : ' + base);
  const js = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: f,
  }).outputText;
  const m = new Module(f);
  m.filename = f;
  m.require = (nom) => {
    if (nom in doublures) return doublures[nom];
    if (nom.startsWith('@/lib/')) return chargerPur(path.join(dirSrc, nom.slice(2)), dirSrc, doublures);
    throw new Error('Import non prévu : ' + nom);
  };
  m._compile(js, f);
  return m.exports;
}

module.exports = { rendre };
