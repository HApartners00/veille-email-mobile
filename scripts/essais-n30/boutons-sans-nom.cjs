/**
 * n°30 — Repère les boutons que VoiceOver ne sait pas nommer.
 *
 * Un <Pressable> est lu par VoiceOver avec le TEXTE qu'il contient. S'il ne
 * contient qu'une icône (dessin SVG, image, rond de couleur), VoiceOver ne dit
 * rien d'utile : il faut un `accessibilityLabel`.
 *
 * Usage : node boutons-sans-nom.cjs <dossier src> [--json]
 * Sortie : la liste des boutons sans nom (fichier:ligne), puis un total.
 * Code de sortie : 0 toujours (c'est un relevé, pas un juge) ; l'essai qui
 * juge est essai-n30.test.cjs.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Les interrupteurs (Switch) aussi : VoiceOver dit « interrupteur, activé » sans dire lequel.
const TOUCHABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Switch']);

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx$/.test(e.name) && !/\.web\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function nomBalise(n) {
  const t = ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName;
  return t.getText();
}
function attributs(n) {
  return ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;
}
function attr(n, nom) {
  for (const a of attributs(n).properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === nom) return a;
  }
  return null;
}
function aUnSpread(n) {
  return attributs(n).properties.some((a) => ts.isJsxSpreadAttribute(a));
}

/** Le sous-arbre contient-il quelque chose que VoiceOver lira comme du texte ? */
function contientTexte(node) {
  let trouve = false;
  function visite(n) {
    if (trouve) return;
    if (ts.isJsxText(n)) {
      if (n.getText().trim()) trouve = true;
      return;
    }
    if (ts.isJsxExpression(n) && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      // {t('...')} , {'texte'} , {`...`} , {variable} directement entre balises
      // (pas les props : on est enfant d'un élément).
      const e = n.expression;
      if (e && !ts.isJsxElement(e) && !ts.isJsxSelfClosingElement(e) && !ts.isJsxFragment(e)) {
        // Une expression enfant directe d'une balise <Text> ou de type texte.
        const parentNom = ts.isJsxElement(n.parent) ? nomBalise(n.parent) : '';
        if (/Text$/.test(parentNom) || /^Text/.test(parentNom)) {
          trouve = true;
          return;
        }
      }
    }
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n))) {
      const nom = nomBalise(n);
      // Un composant qui porte son propre nom pour VoiceOver.
      if (attr(n, 'accessibilityLabel') || attr(n, 'aria-label')) {
        trouve = true;
        return;
      }
      if (/(^|\.)Text$|ThemedText|TextInput/.test(nom) && ts.isJsxElement(n)) {
        // <Text> non vide
        if (n.children.some((c) => !(ts.isJsxText(c) && !c.getText().trim()))) {
          trouve = true;
          return;
        }
      }
    }
    ts.forEachChild(n, visite);
  }
  if (ts.isJsxElement(node)) node.children.forEach(visite);
  return trouve;
}

/** Ce que contient le bouton, pour aider à lui trouver un nom. */
function resume(node, src) {
  if (!ts.isJsxElement(node)) return '(vide)';
  const noms = [];
  function visite(n) {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) noms.push(nomBalise(n));
    ts.forEachChild(n, visite);
  }
  node.children.forEach(visite);
  return noms.length ? [...new Set(noms)].join(' ') : '(vide)';
}

function analyser(dirSrc) {
  const resultat = [];
  for (const f of fichiers(dirSrc)) {
    const texte = fs.readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(f, texte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visite(n) {
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && TOUCHABLES.has(nomBalise(n))) {
        const ligne = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const label = attr(n, 'accessibilityLabel') || attr(n, 'aria-label');
        const cache = (() => {
          const a = attr(n, 'accessible');
          return !!(a && a.initializer && a.initializer.getText().includes('false'));
        })();
        const role = attr(n, 'accessibilityRole') || attr(n, 'role');
        resultat.push({
          balise: nomBalise(n),
          fichier: path.relative(dirSrc, f).replace(/\\/g, '/'),
          ligne,
          label: label ? label.initializer?.getText() ?? '' : null,
          role: role ? role.initializer?.getText() ?? '' : null,
          cache,
          spread: aUnSpread(n),
          texte: contientTexte(n),
          contenu: resume(n, sf),
          onPress: (attr(n, 'onPress')?.initializer?.getText() ?? '').replace(/\s+/g, ' ').slice(0, 90),
        });
      }
      ts.forEachChild(n, visite);
    }
    visite(sf);
  }
  return resultat;
}

module.exports = { analyser };

if (require.main === module) {
  const dir = process.argv[2];
  const tous = analyser(dir);
  const sansNom = tous.filter((b) => !b.label && !b.texte && !b.cache);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: tous.length, sansNom }, null, 1));
  } else {
    for (const b of sansNom) console.log(`${b.fichier}:${b.ligne}  [${b.contenu}]  onPress=${b.onPress}`);
    console.log(`\n${tous.length} boutons et interrupteurs, ${sansNom.length} sans nom pour VoiceOver.`);
  }
}
