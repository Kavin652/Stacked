import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api, Transaction, Holding, User } from "@/src/api";

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const { user, signOut, refresh } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editBalances, setEditBalances] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, h] = await Promise.all([
        api.get<Transaction[]>("/transactions"),
        api.get<Holding[]>("/holdings"),
      ]);
      setTxs(t);
      setHoldings(h);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const investmentTotal = useMemo(
    () => holdings.reduce((s, h) => s + (h.current_value ?? h.purchase_price * h.shares), 0),
    [holdings]
  );

  const savings = user?.savings_balance ?? 0;
  const cash = user?.cash_balance ?? 0;
  const total = savings + cash + investmentTotal;

  const { thisMonth, lastMonth } = useMemo(() => {
    const now = new Date();
    const ymThis = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ymLast = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}`;
    let thisM = 0, lastM = 0;
    for (const t of txs) {
      if (t.type !== "expense") continue;
      if (t.date.startsWith(ymThis)) thisM += t.amount;
      else if (t.date.startsWith(ymLast)) lastM += t.amount;
    }
    return { thisMonth: thisM, lastMonth: lastM };
  }, [txs]);

  const diff = thisMonth - lastMonth;
  const diffPct = lastMonth > 0 ? (diff / lastMonth) * 100 : 0;
  const trendUp = diff > 0;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.nameText} testID="dashboard-name">{user?.name?.toUpperCase()}</Text>
          </View>
          <TouchableOpacity testID="dashboard-logout" style={styles.iconBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
          <Text style={styles.totalAmount} testID="dashboard-total-balance">{fmt(total)}</Text>
          <View style={styles.totalDivider} />
          <View style={styles.monthRow}>
            <View>
              <Text style={styles.monthLabel}>This month spent</Text>
              <Text style={styles.monthValue}>{fmt(thisMonth)}</Text>
            </View>
            <View style={[styles.trendPill, { backgroundColor: trendUp ? "rgba(255,77,77,0.15)" : "rgba(0,229,160,0.15)" }]}>
              <Ionicons name={trendUp ? "arrow-up" : "arrow-down"} size={14} color={trendUp ? colors.error : colors.brand} />
              <Text style={[styles.trendText, { color: trendUp ? colors.error : colors.brand }]}>
                {Math.abs(diffPct).toFixed(0)}% vs last
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.gridRow}>
          <BalanceCard label="SAVINGS" value={fmt(savings)} icon="wallet-outline" />
          <BalanceCard label="CASH" value={fmt(cash)} icon="cash-outline" />
        </View>
        <View style={styles.gridRow}>
          <BalanceCard label="INVESTMENTS" value={fmt(investmentTotal)} icon="trending-up-outline" />
          <TouchableOpacity style={[styles.balanceCard, { justifyContent: "center", alignItems: "center" }]} onPress={() => setEditBalances(true)} testID="dashboard-edit-balances">
            <Ionicons name="create-outline" size={28} color={colors.brand} />
            <Text style={styles.editBalText}>EDIT BALANCES</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>MONTHLY COMPARISON</Text>
          <View style={styles.comparisonRow}>
            <View style={styles.comparisonCol}>
              <Text style={styles.comparisonLabel}>Last Month</Text>
              <Text style={styles.comparisonValue}>{fmt(lastMonth)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.comparisonCol}>
              <Text style={styles.comparisonLabel}>This Month</Text>
              <Text style={[styles.comparisonValue, { color: trendUp ? colors.error : colors.brand }]}>{fmt(thisMonth)}</Text>
            </View>
          </View>
          <Text style={styles.summaryInsight}>
            {lastMonth === 0 ? "Start logging expenses to compare months." : trendUp
              ? `You're spending ${Math.abs(diffPct).toFixed(0)}% more than last month. Time to tighten up!`
              : `Nice! You're spending ${Math.abs(diffPct).toFixed(0)}% less than last month. Keep it up.`}
          </Text>
        </View>
      </ScrollView>

      <EditBalancesModal
        visible={editBalances}
        onClose={() => setEditBalances(false)}
        initialSavings={savings}
        initialCash={cash}
        onSaved={(u) => { setEditBalances(false); refresh(); }}
      />
    </SafeAreaView>
  );
}

function BalanceCard({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={styles.balanceCard} testID={`balance-card-${label.toLowerCase()}`}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={styles.balanceValue}>{value}</Text>
    </View>
  );
}

function EditBalancesModal({ visible, onClose, initialSavings, initialCash, onSaved }: { visible: boolean; onClose: () => void; initialSavings: number; initialCash: number; onSaved: (u: User) => void; }) {
  const [savings, setSavings] = useState(String(initialSavings));
  const [cash, setCash] = useState(String(initialCash));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSavings(String(initialSavings));
    setCash(String(initialCash));
  }, [initialSavings, initialCash, visible]);

  const save = async () => {
    setSaving(true);
    try {
      const u = await api.post<User>("/auth/balances", {
        savings: parseFloat(savings) || 0,
        cash: parseFloat(cash) || 0,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved(u);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>EDIT BALANCES</Text>
          <Text style={modalStyles.label}>Savings Balance</Text>
          <TextInput
            testID="edit-savings-input"
            value={savings}
            onChangeText={setSavings}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={modalStyles.input}
          />
          <Text style={modalStyles.label}>Cash Balance</Text>
          <TextInput
            testID="edit-cash-input"
            value={cash}
            onChangeText={setCash}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={modalStyles.input}
          />
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.surfaceTertiary, flex: 1 }]} onPress={onClose}>
              <Text style={[modalStyles.btnText, { color: colors.onSurfaceSecondary }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="edit-balances-save" style={[modalStyles.btn, { backgroundColor: colors.brand, flex: 1 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={modalStyles.btnText}>SAVE</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  greeting: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 14 },
  nameText: { fontFamily: fonts.display, fontSize: 32, color: colors.onSurface, letterSpacing: 1 },
  iconBtn: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  totalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  totalLabel: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5 },
  totalAmount: { fontFamily: fonts.display, fontSize: 56, color: colors.brand, letterSpacing: 1 },
  totalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monthLabel: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 0.5 },
  monthValue: { fontFamily: fonts.bodyBold, color: colors.onSurface, fontSize: 18, marginTop: 2 },
  trendPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  trendText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  gridRow: { flexDirection: "row", gap: spacing.md },
  balanceCard: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, borderWidth: 1, borderColor: colors.border, minHeight: 110 },
  balanceLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.onSurfaceTertiary, letterSpacing: 1.5, marginTop: spacing.xs },
  balanceValue: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  editBalText: { fontFamily: fonts.bodyBold, color: colors.brand, fontSize: 11, letterSpacing: 1, marginTop: spacing.xs },
  summaryCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, letterSpacing: 1 },
  comparisonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  comparisonCol: { flex: 1 },
  divider: { width: 1, backgroundColor: colors.border, alignSelf: "stretch" },
  comparisonLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceTertiary, letterSpacing: 0.5 },
  comparisonValue: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, marginTop: 2 },
  summaryInsight: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 19 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, letterSpacing: 1, marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13 },
  input: { backgroundColor: colors.surface, color: colors.onSurface, padding: spacing.lg, borderRadius: radius.md, fontFamily: fonts.body, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  btn: { padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  btnText: { fontFamily: fonts.bodyBold, color: colors.onBrand, letterSpacing: 1 },
});
