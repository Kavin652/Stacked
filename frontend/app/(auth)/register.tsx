import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Register() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Sign up failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoBadge}><Ionicons name="leaf" size={28} color={colors.brand} /></View>
            <Text style={styles.brand}>CORN CLUB</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>JOIN THE CLUB</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput testID="register-name-input" style={styles.input} value={name} onChangeText={setName}
              placeholder="Your first name" placeholderTextColor={colors.onSurfaceTertiary} />

            <Text style={styles.label}>Email</Text>
            <TextInput testID="register-email-input" style={styles.input} value={email} onChangeText={setEmail}
              placeholder="you@email.com" placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.label}>Password</Text>
            <TextInput testID="register-password-input" style={styles.input} value={password} onChangeText={setPassword}
              placeholder="At least 6 characters" placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry />

            {error && <Text style={styles.errorText} testID="register-error">{error}</Text>}

            <TouchableOpacity testID="register-submit-button" style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>CREATE ACCOUNT</Text>}
            </TouchableOpacity>

            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="register-go-login" style={styles.linkBtn}>
                <Text style={styles.linkText}>Already have an account? <Text style={styles.linkTextBold}>Log in</Text></Text>
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
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, justifyContent: "center" },
  logoWrap: { alignItems: "center", marginBottom: spacing.xl },
  logoBadge: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.brand,
  },
  brand: { fontFamily: fonts.display, fontSize: 32, color: colors.onSurface, letterSpacing: 2 },
  form: { gap: spacing.md },
  heading: { fontFamily: fonts.display, fontSize: 26, color: colors.brand, letterSpacing: 1, marginBottom: spacing.sm },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13 },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, padding: spacing.lg, fontFamily: fonts.body, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  primaryBtnText: { color: colors.onBrand, fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: 1 },
  linkBtn: { alignItems: "center", padding: spacing.md },
  linkText: { color: colors.onSurfaceTertiary, fontFamily: fonts.body },
  linkTextBold: { color: colors.brand, fontFamily: fonts.bodyBold },
  errorText: { color: colors.error, fontFamily: fonts.body, fontSize: 13, textAlign: "center" },
});
