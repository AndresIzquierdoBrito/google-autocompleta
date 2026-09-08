import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";

export type UiMode = "daily" | "archive" | "random";

const modes: { value: UiMode; label: string }[] = [
  { value: "daily", label: "Diario" },
  { value: "archive", label: "Histórico" },
  { value: "random", label: "Aleatorio" },
];

type Props = {
  value: UiMode;
  onChange: (mode: UiMode) => void;
};

export function ModeTabs({ value, onChange }: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {modes.map((mode) => {
        const selected = value === mode.value;
        return (
          <Pressable
            key={mode.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(mode.value)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.tabPressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: "100%",
      flexDirection: "row",
      padding: 3,
      borderRadius: radius.medium,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      minHeight: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
    },
    tabSelected: { backgroundColor: colors.surfaceSoft },
    tabPressed: { opacity: 0.72 },
    label: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    labelSelected: { color: colors.text },
  });
