import "./src/global.css";

import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/index";
import { ThemeProvider, useAppTheme } from "@/theme/theme-context";
import type { ThemeColors } from "@/theme/tokens";

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootApp() {
  const { colors, mode } = useAppTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.root}>
      <HomeScreen />
      <StatusBar style={mode === "light" ? "dark" : "light"} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
  });
