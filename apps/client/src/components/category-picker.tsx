import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { Category } from "@/api/types";
import { useAppTheme } from "@/theme/theme-context";
import { radius, shadow, type ThemeColors } from "@/theme/tokens";

type Props = {
  categories: Category[];
  value: string;
  visible: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
};

export function CategoryPicker({
  categories,
  value,
  visible,
  disabled,
  onOpen,
  onClose,
  onChange,
}: Props) {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const options = [
    { slug: "todas", name: "Todas las categorías" },
    ...categories,
  ];
  const selected = options.find((item) => item.slug === value) ?? options[0];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Categoría: ${selected.name}`}
        disabled={disabled}
        hitSlop={5}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.trigger,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {selected.name}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            accessibilityViewIsModal
            style={styles.sheet}
            onPress={() => undefined}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>MODO ALEATORIO</Text>
                <Text style={styles.title}>Elige una categoría</Text>
              </View>
              <Pressable
                accessibilityLabel="Cerrar"
                onPress={onClose}
                style={styles.close}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.options}>
              {options.map((item) => {
                const isSelected = item.slug === value;
                return (
                  <Pressable
                    key={item.slug}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    onPress={() => {
                      onChange(item.slug);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isSelected && <View style={styles.dot} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    trigger: {
      minHeight: 34,
      minWidth: 182,
      maxWidth: 250,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 14,
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    triggerLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      flexShrink: 1,
    },
    chevron: { color: colors.textMuted, fontSize: 18, marginTop: -4 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.68)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      width: "100%",
      maxWidth: 440,
      padding: 20,
      borderRadius: radius.large,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      ...shadow,
    },
    sheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    },
    eyebrow: {
      color: colors.cobalt,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      marginTop: 3,
    },
    close: {
      width: 38,
      height: 38,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSoft,
    },
    closeText: { color: colors.text, fontSize: 25, lineHeight: 27 },
    options: { gap: 7 },
    option: {
      minHeight: 47,
      paddingHorizontal: 14,
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    optionSelected: {
      borderColor: colors.cobalt,
      backgroundColor: colors.cobaltSoft,
    },
    optionText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
    optionTextSelected: { color: colors.text },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.cobalt,
    },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.48 },
  });
