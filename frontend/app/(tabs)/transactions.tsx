import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts, categoryMeta } from "@/src/theme";
import { api, Transaction } from "@/src/api";
import { PieChart, BarChart } from "@/src/charts";

const CATEGORIES = ["Food", "Entertainment", "Transport", "Income", "Subscriptions", "Other"] as const;

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsScreen() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api.get<Transaction[]>("/transactions");
      setTxs(t);
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  };

  const monthData = useMemo(() => {
    const ymThis = new Date().toISOString().slice(0, 7);
    const byCat: Record<string, number> = {};
    for (const t of txs) {
      if (t.type !== "expense" || !t.date.startsWith(ymThis)) continue;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    }
    const entries = Object.entries(byCat);
    return entries.map(([cat, val]) => ({
      label: cat, value: val, color: categoryMeta[cat]?.color || colors.brand,
    }));
  }, [txs]);

  const monthTotal = monthData.reduce((s, d) => s + d.value, 0);

  const onDelete = async (id: string) => {
    try {
      await api.delete(`/transactions/${id}`);
      setTxs(txs.filter(t => t.id !== id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>TRANSACTIONS</Text>
        <TouchableOpacity testID="add-transaction-button" style={styles.fab} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={22} color={colors.onBrand} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={txs}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>THIS MONTH'S SPENDING</Text>
              <Text style={styles.chartTotal}>{fmt(monthTotal)}</Text>
              {monthData.length > 0 ? (
                <View style={{ alignItems: "center", marginTop: spacing.lg }}>
                  <PieChart data={monthData} size={180} />
                </View>
              ) : (
                <Text style={styles.emptyText}>No expenses logged this month yet.</Text>
              )}
              {monthData.length > 0 && (
                <View style={styles.legend}>
                  {monthData.map(d => (
                    <View key={d.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                      <Text style={styles.legendLabel}>{d.label}</Text>
                      <Text style={styles.legendValue}>{fmt(d.value)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {monthData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>CATEGORY BREAKDOWN</Text>
                <BarChart
                  data={monthData.map(d => ({ label: d.label, value: d.value, color: d.color }))}
                  height={140}
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                  {monthData.map(d => (
                    <Text key={d.label} style={[styles.barLabel, { flex: 1 }]} numberOfLines={1}>
                      {d.label.slice(0, 4)}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>ALL TRANSACTIONS</Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta[item.category] || categoryMeta.Other;
          const sign = item.type === "income" ? "+" : "-";
          const color = item.type === "income" ? colors.brand : colors.onSurface;
          return (
            <TouchableOpacity
              testID={`tx-row-${item.id}`}
              style={styles.txRow}
              onLongPress={() => onDelete(item.id)}
            >
              <View style={[styles.txIcon, { backgroundColor: `${meta.color}22` }]}>
                <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txCategory}>{item.category}</Text>
                <Text style={styles.txDesc} numberOfLines={1}>
                  {item.description || new Date(item.date).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.txAmount, { color }]}>{sign}{fmt(item.amount)}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No transactions yet. Tap + to add one.</Text>}
      />

      <AddTransactionModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={(t) => { setTxs([t, ...txs]); setShowAdd(false); }}
      />
    </SafeAreaView>
  );
}

function AddTransactionModal({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (t: Transaction) => void }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("Food");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      const t = await api.post<Transaction>("/transactions", {
        amount: amt, category, type, description,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAmount(""); setDescription(""); setCategory("Food"); setType("expense");
      onAdded(t);
    } catch {} finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.overlay}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>ADD TRANSACTION</Text>

            <View style={modalStyles.toggleRow}>
              {(["expense", "income"] as const).map(t => (
                <TouchableOpacity
                  testID={`tx-type-${t}`}
                  key={t}
                  style={[modalStyles.toggleBtn, type === t && modalStyles.toggleBtnActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[modalStyles.toggleText, type === t && modalStyles.toggleTextActive]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Amount</Text>
            <TextInput
              testID="tx-amount-input"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={modalStyles.input}
            />

            <Text style={modalStyles.label}>Category</Text>
            <View style={modalStyles.catGrid}>
              {CATEGORIES.map(c => {
                const meta = categoryMeta[c];
                const active = category === c;
                return (
                  <TouchableOpacity
                    testID={`tx-cat-${c}`}
                    key={c}
                    style={[modalStyles.catChip, active && { borderColor: meta.color, backgroundColor: `${meta.color}22` }]}
                    onPress={() => setCategory(c)}
                  >
                    <Ionicons name={meta.icon as any} size={14} color={active ? meta.color : colors.onSurfaceTertiary} />
                    <Text style={[modalStyles.catText, active && { color: meta.color }]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={modalStyles.label}>Description (optional)</Text>
            <TextInput
              testID="tx-desc-input"
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Coffee with friends"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={modalStyles.input}
            />

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.surfaceTertiary, flex: 1 }]} onPress={onClose}>
                <Text style={[modalStyles.btnText, { color: colors.onSurfaceSecondary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="tx-save-button" style={[modalStyles.btn, { backgroundColor: colors.brand, flex: 1 }]} onPress={save} disabled={saving}>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 32, letterSpacing: 1 },
  fab: { backgroundColor: colors.brand, width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  chartCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5 },
  chartTotal: { fontFamily: fonts.display, color: colors.brand, fontSize: 36, marginTop: spacing.xs },
  legend: { gap: spacing.sm, marginTop: spacing.xl },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: colors.onSurfaceSecondary, fontFamily: fonts.body, fontSize: 13, flex: 1 },
  legendValue: { color: colors.onSurface, fontFamily: fonts.bodyBold, fontSize: 13 },
  barLabel: { color: colors.onSurfaceTertiary, fontFamily: fonts.body, fontSize: 10, textAlign: "center" },
  sectionTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 18, letterSpacing: 1 },
  txRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  txIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  txCategory: { fontFamily: fonts.bodyBold, color: colors.onSurface, fontSize: 14 },
  txDesc: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  txAmount: { fontFamily: fonts.bodyBold, fontSize: 16 },
  emptyText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, textAlign: "center", padding: spacing.xl },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, alignSelf: "center", marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, letterSpacing: 1 },
  toggleRow: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, padding: spacing.md, alignItems: "center", borderRadius: radius.sm },
  toggleBtnActive: { backgroundColor: colors.brand },
  toggleText: { fontFamily: fonts.bodyBold, color: colors.onSurfaceTertiary, letterSpacing: 1, fontSize: 13 },
  toggleTextActive: { color: colors.onBrand },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, color: colors.onSurface, padding: spacing.lg, borderRadius: radius.md, fontFamily: fonts.body, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  catText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  btn: { padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  btnText: { fontFamily: fonts.bodyBold, color: colors.onBrand, letterSpacing: 1 },
});
