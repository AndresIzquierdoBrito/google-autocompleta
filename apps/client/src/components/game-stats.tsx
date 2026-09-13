import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

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
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  const meterSize =
    width < 600
      ? Math.max(16, Math.min(22, Math.floor(((width - 32) / 4 - 6) / 4)))
      : 26;
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
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            style={styles.label}
          >
            {entry.label}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {entry.value}
          </Text>
        </View>
      ))}
      <View style={[styles.item, styles.divider]}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={1}
          style={styles.label}
        >
          FALLOS
        </Text>
        <StrikeMeter
          misses={game.misses}
          numeric={width < 600}
          size={meterSize}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, viewportWidth = 768) =>
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
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: viewportWidth < 600 ? 2 : 0,
      paddingVertical: viewportWidth < 600 ? 8 : 10,
    },
    divider: { borderLeftWidth: 1, borderLeftColor: colors.border },
    label: {
      color: colors.textFaint,
      fontSize: viewportWidth < 360 ? 9 : 12,
      fontWeight: "800",
      letterSpacing:
        viewportWidth < 360 ? 0.4 : viewportWidth < 390 ? 0.8 : 1.2,
      maxWidth: "100%",
    },
    value: {
      color: colors.text,
      fontSize: viewportWidth < 360 ? 16 : 19,
      lineHeight: 23,
      fontWeight: "800",
      marginTop: 1,
    },
  });
