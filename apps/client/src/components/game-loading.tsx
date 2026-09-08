import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";

export function GameLoading() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View accessibilityLabel="Cargando reto" style={styles.card}>
      <View style={styles.heading} />
      <View style={styles.prompt} />
      {Array.from({ length: 10 }, (_, index) => (
        <View key={index} style={styles.row} />
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: "100%",
      gap: 7,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      backgroundColor: colors.surface,
      padding: 16,
    },
    heading: {
      width: "42%",
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.surfaceSoft,
    },
    prompt: {
      width: "72%",
      height: 26,
      borderRadius: 7,
      backgroundColor: colors.surfaceSoft,
      marginBottom: 6,
    },
    row: {
      height: 32,
      borderRadius: radius.small,
      backgroundColor: colors.surfaceRaised,
    },
  });
