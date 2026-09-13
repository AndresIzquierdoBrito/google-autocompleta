import { Pressable, StyleSheet, Text, View } from "react-native";

import type { GameState } from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";
import { formatPoints } from "@/utils/share-result";

type Props = {
  game: GameState;
  acting: boolean;
  newRecord?: boolean;
  shareMessage?: string | null;
  onShare: () => void;
  onNextRound: () => void;
  onNewRandom: () => void;
  onArchive: () => void;
};

export function GameResult({
  game,
  acting,
  newRecord = false,
  shareMessage,
  onShare,
  onNextRound,
  onNewRandom,
  onArchive,
}: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const found = game.slots.filter((slot) => slot.status === "found").length;
  const randomBetweenRounds =
    game.mode === "random" && game.status === "round_complete";
  const randomComplete = game.mode === "random" && game.status === "complete";
  const summaries = game.round_summaries ?? [];
  const totalFound = summaries.length
    ? summaries.reduce((sum, item) => sum + item.found, 0)
    : found;
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        {randomBetweenRounds
          ? `RONDA ${game.round_number} COMPLETADA`
          : "RESULTADO"}
      </Text>
      <Text style={styles.title}>
        {randomComplete
          ? `${totalFound} de ${game.total_rounds * 10} respuestas`
          : found === 10
            ? "¡Tablero perfecto!"
            : `${found} de 10 respuestas`}
      </Text>
      <Text style={styles.score}>{formatPoints(game.score)} puntos</Text>
      {randomComplete && newRecord && <Text style={styles.record}>🏆 Nuevo récord</Text>}
      {randomComplete && (
        <View style={styles.recap} accessibilityLabel="Resumen de rondas">
          {summaries.map((summary) => (
            <Text key={summary.round_number} style={styles.recapRow}>
              Ronda {summary.round_number} · {summary.category.name} · {summary.found}/10 · {formatPoints(summary.score)}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        {randomBetweenRounds && (
          <Action
            label="Siguiente ronda"
            primary
            disabled={acting}
            onPress={onNextRound}
          />
        )}
        {randomComplete && (
          <Action
            label="Nueva partida"
            primary
            disabled={acting}
            onPress={onNewRandom}
          />
        )}
        {(game.mode !== "random" || randomComplete) && (
          <>
            <Action
              label="Compartir"
              primary
              disabled={acting}
              onPress={onShare}
            />
            {game.mode !== "random" && <Action label="Ver histórico" disabled={acting} onPress={onArchive} />}
          </>
        )}
      </View>
      {shareMessage && (
        <Text accessibilityLiveRegion="polite" style={styles.shareMessage}>
          {shareMessage}
        </Text>
      )}
    </View>
  );
}

function Action({
  label,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      alignItems: "center",
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 16,
      padding: 17,
    },
    eyebrow: {
      color: colors.green,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      marginTop: 4,
    },
    score: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 3,
    },
    record: { color: colors.amber, fontSize: 12, fontWeight: "800", marginTop: 5 },
    recap: { width: "100%", marginTop: 12, gap: 4 },
    recapRow: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
    actions: { width: "100%", flexDirection: "row", gap: 8, marginTop: 14 },
    button: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    buttonPrimary: {
      backgroundColor: colors.cobalt,
      borderColor: colors.cobalt,
    },
    buttonText: { color: colors.text, fontSize: 13, fontWeight: "800" },
    buttonTextPrimary: { color: colors.white },
    shareMessage: { color: colors.textMuted, fontSize: 11, marginTop: 9 },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
  });
