import { useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors, radius } from '@/lib/theme';

/**
 * Le corps d'un mail HTML, rendu POUR DE VRAI — jumeau mobile de
 * `apps/web/src/components/email-body.tsx`.
 *
 * POURQUOI CE COMPOSANT EXISTE — constat de HA le 11/08/2026 :
 * « c'est correct en soi, mais toujours pas le mail original ».
 * Il avait raison. Le web rend le HTML dans une iframe ; le mobile le
 * convertissait en texte, faute de moteur de rendu. Le résultat était propre
 * mais ce n'était plus le mail : logo éclaté en « V mail », mise en page perdue,
 * boutons devenus des lignes de texte. La règle d'alignement du 07/08 dit que
 * les deux apps doivent se comporter pareil sur tout ce qui n'est pas le design.
 *
 * ⚠️ CE QUE CE COMPOSANT NE FAIT PAS AUSSI BIEN QUE LE WEB.
 * Le web bloque les scripts DEUX fois : la sandbox de l'iframe (sans
 * `allow-scripts`) puis le nettoyage du HTML. Il n'existe pas d'équivalent de
 * cette sandbox dans une WebView : le nettoyage ci-dessous est la seule couche.
 * Il retire <script>, <iframe>, <object>, <embed>, <form>, les attributs `on*=`
 * et les URL `javascript:` — la même liste que le web, moins la ceinture.
 *
 * ⚠️ Afficher le vrai mail charge ses images distantes, donc ses pixels de
 * traçage se déclenchent à l'ouverture. C'était déjà vrai sur le web ; ça le
 * devient sur mobile. Dit à HA avant de le faire.
 */

/** Jumelle de `sanitizeHtml()` du web, à la ligne près. */
function assainir(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, '$1=$2#');
}

/**
 * Une WebView ne se dimensionne pas toute seule : sans hauteur explicite elle
 * occupe 0 px. Ce script renvoie la hauteur réelle du document.
 *
 * Il la renvoie PLUSIEURS fois, et ce n'est pas de la superstition : la première
 * mesure tombe avant que les images distantes ne soient arrivées, et un mail
 * marketing grandit de plusieurs centaines de pixels quand elles se posent.
 * `ResizeObserver` couvre le cas général, les deux `setTimeout` couvrent les
 * moteurs où il manque, et `load` couvre les images.
 */
/**
 * Deux choses à la fois : AJUSTER LA LARGEUR, puis rendre la hauteur.
 *
 * ⚠️ LA LARGEUR — constat de HA le 11/08/2026 : « quand j'ouvre un mail comme le
 * code de connexion Vmail, le corps est trop large donc ça le coupe sur la
 * droite ». Un email est bâti pour 600 px ; l'écran en fait ~390. Les règles CSS
 * `max-width:100%` ne suffisent pas : une largeur fixe posée en attribut HTML
 * (`<table width="600">`), ou un `min-width`, passe outre. Et comme le
 * défilement interne est désactivé — c'est la page qui défile — ce qui dépasse
 * est simplement coupé.
 *
 * On fait donc ce que font les clients mail : on RÉDUIT la page à l'échelle,
 * plutôt que de casser sa mise en page. `VW` est mesurée AVANT tout réglage,
 * parce que fixer `width=` dans le viewport change `window.innerWidth` — la
 * relire ensuite donnerait une échelle de 1 et le mail resterait coupé.
 *
 * ⚠️ LA HAUTEUR est renvoyée MULTIPLIÉE par l'échelle : à 65 %, un document de
 * 2 000 px n'occupe plus que 1 300 px à l'écran. Sans ça, on réserverait la
 * hauteur d'avant la réduction et on verrait un grand vide sous le mail.
 *
 * Plusieurs envois : la première mesure tombe avant l'arrivée des images
 * distantes, qui changent la largeur ET la hauteur.
 */
const MESURE = `
(function () {
  var VW = window.innerWidth;
  var meta = document.querySelector('meta[name=viewport]');
  var echelle = 1;

  function ajuster() {
    var l = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    if (!l || l <= VW + 1) return 1;
    var s = VW / l;
    if (meta) {
      meta.setAttribute(
        'content',
        'width=' + l + ', initial-scale=' + s + ', maximum-scale=' + s + ', user-scalable=no'
      );
    }
    return s;
  }

  // ⚠️ ON NE MONTRE PAS LA PAGE DES QU'ELLE EST A L'ECHELLE.
  // HA, 11/08 : "y a encore un flash au niveau du corps du mail, comme si la
  // photo apparaissait une demi-seconde apres". C'est exactement ca : le texte
  // se pose, puis l'image distante arrive et pousse tout. On attend donc
  // "load" (images comprises), avec un plafond a 1,2 s pour qu'une image lente
  // ou morte ne retienne pas le mail en otage. Cout assume : le mail apparait
  // ~0,3 a 0,8 s plus tard, mais d'un seul bloc, sans rien qui saute.
  var montre = false;
  function revele() {
    if (montre) return;
    montre = true;
    if (document.body) document.body.style.opacity = '1';
  }

  function envoyer() {
    echelle = ajuster();
    var b = document.body, d = document.documentElement;
    var h = Math.max(b.scrollHeight, b.offsetHeight, d.scrollHeight, d.offsetHeight);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(String(Math.ceil(h * echelle)));
    }
  }

  envoyer();
  window.addEventListener('load', function () {
    envoyer();
    revele();
  });
  setTimeout(revele, 1200);
  if (window.ResizeObserver) { try { new ResizeObserver(envoyer).observe(document.body); } catch (e) {} }
  setTimeout(envoyer, 300);
  setTimeout(envoyer, 1200);
  true;
})();
`;

export default function MailHtml({ html }: { html: string }) {
  // 160 px et non 1 : a 1 px le bloc s'effondrait completement avant de sauter
  // a sa vraie hauteur. Une reserve modeste rend l'arrivee du mail continue.
  const [hauteur, setHauteur] = useState(160);

  const page = useMemo(
    () => `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  /* ⚠️ LE MAIL RESTE SUR FOND CLAIR, MEME EN THEME SOMBRE.
     Un email est un document concu pour du blanc : son texte, ses tableaux et
     ses images supposent un fond clair. Le poser sur du charbon rendrait
     illisible la moitie des mails du monde. Tous les clients mail font pareil :
     l'interface passe en sombre, le message reste une feuille claire. Ces deux
     couleurs sont donc VOLONTAIREMENT ecrites en dur et ne suivent pas le
     theme — c'est le seul endroit de l'app dans ce cas. */
  html, body { margin:0; padding:0; background:#faf7f0; -webkit-text-size-adjust:100%; }
  /* Le texte du mail ne colle pas aux bords de la feuille — signale par HA
     le 18/08/2026 : « le mail et son encadre, c'est pas joli, ca colle les
     bords ». La marge est posee sur le body et non sur un conteneur React :
     c'est la feuille elle-meme qui doit respirer, y compris pour les mails
     en tableaux qui ignorent tout ce qui les entoure. */
  body { padding:12px 14px; }
  /* ⚠️ LA PAGE RESTE INVISIBLE JUSQU'A SA MISE A L'ECHELLE.
     Sans ça, le mail s'affiche une fraction de seconde à sa largeur d'origine
     (600 px sur un écran de 390) puis se réduit d'un coup : c'est le "flash"
     signalé par HA le 11/08. On ne montre rien tant que ce n'est pas juste.
     Le repli par animation est une SÉCURITÉ : si le script injecté ne
     s'exécutait pas, la page apparaîtrait quand même au bout d'1,2 s, au lieu
     de rester blanche pour toujours. */
  body { opacity:0; transition: opacity .18s ease-out; animation: vmail-montrer 0s 2s forwards; }
  @keyframes vmail-montrer { to { opacity:1; } }
  body { font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         font-size:15px; line-height:1.6; color:#2a2a25;
         word-break:break-word; overflow-wrap:anywhere; }
  /* On ne force PLUS \`max-width:100%\` sur tout : ça écrasait la mise en page
     des mails en tables sans regler le debordement (une largeur posee en
     attribut HTML passe outre). C'est la reduction a l'echelle, cote script,
     qui fait tenir le mail dans l'ecran. On garde seulement les images, dont le
     debordement est le plus frequent et le moins structurant. */
  img { max-width:100% !important; height:auto !important; }
  a { color:${colors.terracotta}; }
</style></head><body>${assainir(html)}</body></html>`,
    [html],
  );

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: page }}
      injectedJavaScript={MESURE}
      onMessage={(e) => {
        const n = Number(e.nativeEvent.data);
        // On ne garde que la plus grande hauteur vue — même raison que l'encadré
        // qui l'entoure : sinon l'arrivée des images fait osciller la mise en page.
        if (Number.isFinite(n) && n > 0) setHauteur((h) => Math.max(h, Math.ceil(n)));
      }}
      /* Pas de défilement interne : c'est la page qui défile. Deux zones de
         défilement se disputeraient le doigt — c'est exactement ce dont HA n'a
         pas voulu au moment de l'encadré. */
      scrollEnabled={false}
      nestedScrollEnabled={false}
      setSupportMultipleWindows={false}
      /* Un lien tapé ne remplace PAS le corps du mail par le site : il s'ouvre
         dans le navigateur, comme `<base target="_blank">` côté web. */
      onShouldStartLoadWithRequest={(req) => {
        if (!/^https?:/i.test(req.url)) return true; // le document lui-même
        Linking.openURL(req.url).catch(() => {});
        return false;
      }}
      /* ⚠️ SUR iOS, UNE WEBVIEW PEINT DU BLANC AVANT SA PREMIERE IMAGE, quelle
         que soit la couleur de fond du document. Le fond de l'app etant creme,
         chaque ouverture donnait creme -> blanc -> mail : c'est le "flash"
         signale par HA le 11/08, et c'est pour ca que retarder l'affichage n'y
         changeait rien. `opaque={false}` + fond transparent laissent le creme du
         parent traverser tant que la page n'a pas peint. */
      opaque={false}
      style={{
        width: '100%',
        height: hauteur,
        backgroundColor: 'transparent',
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    />
  );
}
