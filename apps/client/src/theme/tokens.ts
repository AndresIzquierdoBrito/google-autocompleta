export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  cobalt: string;
  cobaltSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  danger: string;
  dangerSoft: string;
  revealed: string;
  white: string;
};

export const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceRaised: "#F8F9FA",
  surfaceSoft: "#F1F3F4",
  border: "#DADCE0",
  borderStrong: "#BDC1C6",
  text: "#202124",
  textMuted: "#5F6368",
  textFaint: "#80868B",
  cobalt: "#1A73E8",
  cobaltSoft: "#E8F0FE",
  green: "#188038",
  greenSoft: "#E6F4EA",
  amber: "#F9AB00",
  danger: "#D93025",
  dangerSoft: "#FCE8E6",
  revealed: "#5F6368",
  white: "#FFFFFF",
};

export const darkColors: ThemeColors = {
  background: "#202124",
  surface: "#202124",
  surfaceRaised: "#303134",
  surfaceSoft: "#35363A",
  border: "#3C4043",
  borderStrong: "#5F6368",
  text: "#F8F9FA",
  textMuted: "#BDC1C6",
  textFaint: "#9AA0A6",
  cobalt: "#8AB4F8",
  cobaltSoft: "#243B63",
  green: "#81C995",
  greenSoft: "#24452D",
  amber: "#FDD663",
  danger: "#F28B82",
  dangerSoft: "#5B302D",
  revealed: "#9AA0A6",
  white: "#FFFFFF",
};

export const brandColors = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC05",
  green: "#34A853",
} as const;

export const radius = {
  small: 8,
  medium: 12,
  large: 18,
  pill: 999,
} as const;

export const shadow = {
  boxShadow: "0 2px 8px rgba(60, 64, 67, 0.18)",
  elevation: 3,
} as const;
