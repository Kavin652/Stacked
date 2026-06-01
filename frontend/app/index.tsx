import { View, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

// Placeholder splash while RootLayout's redirect kicks in.
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
