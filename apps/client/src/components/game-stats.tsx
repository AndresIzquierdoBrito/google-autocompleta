import { StyleSheet, Text, View } from "react-native";

import type { GameState } from "@/api/types";
import { StrikeMeter } from "@/components/strike-meter";
import { useAppTheme } from "@/theme/theme-context";
import type { ThemeColors } from "@/theme/tokens";
import { formatPoints } from "@/utils/share-result";

type Props = {
  game: GameState;
  bestScore?: number;
};

export function GameStats({ game, bestScore = 0 }: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const entries = [
    {
      label: game.mode === "random" ? "RONDA" : game.puzzle_number ? `RETO #${game.puzzle_number}` : "RETO",
      value:
        game.mode === "random"
          ? `${game.round_number}/${game.total_rounds}`
          : game.category.name,
    },
    ...(game.mode === "random"
      ? [{ label: "CATEGORÍA", value: game.category.name }]
      : []),
    { label: "PUNTOS", value: formatPoints(game.score) },
  ];
  return (
    <View
      style={styles.container}
      accessibilityLabel={bestScore > 0 ? `Mejor puntuación: ${formatPoints(bestScore)}` : undefined}
    >
      {entries.map((entry, index) => (
        <View
          key={entry.label}
          style={[styles.item, index > 0 && styles.divider]}
        >
          <Text style={styles.label}>{entry.label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {entry.value}
          </Text>
        </View>
      ))}
      <View style={[styles.item, styles.divider]}>
        <Text style={styles.label}>FALLOS</Text>
        <StrikeMeter misses={game.misses} />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: "100%",
      flexDirection: "row",
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    item: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
    },
    divider: { borderLeftWidth: 1, borderLeftColor: colors.border },
    label: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    value: {
      color: colors.text,
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "800",
      marginTop: 1,
    },
  });
