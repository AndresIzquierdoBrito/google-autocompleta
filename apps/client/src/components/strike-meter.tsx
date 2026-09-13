import { StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";

type Props = {
  misses: number;
  total?: number;
  size?: number;
  numeric?: boolean;
};

function Cross({ active, size }: { active: boolean; size: number }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors, size);
  return (
    <View style={[styles.crossBox, active && styles.crossBoxActive]}>
      <Svg
        height={Math.round(size * 0.54)}
        viewBox="0 0 16 16"
        width={Math.round(size * 0.54)}
      >
        <Line
          stroke={active ? colors.white : colors.textFaint}
          strokeLinecap="round"
          strokeWidth={2.5}
          x1="3"
          x2="13"
          y1="3"
          y2="13"
        />
        <Line
          stroke={active ? colors.white : colors.textFaint}
          strokeLinecap="round"
          strokeWidth={2.5}
          x1="13"
          x2="3"
          y1="3"
          y2="13"
        />
      </Svg>
    </View>
  );
}

export function StrikeMeter({
  misses,
  total = 4,
  size = 26,
  numeric = false,
}: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors, size);
  return (
    <View
      accessibilityLabel={`${misses} de ${total} fallos usados`}
      accessibilityRole="text"
      style={styles.container}
    >
      {numeric ? (
        <Text style={styles.count}>{misses}/{total}</Text>
      ) : (
        Array.from({ length: total }, (_, index) => (
          <Cross active={index < misses} key={index} size={size} />
        ))
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, size = 26) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.max(2, Math.round(size * 0.14)),
      marginTop: 3,
    },
    count: {
      color: colors.text,
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "800",
    },
    crossBox: {
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceRaised,
    },
    crossBoxActive: {
      borderColor: colors.danger,
      backgroundColor: colors.danger,
    },
  });
