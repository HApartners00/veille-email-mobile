import { Text, View } from 'react-native';

import { colors, fonts } from '@/lib/theme';

/** Marque : tuile charbon carree + "V" serif orange (identite Veille Email). */
export function LogoV({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: colors.charcoal,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fonts.serif,
          fontSize: Math.round(size * 0.56),
          color: colors.terracottaVivid,
          includeFontPadding: false,
          textAlign: 'center',
          textAlignVertical: 'center',
        }}
      >
        V
      </Text>
    </View>
  );
}

export default LogoV;
