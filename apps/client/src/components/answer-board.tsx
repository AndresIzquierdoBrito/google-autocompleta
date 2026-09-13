import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { AnswerSlot } from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import { radius, type ThemeColors } from "@/theme/tokens";
import { formatPoints } from "@/utils/share-result";

type RowProps = {
  prompt: string;
  slot: AnswerSlot;
};

function AnswerRow({ prompt, slot }: RowProps) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  // Completed games mount a fresh board with revealed slots. Start visible so
  // the answer text is present immediately; status changes while playing are
  // still animated by the effect below.
  const [reveal] = useState(() => new Animated.Value(1));
  const previousStatus = useRef(slot.status);

  useEffect(() => {
    if (previousStatus.current === "hidden" && slot.status !== "hidden") {
      reveal.setValue(0);
      Animated.sequence([
        Animated.delay((slot.rank - 1) * 35),
        Animated.timing(reveal, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
    previousStatus.current = slot.status;
  }, [reveal, slot.rank, slot.status]);

  const isFound = slot.status === "found";
  const isRevealed = slot.status === "revealed";
  const animatedStyle = {
    opacity: reveal,
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [5, 0],
        }),
      },
    ],
  };

  return (
    <View
      accessibilityLabel={
        slot.status === "hidden"
          ? `Respuesta ${slot.rank}, oculta, ${formatPoints(slot.points)} puntos`
          : `Respuesta ${slot.rank}: ${prompt} ${slot.completion}, ${formatPoints(slot.points)} puntos`
      }
      style={[
        styles.row,
        isFound && styles.rowFound,
        isRevealed && styles.rowRevealed,
      ]}
    >
      <Text style={styles.rank}>{slot.rank}</Text>
      <View accessibilityElementsHidden style={styles.rowSearchIcon}>
        <View style={styles.rowSearchCircle} />
        <View style={styles.rowSearchHandle} />
      </View>
      <View style={styles.answer}>
        {slot.status === "hidden" ? (
          <Text style={styles.hiddenText}>Respuesta oculta</Text>
        ) : (
          <Animated.View
            style={[
              styles.answerChip,
              isFound && styles.answerChipFound,
              isRevealed && styles.answerChipRevealed,
              animatedStyle,
            ]}
          >
            <Text numberOfLines={2} style={styles.completion}>
              {slot.completion}
            </Text>
          </Animated.View>
        )}
      </View>
      <Text style={[styles.points, isFound && styles.pointsFound]}>
        {formatPoints(slot.points)}
      </Text>
    </View>
  );
}

type Props = {
  prompt: string;
  slots: AnswerSlot[];
};

export function AnswerBoard({ prompt, slots }: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  return (
    <View
      style={styles.board}
      accessibilityLabel={`Diez respuestas posibles para «${prompt}»`}
    >
      {slots.map((slot) => (
        <AnswerRow key={slot.rank} prompt={prompt} slot={slot} />
      ))}
    </View>
  );
}

const createStyles = (colors: ThemeColors, viewportWidth = 768) =>
  StyleSheet.create({
    board: {
      width: "100%",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.surface,
    },
    row: {
      minHeight: viewportWidth < 600 ? 44 : viewportWidth >= 1200 ? 38 : 50,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: viewportWidth < 600 ? 12 : 20,
    },
    rowFound: { backgroundColor: colors.greenSoft },
    rowRevealed: { backgroundColor: colors.surfaceSoft },
    rank: {
      width: viewportWidth < 600 ? 24 : 34,
      color: colors.textFaint,
      fontSize: viewportWidth < 600 ? 12 : viewportWidth >= 1200 ? 13 : 16,
      fontWeight: "800",
    },
    rowSearchIcon: {
      width: viewportWidth < 600 ? 20 : viewportWidth >= 1200 ? 21 : 26,
      height: viewportWidth < 600 ? 20 : viewportWidth >= 1200 ? 21 : 26,
      position: "relative",
      marginRight: viewportWidth < 600 ? 8 : viewportWidth >= 1200 ? 11 : 14,
    },
    rowSearchCircle: {
      position: "absolute",
      width: viewportWidth < 600 ? 12 : viewportWidth >= 1200 ? 13 : 16,
      height: viewportWidth < 600 ? 12 : viewportWidth >= 1200 ? 13 : 16,
      top: 1,
      left: 1,
      borderWidth: 2,
      borderColor: colors.textFaint,
      borderRadius: radius.pill,
    },
    rowSearchHandle: {
      position: "absolute",
      width: viewportWidth < 600 ? 8 : viewportWidth >= 1200 ? 8 : 10,
      height: 2,
      top: viewportWidth < 600 ? 13 : viewportWidth >= 1200 ? 14 : 17,
      left: viewportWidth < 600 ? 12 : viewportWidth >= 1200 ? 13 : 16,
      borderRadius: 1,
      backgroundColor: colors.textFaint,
      transform: [{ rotate: "45deg" }],
    },
    answer: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: viewportWidth < 600 ? 7 : viewportWidth >= 1200 ? 9 : 12,
      overflow: "hidden",
    },
    hiddenText: {
      color: colors.textFaint,
      fontSize: viewportWidth < 600 ? 13 : 14,
      fontWeight: "600",
      fontStyle: "italic",
    },
    answerChip: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.cobalt,
    },
    answerChipFound: { backgroundColor: colors.cobalt },
    answerChipRevealed: { backgroundColor: colors.cobalt },
    completion: {
      flexShrink: 1,
      color: colors.white,
      fontSize: viewportWidth < 600 ? 13 : viewportWidth >= 1200 ? 13 : 16,
      fontWeight: "800",
    },
    points: {
      width: viewportWidth < 600 ? 62 : viewportWidth >= 1200 ? 74 : 90,
      flexShrink: 0,
      marginLeft: 8,
      textAlign: "right",
      color: colors.textFaint,
      fontSize: viewportWidth < 600 ? 12 : viewportWidth >= 1200 ? 12 : 14,
      fontWeight: "800",
    },
    pointsFound: { color: colors.green },
  });
