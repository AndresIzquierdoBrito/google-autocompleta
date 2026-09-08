import { StyleSheet, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";

type Props = {
  misses: number;
  total?: number;
};

function Cross({ active }: { active: boolean }) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={[styles.crossBox, active && styles.crossBoxActive]}>
      <Svg height={14} viewBox="0 0 16 16" width={14}>
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

export function StrikeMeter({ misses, total = 4 }: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View
      accessibilityLabel={`${misses} de ${total} fallos usados`}
      accessibilityRole="text"
      style={styles.container}
    >
      {Array.from({ length: total }, (_, index) => (
        <Cross active={index < misses} key={index} />
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 3,
    },
    crossBox: {
      width: 26,
      height: 26,
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
