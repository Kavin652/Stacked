import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoBadge}>
              <Ionicons name="leaf" size={32} color={colors.brand} />
            </View>
            <Text style={styles.brand}>STACKED</Text>
            <Text style={styles.tagline}>Your money. Your moves.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>WELCOME BACK</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
            />

            {error && <Text style={styles.errorText} testID="login-error">{error}</Text>}

            <TouchableOpacity testID="login-submit-button" style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>LOG IN</Text>}
            </TouchableOpacity>

            <Link href="/(auth)/register" asChild>
              <TouchableOpacity testID="login-go-register" style={styles.linkBtn}>
                <Text style={styles.linkText}>
                  New to Stacked? <Text style={styles.linkTextBold}>Sign up</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: spacing.xxxl },
  logoBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.brand,
  },
  brand: { fontFamily: fonts.display, fontSize: 40, color: colors.onSurface, letterSpacing: 2 },
  tagline: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, marginTop: spacing.xs },
  form: { gap: spacing.md },
  heading: { fontFamily: fonts.display, fontSize: 28, color: colors.brand, letterSpacing: 1, marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13 },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, padding: spacing.lg, fontFamily: fonts.body, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md,
    alignItems: "center", marginTop: spacing.lg,
  },
  primaryBtnText: { color: colors.onBrand, fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: 1 },
  linkBtn: { alignItems: "center", padding: spacing.md, marginTop: spacing.sm },
  linkText: { color: colors.onSurfaceTertiary, fontFamily: fonts.body },
  linkTextBold: { color: colors.brand, fontFamily: fonts.bodyBold },
  errorText: { color: colors.error, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});
