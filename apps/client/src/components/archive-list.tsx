import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ArchivePuzzle } from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";

type Props = {
  puzzles: ArchivePuzzle[];
  loading: boolean;
  completedDates: Set<string>;
  onSelect: (puzzle: ArchivePuzzle) => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00`))
    .replace(".", "");
}

export function ArchiveList({
  puzzles,
  loading,
  completedDates,
  onSelect,
}: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>HEMEROTECA</Text>
          <Text style={styles.title}>Retos anteriores</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{puzzles.length} retos</Text>
        </View>
      </View>
      <Text style={styles.description}>
        Cada reto guarda las respuestas de su día. Solo tienes un intento por
        fecha.
      </Text>
      {loading ? (
        <View style={styles.loadingGrid}>
          {Array.from({ length: 8 }, (_, index) => (
            <View key={index} style={styles.skeleton} />
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {puzzles.map((puzzle) => {
            const complete = completedDates.has(puzzle.date);
            return (
              <Pressable
                key={puzzle.date}
                accessibilityRole="button"
                accessibilityLabel={`Reto ${puzzle.number}, ${puzzle.category.name}, ${formatDate(puzzle.date)}${complete ? ", completado" : ""}`}
                onPress={() => onSelect(puzzle)}
                style={({ pressed }) => [
                  styles.card,
                  complete && styles.cardComplete,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.number}>#{puzzle.number}</Text>
                  <Text
                    style={[styles.status, complete && styles.statusComplete]}
                  >
                    {complete ? "✓" : "→"}
                  </Text>
                </View>
                <Text style={styles.category}>{puzzle.category.name}</Text>
                <Text style={styles.date}>{formatDate(puzzle.date)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: "100%",
      padding: 20,
      backgroundColor: colors.surface,
    },
    headingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    eyebrow: {
      color: colors.cobalt,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
    },
    title: {
      color: colors.text,
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.6,
      marginTop: 3,
    },
    countPill: {
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surfaceSoft,
    },
    countText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    description: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
      marginBottom: 18,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    loadingGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    skeleton: {
      width: "47%",
      minWidth: 130,
      flexGrow: 1,
      height: 103,
      borderRadius: radius.medium,
      backgroundColor: colors.surfaceSoft,
    },
    card: {
      width: "47%",
      minWidth: 130,
      flexGrow: 1,
      minHeight: 103,
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
      padding: 13,
    },
    cardComplete: {
      borderColor: colors.green,
      backgroundColor: colors.greenSoft,
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    number: { color: colors.text, fontSize: 15, fontWeight: "900" },
    status: { color: colors.cobalt, fontSize: 18, fontWeight: "800" },
    statusComplete: { color: colors.green },
    category: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 10,
    },
    date: {
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: "600",
      marginTop: 2,
      textTransform: "capitalize",
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
