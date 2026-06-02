import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { api, Goal } from "@/src/api";

const EMOJI_OPTIONS = ["🎯", "✈️", "💻", "🚗", "🏠", "🎓", "📱", "🎮", "👟", "🎸", "💍", "🍔"];

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type Projection = { weeks: number | null; months?: number; weekly_rate: number; message: string };

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [projections, setProjections] = useState<Record<string, Projection>>({});

  const load = useCallback(async () => {
    try {
      const g = await api.get<Goal[]>("/goals");
      setGoals(g);
      // Load projections for each
      const all = await Promise.all(
        g.map(goal => api.post<Projection>(`/ai/goal-projection/${goal.id}`).catch(() => null))
      );
      const map: Record<string, Projection> = {};
      g.forEach((goal, i) => { if (all[i]) map[goal.id] = all[i] as Projection; });
      setProjections(map);
    } catch {} finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  };

  const onDelete = (g: Goal) => {
    Alert.alert("Delete goal", `Delete "${g.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await api.delete(`/goals/${g.id}`);
        setGoals(goals.filter(x => x.id !== g.id));
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
          <View>
            <Text style={styles.title}>GOALS</Text>
            <Text style={styles.subtitle}>{goals.length} active {goals.length === 1 ? "goal" : "goals"}</Text>
          </View>
          <TouchableOpacity testID="add-goal-button" style={styles.fab} onPress={() => { setEditing(null); setShowAdd(true); }}>
            <Ionicons name="add" size={22} color={colors.onBrand} />
          </TouchableOpacity>
        </View>

        {goals.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48 }}>🎯</Text>
            <Text style={styles.emptyTitle}>NO GOALS YET</Text>
            <Text style={styles.emptyText}>Set your first savings goal and let Stax help you crush it.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { setEditing(null); setShowAdd(true); }}>
              <Text style={styles.primaryBtnText}>CREATE A GOAL</Text>
            </TouchableOpacity>
          </View>
        )}

        {goals.map(g => {
          const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
          const proj = projections[g.id];
          return (
            <TouchableOpacity
              key={g.id}
              testID={`goal-${g.id}`}
              style={styles.goalCard}
              onPress={() => { setEditing(g); setShowAdd(true); }}
              onLongPress={() => onDelete(g)}
            >
              <View style={styles.goalHead}>
                <Text style={styles.goalEmoji}>{g.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalName}>{g.name.toUpperCase()}</Text>
                  <Text style={styles.goalAmounts}>{fmt(g.current_amount)} / {fmt(g.target_amount)}</Text>
                </View>
                <Text style={styles.goalPct}>{pct.toFixed(0)}%</Text>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>

              <View style={styles.projectionRow}>
                <Ionicons name="sparkles" size={12} color={colors.brand} />
                <Text style={styles.projectionText} numberOfLines={2}>
                  {proj ? proj.message : "Calculating timeline..."}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <GoalModal
        visible={showAdd}
        goal={editing}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={(saved, isNew) => {
          if (isNew) setGoals([saved, ...goals]);
          else setGoals(goals.map(g => g.id === saved.id ? saved : g));
          setShowAdd(false);
          setEditing(null);
          load();
        }}
      />
    </SafeAreaView>
  );
}

function GoalModal({ visible, goal, onClose, onSaved }: { visible: boolean; goal: Goal | null; onClose: () => void; onSaved: (g: Goal, isNew: boolean) => void }) {
  const [name, setName] = useState(goal?.name || "");
  const [emoji, setEmoji] = useState(goal?.emoji || "🎯");
  const [target, setTarget] = useState(String(goal?.target_amount || ""));
  const [current, setCurrent] = useState(String(goal?.current_amount || "0"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(goal?.name || ""); setEmoji(goal?.emoji || "🎯");
      setTarget(String(goal?.target_amount || ""));
      setCurrent(String(goal?.current_amount || "0"));
      setError(null);
    }
  }, [goal, visible]);

  const save = async () => {
    setError(null);
    const t = parseFloat(target); const c = parseFloat(current) || 0;
    if (!name.trim()) return setError("Name required");
    if (isNaN(t) || t <= 0) return setError("Invalid target amount");
    setSaving(true);
    try {
      const payload = { name: name.trim(), emoji, target_amount: t, current_amount: c };
      const res = goal
        ? await api.patch<Goal>(`/goals/${goal.id}`, payload)
        : await api.post<Goal>("/goals", payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved(res, !goal);
    } catch (e: any) { setError(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={modalStyles.overlay}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>{goal ? "EDIT GOAL" : "NEW GOAL"}</Text>

            <Text style={modalStyles.label}>Emoji</Text>
            <View style={modalStyles.emojiGrid}>
              {EMOJI_OPTIONS.map(e => (
                <TouchableOpacity
                  key={e}
                  testID={`emoji-${e}`}
                  style={[modalStyles.emojiChip, emoji === e && modalStyles.emojiChipActive]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>Goal Name</Text>
            <TextInput testID="goal-name-input" value={name} onChangeText={setName} placeholder="e.g. New iPhone" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} />

            <Text style={modalStyles.label}>Target Amount</Text>
            <TextInput testID="goal-target-input" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} />

            <Text style={modalStyles.label}>Current Saved</Text>
            <TextInput testID="goal-current-input" value={current} onChangeText={setCurrent} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.onSurfaceTertiary} style={modalStyles.input} />

            {error && <Text style={modalStyles.error}>{error}</Text>}

            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity style={[modalStyles.btn, { backgroundColor: colors.surfaceTertiary, flex: 1 }]} onPress={onClose}>
                <Text style={[modalStyles.btnText, { color: colors.onSurfaceSecondary }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="goal-save-button" style={[modalStyles.btn, { backgroundColor: colors.brand, flex: 1 }]} onPress={save} disabled={saving}>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 32, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 12 },
  fab: { backgroundColor: colors.brand, width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  emptyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xxl, alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22, letterSpacing: 1 },
  emptyText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", paddingHorizontal: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  primaryBtnText: { fontFamily: fonts.bodyBold, color: colors.onBrand, letterSpacing: 1 },
  goalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  goalHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  goalEmoji: { fontSize: 32 },
  goalName: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 18, letterSpacing: 1 },
  goalAmounts: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  goalPct: { fontFamily: fonts.display, color: colors.brand, fontSize: 24 },
  progressTrack: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand, borderRadius: radius.pill },
  projectionRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  projectionText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 11, flex: 1, lineHeight: 16 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, alignSelf: "center", marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, letterSpacing: 1 },
  label: { fontFamily: fonts.bodyMedium, color: colors.onSurfaceSecondary, fontSize: 13 },
  input: { backgroundColor: colors.surface, color: colors.onSurface, padding: spacing.lg, borderRadius: radius.md, fontFamily: fonts.body, fontSize: 16, borderWidth: 1, borderColor: colors.border },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emojiChip: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  emojiChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  error: { fontFamily: fonts.body, color: colors.error, fontSize: 13, textAlign: "center" },
  btn: { padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  btnText: { fontFamily: fonts.bodyBold, color: colors.onBrand, letterSpacing: 1 },
});
