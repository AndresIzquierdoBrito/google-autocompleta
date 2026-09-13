import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getCurrentDaily, listArchive, listCategories } from "@/api/client";
import type { ArchivePuzzle, Category } from "@/api/types";
import { AnswerBoard } from "@/components/answer-board";
import { ArchiveList } from "@/components/archive-list";
import { BrandHeader } from "@/components/brand-header";
import { GameLoading } from "@/components/game-loading";
import { GameResult } from "@/components/game-result";
import { GameStats } from "@/components/game-stats";
import { GuessComposer } from "@/components/guess-composer";
import { IzbriFooter, LandingScreen } from "@/components/landing-screen";
import type { UiMode } from "@/components/mode-tabs";
import { useGameSession } from "@/hooks/use-game-session";
import {
  getCompletedArchiveDates,
  getRecentRandomPuzzleIds,
  getStreakStats,
  migrateDailySession,
  sessionKey,
  type StreakStats,
} from "@/storage/game-storage";
import { useAppTheme } from "@/theme/theme-context";
import { radius, shadow, type ThemeColors } from "@/theme/tokens";
import { buildShareText } from "@/utils/share-result";

function formatArchiveDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  const [landing, setLanding] = useState(true);
  const [mode, setMode] = useState<UiMode>("daily");
  const [streak, setStreak] = useState<StreakStats>({ current: 0, played: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [archive, setArchive] = useState<ArchivePuzzle[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("todas");
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const modeRequest = useRef(0);
  const session = useGameSession();

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const result = await listCategories();
      if (result.length === 0) throw new Error("No hay categorías disponibles.");
      setCategories(result);
    } catch (caught) {
      setCategoriesError(
        caught instanceof Error
          ? caught.message
          : "No se pudieron cargar las categorías.",
      );
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    const categoriesRequest = setTimeout(() => {
      loadCategories().catch(() => undefined);
    }, 0);
    getCurrentDaily()
      .then((current) => getStreakStats(current.date, current.timezone))
      .then(setStreak)
      .catch(() => getStreakStats().then(setStreak).catch(() => undefined));
    return () => clearTimeout(categoriesRequest);
  }, [loadCategories]);

  const refreshArchive = async () => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const [puzzles, dates] = await Promise.all([
        listArchive(),
        getCompletedArchiveDates(),
      ]);
      setArchive(puzzles);
      setCompletedDates(dates);
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : "No se pudo cargar el histórico.");
    } finally {
      setArchiveLoading(false);
    }
  };

  const changeMode = (nextMode: UiMode) => {
    const requestId = ++modeRequest.current;
    setLanding(false);
    setMode(nextMode);
    setShareMessage(null);
    setModeError(null);
    setArchiveDate(null);
    if (nextMode === "daily") {
      getCurrentDaily()
        .then((current) => {
          if (requestId !== modeRequest.current) return;
          return migrateDailySession(current.date).then(() =>
            requestId === modeRequest.current
              ? session.start({ mode: "daily" }, sessionKey.daily(current.date))
              : undefined,
          );
        })
        .catch(() => {
          if (requestId === modeRequest.current) {
            session.resetView();
            setModeError("No se pudo cargar el reto de hoy. Inténtalo de nuevo.");
          }
        });
    } else if (nextMode === "random") {
      getRecentRandomPuzzleIds(category)
        .then((recent_puzzle_ids) =>
          session.start(
            { mode: "random", category, recent_puzzle_ids },
            sessionKey.random(category),
          ),
        )
        .catch(() => session.start({ mode: "random", category }, sessionKey.random(category)));
    } else {
      session.resetView();
      refreshArchive().catch(() => undefined);
    }
  };

  const returnHome = () => {
    modeRequest.current += 1;
    setLanding(true);
    setArchiveDate(null);
    setShareMessage(null);
    session.resetView();
    getStreakStats()
      .then(setStreak)
      .catch(() => undefined);
  };

  const startRandomWithCategory = (selectedCategory: string) => {
    modeRequest.current += 1;
    setLanding(false);
    setMode("random");
    setCategory(selectedCategory);
    setShareMessage(null);
    setModeError(null);
    setArchiveDate(null);
    getRecentRandomPuzzleIds(selectedCategory)
      .then((recent_puzzle_ids) =>
        session.start(
          { mode: "random", category: selectedCategory, recent_puzzle_ids },
          sessionKey.random(selectedCategory),
        ),
      )
      .catch(() => session.start({ mode: "random", category: selectedCategory }, sessionKey.random(selectedCategory)));
  };

  const selectArchivePuzzle = (puzzle: ArchivePuzzle) => {
    modeRequest.current += 1;
    setArchiveDate(puzzle.date);
    session.start(
      { mode: "archive", date: puzzle.date },
      sessionKey.archive(puzzle.date),
    );
  };

  const startNewRandom = () => {
    modeRequest.current += 1;
    getRecentRandomPuzzleIds(category)
      .then((recent_puzzle_ids) =>
        session.start(
          { mode: "random", category, recent_puzzle_ids },
          sessionKey.random(category),
          true,
        ),
      )
      .catch(() =>
        session.start({ mode: "random", category }, sessionKey.random(category), true),
      );
  };

  const shareResult = async () => {
    if (!session.game) return;
    const message = buildShareText(session.game);
    try {
      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({ text: message });
          setShareMessage("Resultado compartido.");
        } else {
          await navigator.clipboard.writeText(message);
          setShareMessage("Resultado copiado al portapapeles.");
        }
      } else {
        await Share.share({ message });
        setShareMessage("Resultado listo para compartir.");
      }
    } catch {
      setShareMessage("No se pudo compartir el resultado.");
    }
  };

  const returnToArchive = () => {
    setArchiveDate(null);
    session.resetView();
    refreshArchive().catch(() => undefined);
  };

  const game = session.game;
  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {landing ? (
              <LandingScreen
                categories={categories}
                categoriesLoading={categoriesLoading}
                categoriesError={categoriesError}
                played={streak.played}
                streak={streak.current}
                onDaily={() => changeMode("daily")}
                onArchive={() => changeMode("archive")}
                onRandom={startRandomWithCategory}
                onRandomOpen={() => {
                  if (!categories.length || categoriesError) {
                    loadCategories().catch(() => undefined);
                  }
                }}
                onRetryCategories={() => loadCategories().catch(() => undefined)}
                onInfo={() => setInfoOpen(true)}
              />
            ) : (
              <>
                <BrandHeader
                  onHome={returnHome}
                  onInfo={() => setInfoOpen(true)}
                />
                {mode === "archive" && archiveDate === null ? (
                  archiveError ? (
                    <ErrorCard message={archiveError} onRetry={refreshArchive} />
                  ) : (
                    <ArchiveList
                      puzzles={archive}
                      loading={archiveLoading}
                      completedDates={completedDates}
                      onSelect={selectArchivePuzzle}
                    />
                  )
                ) : session.loading ? (
                  <GameLoading />
                ) : (session.error || modeError) && !game ? (
                  <ErrorCard
                    message={session.error ?? modeError ?? "No se pudo cargar el juego."}
                    onRetry={() => {
                      setModeError(null);
                      if (mode === "daily") changeMode("daily");
                      else if (mode === "random") changeMode("random");
                      else if (archiveDate) {
                        const puzzle = archive.find(
                          (item) => item.date === archiveDate,
                        );
                        if (puzzle) selectArchivePuzzle(puzzle);
                      }
                    }}
                  />
                ) : game ? (
                  <>
                    <GameStats game={game} bestScore={session.bestScore} />
                    <View style={styles.gameCard}>
                    {mode !== "random" && (
                      <View style={styles.gameTopline}>
                        {mode === "archive" ? (
                          <View style={styles.archiveTopline}>
                            <Pressable
                              onPress={returnToArchive}
                              style={styles.backButton}
                            >
                              <Text style={styles.backText}>← Histórico</Text>
                            </Pressable>
                            {game.puzzle_date && (
                              <Text style={styles.archiveDate}>
                                {formatArchiveDate(game.puzzle_date)}
                              </Text>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.dailyDate}>HOY</Text>
                        )}
                      </View>
                    )}

                    {game.status === "playing" ? (
                      <GuessComposer
                        game={game}
                        acting={session.acting}
                        feedbackId={session.feedbackId}
                        onSubmit={session.submitGuess}
                        onGiveUp={() => setConfirmGiveUp(true)}
                      >
                        <AnswerBoard prompt={game.prompt} slots={game.slots} />
                      </GuessComposer>
                    ) : (
                      <>
                        <GameResult
                          game={game}
                          acting={session.acting}
                          newRecord={session.newRecord}
                          shareMessage={shareMessage}
                          onShare={shareResult}
                          onNextRound={session.nextRound}
                          onNewRandom={startNewRandom}
                          onArchive={() => changeMode("archive")}
                        />
                        <AnswerBoard prompt={game.prompt} slots={game.slots} />
                      </>
                    )}

                    {session.error && game && (
                      <Text
                        accessibilityLiveRegion="assertive"
                        style={styles.inlineError}
                      >
                        {session.error}
                      </Text>
                    )}
                    </View>
                  </>
                ) : null}

                <Text style={styles.disclaimer}>
                  Google Autocompleta es un juego independiente y no está
                  afiliado, patrocinado ni aprobado por Google LLC. Google es
                  una marca de Google LLC. Las respuestas son adaptaciones
                  curadas inspiradas en juegos de autocompletado.
                </Text>
                <View style={styles.gameFooter}>
                  <IzbriFooter />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <InfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
      <ConfirmModal
        visible={confirmGiveUp}
        onCancel={() => setConfirmGiveUp(false)}
        onConfirm={() => {
          setConfirmGiveUp(false);
          session.giveUp();
        }}
      />
    </View>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.errorCard}>
      <Text style={styles.errorTitle}>No hemos podido cargar el reto</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>Volver a intentar</Text>
      </Pressable>
    </View>
  );
}

function InfoModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <ScrollView
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="handled"
        >
        <Pressable
          accessibilityViewIsModal
          style={styles.modalCard}
          onPress={() => undefined}
        >
          <Text style={styles.modalEyebrow}>CÓMO SE JUEGA</Text>
          <Text style={styles.modalTitle}>Piensa como busca España</Text>
          <Text style={styles.modalBody}>
            Adivina diez predicciones capturadas para completar la frase. No son
            un ranking oficial de Google. Puedes
            escribir una palabra distintiva, la parte que falta o la búsqueda
            completa. Tienes cuatro fallos por ronda.
          </Text>
          <View style={styles.infoRows}>
            <Text style={styles.infoRow}>
              ● Diario — el mismo reto para todos, una vez al día.
            </Text>
            <Text style={styles.infoRow}>
              ● Histórico — recupera los retos de fechas anteriores.
            </Text>
            <Text style={styles.infoRow}>
              ● Aleatorio — tres rondas y puntuación acumulada.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.modalPrimary}
          >
            <Text style={styles.modalPrimaryText}>Entendido</Text>
          </Pressable>
        </Pressable>
        </ScrollView>
      </Pressable>
    </Modal>
  );
}

function ConfirmModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.confirmCard}>
          <Text style={styles.modalTitle}>¿Revelar las respuestas?</Text>
          <Text style={styles.modalBody}>
            Esta ronda terminará y contará como jugada.
          </Text>
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.confirmSecondary}>
              <Text style={styles.confirmSecondaryText}>Seguir jugando</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={styles.confirmDanger}>
              <Text style={styles.confirmDangerText}>Revelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, viewportWidth = 768) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    safeArea: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      alignItems: "center",
      paddingHorizontal: viewportWidth < 600 ? 16 : 24,
      paddingTop: viewportWidth < 600 ? 20 : 24,
      paddingBottom: 24,
    },
    content: {
      width: "100%",
      maxWidth: 880,
      gap: 14,
    },
    gameCard: {
      width: "100%",
      gap: viewportWidth < 600 ? 10 : 8,
      padding: 0,
      backgroundColor: "transparent",
    },
    gameTopline: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    categoryBadge: {
      minHeight: 26,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      backgroundColor: colors.cobaltSoft,
    },
    categoryDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.cobalt,
    },
    categoryText: { color: colors.cobalt, fontSize: 14, fontWeight: "800" },
    dailyDate: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    backButton: {
      minHeight: 38,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    backText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
    archiveTopline: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    archiveDate: {
      color: colors.textFaint,
      flexShrink: 1,
      fontSize: 12,
      fontWeight: "700",
      textAlign: "right",
      textTransform: "capitalize",
    },
    questionBlock: { gap: 4 },
    eyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.25,
    },
    searchBar: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      ...shadow,
    },
    searchIcon: {
      width: 18,
      height: 18,
      position: "relative",
    },
    searchCircle: {
      position: "absolute",
      width: 11,
      height: 11,
      top: 1,
      left: 1,
      borderWidth: 2,
      borderColor: colors.textFaint,
      borderRadius: radius.pill,
    },
    searchHandle: {
      position: "absolute",
      width: 7,
      height: 2,
      top: 12,
      left: 11,
      borderRadius: 1,
      backgroundColor: colors.textFaint,
      transform: [{ rotate: "45deg" }],
    },
    prompt: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      flexShrink: 1,
      letterSpacing: -0.25,
    },
    cursor: {
      width: 2,
      height: 27,
      backgroundColor: colors.cobalt,
      borderRadius: 1,
    },
    inlineError: { color: colors.danger, fontSize: 14, textAlign: "center" },
    disclaimer: {
      maxWidth: 650,
      alignSelf: "center",
      color: colors.textFaint,
      fontSize: 9,
      lineHeight: 12,
      textAlign: "center",
      paddingHorizontal: 12,
      paddingVertical: 3,
    },
    gameFooter: { alignItems: "center", paddingTop: 5, paddingBottom: 9 },
    errorCard: {
      alignItems: "center",
      borderRadius: radius.large,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 28,
    },
    errorTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
    },
    errorMessage: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
      marginTop: 7,
    },
    retryButton: {
      minHeight: 44,
      borderRadius: radius.small,
      backgroundColor: colors.cobalt,
      paddingHorizontal: 20,
      justifyContent: "center",
      marginTop: 18,
    },
    retryText: { color: colors.white, fontSize: 13, fontWeight: "800" },
    modalBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.72)",
      padding: 20,
    },
    modalScrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 480,
      borderRadius: radius.large,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceRaised,
      padding: 23,
      ...shadow,
    },
    confirmCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: radius.large,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceRaised,
      padding: 23,
      ...shadow,
    },
    modalEyebrow: {
      color: colors.cobalt,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.5,
      marginTop: 4,
    },
    modalBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 9,
    },
    infoRows: { gap: 9, marginTop: 17 },
    infoRow: { color: colors.text, fontSize: 13, lineHeight: 18 },
    modalPrimary: {
      minHeight: 46,
      borderRadius: radius.small,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.cobalt,
      marginTop: 21,
    },
    modalPrimaryText: { color: colors.white, fontSize: 14, fontWeight: "800" },
    confirmActions: { flexDirection: "row", gap: 8, marginTop: 20 },
    confirmSecondary: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    confirmSecondaryText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    confirmDanger: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.small,
      backgroundColor: colors.danger,
    },
    confirmDangerText: { color: colors.white, fontSize: 13, fontWeight: "800" },
  });
