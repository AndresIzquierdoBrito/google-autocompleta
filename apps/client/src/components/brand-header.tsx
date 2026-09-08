import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useAppTheme } from "@/theme/theme-context";
import { brandColors, radius, type ThemeColors } from "@/theme/tokens";

type Props = {
  onHome: () => void;
  onInfo: () => void;
};

export function ThemeToggle() {
  const { colors, mode, toggleTheme } = useAppTheme();
  const styles = createStyles(colors);
  const nextMode = mode === "light" ? "oscuro" : "claro";
  return (
    <Pressable
      accessibilityLabel={`Activar modo ${nextMode}`}
      accessibilityRole="button"
      hitSlop={4}
      onPress={toggleTheme}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Text style={styles.themeIcon}>{mode === "light" ? "☾" : "☀"}</Text>
    </Pressable>
  );
}

export function BrandHeader({ onHome, onInfo }: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  return (
    <View style={styles.header}>
      <View style={styles.leftGroup}>
        <Pressable
          accessibilityLabel="Volver al inicio"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onHome}
          style={({ pressed }) => [
            styles.homeButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.homeText}>← Inicio</Text>
        </Pressable>
      </View>
      <View
        pointerEvents="none"
        style={styles.brand}
        accessibilityLabel="Google Autocompleta"
      >
        <GoogleLetters size={width < 600 ? 22 : 32} />
        <Text style={styles.brandSuffix} numberOfLines={1}>
          Autocompleta
        </Text>
      </View>
      <View style={styles.actions}>
        <ThemeToggle />
        <Pressable
          accessibilityLabel="Información sobre el juego"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onInfo}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.infoText}>i</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, viewportWidth = 768) =>
  StyleSheet.create({
    header: {
      width: "100%",
      minHeight: 44,
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    leftGroup: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    homeButton: { minHeight: 36, justifyContent: "center" },
    homeText: { color: colors.cobalt, fontSize: 17, fontWeight: "700" },
    brand: {
      position: "absolute",
      left: 0,
      right: 0,
      justifyContent: "center",
      flexDirection: "row",
      alignItems: "baseline",
      flexShrink: 1,
    },
    brandSuffix: {
      color: colors.text,
      fontSize: viewportWidth < 600 ? 22 : 32,
      fontWeight: "700",
      letterSpacing: -0.7,
      flexShrink: 1,
    },
    actions: { flexDirection: "row", alignItems: "center", gap: 6 },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceRaised,
    },
    themeIcon: { color: colors.text, fontSize: 19, lineHeight: 21 },
    infoText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
      fontStyle: "italic",
    },
    pressed: { opacity: 0.68 },
  });

function GoogleLetters({ size }: { size: number }) {
  const letters = [
    ["G", brandColors.blue],
    ["o", brandColors.red],
    ["o", brandColors.yellow],
    ["g", brandColors.blue],
    ["l", brandColors.green],
    ["e", brandColors.red],
  ] as const;
  return (
    <Text style={{ fontSize: size, fontWeight: "700", letterSpacing: -0.7 }}>
      {letters.map(([letter, color], index) => (
        <Text key={`${letter}-${index}`} style={{ color }}>
          {letter}
        </Text>
      ))}
    </Text>
  );
}
