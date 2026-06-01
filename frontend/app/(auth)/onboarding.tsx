import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api, User } from "@/src/api";

type Risk = "low" | "medium" | "high";

const STEPS = ["NAME", "AGE", "RISK"] as const;

export default function Onboarding() {
  const { user, setUser } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.name || "");
  const [age, setAge] = useState("");
  const [risk, setRisk] = useState<Risk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    setError(null);
    if (step === 0 && !name.trim()) return setError("Please enter your name");
    if (step === 1) {
      const n = parseInt(age, 10);
      if (isNaN(n) || n < 10 || n > 100) return setError("Please enter a valid age (10-100)");
    }
    if (step < 2) setStep(step + 1);
  };

  const submit = async () => {
    if (!risk) return setError("Please pick a risk tolerance");
    setLoading(true);
    setError(null);
    try {
      const updated = await api.post<User>("/auth/onboarding", {
        name: name.trim(),
        age: parseInt(age, 10),
        risk_tolerance: risk,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUser(updated);
    } catch (e: any) {
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.progressRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.progressBar, i <= step && styles.progressBarActive]} />
            ))}
          </View>

          <Text style={styles.stepLabel}>STEP {step + 1} OF 3</Text>

          {step === 0 && (
            <View style={styles.section}>
              <Text style={styles.heading}>WHAT'S YOUR NAME?</Text>
              <Text style={styles.subtext}>We'll use it to personalize your experience.</Text>
              <TextInput
                testID="onboarding-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoFocus
              />
            </View>
          )}

          {step === 1 && (
            <View style={styles.section}>
              <Text style={styles.heading}>HOW OLD ARE YOU?</Text>
              <Text style={styles.subtext}>Helps us tailor advice to your stage of life.</Text>
              <TextInput
                testID="onboarding-age-input"
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="e.g. 17"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad"
                autoFocus
              />
            </View>
          )}

          {step === 2 && (
            <View style={styles.section}>
              <Text style={styles.heading}>RISK TOLERANCE?</Text>
              <Text style={styles.subtext}>This affects investment suggestions.</Text>
              {(["low", "medium", "high"] as Risk[]).map(r => (
                <TouchableOpacity
                  testID={`onboarding-risk-${r}`}
                  key={r}
                  style={[styles.riskCard, risk === r && styles.riskCardActive]}
                  onPress={() => { setRisk(r); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.riskLabel, risk === r && styles.riskLabelActive]}>
                    {r === "low" ? "🛡️ LOW" : r === "medium" ? "⚖️ MEDIUM" : "🚀 HIGH"}
                  </Text>
                  <Text style={styles.riskDesc}>
                    {r === "low" ? "Play it safe. Slow but steady growth."
                      : r === "medium" ? "Balanced growth with some volatility."
                      : "Higher risk for higher potential rewards."}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.actions}>
            {step > 0 && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(step - 1)}>
                <Text style={styles.secondaryBtnText}>BACK</Text>
              </TouchableOpacity>
            )}
            {step < 2 ? (
              <TouchableOpacity testID="onboarding-next-button" style={[styles.primaryBtn, { flex: 1 }]} onPress={next}>
                <Text style={styles.primaryBtnText}>NEXT</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity testID="onboarding-finish-button" style={[styles.primaryBtn, { flex: 1 }]} onPress={submit} disabled={loading}>
                {loading ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>LET'S GO</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl, justifyContent: "center" },
  progressRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  progressBar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  progressBarActive: { backgroundColor: colors.brand },
  stepLabel: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceTertiary, fontSize: 12, letterSpacing: 1, marginBottom: spacing.lg },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  heading: { fontFamily: fonts.display, fontSize: 36, color: colors.onSurface, letterSpacing: 1 },
  subtext: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 14, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, padding: spacing.lg, fontFamily: fonts.body, fontSize: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  riskCard: {
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  riskCardActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  riskLabel: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, letterSpacing: 1 },
  riskLabelActive: { color: colors.brand },
  riskDesc: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  primaryBtnText: { color: colors.onBrand, fontFamily: fonts.bodyBold, fontSize: 16, letterSpacing: 1 },
  secondaryBtn: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xl },
  secondaryBtnText: { color: colors.onSurfaceSecondary, fontFamily: fonts.bodyBold, letterSpacing: 1 },
  errorText: { color: colors.error, fontFamily: fonts.body, textAlign: "center", marginBottom: spacing.md },
});
