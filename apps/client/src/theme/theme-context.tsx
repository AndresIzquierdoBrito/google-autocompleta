import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";

import { darkColors, lightColors, type ThemeColors } from "@/theme/tokens";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  colors: ThemeColors;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const STORAGE_KEY = "@google-autocompleta:settings:theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren<unknown>) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light" || saved === "dark") setMode(saved);
      })
      .catch(() => undefined);
  }, []);

  const colors = mode === "light" ? lightColors : darkColors;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.documentElement.style.backgroundColor = colors.background;
    document.documentElement.style.colorScheme = mode;
    document.body.style.backgroundColor = colors.background;
  }, [colors.background, mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      mode,
      toggleTheme: () => {
        setMode((current) => {
          const next = current === "light" ? "dark" : "light";
          AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
          return next;
        });
      },
    }),
    [colors, mode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value)
    throw new Error("useAppTheme debe usarse dentro de ThemeProvider");
  return value;
}
