// Essais de l'écran Emails de l'app (09/10/2026) : le VRAI src/app/(tabs)/index.tsx, la VRAIE
// ligne (email-row), le VRAI bandeau, le VRAI lib/actions-groupees.ts, montés dans un faux
// navigateur avec react-native-web. Faux : la base, /api (réponses données à la main, pour
// choisir QUAND la messagerie répond), le geste lui-même (on appelle onSwipeableOpen).
const { JSDOM } = await import(process.env.JSDOM_CHEMIN || 'jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://app.veille-email.fr/', pretendToBeVisual: true });
const g = globalThis as any;
g.window = dom.window; g.document = dom.window.document; g.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.requestAnimationFrame = dom.window.requestAnimationFrame; g.cancelAnimationFrame = dom.window.cancelAnimationFrame;
g.getComputedStyle = dom.window.getComputedStyle; for (const k of ["ShadowRoot", "Node", "Element", "Text", "MutationObserver", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "FocusEvent", "PointerEvent"]) if ((dom.window as any)[k] && !g[k]) g[k] = (dom.window as any)[k]; g.__DEV__ = false; g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react'); const { act } = React; g.React = React;
const { createRoot } = await import('react-dom/client');
const Feed = (await import('@/app/(tabs)/index')).default;
const { etat } = await import('../doublures/supabase');
const { attentes } = await import('../doublures/api');
const { textesSelection } = await import('@/lib/i18n/selection-mails');
const { getDictionary } = await import('@/lib/i18n');
const ts = textesSelection('fr'); const t = getDictionary('fr');

let n = 0, ko = 0;
const verif = (nom: string, c: boolean, d: unknown = '') => { n++; if (!c) ko++; console.log((c ? 'OK ' : 'KO ') + nom + (c ? '' : '  → ' + JSON.stringify(d))); };
const erreurs: string[] = []; const vraiError = console.error;
console.error = (...a: any[]) => { erreurs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
console.warn = () => {};

const BASE = ['box:moi@gmail.com'];
const SUJETS = ['Sujet A', 'Sujet B', 'Sujet C', 'Sujet D', 'Sujet E', 'Sujet F', 'Sujet G', 'Sujet H'];
etat.items = SUJETS.map((s, i) => ({ id: 'm' + i, title: s, author: `Exp ${i} <e${i}@ex.fr>`, preview: 'Aperçu', url: null, status: 'unread', tags: [...BASE], received_at: `2026-10-0${8 - (i % 8)}T1${i}:00:00Z` }));
const idDe = (s: string) => 'm' + SUJETS.indexOf(s);

const vider = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((ok) => setTimeout(ok, 0)); });
const racine = createRoot(dom.window.document.getElementById('r')!);
await act(async () => { racine.render(<Feed />); });
await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });

const ligne = (s: string) => dom.window.document.querySelector(`[aria-label="${s}"]`);
const bandeau = () => dom.window.document.querySelector('[aria-live="polite"]') as HTMLElement | null;
const texteBandeau = () => bandeau()?.textContent ?? '';
const glisser = (s: string, sens: 'droite' | 'gauche') => act(async () => { g.__glisser[s].onSwipeableOpen(sens === 'droite' ? 'right' : 'left'); });
/** Répond à la PREMIÈRE requête en attente pour ce mail ; met la base à jour comme le vrai serveur. */
async function repondre(s: string, status: number, json?: any) {
  const i = attentes.findIndex((a) => a.corps.itemId === idDe(s));
  if (i < 0) throw new Error('aucune requête en attente pour ' + s);
  const a = attentes.splice(i, 1)[0]!;
  let corps = json;
  if (status === 200 && !json) {
    const tags = a.corps.op === 'archive' ? [...BASE, 'archive'] : a.corps.op === 'trash' ? [...BASE, 'corbeille'] : [...BASE];
    etat.items.find((x) => x.id === a.corps.itemId)!.tags = tags; corps = { ok: true, tags };
  }
  await act(async () => { a.repondre(status, corps); }); await vider();
}
const cliquerAnnuler = async () => {
  const el = [...(bandeau()?.querySelectorAll('*') ?? [])].find((e) => e.textContent === t.mailActions.undo && e.children.length === 0) as HTMLElement | undefined;
  if (!el) throw new Error('pas de bouton Annuler'); await act(async () => { el.click(); }); await vider();
};
const enAttente = (s: string) => attentes.filter((a) => a.corps.itemId === idDe(s)).map((a) => a.corps.op);

verif('au départ : 8 mails dans la boîte, aucun bandeau', SUJETS.every((s) => !!ligne(s)) && !bandeau(), SUJETS.filter((s) => !ligne(s)));
verif('chaque ligne peut glisser (geste actif hors sélection)', SUJETS.every((s) => g.__glisser[s]?.enabled === true), SUJETS.map((s) => g.__glisser[s]?.enabled));

// 1. Glisser à droite : bandeau TOUT DE SUITE, avant la réponse de la messagerie
await glisser('Sujet A', 'droite');
verif('A glissé à droite : la ligne part tout de suite', !ligne('Sujet A'));
verif('A : « Archivé » + « Annuler » AVANT la réponse de la messagerie', texteBandeau().includes(ts.fait('archive', 1)) && texteBandeau().includes(t.mailActions.undo), texteBandeau());
verif('A : une seule requête « archive » envoyée', JSON.stringify(enAttente('Sujet A')) === '["archive"]', enAttente('Sujet A'));
await repondre('Sujet A', 200);
verif('A : la messagerie dit oui → la ligne reste partie, le bandeau ne bouge pas', !ligne('Sujet A') && texteBandeau().includes(ts.fait('archive', 1)) && texteBandeau().includes(t.mailActions.undo), texteBandeau());

// 2. Refus de la messagerie : la ligne revient, le bandeau le dit
await glisser('Sujet B', 'gauche');
verif('B glissé à gauche : « Mis à la corbeille » tout de suite', !ligne('Sujet B') && texteBandeau().includes(ts.fait('trash', 1)), texteBandeau());
await repondre('Sujet B', 502, { message: 'Gmail ne répond pas.' });
verif('B refusé : la ligne REVIENT', !!ligne('Sujet B'));
verif('B refusé : le bandeau devient une erreur avec la phrase de la messagerie, sans « Annuler »', texteBandeau().includes('Gmail ne répond pas.') && !texteBandeau().includes(t.mailActions.undo), texteBandeau());
verif('B refusé : la panne est écrite dans la console (pas de silence)', erreurs.some((e) => e.includes('[selection] action refusée')), erreurs);

// 3. « Annuler » AVANT la réponse : la ligne revient tout de suite, puis on défait
await glisser('Sujet C', 'droite');
verif('C parti', !ligne('Sujet C'));
await cliquerAnnuler();
verif('C : « Annuler » touché avant la réponse → la ligne revient TOUT DE SUITE', !!ligne('Sujet C'));
verif('C : rien n\'est défait tant que l\'archivage n\'a pas répondu', JSON.stringify(enAttente('Sujet C')) === '["archive"]', enAttente('Sujet C'));
await repondre('Sujet C', 200);
verif('C : l\'archivage répond oui → la ligne NE disparaît PAS (pas de clignement)', !!ligne('Sujet C'));
verif('C : puis « remettre en boîte » est envoyé', JSON.stringify(enAttente('Sujet C')) === '["unarchive"]', enAttente('Sujet C'));
await repondre('Sujet C', 200);
verif('C : à la fin, la ligne est là, base remise comme avant', !!ligne('Sujet C') && JSON.stringify(etat.items.find((x) => x.id === idDe('Sujet C'))!.tags) === JSON.stringify(BASE));

// 4. « Annuler » APRÈS la réponse
await glisser('Sujet D', 'gauche'); await repondre('Sujet D', 200);
verif('D à la corbeille, réponse reçue, ligne partie', !ligne('Sujet D'));
await cliquerAnnuler();
verif('D : « Annuler » après la réponse → la ligne revient TOUT DE SUITE (avant le serveur)', !!ligne('Sujet D') && JSON.stringify(enAttente('Sujet D')) === '["untrash"]', enAttente('Sujet D'));
await repondre('Sujet D', 200);
verif('D : le serveur confirme, la ligne reste', !!ligne('Sujet D') && !bandeau());

// 5. « Annuler » avant la réponse, et l'action ÉCHOUE : rien à défaire, aucun message faux
await glisser('Sujet E', 'droite'); await cliquerAnnuler();
await repondre('Sujet E', 502, { message: 'Panne' });
verif('E : échec après « Annuler » → la ligne est là, aucune requête « défaire » envoyée', !!ligne('Sujet E') && enAttente('Sujet E').length === 0, enAttente('Sujet E'));

// 6. « Annuler » refusé par la messagerie : la liste est relue, le bandeau le dit
await glisser('Sujet F', 'droite'); await repondre('Sujet F', 200);
const lecturesAvant = etat.lectures;
await cliquerAnnuler();
verif('F : « Annuler » → ligne revenue pendant l\'attente', !!ligne('Sujet F'));
await repondre('Sujet F', 502, { message: 'Remise impossible.' });
verif('F : défaire refusé → la liste est relue et la ligne repart (le mail EST archivé)', etat.lectures > lecturesAvant && !ligne('Sujet F'), { lectures: etat.lectures - lecturesAvant });
verif('F : le bandeau dit le refus', texteBandeau().includes('Remise impossible.'), texteBandeau());

// 7. Entrer en sélection ne remonte pas les lignes, et coupe le geste
const montages = g.__montages;
await act(async () => { g.__glisser['Sujet G'].children.props.onLongPress(); }); await vider();
verif('appui long : la sélection s\'ouvre (barre en bas)', (dom.window.document.body.textContent || '').includes(ts.nombre(1)), ts.nombre(1));
verif('en sélection, le geste est coupé sur toutes les lignes', ['Sujet A', 'Sujet C', 'Sujet G', 'Sujet H'].filter((s) => ligne(s)).every((s) => g.__glisser[s].enabled === false));
verif('entrer en sélection NE remonte PAS les lignes', g.__montages === montages, { avant: montages, apres: g.__montages });

// 8. Plusieurs mails : inchangé (« En cours… » puis bandeau)
await act(async () => { g.__glisser['Sujet H'].children.props.onPress(); }); await vider();
const boutonArchiver = [...dom.window.document.querySelectorAll('[role="button"]')].find((b) => b.textContent === t.mailActions.archive) as HTMLElement;
await act(async () => { boutonArchiver.click(); }); await vider();
verif('lot de 2 : la barre montre « En cours… », pas de bandeau avant les réponses', (dom.window.document.body.textContent || '').includes(ts.enCours(0, 2)) && !bandeau(), dom.window.document.body.textContent?.slice(-120));
await repondre('Sujet G', 200); await repondre('Sujet H', 200);
verif('lot de 2 : à la fin, « 2 archivés » + Annuler, lignes parties', texteBandeau().includes(ts.fait('archive', 2)) && texteBandeau().includes(t.mailActions.undo) && !ligne('Sujet G') && !ligne('Sujet H'), texteBandeau());
verif('après le lot, le geste revient', ['Sujet A', 'Sujet C'].filter((s) => ligne(s)).every((s) => g.__glisser[s].enabled === true));

await act(async () => { racine.unmount(); });
console.error = vraiError;
console.log(`\n${n - ko} essais réussis sur ${n}`);
process.exit(ko ? 1 : 0);
