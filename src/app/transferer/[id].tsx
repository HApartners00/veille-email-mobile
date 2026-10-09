import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost, apiUploadBrut } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { MAX_ATT_BYTES, messageEchecPJ, nomLisible, pjStr, typeRetenu } from '@/lib/pieces-jointes';
import { tailleLisible } from '@/lib/i18n/signature-pj';
import { textesTransfert } from '@/lib/i18n/transfert';
import ChampDestinataires from '@/components/champ-destinataires';
import BoutonIaIrise from '@/components/bouton-ia-irise';
import ChampsCopies from '@/components/champs-copies';
import PjSignature, { usePjSignature } from '@/components/pj-signature';
import { enListe, libellesCopies } from '@/lib/copies';
import { IconChevronLeft, IconClose, IconPlus } from '@/components/icons';

/**
 * TRANSFÉRER UN MAIL REÇU — 09/10/2026, demande de HA (« on peut pas transférer un mail reçu »).
 * Jumeau : Veille Email/apps/web/src/components/transferer-mail.tsx. Serveur : /api/forward.
 * On y arrive par « ⋯ » sur un mail (app/email/[id].tsx).
 *
 * Ce qui part : le mot (la signature pré-remplie dessous), puis le mail d'origine en entier avec
 * ses pièces jointes, plus les fichiers ajoutés ici et celui de la signature (✕ pour le retirer).
 * À + Cc + Cci. L'IA écrit ou modifie le mot (mode `transfert` de /api/draft).
 * Les fichiers ajoutés vont dans le panier « transfert » du mail (`transfert=1`) : ils ne se
 * mêlent pas à ceux d'une réponse au même mail.
 */
type Prep = {
  boite: string;
  imap: boolean;
  signature: string;
  piecesOrigine: { nom: string; taille: number }[] | null;
  piecesOrigineIllisibles?: boolean;
};
type Fichier = { id: string; filename: string };
const ADRESSE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export default function TransfererMail() {
  const { id: brut } = useLocalSearchParams<{ id: string }>();
  const id = String(brut || '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const tt = textesTransfert(locale);
  const attStr = pjStr(locale);
  const libCopies = libellesCopies(locale);
  const pjSig = usePjSignature({ itemId: id || undefined });

  const [prep, setPrep] = useState<Prep | null>(null);
  const [prepErreur, setPrepErreur] = useState<string | null>(null);
  const [a, setA] = useState('');
  const [cc, setCc] = useState('');
  const [cci, setCci] = useState('');
  const [copiesOuvertes, setCopiesOuvertes] = useState(false);
  const [note, setNote] = useState('');
  const [consigne, setConsigne] = useState('');
  const consigneRef = useRef<TextInput | null>(null);
  const [ia, setIa] = useState(false);
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [televersement, setTeleversement] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = useRef<{ empreinte: string; valeur: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let annule = false;
    apiGet<Prep>(`/api/forward?item_id=${encodeURIComponent(id)}`)
      .then((j) => {
        if (annule) return;
        setPrep(j);
        // Comme une réponse : la signature sous le mot.
        if (j.signature) setNote((n) => (n ? n : `\n\n${j.signature}`));
      })
      .catch((e) => {
        if (annule) return;
        console.error('[transfert] préparation illisible', e);
        setPrepErreur(e instanceof Error ? e.message : String(e));
      });
    apiGet<{ attachments?: Fichier[] }>(`/api/reply-attachments?item_id=${encodeURIComponent(id)}&transfert=1`)
      .then((j) => {
        if (!annule) setFichiers((j?.attachments || []).map((x) => ({ id: x.id, filename: x.filename })));
      })
      .catch((e) => {
        console.error('[transfert] fichiers ajoutés illisibles', e);
        if (!annule) setErreur(attStr.failed);
      });
    return () => {
      annule = true;
    };
  }, [id, attStr.failed]);

  const destinataires = useMemo(() => enListe(a), [a]);
  const invalides = useMemo(() => [...destinataires, ...enListe(cc), ...enListe(cci)].filter((x) => !ADRESSE.test(x)), [destinataires, cc, cci]);
  const motVide = !note.replace(prep?.signature || '\u0000', '').trim();

  async function ecrireAvecIa() {
    if (ia) return;
    if (motVide && !consigne.trim()) {
      consigneRef.current?.focus();
      return;
    }
    setIa(true);
    setErreur(null);
    try {
      const corps: Record<string, unknown> = { id, transfert: true, locale, destinataires: destinataires.join(', ') };
      if (!motVide) {
        corps.previousDraft = note;
        corps.instructions = consigne.trim() || 'Améliore la formulation sans changer le sens.';
      } else corps.instructions = consigne.trim();
      const j = await apiPost<{ draft?: string }>('/api/draft', corps);
      if (!j?.draft) throw new Error('réponse vide');
      setNote(j.draft);
      setConsigne('');
    } catch (e) {
      console.error('[transfert] IA en échec', e);
      setErreur(tt.echecIa);
    } finally {
      setIa(false);
    }
  }

  async function televerser(uri: string, name: string, type: string, taille?: number | null): Promise<string | null> {
    const nom = nomLisible(name);
    if (typeof taille === 'number' && taille > MAX_ATT_BYTES) return `${nom} — ${attStr.tooBig}`;
    const form = new FormData();
    form.append('item_id', id);
    form.append('transfert', '1');
    form.append('file', { uri, name: nom, type: typeRetenu(nom, type) } as unknown as Blob);
    try {
      const r = await apiUploadBrut<{ attachment?: { id: string; filename: string }; error?: string }>('/api/reply-attachments', form);
      if (r.ok && r.json?.attachment) {
        const pj = r.json.attachment;
        setFichiers((p) => [...p, { id: pj.id, filename: pj.filename }]);
        return null;
      }
      return `${nom} — ${r.status === 413 ? attStr.tooBig : r.json?.error || attStr.failed}`;
    } catch (e) {
      return `${nom} — ${messageEchecPJ(attStr, e)}`;
    }
  }

  async function depuisFichiers() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setTeleversement(true);
      setErreur(null);
      const echecs: string[] = [];
      for (const f of res.assets) {
        const e = await televerser(f.uri, f.name || 'fichier', f.mimeType || '', f.size);
        if (e) echecs.push(e);
      }
      if (echecs.length) setErreur(echecs.join('\n'));
    } catch (e) {
      setErreur(messageEchecPJ(attStr, e));
    } finally {
      setTeleversement(false);
    }
  }

  async function depuisPhotos() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
      if (res.canceled || !res.assets?.length) return;
      setTeleversement(true);
      setErreur(null);
      const echecs: string[] = [];
      for (const f of res.assets) {
        const e = await televerser(f.uri, f.fileName || `photo-${Date.now()}.jpg`, f.mimeType || 'image/jpeg', f.fileSize);
        if (e) echecs.push(e);
      }
      if (echecs.length) setErreur(echecs.join('\n'));
    } catch (e) {
      setErreur(messageEchecPJ(attStr, e));
    } finally {
      setTeleversement(false);
    }
  }

  async function retirerFichier(fid: string) {
    const avant = fichiers;
    setFichiers((p) => p.filter((x) => x.id !== fid));
    try {
      await apiDelete(`/api/reply-attachments?id=${encodeURIComponent(fid)}`);
    } catch (e) {
      // Il partirait quand même : on le remet à l'écran et on le DIT.
      console.error('[transfert] fichier non retiré', e);
      setFichiers(avant);
      setErreur(attStr.failed);
    }
  }

  function demander() {
    setErreur(null);
    if (!destinataires.length) return setErreur(tt.sansDestinataire);
    if (invalides.length) return setErreur(tt.adresseInvalide(invalides.slice(0, 3).join(', ')));
    setConfirmer(true);
  }

  async function transferer() {
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    let fuseau = 'Europe/Paris';
    try {
      fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || fuseau;
    } catch (e) {
      console.warn('[transfert] fuseau horaire illisible, Europe/Paris retenu', e);
    }
    const corps = { id, to: destinataires, cc: enListe(cc), bcc: enListe(cci), note, pjSignature: pjSig.joindre, locale, fuseau };
    const empreinte = JSON.stringify([corps, fichiers.map((f) => f.id)]);
    if (cle.current?.empreinte !== empreinte) cle.current = { empreinte, valeur: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try {
      const r = await apiPost<{ ok?: boolean; avertissement?: string }>('/api/forward', { ...corps, idempotencyKey: cle.current.valeur });
      setConfirmer(false);
      Alert.alert(tt.fait, r?.avertissement || undefined);
      router.back();
    } catch (e) {
      console.error('[transfert] envoi en échec', e);
      setConfirmer(false);
      setErreur(e instanceof Error && e.message ? e.message : tt.echec);
    } finally {
      setEnvoi(false);
    }
  }

  const nbDest = destinataires.length + enListe(cc).length + enListe(cci).length;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} hitSlop={12} onPress={() => router.back()}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          <Text style={styles.titre}>{tt.titre}</Text>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.corps} contentContainerStyle={styles.corpsContenu} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {prepErreur ? <Text style={styles.erreur}>{prepErreur}</Text> : null}

        <View style={styles.ligneLabel}>
          <Text style={styles.label}>{tt.a}</Text>
          {!copiesOuvertes ? (
            <Pressable hitSlop={12} onPress={() => setCopiesOuvertes(true)}>
              <Text style={styles.lienCopies}>{libCopies.lien}</Text>
            </Pressable>
          ) : null}
        </View>
        <ChampDestinataires value={a} onChange={setA} boite={prep?.boite || ''} placeholder={tt.placeholderA} locale={locale} style={styles.champ} />
        {copiesOuvertes ? (
          <ChampsCopies cc={cc} cci={cci} onCc={setCc} onCci={setCci} boite={prep?.boite || ''} locale={locale} placeholder="nom@exemple.com" styleChamp={styles.champ} styleLabel={styles.label} />
        ) : null}

        <Text style={styles.label}>{tt.mot}</Text>
        <TextInput style={styles.editeur} value={note} onChangeText={setNote} multiline textAlignVertical="top" placeholder={tt.placeholderMot} placeholderTextColor={colors.hint} editable={!envoi} />

        {ia ? (
          <View style={styles.iaEnCours}>
            <ActivityIndicator color={colors.terracotta} />
            <Text style={styles.iaEnCoursText}>{tt.iaEnCours}</Text>
          </View>
        ) : (
          <>
            <TextInput ref={consigneRef} style={[styles.champ, styles.consigne]} value={consigne} onChangeText={setConsigne} placeholder={tt.placeholderConsigne} placeholderTextColor={colors.hint} />
            <BoutonIaIrise libelle={motVide ? tt.ia : tt.iaReecrire} onPress={() => void ecrireAvecIa()} />
          </>
        )}

        {prep?.piecesOrigine && prep.piecesOrigine.length ? (
          <>
            <Text style={styles.label}>{tt.piecesOrigine}</Text>
            {prep.piecesOrigine.map((p, i) => (
              <View key={`${p.nom}-${i}`} style={styles.pjLigne}>
                <Text style={[styles.pjNom, styles.pjOrigine]} numberOfLines={1}>
                  📎 {p.nom}
                </Text>
                {p.taille ? <Text style={styles.pjTaille}>{tailleLisible(p.taille, locale)}</Text> : null}
              </View>
            ))}
          </>
        ) : prep && (prep.imap || prep.piecesOrigineIllisibles) ? (
          <Text style={[styles.note, styles.noteHaut]}>{prep.piecesOrigineIllisibles ? tt.piecesOrigineIllisibles : tt.piecesOrigineInconnues}</Text>
        ) : null}

        <Text style={styles.label}>{tt.ajoutees}</Text>
        <PjSignature {...pjSig} locale={locale} desactive={envoi} />
        {fichiers.map((f) => (
          <View key={f.id} style={styles.pjLigne}>
            <Text style={styles.pjNom} numberOfLines={1}>
              {f.filename}
            </Text>
            <Pressable hitSlop={10} disabled={envoi} onPress={() => void retirerFichier(f.id)}>
              <IconClose size={15} color={colors.onDarkMuted} />
            </Pressable>
          </View>
        ))}
        {televersement ? (
          <View style={styles.iaEnCours}>
            <ActivityIndicator color={colors.terracotta} />
            <Text style={styles.iaEnCoursText}>{tt.envoiFichier}</Text>
          </View>
        ) : (
          <View style={styles.pjBtns}>
            <Pressable style={[styles.pjBtn, envoi && styles.off]} disabled={envoi} onPress={() => void depuisFichiers()}>
              <IconPlus size={14} color={colors.onDark} />
              <Text style={styles.pjBtnText}>{attStr.files}</Text>
            </Pressable>
            <Pressable style={[styles.pjBtn, envoi && styles.off]} disabled={envoi} onPress={() => void depuisPhotos()}>
              <IconPlus size={14} color={colors.onDark} />
              <Text style={styles.pjBtnText}>{attStr.photos}</Text>
            </Pressable>
          </View>
        )}
        {prep?.imap ? <Text style={[styles.note, styles.noteHaut]}>{tt.imapTexte}</Text> : null}
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable style={[styles.cta, styles.flex1, (envoi || !prep) && styles.off]} disabled={envoi || !prep} onPress={demander}>
          <Text style={styles.ctaText}>{envoi ? tt.envoi : tt.envoyer}</Text>
        </Pressable>
      </View>

      <Modal visible={confirmer} transparent animationType="fade" onRequestClose={() => (envoi ? null : setConfirmer(false))}>
        <Pressable style={styles.overlay} onPress={() => (envoi ? null : setConfirmer(false))}>
          <Pressable style={styles.carte} onPress={() => {}}>
            <Text style={styles.carteTitre}>{tt.confirmer(nbDest)}</Text>
            <View style={styles.carteBtns}>
              <Pressable style={[styles.cta, styles.flex1, envoi && styles.off]} disabled={envoi} onPress={() => void transferer()}>
                <Text style={styles.ctaText}>{envoi ? tt.envoi : tt.oui}</Text>
              </Pressable>
              <Pressable style={styles.annuler} disabled={envoi} onPress={() => setConfirmer(false)}>
                <Text style={styles.annulerText}>{tt.annuler}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Mêmes mesures que l'écran « Nouveau mail » (app/nouveau.tsx).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fond },
  safe: { backgroundColor: colors.charcoalSoft, borderBottomWidth: 1, borderBottomColor: colors.charline },
  topbar: {
    backgroundColor: colors.charcoalSoft,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: 'rgba(234,225,208,0.10)', alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.onDark },
  corps: { flex: 1 },
  corpsContenu: { padding: spacing.xl, paddingBottom: spacing.xl },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  ligneLabel: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  lienCopies: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.terracottaVivid, marginBottom: spacing.sm },
  champ: {
    fontFamily: fonts.sans,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.ink,
  },
  consigne: { marginTop: spacing.md, marginBottom: spacing.sm },
  editeur: {
    fontFamily: fonts.sans,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    minHeight: 150,
  },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted, lineHeight: 17 },
  noteHaut: { marginTop: spacing.lg },
  iaEnCours: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  iaEnCoursText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDarkMuted },
  pjLigne: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.charline },
  pjNom: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDark },
  pjOrigine: { color: colors.onDarkMuted },
  pjTaille: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted },
  pjBtns: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.md },
  pjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  pjBtnText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.onDark },
  off: { opacity: 0.4 },
  erreur: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.danger, marginTop: spacing.lg, lineHeight: 18 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.charcoalSoft,
    borderTopWidth: 1,
    borderTopColor: colors.charline,
  },
  flex1: { flex: 1 },
  cta: { backgroundColor: colors.terracottaVivid, borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(20,18,15,0.55)', justifyContent: 'flex-end', padding: spacing.lg },
  carte: { backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  carteTitre: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2, marginBottom: spacing.xs },
  carteBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  annuler: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  annulerText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
});
