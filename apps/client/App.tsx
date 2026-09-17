import "./src/global.css";

import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/index";
import AuditScreen from "@/app/audit";
import { ThemeProvider, useAppTheme } from "@/theme/theme-context";
import type { ThemeColors } from "@/theme/tokens";
import { getCurrentWebRoute } from "@/utils/web-navigation";

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
  const route = getCurrentWebRoute();
  return (
    <View style={styles.root}>
      {route === "audit" ? <AuditScreen /> : <HomeScreen />}
      <StatusBar style={mode === "light" ? "dark" : "light"} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
  });
