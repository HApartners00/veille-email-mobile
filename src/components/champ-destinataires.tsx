import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { apiGet } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * CHAMP « À » AVEC MÉMOIRE DES DESTINATAIRES — PAR BOÎTE. Jumeau mobile de
 * `apps/web/src/components/champ-destinataires.tsx`, même journée (14/08/2026),
 * même route `/api/recipients`, mêmes règles. Règle d'alignement du projet :
 * tout ce qui n'est pas du design doit être identique des deux côtés.
 *
 * ⚠️ LA RAISON D'ÊTRE DU COMPOSANT EST LE CLOISONNEMENT PAR BOÎTE :
 *   1. `boite` part dans chaque requête — le filtre est appliqué en base ;
 *   2. quand `boite` change, la liste, le cache et la requête en vol sont
 *      abandonnés sur-le-champ. Sans ça, on change de boîte d'envoi en cours de
 *      rédaction et les adresses de la précédente restent proposées : des
 *      adresses professionnelles dans un mail personnel.
 *
 * TROIS ÉTATS, JAMAIS DEUX : « Recherche… », « Aucune adresse connue pour cette
 * boîte » et « Suggestions indisponibles » sont trois messages distincts. Une
 * réponse dépassée (la frappe suivante est déjà partie) est ignorée, pas
 * comptée comme une panne — d'où le compteur `sequence` plutôt qu'un
 * AbortController, `apiGet` ne prenant pas de signal.
 *
 * DIFFÉRENCE DE FORME ASSUMÉE AVEC LE WEB : ici la liste s'affiche EN DESSOUS
 * du champ, dans le flux, et pas en surimpression. Dans un ScrollView, un
 * calque flottant se fait couper par les vues suivantes sur Android, et la
 * hauteur du clavier rend sa position imprévisible. C'est du design, donc
 * légitimement différent ; le comportement, lui, est le même.
 */

const MIN_CARACTERES = 2;
const ATTENTE_MS = 180;

type Suggestion = { email: string; name: string | null; uses: number };
type Etat = 'repos' | 'chargement' | 'ok' | 'erreur';
type Dict = { cherche: string; aucune: string; echec: string };

const STR: Record<string, Dict> = {
  fr: { cherche: 'Recherche…', aucune: 'Aucune adresse connue pour cette boîte.', echec: 'Suggestions indisponibles.' },
  en: { cherche: 'Searching…', aucune: 'No known address for this mailbox.', echec: 'Suggestions unavailable.' },
  es: { cherche: 'Buscando…', aucune: 'Ninguna dirección conocida para este buzón.', echec: 'Sugerencias no disponibles.' },
  de: { cherche: 'Suche…', aucune: 'Keine bekannte Adresse für dieses Postfach.', echec: 'Vorschläge nicht verfügbar.' },
  pt: { cherche: 'A procurar…', aucune: 'Nenhum endereço conhecido para esta caixa.', echec: 'Sugestões indisponíveis.' },
  it: { cherche: 'Ricerca…', aucune: 'Nessun indirizzo noto per questa casella.', echec: 'Suggerimenti non disponibili.' },
  ar: { cherche: 'جارٍ البحث…', aucune: 'لا يوجد عنوان معروف لهذا الصندوق.', echec: 'الاقتراحات غير متاحة.' },
  ru: { cherche: 'Поиск…', aucune: 'Нет известных адресов для этого ящика.', echec: 'Подсказки недоступны.' },
};

/** Le champ contient « a@x.com, b@y.com, deb » — seul le dernier fragment est complété. */
function decouper(valeur: string): [string, string] {
  const i = valeur.lastIndexOf(',');
  if (i < 0) return ['', valeur];
  return [valeur.slice(0, i + 1), valeur.slice(i + 1)];
}

export default function ChampDestinataires({
  value,
  onChange,
  boite,
  placeholder,
  style,
  locale,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Adresse de la boîte d'envoi sélectionnée. Vide = on ne propose rien. */
  boite: string;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  locale: string;
}) {
  const s = STR[locale] ?? STR.en;
  const cache = useRef(new Map<string, Suggestion[]>());
  const sequence = useRef(0);
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [etat, setEtat] = useState<Etat>('repos');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);

  const fragment = useMemo(() => decouper(value)[1].trim(), [value]);

  /** ⚠️ CHANGEMENT DE BOÎTE D'ENVOI — le garde-fou du chantier. */
  useEffect(() => {
    sequence.current += 1; // toute réponse en vol devient périmée
    cache.current.clear();
    setSuggestions([]);
    setOuvert(false);
    setEtat('repos');
  }, [boite]);

  useEffect(() => {
    // On ne cherche que si la liste peut s'afficher — sur la page d'un brouillon
    // le champ arrive DÉJÀ REMPLI, et sans ce garde la route serait appelée au
    // montage avec l'adresse entière, pour un résultat que personne ne voit.
    if (!ouvert || !boite || fragment.length < MIN_CARACTERES) {
      setSuggestions([]);
      setEtat('repos');
      return;
    }

    const cle = `${boite}|${fragment.toLowerCase()}`;
    const enCache = cache.current.get(cle);
    if (enCache) {
      setSuggestions(enCache);
      setEtat('ok');
      return;
    }

    setEtat('chargement');
    const minuteur = setTimeout(() => {
      sequence.current += 1;
      const mien = sequence.current;

      apiGet<{ ok?: boolean; suggestions?: Suggestion[] }>(
        `/api/recipients?mailbox=${encodeURIComponent(boite)}&q=${encodeURIComponent(fragment)}`,
      )
        .then((j) => {
          // Réponse dépassée : la frappe suivante est déjà partie. Ce n'est pas
          // une panne, on la laisse tomber en silence — mais SEULEMENT celle-là.
          if (mien !== sequence.current) return;
          if (!j?.ok || !Array.isArray(j.suggestions)) {
            console.error('[destinataires] réponse inattendue de /api/recipients', j);
            setEtat('erreur');
            setSuggestions([]);
            return;
          }
          cache.current.set(cle, j.suggestions);
          setSuggestions(j.suggestions);
          setEtat('ok');
        })
        .catch((e: unknown) => {
          if (mien !== sequence.current) return;
          // RIEN EN SILENCE : une liste vide ici ferait passer une panne pour
          // « aucun destinataire connu ». On l'écrit à l'écran.
          console.error('[destinataires] /api/recipients injoignable', e);
          setEtat('erreur');
          setSuggestions([]);
        });
    }, ATTENTE_MS);

    return () => clearTimeout(minuteur);
  }, [boite, fragment, ouvert]);

  useEffect(() => () => {
    if (fermeture.current) clearTimeout(fermeture.current);
  }, []);

  const choisir = useCallback(
    (email: string) => {
      const [debut] = decouper(value);
      // Adresse NUE, jamais « Nom <adresse> » : c'est ce que /api/compose et les
      // workflows n8n reçoivent, et ce chantier ne change pas ce contrat.
      onChange(`${debut}${debut ? ' ' : ''}${email}, `);
      setOuvert(false);
      setSuggestions([]);
      setEtat('repos');
    },
    [onChange, value],
  );

  const liste = ouvert && Boolean(boite) && fragment.length >= MIN_CARACTERES;
  const message =
    etat === 'chargement'
      ? s.cherche
      : etat === 'erreur'
        ? s.echec
        : suggestions.length === 0
          ? s.aucune
          : null;

  return (
    <View>
      <TextInput
        style={style}
        value={value}
        onChangeText={(v) => {
          onChange(v);
          setOuvert(true);
        }}
        onFocus={() => {
          if (fermeture.current) clearTimeout(fermeture.current);
          setOuvert(true);
        }}
        onBlur={() => {
          // Le `blur` précède le `press` d'une proposition : fermer tout de
          // suite ferait disparaître la ligne avant qu'on ne l'ait touchée.
          fermeture.current = setTimeout(() => setOuvert(false), 180);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.hint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      {liste ? (
        <View style={styles.liste}>
          {suggestions.map((sg) => (
            <Pressable
              key={sg.email}
              onPress={() => choisir(sg.email)}
              style={({ pressed }) => [styles.ligne, pressed && styles.lignePressee]}
            >
              {sg.name ? (
                <>
                  <Text style={styles.nom} numberOfLines={1}>
                    {sg.name}
                  </Text>
                  <Text style={styles.adresseSecondaire} numberOfLines={1}>
                    {sg.email}
                  </Text>
                </>
              ) : (
                <Text style={styles.nom} numberOfLines={1}>
                  {sg.email}
                </Text>
              )}
            </Pressable>
          ))}

          {message ? (
            <Text style={[styles.message, etat === 'erreur' && styles.messageErreur]}>{message}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  liste: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  ligne: { paddingHorizontal: spacing.md, paddingVertical: 11 },
  lignePressee: { backgroundColor: colors.creamAlt },
  nom: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  adresseSecondaire: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
  message: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  messageErreur: { color: colors.danger },
});
