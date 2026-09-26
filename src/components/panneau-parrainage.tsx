import { useEffect, useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { apiPost } from '@/lib/api';
import { colors, fonts } from '@/lib/theme';

/**
 * LE GRAND PANNEAU DU PROGRAMME AMBASSADEUR — ACCUEIL DE L'APP — 26/09/2026.
 *
 * Choix de HA sur maquettes : look « A — Les 2 étapes », « Parrainez.
 * Rémunérez-vous. ». Jumeau du web : Veille Email/apps/web/src/components/
 * panneau-parrainage.tsx (mêmes textes, 8 langues). Seule différence : le
 * bouton PARTAGE le lien (feuille de partage de l'iPhone) au lieu de le copier.
 *
 * ⚠️ App Store 3.1.1 — risque ASSUMÉ par HA le 26/09 : « on vend rien dans
 * l'app ». Le panneau parle de remise et d'argent gagné, sans prix ni achat.
 *
 * QUAND : le SERVEUR décide et réserve (POST /api/referral/panneau, `ouvrir`) —
 * 3 jours après l'inscription, au plus 1 fois par semaine, 4 fois au total,
 * compté par compte (web + app). « Plus tard » ferme ; « Ne plus afficher »
 * → `masquer`. Une erreur est journalisée, jamais avalée ; rien ne s'affiche.
 */

type Dict = {
  kick: string;
  t1: string;
  t2: string;
  e1: string;
  e1s: string;
  e2: string;
  e2s: string;
  offert: string;
  offertC: string;
  euro: string;
  euroC: string;
  gauche: string;
  droite: string;
  noteGratuit: string;
  noteRetrait: string;
  copier: string;
  partager: string;
  copie: string;
  echec: string;
  plusTard: string;
  jamais: string;
  fermer: string;
};

const STR: Record<string, Dict> = {
  fr: {
    kick: 'Programme ambassadeur',
    t1: 'Parrainez.',
    t2: 'Rémunérez-vous.',
    e1: '5 amis en Premium = votre abonnement offert',
    e1s: 'Ou 10 amis en Essentiel. Tant qu’ils restent abonnés.',
    e2: 'Au-delà, chaque ami vous rapporte de l’argent',
    e2s: 'Chaque mois, versé sur votre compte bancaire.',
    offert: 'Abonnement offert',
    offertC: 'Offert',
    euro: '+ € chaque mois',
    euroC: '+ €/mois',
    gauche: 'Amis abonnés en Premium',
    droite: '6ᵉ ami et après',
    noteGratuit: 'Pour la remise et l’argent, il faut être abonné.',
    noteRetrait: 'L’argent se retire sur votre compte bancaire à partir de 20 €.',
    copier: 'Copier mon lien',
    partager: 'Partager mon lien',
    copie: 'Lien copié ✓',
    echec: 'Copiez ce lien :',
    plusTard: 'Plus tard',
    jamais: 'Ne plus afficher',
    fermer: 'Fermer',
  },
  en: {
    kick: 'Ambassador program',
    t1: 'Refer friends.',
    t2: 'Get paid.',
    e1: '5 friends on Premium = your subscription is free',
    e1s: 'Or 10 friends on Essentiel. As long as they stay subscribed.',
    e2: 'Beyond that, every friend earns you money',
    e2s: 'Every month, paid to your bank account.',
    offert: 'Free subscription',
    offertC: 'Free',
    euro: '+ € every month',
    euroC: '+ €/mo',
    gauche: 'Friends subscribed to Premium',
    droite: '6th friend onwards',
    noteGratuit: 'You need a subscription to get the discount and the money.',
    noteRetrait: 'Money can be withdrawn to your bank account from €20.',
    copier: 'Copy my link',
    partager: 'Share my link',
    copie: 'Link copied ✓',
    echec: 'Copy this link:',
    plusTard: 'Later',
    jamais: 'Don’t show again',
    fermer: 'Close',
  },
  es: {
    kick: 'Programa de embajadores',
    t1: 'Recomienda.',
    t2: 'Gana dinero.',
    e1: '5 amigos en Premium = tu suscripción gratis',
    e1s: 'O 10 amigos en Essentiel. Mientras sigan suscritos.',
    e2: 'A partir de ahí, cada amigo te hace ganar dinero',
    e2s: 'Cada mes, en tu cuenta bancaria.',
    offert: 'Suscripción gratis',
    offertC: 'Gratis',
    euro: '+ € cada mes',
    euroC: '+ €/mes',
    gauche: 'Amigos suscritos a Premium',
    droite: 'Del 6.º amigo en adelante',
    noteGratuit: 'Para el descuento y el dinero, necesitas estar suscrito.',
    noteRetrait: 'El dinero se retira a tu cuenta bancaria a partir de 20 €.',
    copier: 'Copiar mi enlace',
    partager: 'Compartir mi enlace',
    copie: 'Enlace copiado ✓',
    echec: 'Copia este enlace:',
    plusTard: 'Más tarde',
    jamais: 'No volver a mostrar',
    fermer: 'Cerrar',
  },
  de: {
    kick: 'Botschafterprogramm',
    t1: 'Empfehle.',
    t2: 'Verdiene mit.',
    e1: '5 Freunde im Premium = Ihr Abo kostenlos',
    e1s: 'Oder 10 Freunde im Essentiel. Solange sie abonniert bleiben.',
    e2: 'Darüber hinaus bringt Ihnen jeder Freund Geld',
    e2s: 'Jeden Monat, auf Ihr Bankkonto.',
    offert: 'Abo kostenlos',
    offertC: 'Gratis',
    euro: '+ € jeden Monat',
    euroC: '+ €/Monat',
    gauche: 'Freunde mit Premium-Abo',
    droite: 'Ab dem 6. Freund',
    noteGratuit: 'Für Rabatt und Geld brauchen Sie ein Abo.',
    noteRetrait: 'Auszahlung auf Ihr Bankkonto ab 20 €.',
    copier: 'Meinen Link kopieren',
    partager: 'Meinen Link teilen',
    copie: 'Link kopiert ✓',
    echec: 'Kopieren Sie diesen Link:',
    plusTard: 'Später',
    jamais: 'Nicht mehr anzeigen',
    fermer: 'Schließen',
  },
  pt: {
    kick: 'Programa de embaixadores',
    t1: 'Indica.',
    t2: 'Ganha dinheiro.',
    e1: '5 amigos no Premium = a sua assinatura grátis',
    e1s: 'Ou 10 amigos no Essentiel. Enquanto continuarem assinantes.',
    e2: 'A partir daí, cada amigo rende-lhe dinheiro',
    e2s: 'Todos os meses, na sua conta bancária.',
    offert: 'Assinatura grátis',
    offertC: 'Grátis',
    euro: '+ € por mês',
    euroC: '+ €/mês',
    gauche: 'Amigos assinantes do Premium',
    droite: 'A partir do 6.º amigo',
    noteGratuit: 'Para o desconto e o dinheiro, é preciso ser assinante.',
    noteRetrait: 'O dinheiro é transferido para a sua conta bancária a partir de 20 €.',
    copier: 'Copiar o meu link',
    partager: 'Partilhar o meu link',
    copie: 'Link copiado ✓',
    echec: 'Copie este link:',
    plusTard: 'Mais tarde',
    jamais: 'Não mostrar de novo',
    fermer: 'Fechar',
  },
  it: {
    kick: 'Programma ambassador',
    t1: 'Invita.',
    t2: 'Fatti pagare.',
    e1: '5 amici in Premium = abbonamento gratis',
    e1s: 'Oppure 10 amici in Essentiel. Finché restano abbonati.',
    e2: 'Oltre, ogni amico ti fa guadagnare',
    e2s: 'Ogni mese, sul tuo conto bancario.',
    offert: 'Abbonamento gratis',
    offertC: 'Gratis',
    euro: '+ € ogni mese',
    euroC: '+ €/mese',
    gauche: 'Amici abbonati a Premium',
    droite: 'Dal 6° amico in poi',
    noteGratuit: 'Per lo sconto e il denaro serve un abbonamento.',
    noteRetrait: 'Il denaro si trasferisce sul tuo conto bancario da 20 €.',
    copier: 'Copia il mio link',
    partager: 'Condividi il mio link',
    copie: 'Link copiato ✓',
    echec: 'Copia questo link:',
    plusTard: 'Più tardi',
    jamais: 'Non mostrare più',
    fermer: 'Chiudi',
  },
  ar: {
    kick: 'برنامج السفراء',
    t1: 'رشّح أصدقاءك.',
    t2: 'واربح المال.',
    e1: '5 أصدقاء في Premium = اشتراكك مجانًا',
    e1s: 'أو 10 أصدقاء في Essentiel، ما داموا مشتركين.',
    e2: 'بعد ذلك، كل صديق يدرّ عليك المال',
    e2s: 'كل شهر، في حسابك المصرفي.',
    offert: 'اشتراك مجاني',
    offertC: 'مجاني',
    euro: '+ € كل شهر',
    euroC: '+ €/شهر',
    gauche: 'أصدقاء مشتركون في Premium',
    droite: 'من الصديق السادس فما فوق',
    noteGratuit: 'للحصول على الخصم والمال، يجب أن تكون مشتركًا.',
    noteRetrait: 'يمكن سحب المال إلى حسابك المصرفي ابتداءً من 20 €.',
    copier: 'نسخ رابطي',
    partager: 'مشاركة رابطي',
    copie: 'تم نسخ الرابط ✓',
    echec: 'انسخ هذا الرابط:',
    plusTard: 'لاحقًا',
    jamais: 'عدم الإظهار مجددًا',
    fermer: 'إغلاق',
  },
  ru: {
    kick: 'Программа амбассадоров',
    t1: 'Приглашайте.',
    t2: 'Зарабатывайте.',
    e1: '5 друзей на Premium = ваша подписка бесплатно',
    e1s: 'Или 10 друзей на Essentiel. Пока они остаются подписчиками.',
    e2: 'Дальше каждый друг приносит вам деньги',
    e2s: 'Каждый месяц, на ваш банковский счёт.',
    offert: 'Подписка бесплатно',
    offertC: 'Бесплатно',
    euro: '+ € каждый месяц',
    euroC: '+ €/мес',
    gauche: 'Друзья с подпиской Premium',
    droite: 'С 6-го друга',
    noteGratuit: 'Чтобы получить скидку и деньги, нужна подписка.',
    noteRetrait: 'Деньги выводятся на банковский счёт от 20 €.',
    copier: 'Скопировать ссылку',
    partager: 'Поделиться ссылкой',
    copie: 'Ссылка скопирована ✓',
    echec: 'Скопируйте эту ссылку:',
    plusTard: 'Позже',
    jamais: 'Больше не показывать',
    fermer: 'Закрыть',
  },
};

type Donnees = { code: string; lien: string; abonne: boolean };

export function PanneauParrainage() {
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Donnees | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const j = await apiPost<{ montrer?: boolean; code?: string; lien?: string; abonne?: boolean }>(
          '/api/referral/panneau',
          { action: 'ouvrir' },
        );
        if (!annule && j?.montrer === true && j.code && j.lien) {
          setD({ code: j.code, lien: j.lien, abonne: j.abonne === true });
        }
      } catch (e) {
        console.error('[panneau parrainage] lecture impossible', e);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  if (!d) return null;

  const fermer = () => setD(null);

  const jamais = async () => {
    setD(null);
    try {
      await apiPost('/api/referral/panneau', { action: 'masquer' });
    } catch (e) {
      console.error('[panneau parrainage] « ne plus afficher » impossible', e);
    }
  };

  const partager = async () => {
    try {
      await Share.share({ message: d.lien, url: d.lien });
    } catch (e) {
      console.error('[panneau parrainage] partage impossible', e);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fermer}>
      <Pressable style={styles.voile} onPress={fermer}>
        <Pressable style={[styles.feuille, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
          <Text style={styles.kick}>{t.kick.toUpperCase()}</Text>
          <Text style={styles.titre} accessibilityRole="header">
            {t.t1}
            {'\n'}
            <Text style={styles.orange}>{t.t2}</Text>
          </Text>

          {[
            [t.e1, t.e1s],
            [t.e2, t.e2s],
          ].map(([titre, sous], i) => (
            <View key={i} style={styles.etape}>
              <View style={styles.num}>
                <Text style={styles.numTexte}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.etapeTitre}>{titre}</Text>
                <Text style={styles.etapeSous}>{sous}</Text>
              </View>
            </View>
          ))}

          {/* La frise : 5 amis → offert → de l'argent chaque mois. */}
          <View style={styles.frise} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[1, 2, 3, 4, 5].map((n) => (
              <View key={n} style={styles.friseMorceau}>
                <View style={styles.point}>
                  <Text style={styles.pointTexte}>{n}</Text>
                </View>
                <View style={styles.filet} />
              </View>
            ))}
            <View style={styles.offert}>
              <Text style={styles.offertTexte}>{t.offertC}</Text>
            </View>
            <View style={[styles.filet, { backgroundColor: VERT }]} />
            <View style={styles.euro}>
              <Text style={styles.euroTexte}>{t.euroC}</Text>
            </View>
          </View>
          <View style={styles.legende}>
            <Text style={styles.legendeTexte}>{t.gauche}</Text>
            <Text style={styles.legendeTexte}>{t.droite}</Text>
          </View>

          <Text style={styles.note}>
            {d.abonne ? '' : t.noteGratuit + ' '}
            {t.noteRetrait}
          </Text>

          <View style={styles.actions}>
            <View style={styles.code}>
              <Text style={styles.codeTexte} selectable>
                {d.code}
              </Text>
            </View>
            <Pressable onPress={() => void partager()} style={styles.bouton} accessibilityRole="button">
              <Text style={styles.boutonTexte}>{t.partager}</Text>
            </Pressable>
          </View>

          <View style={styles.pied}>
            <Pressable onPress={fermer} hitSlop={8} accessibilityRole="button">
              <Text style={styles.piedTexte}>{t.plusTard}</Text>
            </Pressable>
            <Pressable onPress={() => void jamais()} hitSlop={8} accessibilityRole="button">
              <Text style={styles.piedTexte}>{t.jamais}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ORANGE = colors.terracottaVivid;
const VERT = '#5fa37a';
const ORANGE_DOUX = 'rgba(232,93,12,0.16)';

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: colors.charcoal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: colors.charline,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  kick: { color: ORANGE, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.8 },
  titre: { color: '#fff', fontFamily: fonts.sansExtrabold, fontSize: 27, lineHeight: 31, letterSpacing: -0.6, marginTop: 8 },
  orange: { color: ORANGE },
  etape: { flexDirection: 'row', gap: 14, marginTop: 16 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: ORANGE_DOUX, alignItems: 'center', justifyContent: 'center' },
  numTexte: { color: ORANGE, fontFamily: fonts.sansBold, fontSize: 14 },
  etapeTitre: { color: '#fff', fontFamily: fonts.sansSemibold, fontSize: 15, lineHeight: 20 },
  etapeSous: { color: colors.onDarkMuted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, marginTop: 1 },
  frise: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  friseMorceau: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  point: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(232,93,12,0.55)', alignItems: 'center', justifyContent: 'center' },
  pointTexte: { color: ORANGE, fontFamily: fonts.sansBold, fontSize: 10 },
  filet: { flex: 1, height: 2, minWidth: 3, backgroundColor: 'rgba(232,93,12,0.35)' },
  offert: { backgroundColor: ORANGE_DOUX, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  offertTexte: { color: ORANGE, fontFamily: fonts.sansBold, fontSize: 12 },
  euro: { backgroundColor: VERT, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  euroTexte: { color: '#10170f', fontFamily: fonts.sansExtrabold, fontSize: 12 },
  legende: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  legendeTexte: { color: colors.onDarkMuted, fontFamily: fonts.sans, fontSize: 11.5 },
  note: { color: 'rgba(234,225,208,0.55)', fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  code: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(234,225,208,0.35)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  codeTexte: { color: colors.onDark, fontFamily: fonts.sansBold, fontSize: 14, letterSpacing: 1.8 },
  bouton: { flex: 1, backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  boutonTexte: { color: '#fff', fontFamily: fonts.sansSemibold, fontSize: 15 },
  pied: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  piedTexte: { color: 'rgba(234,225,208,0.55)', fontFamily: fonts.sans, fontSize: 13.5 },
});
