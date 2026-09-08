// These properties are supported by React Native Web and are harmless on
// native clients, but they were added to the React Native type definitions
// after the SDK 44 runtime. Keep the SDK 44 types strict without losing the
// responsive web layout.
import "react-native";

declare module "*.css";

declare module "react-native" {
  interface ViewStyle {
    gap?: number;
    rowGap?: number;
    columnGap?: number;
  }

  interface TextInputProps {
    enterKeyHint?: string;
  }
}
