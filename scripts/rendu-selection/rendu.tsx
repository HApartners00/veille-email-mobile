import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
(globalThis as any).React = React;
import { AppRegistry, View, Text } from 'react-native';

const { EmailRow } = await import('@/components/email-row');
const { LigneGlissable } = await import('@/components/ligne-glissable');
const { BarreActions, BandeauResultat } = await import('@/components/selection-mails');
const { textesSelection } = await import('@/lib/i18n/selection-mails');
const { colors } = await import('@/lib/theme');

const ts = textesSelection('fr');
const libelleOp = (op: string) => ({ archive: 'Archiver', unarchive: 'Remettre en boîte', trash: 'Corbeille', untrash: 'Restaurer', unspam: 'Non indésirable' } as any)[op];
const MAILS = [
  { s: 'Devis chantier Durand — version 2', e: 'Karim Benali', i: 'KB', k: 'urgent', l: 'URGENT', c: '#c2410c', d: '09:42', p: 'Bonjour, voici le devis corrigé avec les trois postes demandés…', u: true },
  { s: 'Votre facture d’octobre est disponible', e: 'EDF', i: 'ED', k: 'info', l: 'INFO', c: '#6b6455', d: '08:15', p: 'Votre facture de 64,20 € est disponible dans votre espace client.', u: false },
  { s: 'Re: Réunion de jeudi', e: 'Sophie Martin', i: 'SM', k: 'human', l: 'À RÉPONDRE', c: '#28704d', d: 'hier', p: 'Parfait pour 14 h. Je réserve la salle et je vous envoie l’invitation.', u: true },
  { s: 'Confirmation de votre rendez-vous', e: 'Doctolib', i: 'DO', k: 'important', l: 'IMPORTANT', c: '#b8860b', d: 'hier', p: 'Votre rendez-vous du 14 octobre à 10:30 est confirmé.', u: false },
  { s: 'Nouveautés de la semaine', e: 'Newsletter Notion', i: 'NN', k: 'info', l: 'INFO', c: '#6b6455', d: 'lun.', p: 'Découvrez les nouvelles fonctionnalités de la semaine…', u: false },
];
const g = globalThis as any;
function liste(opts: { selection?: boolean[]; decalages?: number[] }) {
  g.__decalages = [...(opts.decalages || [])];
  return MAILS.map((m, i) => (
    <LigneGlissable key={i} actif={!opts.selection} droite={{ op: 'archive', libelle: 'Archiver' }} gauche={{ op: 'trash', libelle: 'Corbeille' }} onAction={() => {}}>
      <EmailRow layout="ligne" subject={m.s} sender={m.e} initials={m.i} prioKey={m.k} prioColor={m.c} prioLabel={m.l} date={m.d} preview={m.p} unread={m.u}
        modeSelection={!!opts.selection} selectionne={!!opts.selection?.[i]} onPress={() => {}} onLongPress={() => {}} />
    </LigneGlissable>
  ));
}
const Ecran = ({ children, titre }: any) => (
  <View style={{ width: 390, height: 640, backgroundColor: colors.fond, overflow: 'hidden', position: 'relative' }}>
    <View style={{ height: 40 }} />
    {titre ? <Text style={{ color: colors.onDark, fontSize: 26, fontWeight: '800', paddingHorizontal: 24, paddingBottom: 14, fontFamily: 'Inter_800ExtraBold' }}>{titre}</Text> : null}
    {children}
  </View>
);
// le Swipeable doublé lit `__decalages` dans l'ordre : on le remplit juste avant chaque rendu
function Decale({ d, children }: any) { return children; }
const scenes: Record<string, () => any> = {
  glisser: () => <Ecran titre="Boîte de réception">{liste({ decalages: [190, -190, 0, 0, 0] })}</Ecran>,
  selection: () => (
    <Ecran titre="Boîte de réception">
      {liste({ selection: [true, false, true, false, false] })}
      <BarreActions nombre={ts.nombre(2)} libelleTout={ts.tout} libelleFermer={ts.fermer} toutCoche={false} onFermer={() => {}} onTout={() => {}} ops={['archive', 'trash']} libelleOp={libelleOp as any} libelleLu={ts.lu} libelleNonLu={ts.nonLu} libelleCategorie={ts.categorie} enCours={null} onOp={() => {}} onLu={() => {}} onNonLu={() => {}} onCategorie={() => {}} />
    </Ecran>
  ),
  encours: () => (
    <Ecran titre="Boîte de réception">
      {liste({})}
      <BarreActions nombre={ts.nombre(2)} libelleTout={ts.tout} libelleFermer={ts.fermer} toutCoche={false} onFermer={() => {}} onTout={() => {}} ops={['archive', 'trash']} libelleOp={libelleOp as any} libelleLu={ts.lu} libelleNonLu={ts.nonLu} libelleCategorie={ts.categorie} enCours={ts.enCours(3, 12)} onOp={() => {}} onLu={() => {}} onNonLu={() => {}} onCategorie={() => {}} />
    </Ecran>
  ),
  annuler: () => (
    <Ecran titre="Boîte de réception">
      {liste({})}
      <BandeauResultat message={ts.fait('archive', 3)} libelleAnnuler="Annuler" onAnnuler={() => {}} onFermer={() => {}} />
    </Ecran>
  ),
  echec: () => (
    <Ecran titre="Boîte de réception">
      {liste({})}
      <BandeauResultat message={ts.fait('archive', 2) + ' ' + ts.echecs(1, 3, 'La boîte Outlook ne répond pas. Réessayez dans un instant.')} erreur libelleAnnuler="Annuler" onAnnuler={() => {}} onFermer={() => {}} />
    </Ecran>
  ),
};
const sortie: Record<string, string> = {};
for (const [nom, f] of Object.entries(scenes)) {
  AppRegistry.registerComponent('S' + nom, () => () => f());
  const { element, getStyleElement } = (AppRegistry as any).getApplication('S' + nom, {});
  const html = renderToStaticMarkup(element);
  const css = renderToStaticMarkup(getStyleElement());
  sortie[nom] = css + html;
}
const json = JSON.stringify(sortie);
console.log('MD5 ' + createHash('md5').update(json).digest('hex') + ' ' + json.length);
const { writeFileSync, mkdirSync } = await import('node:fs');
const dossier = process.env.SORTIE!;
mkdirSync(dossier, { recursive: true });
writeFileSync(dossier + '/vues-app.json', json);
