import { Text, type StyleProp, type TextStyle } from 'react-native';

import ChampDestinataires from '@/components/champ-destinataires';
import { libellesCopies } from '@/lib/copies';

/**
 * LES DEUX CHAMPS « Cc » ET « Cci » — 06/10/2026, demande de HA. Jumeau de
 * `Veille Email/apps/web/src/components/champs-copies.tsx`.
 *
 * Un seul composant pour les trois ecrans qui les affichent. Chacun garde son
 * habillage : les styles du champ et du libelle sont passes par l'ecran.
 *
 * ⚠️ CE COMPOSANT N'AFFICHE PAS LE LIEN « Cc Cci » : c'est l'ecran qui deplie.
 * La regle qu'il doit tenir : UN CHAMP REPLIE EST TOUJOURS VIDE. On ne replie
 * jamais des champs remplis, et des copies deja enregistrees les ouvrent a
 * l'arrivee — sinon un mail partirait vers des personnes que l'ecran ne montre
 * pas.
 */
export default function ChampsCopies({
  cc,
  cci,
  onCc,
  onCci,
  boite,
  locale,
  placeholder,
  styleChamp,
  styleLabel,
}: {
  cc: string;
  cci: string;
  onCc: (v: string) => void;
  onCci: (v: string) => void;
  /** Boite d'envoi, pour les propositions. Vide = aucune proposition. */
  boite: string;
  locale: string;
  placeholder?: string;
  styleChamp?: StyleProp<TextStyle>;
  styleLabel?: StyleProp<TextStyle>;
}) {
  const l = libellesCopies(locale);
  return (
    <>
      <Text style={styleLabel}>{l.cc}</Text>
      <ChampDestinataires
        value={cc}
        onChange={onCc}
        boite={boite}
        placeholder={placeholder}
        locale={locale}
        style={styleChamp}
      />
      <Text style={styleLabel}>{l.cci}</Text>
      <ChampDestinataires
        value={cci}
        onChange={onCci}
        boite={boite}
        placeholder={placeholder}
        locale={locale}
        style={styleChamp}
      />
    </>
  );
}
