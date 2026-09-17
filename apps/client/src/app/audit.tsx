import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import {
  fetchFreeAuditSuggestions,
  fetchPromptVariants,
  listAuditBoards,
} from "@/api/client";
import type {
  AuditBoard,
  AuditCandidate,
  AuditPack,
  PromptVariant,
} from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import { radius, shadow, type ThemeColors } from "@/theme/tokens";

const DRAFT_KEY = "@google-autocompleta:content-audit:v5";

type SelectionMap = Record<string, string[]>;
type PromptMap = Record<string, string>;
type CandidateView = AuditCandidate & { current: boolean };

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function candidateFromEnding(prompt: string, ending: string): CandidateView {
  return {
    text: `${prompt} ${ending}`.trim(),
    ending,
    source_query: prompt,
    source_rank: 0,
    exact_prompt_query: true,
    current: true,
  };
}

function initialSelections(boards: AuditBoard[]): SelectionMap {
  return Object.fromEntries(boards.map((board) => [board.id, board.completions]));
}

function downloadPack(pack: AuditPack, selections: SelectionMap, prompts: PromptMap): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const content = {
    content_version: "5",
    status: "draft-needs-editorial-review",
    generated_at: new Date().toISOString().slice(0, 10),
    boards: pack.boards.map((board) => ({
      id: board.id,
      category: board.category,
      category_name: board.category_name,
      prompt: prompts[board.id] ?? board.prompt,
      completions: selections[board.id] ?? board.completions,
      aliases: board.aliases,
      eligibility: board.eligibility,
      source: board.source,
      review: board.review,
    })),
  };
  const blob = new Blob([`${JSON.stringify(content, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "boards-v5-curated.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AuditScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const styles = createStyles(colors, width);
  const [pack, setPack] = useState<AuditPack | null>(null);
  const [boardIndex, setBoardIndex] = useState(0);
  const [selections, setSelections] = useState<SelectionMap>({});
  const [promptDrafts, setPromptDrafts] = useState<PromptMap>({});
  const [liveCandidates, setLiveCandidates] = useState<Record<string, AuditCandidate[]>>({});
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreCandidates, setExploreCandidates] = useState<AuditCandidate[]>([]);
  const [exploreQueriesRun, setExploreQueriesRun] = useState(0);
  const [exploreFailedQueries, setExploreFailedQueries] = useState(0);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const [promptVariants, setPromptVariants] = useState<PromptVariant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);

  useEffect(() => {
    listAuditBoards()
      .then((nextPack) => {
        setPack(nextPack);
        setSelections(initialSelections(nextPack.boards));
        setPromptDrafts(Object.fromEntries(nextPack.boards.map((board) => [board.id, board.prompt])));
        AsyncStorage.getItem(DRAFT_KEY)
          .then((saved) => {
            if (!saved) return;
            const parsed = JSON.parse(saved) as SelectionMap & {
              selections?: SelectionMap;
              prompts?: PromptMap;
            };
            setSelections((current) => ({
              ...current,
              ...(parsed.selections ?? parsed),
            }));
            if (parsed.prompts) setPromptDrafts((current) => ({ ...current, ...parsed.prompts }));
          })
          .catch(() => undefined);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "No se pudo cargar el auditor.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (Object.keys(selections).length > 0) {
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ selections, prompts: promptDrafts }),
      ).catch(() => undefined);
    }
  }, [promptDrafts, selections]);

  const board = pack?.boards[boardIndex] ?? null;
  const selected = useMemo(
    () => (board ? selections[board.id] ?? board.completions : []),
    [board, selections],
  );
  const boardPrompt = board ? promptDrafts[board.id] ?? board.prompt : "";
  const selectedKeys = useMemo(() => new Set(selected.map(normalize)), [selected]);
  const candidates = useMemo(() => {
    if (!board) return [];
    const combined: CandidateView[] = board.completions.map((ending) =>
      candidateFromEnding(boardPrompt, ending),
    );
    const snapshotCandidates =
      boardPrompt === board.prompt
        ? (board.audit?.google_suggestions ?? []).map((text, index) => ({
            text,
            ending: text.slice(board.prompt.length).trim(),
            source_query: board.prompt,
            source_rank: index + 1,
            exact_prompt_query: true,
            current: false,
          }))
        : [];
    const live = (liveCandidates[board.id] ?? []).map((candidate) => ({
      ...candidate,
      current: false,
    }));
    const all = [...combined, ...snapshotCandidates, ...live];
    const seen = new Set<string>();
    return all.filter((candidate) => {
      const key = normalize(candidate.ending);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [board, boardPrompt, liveCandidates]);

  const completeBoardCount = pack
    ? pack.boards.filter((item) => (selections[item.id] ?? item.completions).length === 10).length
    : 0;
  const canExport = Boolean(pack && completeBoardCount === pack.boards.length);

  const toggleSelection = (ending: string) => {
    if (!board) return;
    setSelections((current) => {
      const existing = current[board.id] ?? board.completions;
      const key = normalize(ending);
      const next = existing.some((item) => normalize(item) === key)
        ? existing.filter((item) => normalize(item) !== key)
        : [...existing, ending];
      return { ...current, [board.id]: next };
    });
  };

  const scanFreeQuery = async () => {
    const query = exploreQuery.trim();
    if (!query) return;
    setExploreLoading(true);
    setExploreError(null);
    try {
      const response = await fetchFreeAuditSuggestions(query);
      setExploreCandidates(response.candidates);
      setExploreQueriesRun(response.queries_run);
      setExploreFailedQueries(response.failed_queries);
    } catch (caught) {
      setExploreError(caught instanceof Error ? caught.message : "No se pudieron cargar candidatos.");
      setExploreCandidates([]);
    } finally {
      setExploreLoading(false);
    }
  };

  const updateBoardPrompt = (prompt: string) => {
    if (!board) return;
    setPromptDrafts((current) => ({ ...current, [board.id]: prompt }));
    setSelections((current) => ({ ...current, [board.id]: [] }));
    setLiveCandidates((current) => {
      const next = { ...current };
      delete next[board.id];
      return next;
    });
  };

  const analyzePromptVariants = async () => {
    if (!boardPrompt.trim()) return;
    setVariantLoading(true);
    setVariantError(null);
    try {
      const response = await fetchPromptVariants(boardPrompt);
      setPromptVariants(response.variants);
    } catch (caught) {
      setVariantError(caught instanceof Error ? caught.message : "No se pudieron analizar variantes.");
      setPromptVariants([]);
    } finally {
      setVariantLoading(false);
    }
  };

  const applyPromptVariant = (prompt: string) => {
    if (!board) return;
    setPromptDrafts((current) => ({ ...current, [board.id]: prompt }));
    setSelections((current) => ({ ...current, [board.id]: [] }));
    setLiveCandidates((current) => {
      const next = { ...current };
      delete next[board.id];
      return next;
    });
    setScanError(null);
  };

  const scanBoard = async () => {
    if (!board) return;
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetchFreeAuditSuggestions(boardPrompt);
      setLiveCandidates((current) => ({ ...current, [board.id]: response.candidates }));
    } catch (caught) {
      setScanError(caught instanceof Error ? caught.message : "No se pudieron cargar candidatos.");
    } finally {
      setScanning(false);
    }
  };

  const goToBoard = (nextIndex: number) => {
    if (!pack) return;
    setBoardIndex(Math.max(0, Math.min(pack.boards.length - 1, nextIndex)));
    setScanError(null);
  };

  if (loading) {
    return <CenteredMessage colors={colors} message="Cargando el auditor…" />;
  }
  if (error || !pack || !board) {
    return (
      <CenteredMessage
        colors={colors}
        message={error ?? "El auditor no está disponible. Activa AUDIT_ENABLED en desarrollo."}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>EDITORIAL TOOL · LOCAL ONLY</Text>
              <Text style={styles.title}>Auditoría de prompts v5</Text>
              <Text style={styles.subtitle}>
                Borrador separado del juego: reúne hasta 30 candidatos y deja exactamente diez.
              </Text>
            </View>
            <Pressable onPress={() => { window.location.href = "/"; }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Volver al juego</Text>
            </Pressable>
          </View>

          <View style={styles.explorerCard}>
            <Text style={styles.sectionTitle}>Probar cualquier búsqueda</Text>
            <Text style={styles.sectionHint}>
              Escribe una frase nueva para ver hasta 30 candidatos reales de Google, aunque todavía no exista como tablero.
            </Text>
            <View style={styles.explorerRow}>
              <TextInput
                accessibilityLabel="Búsqueda para explorar"
                autoCapitalize="none"
                onChangeText={setExploreQuery}
                onSubmitEditing={scanFreeQuery}
                placeholder="por qué mi gato…"
                placeholderTextColor={colors.textFaint}
                style={styles.explorerInput}
                value={exploreQuery}
              />
              <Pressable
                accessibilityRole="button"
                disabled={exploreLoading || !exploreQuery.trim()}
                onPress={scanFreeQuery}
                style={[styles.scanButton, (exploreLoading || !exploreQuery.trim()) && styles.disabledButton]}
              >
                <Text style={styles.scanButtonText}>
                  {exploreLoading ? "Buscando…" : "Buscar 30"}
                </Text>
              </Pressable>
            </View>
            {exploreError && <Text style={styles.error}>{exploreError}</Text>}
            {exploreQueriesRun > 0 && (
              <Text style={styles.explorerMeta}>
                {exploreCandidates.length} candidatos de {exploreQueriesRun} consultas
                {exploreFailedQueries ? ` · ${exploreFailedQueries} sin resultados` : ""}
              </Text>
            )}
            {exploreCandidates.map((candidate) => (
              <View key={`${candidate.source_query}:${candidate.text}`} style={styles.explorerCandidate}>
                <Text style={styles.candidateText}>{candidate.text}</Text>
                <Text style={styles.candidateSource}>
                  {candidate.exact_prompt_query ? "Google · prompt exacto" : `Google · ${candidate.source_query}`}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              {completeBoardCount}/{pack.boards.length} tableros tienen diez respuestas seleccionadas
            </Text>
            <Text style={styles.summaryHint}>
              El pack v3 sigue intacto; este borrador v4 no se publica hasta descargarlo y revisarlo.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!canExport}
              onPress={() => downloadPack(pack, selections, promptDrafts)}
              style={[styles.primaryButton, !canExport && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>
                {canExport ? "Descargar pack seleccionado" : "Completa todos los tableros para exportar"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.navigationCard}>
            <View style={styles.boardMeta}>
              <Text style={styles.boardNumber}>TABLERO {boardIndex + 1} / {pack.boards.length}</Text>
              <Text style={styles.category}>{board.category_name} · {board.eligibility}</Text>
            </View>
            <View style={styles.boardNavRow}>
              <Pressable
                accessibilityRole="button"
                disabled={boardIndex === 0}
                onPress={() => goToBoard(boardIndex - 1)}
                style={[styles.navButton, boardIndex === 0 && styles.disabledButton]}
              >
                <Text style={styles.navButtonText}>← Anterior</Text>
              </Pressable>
              <TextInput
                accessibilityLabel="Número de tablero"
                keyboardType="number-pad"
                onChangeText={(value) => {
                  const number = Number.parseInt(value, 10);
                  if (Number.isFinite(number)) goToBoard(number - 1);
                }}
                placeholder={`${boardIndex + 1}`}
                style={styles.boardInput}
              />
              <Pressable
                accessibilityRole="button"
                disabled={boardIndex === pack.boards.length - 1}
                onPress={() => goToBoard(boardIndex + 1)}
                style={[styles.navButton, boardIndex === pack.boards.length - 1 && styles.disabledButton]}
              >
                <Text style={styles.navButtonText}>Siguiente →</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>PROMPT</Text>
            <TextInput
              accessibilityLabel="Prompt del tablero"
              onChangeText={updateBoardPrompt}
              placeholder="Escribe el prompt…"
              placeholderTextColor={colors.textFaint}
              style={styles.promptInput}
              value={boardPrompt}
            />
            {board.english_prompt && (
              <Text style={styles.sourcePrompt}>
                Fuente inglesa: <Text style={styles.sourcePromptValue}>{board.english_prompt}</Text>
              </Text>
            )}
            {boardPrompt !== board.prompt && (
              <Text style={styles.promptChanged}>
                Prompt modificado en este borrador; vuelve a buscar antes de elegir respuestas.
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={variantLoading || !boardPrompt.trim()}
              onPress={analyzePromptVariants}
              style={[styles.variantButton, (variantLoading || !boardPrompt.trim()) && styles.disabledButton]}
            >
              <Text style={styles.variantButtonText}>
                {variantLoading ? "Analizando variantes…" : "Analizar versiones más cortas"}
              </Text>
            </Pressable>
            {variantError && <Text style={styles.error}>{variantError}</Text>}
            {promptVariants.length > 0 && (
              <View style={styles.variantList}>
                <Text style={styles.variantHeading}>Variantes del prompt · sugerencias exactas</Text>
                {promptVariants.map((variant) => (
                  <View key={variant.prompt} style={styles.variantRow}>
                    <View style={styles.variantCopy}>
                      <Text style={styles.variantPrompt}>{variant.prompt}</Text>
                      <Text style={styles.variantCount}>
                        {variant.suggestions.length}/10 sugerencias
                        {variant.error ? " · error" : ""}
                      </Text>
                      {variant.suggestions.length > 0 && (
                        <Text numberOfLines={2} style={styles.variantSuggestions}>
                          {variant.suggestions.slice(0, 3).join(" · ")}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => applyPromptVariant(variant.prompt)}
                      style={styles.useVariantButton}
                    >
                      <Text style={styles.useVariantText}>Usar</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.promptHint}>
              Seleccionadas: <Text style={selected.length === 10 ? styles.good : styles.bad}>{selected.length}/10</Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={scanning || !boardPrompt.trim()}
              onPress={scanBoard}
              style={[styles.scanButton, (scanning || !boardPrompt.trim()) && styles.disabledButton]}
            >
              <Text style={styles.scanButtonText}>
                {scanning ? "Consultando Google…" : "Buscar 30 candidatos en Google"}
              </Text>
            </Pressable>
            {scanError && <Text style={styles.error}>{scanError}</Text>}
          </View>

          <View style={styles.candidateCard}>
            <View style={styles.candidateHeader}>
              <View>
                <Text style={styles.sectionTitle}>Candidatos</Text>
                <Text style={styles.sectionHint}>
                  Los marcados entran en el export. Los azules son respuestas ya guardadas.
                </Text>
              </View>
              <Text style={styles.countBadge}>{selected.length}/10</Text>
            </View>
            {candidates.map((candidate) => {
              const isSelected = selectedKeys.has(normalize(candidate.ending));
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  key={`${candidate.source_query}:${candidate.ending}`}
                  onPress={() => toggleSelection(candidate.ending)}
                  style={[styles.candidateRow, isSelected && styles.candidateRowSelected]}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.candidateCopy}>
                    <Text style={styles.candidateText}>{candidate.text}</Text>
                    <Text style={styles.candidateSource}>
                      {candidate.current ? "Pack actual" : candidate.exact_prompt_query ? "Google · prompt exacto" : `Google · ${candidate.source_query}`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {candidates.length === 0 && (
              <Text style={styles.empty}>Pulsa “Buscar 30 candidatos” para empezar.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function CenteredMessage({ colors, message }: { colors: ThemeColors; message: string }) {
  const styles = createStyles(colors, 768);
  return (
    <View style={styles.centered}>
      <Text style={styles.error}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors, width: number) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
    scrollContent: { alignItems: "center", padding: width < 600 ? 16 : 28, paddingBottom: 48 },
    content: { width: "100%", maxWidth: 960, gap: 14 },
    headerRow: { flexDirection: width < 680 ? "column" : "row", justifyContent: "space-between", gap: 16, alignItems: width < 680 ? "stretch" : "flex-start" },
    eyebrow: { color: colors.cobalt, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
    title: { color: colors.text, fontSize: width < 600 ? 30 : 38, fontWeight: "900", letterSpacing: -1.1, marginTop: 5 },
    subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 5 },
    secondaryButton: { minHeight: 42, borderRadius: radius.small, borderWidth: 1, borderColor: colors.border, justifyContent: "center", paddingHorizontal: 15 },
    secondaryButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
    explorerCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: width < 600 ? 14 : 20, gap: 8 },
    explorerRow: { flexDirection: width < 600 ? "column" : "row", gap: 8, alignItems: width < 600 ? "stretch" : "center" },
    explorerInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.small, color: colors.text, paddingHorizontal: 13, fontSize: 15 },
    explorerMeta: { color: colors.green, fontSize: 12, fontWeight: "800" },
    explorerCandidate: { backgroundColor: colors.surfaceRaised, borderRadius: radius.small, padding: 11, gap: 3 },
    summaryCard: { backgroundColor: colors.surfaceRaised, borderRadius: radius.large, padding: 18, gap: 7 },
    summaryText: { color: colors.text, fontSize: 17, fontWeight: "900" },
    summaryHint: { color: colors.textMuted, fontSize: 13 },
    primaryButton: { alignSelf: "flex-start", minHeight: 42, borderRadius: radius.small, backgroundColor: colors.cobalt, justifyContent: "center", paddingHorizontal: 16, marginTop: 5 },
    primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: "900" },
    disabledButton: { opacity: 0.45 },
    navigationCard: { flexDirection: width < 600 ? "column" : "row", justifyContent: "space-between", alignItems: width < 600 ? "stretch" : "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: 14, backgroundColor: colors.surface },
    boardMeta: { gap: 3 },
    boardNumber: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
    category: { color: colors.textMuted, fontSize: 13, textTransform: "capitalize" },
    boardNavRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    navButton: { minHeight: 40, borderRadius: radius.small, backgroundColor: colors.surfaceSoft, justifyContent: "center", paddingHorizontal: 12 },
    navButtonText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    boardInput: { width: 54, height: 40, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.small, color: colors.text, textAlign: "center", fontWeight: "800" },
    promptCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: 20, gap: 8, ...shadow },
    promptLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
    promptInput: { color: colors.text, fontSize: width < 600 ? 28 : 36, fontWeight: "900", letterSpacing: -0.8, borderBottomWidth: 2, borderBottomColor: colors.cobalt, paddingVertical: 4 },
    sourcePrompt: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    sourcePromptValue: { color: colors.text, fontWeight: "900" },
    promptChanged: { color: colors.amber, fontSize: 12, fontWeight: "800" },
    variantButton: { alignSelf: "flex-start", minHeight: 38, borderRadius: radius.small, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center", paddingHorizontal: 13, marginTop: 3 },
    variantButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
    variantList: { gap: 6, marginTop: 5 },
    variantHeading: { color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
    variantRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: radius.small, backgroundColor: colors.surfaceRaised, padding: 10 },
    variantCopy: { flex: 1, gap: 2 },
    variantPrompt: { color: colors.text, fontSize: 13, fontWeight: "700" },
    variantCount: { color: colors.green, fontSize: 11, fontWeight: "800" },
    variantSuggestions: { color: colors.textFaint, fontSize: 11, lineHeight: 15 },
    useVariantButton: { minHeight: 32, borderRadius: radius.small, backgroundColor: colors.cobaltSoft, justifyContent: "center", paddingHorizontal: 12 },
    useVariantText: { color: colors.cobalt, fontSize: 12, fontWeight: "900" },
    promptHint: { color: colors.textMuted, fontSize: 13 },
    good: { color: colors.green, fontWeight: "900" },
    bad: { color: colors.danger, fontWeight: "900" },
    scanButton: { alignSelf: "flex-start", minHeight: 44, borderRadius: radius.small, backgroundColor: colors.green, justifyContent: "center", paddingHorizontal: 17, marginTop: 5 },
    scanButtonText: { color: colors.white, fontSize: 13, fontWeight: "900" },
    error: { color: colors.danger, fontSize: 14, textAlign: "center" },
    candidateCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.large, padding: width < 600 ? 14 : 20, gap: 8 },
    candidateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 5 },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
    sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
    countBadge: { color: colors.cobalt, backgroundColor: colors.cobaltSoft, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6, fontSize: 12, fontWeight: "900" },
    candidateRow: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: radius.small, padding: 11, backgroundColor: colors.surfaceRaised },
    candidateRowSelected: { backgroundColor: colors.cobaltSoft },
    checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: colors.borderStrong, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    checkboxSelected: { borderColor: colors.cobalt, backgroundColor: colors.cobalt },
    checkmark: { color: colors.white, fontSize: 15, fontWeight: "900", lineHeight: 17 },
    candidateCopy: { flex: 1, gap: 3 },
    candidateText: { color: colors.text, fontSize: 14, fontWeight: "700" },
    candidateSource: { color: colors.textFaint, fontSize: 11 },
    empty: { color: colors.textMuted, fontSize: 14, paddingVertical: 25, textAlign: "center" },
  });
