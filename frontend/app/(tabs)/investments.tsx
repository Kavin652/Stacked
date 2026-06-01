import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { api, Holding } from "@/src/api";
import { PieChart } from "@/src/charts";

const SLICE_COLORS = ["#00E5A0", "#A78BFA", "#60A5FA", "#FFB020", "#FF6B6B", "#34D399", "#F472B6", "#FBBF24"];

type Suggestion = { ticker: string; name: string; reason: string; type: string };

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Investments() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await api.get<Holding[]>("/holdings");
      setHoldings(h);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggest(true);
    try {
      const res = await api.post<{ suggestions: Suggestion[] }>("/ai/suggest-investments");
      setSuggestions(res.suggestions || []);
    } catch {} finally { setLoadingSuggest(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    if (suggestions.length === 0) loadSuggestions();
  }, [load, loadSuggestions, suggestions.length]));

  const total = useMemo(
    () => holdings.reduce((s, h) => s + (h.current_value ?? h.purchase_price * h.shares), 0),
    [holdings]
  );

  const pieData = useMemo(
    () => holdings.map((h, i) => ({
      value: h.current_value ?? h.purchase_price * h.shares,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      label: h.ticker,
    })),
    [holdings]
  );

  const totalGain = useMemo(() => {
    let g = 0;
    for (const h of holdings) {
      if (h.gain_loss !== null && h.gain_loss !== undefined) g += h.gain_loss;
    }
    return g;
  }, [holdings]);

  const onRefresh = async () => {
    setRefreshing(true); await Promise.all([load(), loadSuggestions()]); setRefreshing(false);
  };

  const onDelete = (id: string, ticker: string) => {
    Alert.alert("Remove holding", `Remove ${ticker} from your portfolio?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await api.delete(`/holdings/${id}`);
        setHoldings(holdings.filter(h => h.id !== id));
      }},
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>INVESTMENTS</Text>
          <TouchableOpacity testID="add-holding-button" style={styles.fab} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={22} color={colors.onBrand} />
          </TouchableOpacity>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>PORTFOLIO VALUE</Text>
          <Text style={styles.totalAmount} testID="portfolio-value">{fmt(total)}</Text>
          {holdings.length > 0 && (
            <View style={styles.gainRow}>
              <Ionicons name={totalGain >= 0 ? "trending-up" : "trending-down"} size={16} color={totalGain >= 0 ? colors.brand : colors.error} />
              <Text style={[styles.gainText, { color: totalGain >= 0 ? colors.brand : colors.error }]}>
                {totalGain >= 0 ? "+" : ""}{fmt(totalGain)} all-time
              </Text>
            </View>
          )}
          {pieData.length > 0 && total > 0 && (
            <View style={{ alignItems: "center", marginTop: spacing.lg }}>
              <PieChart data={pieData} size={160} />
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>YOUR HOLDINGS</Text>
        {holdings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="trending-up-outline" size={36} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No holdings yet. Tap + to log your first stock or ETF.</Text>
          </View>
        ) : holdings.map((h, i) => {
          const cost = h.purchase_price * h.shares;
          const value = h.current_value ?? cost;
          const gain = (h.gain_loss ?? 0);
          const gainPct = h.gain_loss_pct ?? 0;
          const positive = gain >= 0;
          return (
            <TouchableOpacity key={h.id} testID={`holding-${h.ticker}`} style={styles.holdingCard} onLongPress={() => onDelete(h.id, h.ticker)}>
              <View style={[styles.tickerBadge, { backgroundColor: `${SLICE_COLORS[i % SLICE_COLORS.length]}22` }]}>
                <Text style={[styles.tickerText, { color: SLICE_COLORS[i % SLICE_COLORS.length] }]}>{h.ticker}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.holdingType}>{h.type} • {h.shares} sh</Text>
                <Text style={styles.holdingValue}>{fmt(value)}</Text>
                {h.current_price !== null && (
                  <Text style={[styles.holdingGain, { color: positive ? colors.brand : colors.error }]}>
                    {positive ? "+" : ""}{fmt(gain)} ({positive ? "+" : ""}{gainPct.toFixed(1)}%)
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
          );
        })}

        <View style={{ marginTop: spacing.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
            <Ionicons name="sparkles" size={16} color={colors.brand} />
            <Text style={styles.sectionTitle}>AI PICKS FOR YOU</Text>
          </View>
          {loadingSuggest ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
              {suggestions.map(s => (
                <View key={s.ticker} style={styles.suggestCard}>
                  <View style={styles.suggestHead}>
                    <Text style={styles.suggestTicker}>{s.ticker}</Text>
                    <Text style={styles.suggestType}>{s.type}</Text>
                  </View>
                  <Text style={styles.suggestName} numberOfLines={2}>{s.name}</Text>
                  <Text style={styles.suggestReason} numberOfLines={4}>{s.reason}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <AddHoldingModal visible={showAdd} onClose={() => setShowAdd(false)} onAdded={(h) => { setHoldings([h, ...holdings]); setShowAdd(false); }} />
    </SafeAreaView>
  );
}

function AddHoldingModal({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (h: Holding) => void }) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<"Stock" | "ETF" | "401k">("Stock");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const s = parseFloat(shares); const p = parseFloat(price);
    if (!ticker.trim()) return setError("Ticker required");
    if (isNaN(s) || s <= 0) return setError("Invalid shares");
    if (isNaN(p) || p <= 0) return setError("Invalid price");
    setSaving(true);
    try {
      const h = await api.post<Holding>("/holdings", { ticker: ticker.trim().toUpperCase(), shares: s, purchase_price: p, type });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTicker(""); setShares(""); setPrice(""); setType("Stock");
      onAdded(h);
    } catch (e: any) { setError(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.overlay}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>ADD HOLDING</Text>

            <View style={modalStyles.toggleRow}>
              {(["Stock", "ETF", "401k"] as const).map(t => (
                <TouchableOpacity key={t} testID={`holding-type-${t}`} style={[modalStyles.toggleBtn, type === t && modalStyles.toggleBtnActive]} onPress={() => setType(t)}>
                  <Text style={[modalStyles.toggleText, type === t && modalStyles.toggleTextActive]}>{t.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Ticker</Text>
            <TextInput testID="holding-ticker-input" value={ticker} onChangeText={setTicker} placeholder="e.g. AAPL, VOO" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} autoCapitalize="characters" />

            <Text style={modalStyles.label}>Shares Owned</Text>
            <TextInput testID="holding-shares-input" value={shares} onChangeText={setShares} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} />

            <Text style={modalStyles.label}>Purchase Price (per share)</Text>
            <TextInput testID="holding-price-input" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} />

            {error && <Text style={modalStyles.error}>{error}</Text>}

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.surfaceTertiary, flex: 1 }]} onPress={onClose}>
                <Text style={[modalStyles.btnText, { color: colors.onSurfaceSecondary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="holding-save-button" style={[modalStyles.btn, { backgroundColor: colors.brand, flex: 1 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={modalStyles.btnText}>SAVE</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 32, letterSpacing: 1 },
  fab: { backgroundColor: colors.brand, width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  totalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  totalLabel: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5 },
  totalAmount: { fontFamily: fonts.display, color: colors.brand, fontSize: 48, letterSpacing: 1 },
  gainRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  gainText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  sectionTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 18, letterSpacing: 1 },
  emptyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
  holdingCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  tickerBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 60, alignItems: "center" },
  tickerText: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
  holdingType: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 11, marginBottom: 2 },
  holdingValue: { fontFamily: fonts.bodyBold, color: colors.onSurface, fontSize: 15 },
  holdingGain: { fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 2 },
  suggestCard: { width: 220, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  suggestHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  suggestTicker: { fontFamily: fonts.display, color: colors.brand, fontSize: 22, letterSpacing: 1 },
  suggestType: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceTertiary, fontSize: 10, letterSpacing: 1, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  suggestName: { fontFamily: fonts.bodyMedium, color: colors.onSurface, fontSize: 13 },
  suggestReason: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, alignSelf: "center", marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, letterSpacing: 1 },
  toggleRow: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, padding: spacing.md, alignItems: "center", borderRadius: radius.sm },
  toggleBtnActive: { backgroundColor: colors.brand },
  toggleText: { fontFamily: fonts.bodyBold, color: colors.onSurfaceTertiary, letterSpacing: 1, fontSize: 12 },
  toggleTextActive: { color: colors.onBrand },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, color: colors.onSurface, padding: spacing.lg, borderRadius: radius.md, fontFamily: fonts.body, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  error: { fontFamily: fonts.body, color: colors.error, fontSize: 13, textAlign: "center" },
  btn: { padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  btnText: { fontFamily: fonts.bodyBold, color: colors.onBrand, letterSpacing: 1 },
});
