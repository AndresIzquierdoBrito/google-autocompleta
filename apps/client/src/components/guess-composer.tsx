import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { ReactNode } from "react";

import type { GameState } from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import {
  actionColors,
  radius,
  shadow,
  type ThemeColors,
} from "@/theme/tokens";

type Props = {
  game: GameState;
  acting: boolean;
  feedbackId: number;
  onSubmit: (guess: string) => Promise<boolean | void>;
  onGiveUp: () => void;
  children?: ReactNode;
};

export function GuessComposer({
  game,
  acting,
  feedbackId,
  onSubmit,
  onGiveUp,
  children,
}: Props) {
  const { colors, mode } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  const compact = width < 600;
  const [guess, setGuess] = useState("");
  const [focused, setFocused] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const input = useRef<TextInput>(null);
  const lastHandledFeedback = useRef(0);

  useEffect(() => {
    if (feedbackId === 0 || feedbackId === lastHandledFeedback.current) return;
    lastHandledFeedback.current = feedbackId;
    if (game.last_result?.outcome === "incorrect") {
      Animated.sequence(
        [-7, 7, -5, 5, 0].map((value) =>
          Animated.timing(shake, {
            toValue: value,
            duration: 55,
            easing: Easing.linear,
            useNativeDriver: Platform.OS !== "web",
          }),
        ),
      ).start();
    }
    input.current?.focus();
  }, [feedbackId, game.last_result?.outcome, shake]);

  const submit = async () => {
    const value = guess.trim();
    if (!value || acting) return;
    const accepted = await onSubmit(value);
    if (accepted !== false) setGuess("");
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.eyebrow}>¿CÓMO COMPLETA ESPAÑA ESTA BÚSQUEDA?</Text>
      {compact && <Text style={styles.promptAbove}>{game.prompt}</Text>}
      <Animated.View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          { transform: [{ translateX: shake }] },
        ]}
      >
        <View accessibilityElementsHidden style={styles.searchIcon}>
          <View style={styles.searchCircle} />
          <View style={styles.searchHandle} />
        </View>
        {!compact && (
          <Text style={styles.prompt} numberOfLines={2}>
            {game.prompt}
          </Text>
        )}
        <TextInput
          ref={input}
          accessibilityLabel="Escribe la parte que falta de la búsqueda"
          autoCapitalize="none"
          autoCorrect={false}
          enterKeyHint="send"
          maxLength={80}
          onChangeText={setGuess}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onSubmitEditing={submit}
          placeholder="completa…"
          placeholderTextColor={colors.textFaint}
          returnKeyType="send"
          style={styles.input}
          value={guess}
        />
      </Animated.View>
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          disabled={!guess.trim() || acting}
          onPress={submit}
          style={({ pressed }) => [
            styles.actionButton,
            styles.submitButton,
            mode === "dark" && styles.darkSubmitButton,
            (!guess.trim() || acting) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.submitButtonText}>{acting ? "…" : "Probar"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={acting}
          onPress={onGiveUp}
          style={({ pressed }) => [
            styles.actionButton,
            styles.giveUpButton,
            acting && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.giveUpButtonText}>Rendirse</Text>
        </Pressable>
      </View>
      <View style={styles.metaRow}>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.feedback,
            game.last_result?.outcome === "correct" && styles.feedbackCorrect,
            game.last_result?.outcome === "too_broad" && styles.feedbackBroad,
            game.last_result?.outcome === "incorrect" && styles.feedbackWrong,
          ]}
        >
          {game.last_result?.message ??
            `${game.misses_remaining} intentos antes de revelar`}
        </Text>
      </View>
      {children && <View style={styles.options}>{children}</View>}
    </View>
  );
}

const createStyles = (colors: ThemeColors, viewportWidth = 768) =>
  StyleSheet.create({
    wrapper: { width: "100%", gap: 4 },
    eyebrow: {
      color: colors.textMuted,
      fontSize: viewportWidth >= 1200 ? 12 : 10,
      fontWeight: "800",
      letterSpacing: 1.5,
      marginBottom: 3,
    },
    inputRow: {
      minHeight: viewportWidth >= 1200 ? 46 : 54,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      padding: 8,
      paddingLeft: 16,
      backgroundColor: colors.surface,
      ...shadow,
    },
    inputRowFocused: {
      borderColor: colors.borderStrong,
      borderWidth: 2,
    },
    input: {
      flex: 1,
      minWidth: 70,
      marginLeft: 10,
      color: colors.text,
      fontSize: viewportWidth >= 1200 ? 15 : 16,
      fontWeight: "700",
      paddingVertical: 0,
    },
    promptAbove: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: "800",
      marginBottom: 2,
    },
    prompt: {
      maxWidth: "52%",
      color: colors.text,
      fontSize: viewportWidth >= 1200 ? 18 : viewportWidth < 600 ? 16 : 18,
      lineHeight: viewportWidth >= 1200 ? 22 : viewportWidth < 600 ? 21 : 23,
      fontWeight: "800",
      flexShrink: 1,
    },
    searchIcon: { width: 24, height: 24, position: "relative", marginRight: 12 },
    searchCircle: {
      position: "absolute",
      width: 15,
      height: 15,
      top: 1,
      left: 1,
      borderWidth: 3,
      borderColor: colors.textFaint,
      borderRadius: radius.pill,
    },
    searchHandle: {
      position: "absolute",
      width: 9,
      height: 3,
      top: 16,
      left: 15,
      borderRadius: 1,
      backgroundColor: colors.textFaint,
      transform: [{ rotate: "45deg" }],
    },
    actionsRow: { flexDirection: "row", gap: 14, marginTop: 10 },
    options: { width: "100%", marginTop: 7, marginBottom: 3 },
    actionButton: {
      flex: 1,
      minHeight: viewportWidth >= 1200 ? 45 : 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
    },
    giveUpButton: { backgroundColor: colors.surfaceSoft },
    submitButton: { backgroundColor: colors.cobalt },
    darkSubmitButton: { backgroundColor: actionColors.blue },
    giveUpButtonText: {
      color: colors.text,
      fontSize: viewportWidth >= 1200 ? 16 : 16,
      fontWeight: "700",
    },
    submitButtonText: {
      color: colors.white,
      fontSize: viewportWidth >= 1200 ? 16 : 16,
      fontWeight: "800",
    },
    metaRow: {
      minHeight: 24,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 3,
      gap: 12,
    },
    feedback: { color: colors.textMuted, fontSize: 11, flex: 1 },
    feedbackCorrect: { color: colors.green, fontWeight: "700" },
    feedbackBroad: { color: colors.textMuted, fontWeight: "700" },
    feedbackWrong: { color: colors.danger, fontWeight: "700" },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.7 },
  });
