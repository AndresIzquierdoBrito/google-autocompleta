import { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { Category } from "@/api/types";
import { ThemeToggle } from "@/components/brand-header";
import { useAppTheme } from "@/theme/theme-context";
import {
  actionColors,
  brandColors,
  radius,
  shadow,
  type ThemeColors,
} from "@/theme/tokens";

type Props = {
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  played: number | null;
  streak: number | null;
  streakStatus: "loading" | "ready" | "error";
  onDaily: () => void;
  onArchive: () => void;
  onRandom: (category: string) => void;
  onRandomOpen: () => void;
  onRetryCategories: () => void;
  onInfo: () => void;
};

export function LandingScreen({
  categories,
  categoriesLoading,
  categoriesError,
  played,
  streak,
  streakStatus,
  onDaily,
  onArchive,
  onRandom,
  onRandomOpen,
  onRetryCategories,
  onInfo,
}: Props) {
  const [randomOpen, setRandomOpen] = useState(false);
  const { colors } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const styles = createStyles(colors);
  const titleStyle = width < 420 ? styles.titleSmall : undefined;
  const streakText = streak === null ? "—" : String(streak);
  const streakDetail =
    played === null
      ? streakStatus === "loading"
        ? "Cargando historial…"
        : "Historial no disponible"
      : `${played} ${played === 1 ? "reto jugado" : "retos jugados"}`;
  return (
    <View style={[styles.screen, { minHeight: Math.max(560, height - 18) }]}>
      <View style={styles.topActions}>
        <ThemeToggle />
        <Pressable
          accessibilityLabel="Información sobre el juego"
          accessibilityRole="button"
          onPress={onInfo}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.infoText}>i</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View
          accessibilityLabel="Google Autocompleta"
          accessibilityRole="header"
          style={styles.wordmark}
        >
          <GoogleTitle extraStyle={titleStyle} />
          <Text style={[styles.titleBottom, titleStyle]}>Autocompleta</Text>
        </View>
        <Text style={styles.subtitle}>Adivina lo que España busca</Text>

        <View style={styles.menu}>
          <View style={styles.menuRow}>
            <ModeButton label="Diario" onPress={onDaily} tone="blue" />
            <ModeButton label="Histórico" onPress={onArchive} tone="red" />
          </View>
          <ModeButton
            label="Aleatorio"
            onPress={() => {
              setRandomOpen(true);
              onRandomOpen();
            }}
            tone="green"
            wide
          />
        </View>

        <View
          accessibilityLabel={
            played === null
              ? "Historial de racha no disponible"
              : `${streakText} días de racha, ${played} retos jugados`
          }
          style={styles.streak}
        >
          <Text style={styles.streakValue}>{streakText}</Text>
          <View>
            <Text style={styles.streakLabel}>DÍAS DE RACHA</Text>
            <Text style={styles.streakDetail}>{streakDetail}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.disclaimer}>
          Juego independiente, no afiliado ni patrocinado por Google LLC. Las
          respuestas son adaptaciones inspiradas en juegos de autocompletado.
        </Text>
        <IzbriFooter />
      </View>

      <RandomSetupModal
        categories={categories}
        categoriesLoading={categoriesLoading}
        categoriesError={categoriesError}
        visible={randomOpen}
        onClose={() => setRandomOpen(false)}
        onRetry={onRetryCategories}
        onSelect={(selectedCategory) => {
          setRandomOpen(false);
          onRandom(selectedCategory);
        }}
      />
    </View>
  );
}

function GoogleTitle({ extraStyle }: { extraStyle?: object }) {
  const letters = [
    ["G", brandColors.blue],
    ["o", brandColors.red],
    ["o", brandColors.yellow],
    ["g", brandColors.blue],
    ["l", brandColors.green],
    ["e", brandColors.red],
  ] as const;
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Text accessibilityLabel="Google" style={[styles.titleTop, extraStyle]}>
      {letters.map(([letter, color], index) => (
        <Text
          accessibilityElementsHidden
          key={`${letter}-${index}`}
          style={{ color }}
        >
          {letter}
        </Text>
      ))}
    </Text>
  );
}

export function IzbriFooter() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Pressable
      accessibilityLabel="Visitar izbri.com"
      accessibilityRole="link"
      onPress={() => Linking.openURL("https://izbri.com")}
    >
      <Text style={styles.signature}>izbri.com</Text>
      <Text style={styles.copyright}>© 2026</Text>
    </Pressable>
  );
}

function ModeButton({
  label,
  tone,
  wide,
  onPress,
}: {
  label: string;
  tone: "blue" | "red" | "green";
  wide?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeButton,
        styles[
          `modeButton${tone === "blue" ? "Blue" : tone === "red" ? "Red" : "Green"}`
        ],
        wide && styles.modeButtonWide,
        pressed && styles.modeButtonPressed,
      ]}
    >
      <Text style={styles.modeButtonText}>{label}</Text>
    </Pressable>
  );
}

function RandomSetupModal({
  categories,
  categoriesLoading,
  categoriesError,
  visible,
  onClose,
  onRetry,
  onSelect,
}: {
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  visible: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (category: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={styles.modalCard}
        >
          <Text style={styles.modalEyebrow}>MODO ALEATORIO</Text>
          <Text style={styles.modalTitle}>¿Cómo quieres jugar?</Text>
          <Text style={styles.modalDescription}>
            Mezcla todas las categorías o mantén las tres rondas dentro de una
            sola.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect("todas")}
            style={({ pressed }) => [
              styles.randomAll,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.randomAllTitle}>Totalmente aleatorio</Text>
            <Text style={styles.randomAllDetail}>
              Una categoría diferente en cada ronda
            </Text>
          </Pressable>
          <Text style={styles.categoryLabel}>O ELIGE UNA CATEGORÍA</Text>
          {categoriesLoading ? (
            <Text style={styles.categoryStatus}>Cargando categorías…</Text>
          ) : categoriesError ? (
            <View style={styles.categoryError}>
              <Text style={styles.categoryStatus}>{categoriesError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={({ pressed }) => [
                  styles.retryCategory,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.retryCategoryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={styles.categoryScroll}>
              <View style={styles.categoryGrid}>
                {categories.map((category, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={category.slug}
                    onPress={() => onSelect(category.slug)}
                    style={({ pressed }) => [
                      styles.categoryOption,
                      index % 4 === 0 && styles.categoryBlue,
                      index % 4 === 1 && styles.categoryRed,
                      index % 4 === 2 && styles.categoryYellow,
                      index % 4 === 3 && styles.categoryGreen,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        index % 4 === 2 && styles.darkButtonText,
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      width: "100%",
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
      paddingBottom: 18,
    },
    topActions: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
    },
    infoText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
      fontStyle: "italic",
    },
    hero: { width: "100%", alignItems: "center", marginTop: -18 },
    wordmark: { alignItems: "center" },
    titleTop: {
      color: colors.text,
      fontSize: 51,
      lineHeight: 55,
      fontWeight: "700",
      letterSpacing: -2.1,
    },
    titleBottom: {
      color: colors.text,
      fontSize: 51,
      lineHeight: 55,
      fontWeight: "700",
      letterSpacing: -2.1,
    },
    titleSmall: { fontSize: 40, lineHeight: 44, letterSpacing: -1.6 },
    subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
    menu: { width: "100%", maxWidth: 560, gap: 12, marginTop: 38 },
    menuRow: { width: "100%", flexDirection: "row", gap: 12 },
    modeButton: {
      minHeight: 54,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      borderWidth: 1,
      borderColor: "transparent",
      ...shadow,
    },
    modeButtonBlue: { backgroundColor: actionColors.blue },
    modeButtonRed: { backgroundColor: actionColors.red },
    modeButtonGreen: { backgroundColor: actionColors.green },
    modeButtonWide: { width: "100%", flexBasis: "auto", flexGrow: 0 },
    modeButtonPressed: {
      opacity: 0.84,
      transform: [{ scale: 0.99 }],
    },
    modeButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
    streak: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 48,
    },
    streakValue: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 35,
      fontWeight: "700",
    },
    streakLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    streakDetail: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    footer: { alignItems: "center", gap: 10 },
    disclaimer: {
      maxWidth: 590,
      color: colors.textFaint,
      fontSize: 9,
      lineHeight: 12,
      textAlign: "center",
    },
    signature: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    copyright: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "600",
      marginTop: 2,
    },
    modalBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(32,33,36,0.62)",
      padding: 18,
    },
    modalCard: {
      width: "100%",
      maxWidth: 500,
      borderRadius: radius.large,
      backgroundColor: colors.surface,
      padding: 22,
      ...shadow,
    },
    modalEyebrow: {
      color: brandColors.green,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.3,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 25,
      fontWeight: "700",
      marginTop: 4,
    },
    modalDescription: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },
    randomAll: {
      minHeight: 62,
      justifyContent: "center",
      borderRadius: radius.medium,
      backgroundColor: actionColors.green,
      paddingHorizontal: 16,
      marginTop: 18,
    },
    randomAllTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
    randomAllDetail: { color: "#E6F4EA", fontSize: 11, marginTop: 2 },
    categoryLabel: {
      color: colors.textFaint,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
      marginTop: 18,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
    },
    categoryOption: {
      width: "47%",
      flexGrow: 1,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      paddingHorizontal: 8,
    },
    categoryScroll: { maxHeight: 340 },
    categoryStatus: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 12,
    },
    categoryError: { alignItems: "center" },
    retryCategory: {
      minHeight: 38,
      justifyContent: "center",
      borderRadius: radius.small,
      backgroundColor: colors.surfaceSoft,
      paddingHorizontal: 16,
      marginTop: 10,
    },
    retryCategoryText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    categoryBlue: { backgroundColor: actionColors.blue },
    categoryRed: { backgroundColor: actionColors.red },
    categoryYellow: { backgroundColor: actionColors.yellow },
    categoryGreen: { backgroundColor: actionColors.green },
    categoryOptionText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
    },
    darkButtonText: { color: "#202124" },
    cancelButton: {
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    pressed: { opacity: 0.68 },
  });
