/**
 * n°30 — L'essai qui juge (lecteur de mails + VoiceOver).
 *
 * Usage (depuis la racine du dépôt veille-email-mobile) :
 *   node scripts/essais-n30/essai-n30.test.cjs
 *
 * Partie A, sans navigateur (il suffit de `typescript`, déjà dans le dépôt) :
 *   A1  aucun bouton ni interrupteur sans nom pour VoiceOver dans src/
 *   A2  les 3 nouveaux textes existent dans les 8 langues
 *   A3  aiguiller() : rien ne sort sans un doigt
 *   A4  assainir() : <meta>, <base>, formulaires et embed ouverts retirés,
 *       un mail normal intact
 *   A5  la CSP est la toute première balise de la page
 * Partie B, dans Chromium (Playwright) — SAUTÉE, et dit, si Playwright manque :
 *   B1  8 mails piégés : aucun script, aucune ouverture de Safari
 *   B2  un mail normal s'affiche comme avant (hauteur, échelle, images, lien)
 *   B3  la CSP seule (sans le nettoyage) bloque encore script, formulaire, <base>
 *   B4  le garde seul : une redirection non nettoyée part, aiguiller() ne l'ouvre pas
 *
 * Sortie : une ligne par essai, puis « N/N réussis ». Code de sortie 1 si un
 * essai échoue.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
const SRC = path.join(RACINE, 'src');
const { analyser } = require('./boutons-sans-nom.cjs');
const { rendre } = require('./charger-lecteur.cjs');

let ok = 0;
let total = 0;
function essai(nom, condition, detail) {
  total++;
  if (condition) ok++;
  console.log(`${condition ? '✅' : '❌'} ${nom}${!condition && detail ? '  → ' + detail : ''}`);
}

// ─── A1 ──────────────────────────────────────────────────────────────────────
const boutons = analyser(SRC);
const sansNom = boutons.filter((b) => !b.label && !b.texte && !b.cache);
const interrupteurs = boutons.filter((b) => b.balise === 'Switch').length;
essai(`A1 ${boutons.length - interrupteurs} boutons et ${interrupteurs} interrupteurs, aucun sans nom pour VoiceOver`,
  sansNom.length === 0 && interrupteurs >= 4,
  sansNom.map((b) => `${b.balise} ${b.fichier}:${b.ligne}`).join(', ') || `${interrupteurs} interrupteurs seulement`);

// ─── A2 ──────────────────────────────────────────────────────────────────────
{
  const ts = require('typescript');
  const f = path.join(SRC, 'lib', 'i18n', 'messages.ts');
  const js = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, require);
  const { messages } = m.exports;
  const langues = ['fr', 'en', 'es', 'de', 'pt', 'it', 'ar', 'ru'];
  for (const cle of ['common.back', 'common.removeAttachment', 'email.talkToAssistant']) {
    const [a, b] = cle.split('.');
    const valeurs = langues.map((l) => (messages[l] && messages[l][a] ? messages[l][a][b] : undefined));
    const manque = langues.filter((l, i) => typeof valeurs[i] !== 'string' || !valeurs[i].trim());
    const distinctes = new Set(valeurs).size;
    essai(`A2 ${cle} dans les 8 langues (${distinctes} formulations)`, manque.length === 0 && distinctes >= 7,
      manque.length ? 'manque : ' + manque.join(',') : 'trop de langues identiques');
  }
  const sansNomFichier = langues.filter((l) => !String(messages[l].common.removeAttachment).includes('{name}'));
  essai('A2 removeAttachment nomme le fichier ({name}) dans les 8 langues', sansNomFichier.length === 0, sansNomFichier.join(','));
}

// ─── A3, A4, A5 ──────────────────────────────────────────────────────────────
const { props, module: lecteur } = rendre(SRC, '<p>Bonjour</p><!--CORPS-->');
const { aiguiller, assainir, CSP } = lecteur;
essai('A3 mail-html.tsx exporte aiguiller(), assainir() et CSP',
  typeof aiguiller === 'function' && typeof assainir === 'function' && typeof CSP === 'string');
if (typeof aiguiller === 'function') {
  const cas = [
    [{ url: 'about:blank', navigationType: 'other' }, 'ios', true, null, 'la feuille elle-même'],
    [{ url: 'about:blank#haut', navigationType: 'click' }, 'ios', true, null, 'ancre interne'],
    [{ url: 'https://hameconnage.test/', navigationType: 'other' }, 'ios', false, null, 'redirection automatique'],
    [{ url: 'https://hameconnage.test/?mdp=x', navigationType: 'formsubmit' }, 'ios', false, null, 'formulaire envoyé'],
    [{ url: 'https://hameconnage.test/', navigationType: 'reload' }, 'ios', false, null, 'rechargement'],
    [{ url: 'https://hameconnage.test/', navigationType: 'backforward' }, 'ios', false, null, 'retour arrière'],
    [{ url: 'https://www.exemple.fr/article', navigationType: 'click' }, 'ios', false, 'https://www.exemple.fr/article', 'lien tapé → Safari'],
    [{ url: 'http://www.exemple.fr/', navigationType: 'click' }, 'ios', false, 'http://www.exemple.fr/', 'lien http tapé → Safari'],
    [{ url: 'mailto:a@b.fr', navigationType: 'click' }, 'ios', false, 'mailto:a@b.fr', 'mailto tapé → app Mail'],
    [{ url: 'tel:+33600000000', navigationType: 'click' }, 'ios', false, 'tel:+33600000000', 'tel tapé → Téléphone'],
    [{ url: 'mailto:a@b.fr', navigationType: 'other' }, 'ios', false, null, 'mailto sans doigt (2e étape d’un target=_blank) : rien'],
    [{ url: 'data:text/html,<h1>x</h1>', navigationType: 'click' }, 'ios', false, null, 'data: tapé : bloqué'],
    [{ url: 'itms-services://?action=download', navigationType: 'click' }, 'ios', false, null, 'schéma d’une autre app : bloqué'],
    [{ url: 'https://www.exemple.fr/', navigationType: undefined }, 'android', false, 'https://www.exemple.fr/', 'Android : pas de navigationType'],
  ];
  for (const [req, os, rester, ouvrir, nom] of cas) {
    const r = aiguiller(req, os);
    essai(`A3 aiguiller — ${nom}`, r.resterIci === rester && r.ouvrir === ouvrir, JSON.stringify(r));
  }
}
if (typeof assainir === 'function' && typeof CSP === 'string') {
  const retire = (html, motif) => !motif.test(assainir(html));
  essai('A4 <meta http-equiv=refresh> retiré', retire('<meta http-equiv="refresh" content="0;url=https://x.test">', /<meta/i));
  essai('A4 <base href> retiré', retire('<BASE href="https://x.test/">', /<base/i));
  essai('A4 <form> laissé ouvert retiré', retire('<form action="https://x.test"><input name=a><button>OK</button>', /<form/i));
  essai('A4 <embed> (sans fermeture) retiré', retire('<embed src="https://x.test/a.svg">', /<embed/i));
  essai('A4 <object> laissé ouvert retiré', retire('<object data="https://x.test/a">', /<object/i));
  // Relecture du 31/10 : retirer un morceau recollait ce qui l'entoure.
  const recolles = [
    ['<me<form>ta http-equiv="refresh" content="0;url=https://x.test">', /<meta/i, 'meta recollée'],
    ['<scr<form>ipt>console.log(1)</scr<form>ipt>', /<script/i, 'script recollé'],
    ['<ba<embed>se href="https://x.test/">', /<base/i, 'base recollée'],
    ['<img src=x o<form>nerror="console.log(1)">', /\son\w+\s*=/i, 'onerror recollé'],
    ['<a href="java<form>script:alert(1)">x</a>', /javascript:/i, 'javascript: recollé'],
    ['<me<me<form>ta>ta http-equiv="refresh" content="0;url=https://x.test">', /<meta/i, 'meta recollée deux fois'],
    ['<meta content="a>b" http-equiv="refresh">', /<meta|http-equiv/i, '> caché dans un attribut'],
    ['<meta http-equiv="refresh" content="0;url=https://x.test>suite du mail', /<meta/i, 'guillemet jamais fermé'],
  ];
  for (const [html, motif, nom] of recolles) {
    const sortie = assainir(html);
    essai(`A4 ${nom} : neutralisé`, !motif.test(sortie), sortie);
  }
  const normal = '<table width="600"><tr><td><style>.a{color:red}</style><img src="https://i.test/a.png" width="600"><p class="a">Bonjour <a href="https://w.test/x">lien</a></p></td></tr></table>';
  essai('A4 un mail normal passe intact', assainir(normal) === normal, assainir(normal));
  const page = props.source.html;
  const tete = page.slice(page.indexOf('<head>') + 6).trimStart();
  essai('A5 la CSP est la première balise de la page', tete.startsWith('<meta http-equiv="Content-Security-Policy" content="' + CSP + '">'), tete.slice(0, 80));
  for (const d of ["script-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'"]) {
    essai(`A5 CSP contient ${d}`, CSP.includes(d));
  }
  essai('A5 originWhitelist reste ["*"] (le garde décide seul)', JSON.stringify(props.originWhitelist) === '["*"]');
}

// ─── B ───────────────────────────────────────────────────────────────────────
async function partieB() {
  let essayer;
  try {
    ({ essayer } = require('./essai-lecteur.cjs'));
  } catch (e) {
    console.log('⚠️  Partie B SAUTÉE : Playwright introuvable (' + String(e.message).split('\n')[0] + ').');
    return;
  }
  const res = await essayer(SRC);
  for (const r of res) {
    const safari = r.decisionsApp.flatMap((d) => d.ouvertDansSafari);
    if (/^mail normal/.test(r.nom)) {
      const h = r.hauteurs.length ? Math.max(...r.hauteurs) : 0;
      essai('B2 mail normal : hauteur envoyée à l’app (> 400 px)', h > 400, String(h));
      essai('B2 mail normal : page rendue visible', r.etat && r.etat.opacite === '1', JSON.stringify(r.etat));
      essai('B2 mail normal : mis à l’échelle de l’écran', r.etat && /initial-scale=0\.6/.test(r.etat.echelle), r.etat && r.etat.echelle);
      essai('B2 mail normal : images https et http chargées', r.imagesChargees.length === 2, r.imagesChargees.join(' '));
      essai('B2 mail normal : style du mail appliqué', r.etat && r.etat.couleurTitre === 'rgb(18, 52, 86)', r.etat && r.etat.couleurTitre);
      essai('B2 mail normal : le lien tapé s’ouvre dans Safari', safari.length === 1 && /exemple\.test\/article/.test(safari[0]), safari.join(' '));
      essai('B2 mail normal : aucune violation CSP', r.violationsCSP === 0, String(r.violationsCSP));
    } else {
      essai(`B1 ${r.nom} : aucun script`, r.scriptsDuMail.length === 0, r.scriptsDuMail.join(','));
      essai(`B1 ${r.nom} : Safari ne s’ouvre pas`, safari.length === 0, safari.join(' '));
      essai(`B1 ${r.nom} : le script de l’app (injecté hors page) renvoie la hauteur`, r.hauteurs.length > 0 && !r.erreurMesure, r.erreurMesure || 'aucune hauteur');
    }
  }
  await partieB3();
}

/** B3 : la CSP SEULE, sans le nettoyage — le jour où une regex rate, la CSP tient. */
async function partieB3() {
  const { chromium } = require('playwright');
  const brut = [
    '<script>console.log("PIRATE-B3a")</script>',
    '<img src="x" onerror="console.log(\'PIRATE-B3b\')">',
    '<form action="https://hameconnage.exemple.test/vol"><input name="mdp" value="x"><button id="ok">OK</button></form>',
    '<base href="https://hameconnage.exemple.test/"><a id="rel" href="connexion">lien</a>',
  ].join('');
  // La page exacte de l'app, mais le corps NON nettoyé glissé à la place du repère.
  const page = props.source.html.replace('<!--CORPS-->', brut);
  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 390, height: 160 } });
  const pirates = [];
  const sorties = [];
  p.on('console', (m) => { if (/PIRATE-B3/.test(m.text())) pirates.push(m.text()); });
  await p.route('**/*', (route) => {
    if (route.request().isNavigationRequest() && route.request().frame() === p.mainFrame()) sorties.push(route.request().url());
    return route.abort('aborted');
  });
  await p.setContent(page, { waitUntil: 'domcontentloaded' });
  await p.click('#ok', { noWaitAfter: true }).catch(() => {});
  const lien = await p.evaluate(() => document.getElementById('rel').href);
  await p.waitForTimeout(800);
  await nav.close();
  essai('B3 CSP seule : aucun script, même non nettoyé', pirates.length === 0, pirates.join(','));
  essai('B3 CSP seule : le formulaire ne part pas', sorties.length === 0, sorties.join(' '));
  essai('B3 CSP seule : <base> ignorée (lien relatif resté local)', !/hameconnage/.test(lien), lien);

  // B4 — Le garde SEUL : une redirection automatique NON nettoyée part bien
  // (la CSP ne sait pas l'arrêter : mesuré ici), et aiguiller() refuse de
  // l'ouvrir. Le type « other » n'est pas observé : c'est celui que WebKit donne
  // à une redirection (WKNavigationTypeOther), lu dans react-native-webview.
  const nav2 = await chromium.launch();
  const p2 = await nav2.newPage({ viewport: { width: 390, height: 160 } });
  const sorties2 = [];
  await p2.route('**/*', (route) => {
    if (route.request().isNavigationRequest() && route.request().frame() === p2.mainFrame()) sorties2.push(route.request().url());
    return route.abort('aborted');
  });
  await p2.setContent(props.source.html.replace('<!--CORPS-->', '<meta http-equiv="refresh" content="0;url=https://hameconnage.exemple.test/connexion">'), { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1200);
  await nav2.close();
  essai('B4 sans nettoyage, la redirection part (la CSP ne l’arrête pas)', sorties2.length === 1, sorties2.join(' ') || 'aucune');
  const d = aiguiller({ url: sorties2[0] || 'https://hameconnage.exemple.test/connexion', navigationType: 'other' }, 'ios');
  essai('B4 … et aiguiller() ne l’ouvre pas', d.resterIci === false && d.ouvrir === null, JSON.stringify(d));
}

partieB()
  .catch((e) => essai('Partie B exécutée sans erreur', false, String(e && e.stack || e).slice(0, 300)))
  .finally(() => {
    console.log(`\n${ok}/${total} réussis`);
    process.exit(ok === total ? 0 : 1);
  });
